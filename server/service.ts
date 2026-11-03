import {env} from 'cloudflare:workers';
import {languages,countries,reviewSource,priceSource,fxSource,registryVersion} from '../shared/config';
import {parseAppId,parseReview,parseQuote,compare} from '../shared/logic';
import type {Quote,Fx,Review,AppResult} from '../shared/types';
class ServiceError extends Error{constructor(public code:string,message:string,public retryAfter=0,public http=503){super(message);}}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const db=()=>{if(!env.DB)throw new ServiceError('CONFIG','資料服務暫時無法使用。');return env.DB;};
async function budget(key:string,limit:number,seconds:number){
 const bucket=Math.floor(Date.now()/(seconds*1000));const k=key+':'+bucket;
 const row=await db().prepare('INSERT INTO budgets(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind(k,(bucket+1)*seconds*1000,limit).first();
 if(!row)throw new ServiceError('RATE_LIMIT','查詢額度已達上限，請稍後再試。',Math.ceil(((bucket+1)*seconds*1000-Date.now())/1000),429);
}
async function readCache(key:string){return db().prepare('SELECT * FROM cache WHERE key=?').bind(key).first<{value:string|null;expires:number;retain_until:number;lease_until:number;owner:string}>();}
async function putCache(key:string,value:unknown,ttl:number,retain=ttl){
 const now=Date.now();
 await db().prepare('INSERT INTO cache(key,value,expires,retain_until,lease_until) VALUES(?,?,?,?,0) ON CONFLICT(key) DO UPDATE SET value=excluded.value,expires=excluded.expires,retain_until=excluded.retain_until,lease_until=0,owner=NULL').bind(key,JSON.stringify(value),now+ttl,now+retain).run();
}
async function cached<T>(key:string,ttl:number,load:()=>Promise<T>,retention=ttl):Promise<T>{
 const start=Date.now();
 while(Date.now()-start<12000){
  const prior=await readCache(key);
  if(prior?.value&&prior.expires>Date.now())return {...JSON.parse(prior.value),cacheState:'hit'};
  const owner=crypto.randomUUID(),now=Date.now();
  const lock=await db().prepare('INSERT INTO cache(key,value,expires,retain_until,lease_until,owner) VALUES(?,NULL,0,?,?,?) ON CONFLICT(key) DO UPDATE SET lease_until=excluded.lease_until,owner=excluded.owner WHERE cache.lease_until<? RETURNING key').bind(key,now+60000,now+45000,owner,now).first();
  if(lock){
   try{const value=await load();await putCache(key,value,(value as any)?.status==='error'?60000:ttl,retention);return {...value,cacheState:'fresh'};}
   catch(e){await db().prepare('UPDATE cache SET lease_until=0,owner=NULL WHERE key=? AND owner=?').bind(key,owner).run();throw e;}
  }
  await sleep(250);
 }
 throw new ServiceError('BUSY','相同資料正在更新，請稍後重試。',3,429);
}
async function slot(provider:string){
 const id=crypto.randomUUID(),start=Date.now();
 while(Date.now()-start<7000){
  for(let i=0;i<3;i++){
   const key=provider+':'+i;
   const row=await db().prepare('INSERT INTO slots(key,expires,owner) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET expires=excluded.expires,owner=excluded.owner WHERE slots.expires<? RETURNING key').bind(key,Date.now()+45000,id,Date.now()).first();
   if(row)return async()=>{await db().prepare('DELETE FROM slots WHERE key=? AND owner=?').bind(key,id).run();};
  }
  await sleep(200);
 }
 throw new ServiceError('BUSY','資料來源忙碌，請稍後重試。',3,429);
}
async function upstream(url:URL,provider:string):Promise<any>{
 const allowed=['api.steampowered.com','store.steampowered.com','open.er-api.com'];if(!allowed.includes(url.hostname))throw new Error('Invalid upstream');
 const cooldown=await readCache('cooldown:'+provider);if(cooldown&&cooldown.expires>Date.now())throw new ServiceError('COOLDOWN','來源暫時限制存取，請稍後重試。',Math.ceil((cooldown.expires-Date.now())/1000),429);
 const release=await slot(provider);
 try{
  for(let attempt=0;attempt<3;attempt++){
   await budget('upstream:'+provider,120,60);await budget('upstream-hour:'+provider,1800,3600);
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
   try{
    const res=await fetch(url,{signal:controller.signal,redirect:'manual',headers:{Accept:'application/json','User-Agent':'SteamLens/1.0 (+https://github.com/Lendicez/steam-review-price-explorer)'}});
    if(res.status>=300&&res.status<400)throw new ServiceError('REDIRECT','來源回傳未預期轉址，已停止請求。');
    if(res.status===429||res.status===403){
     const ra=res.headers.get('Retry-After');const delay=ra?(Number.isFinite(Number(ra))?Number(ra):Math.ceil((Date.parse(ra)-Date.now())/1000)):60;
     const wait=Math.min(3600,Math.max(15,Number.isFinite(delay)?delay:60));await putCache('cooldown:'+provider,{},wait*1000);
     throw new ServiceError(String(res.status),res.status===403?'來源拒絕存取（403）。':'來源限流（429），請稍後重試。',wait,res.status===403?503:429);
    }
    if(res.status>=500&&attempt<2){await res.body?.cancel();await sleep(250*2**attempt+Math.random()*150);continue;}
    if(!res.ok)throw new ServiceError('HTTP_'+res.status,'來源回應 HTTP '+res.status+'。');
    const ct=res.headers.get('content-type')??'';if(!ct.includes('json'))throw new ServiceError('NOT_JSON','來源回傳非 JSON 資料或驗證頁面。');
    if(Number(res.headers.get('content-length')??0)>2_000_000)throw new ServiceError('TOO_LARGE','來源回應過大。');
    const reader=res.body?.getReader();if(!reader)throw new ServiceError('EMPTY','來源回應為空。');
    let length=0;const chunks:Uint8Array[]=[];
    while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.length;if(length>2_000_000){await reader.cancel();throw new ServiceError('TOO_LARGE','來源回應過大。');}chunks.push(chunk.value);}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ServiceError('JSON','來源 JSON 格式無效。');}
   }catch(e){if(e instanceof ServiceError)throw e;console.error('upstream_failure',provider,e instanceof Error?e.name+': '+e.message:'unknown');throw new ServiceError('NETWORK','來源連線失敗或逾時。');}finally{clearTimeout(timer);}
  }
 }finally{await release();}
 throw new ServiceError('UPSTREAM','來源暫時無法使用。');
}
function stateError(e:unknown){return {status:'error',reason:e instanceof Error?e.message:'資料讀取失敗。',errorCode:e instanceof ServiceError?e.code:'SCHEMA',retryAfter:e instanceof ServiceError?e.retryAfter:0,fetchedAt:new Date().toISOString(),cacheState:'none'};}
async function quote(appId:number,country:string):Promise<Quote>{
 return cached('price:v1:'+appId+':'+country,15*60e3,async()=>{
  try{const url=new URL(priceSource);url.search=new URLSearchParams({appids:String(appId),cc:country.toLowerCase(),l:'english'}).toString();return parseQuote(await upstream(url,'store'),appId,country);}
  catch(e){if(e instanceof ServiceError&&(e.code==='BUSY'||e.code==='RATE_LIMIT'))throw e;return {...parseQuote({},appId,country),...stateError(e)};}
 });
}
async function fx():Promise<Fx|null>{
 const prior=await readCache('fx:USD');
 if(prior?.value&&prior.expires>Date.now())return JSON.parse(prior.value);
 try{
  return await cached('fx:USD:load',60*60e3,async()=>{
   const r=await upstream(new URL(fxSource),'fx');
   if(r?.result!=='success'||r.base_code!=='USD'||!r.rates||!Number.isFinite(r.time_last_update_unix)||!Number.isFinite(r.time_next_update_unix))throw new Error('匯率格式異常。');
   const f:Fx={rates:r.rates,asOf:new Date(r.time_last_update_unix*1000).toISOString(),nextUpdate:r.time_next_update_unix*1000};
   if(Date.now()-Date.parse(f.asOf)>48*3600e3)throw new Error('匯率超過 48 小時。');
   await putCache('fx:USD',f,Math.max(3600e3,f.nextUpdate-Date.now()),48*3600e3);return f;
  });
 }catch{
  if(prior?.value){const f=JSON.parse(prior.value) as Fx;if(Date.now()-Date.parse(f.asOf)<=48*3600e3)return {...f,stale:true};}return null;
 }
}
async function cleanup(){
 await db().batch([db().prepare('DELETE FROM cache WHERE retain_until<? AND lease_until<?').bind(Date.now(),Date.now()),db().prepare('DELETE FROM budgets WHERE expires<?').bind(Date.now()),db().prepare('DELETE FROM slots WHERE expires<?').bind(Date.now())]);
 const count=await db().prepare('SELECT COUNT(*) AS n FROM cache').first<{n:number}>();if(count&&count.n>10000)throw new ServiceError('CAPACITY','查詢快取已滿，請稍後再試。',60,429);
}
export async function api(request:Request):Promise<Response>{
 try{
  if(request.method!=='GET')return response({error:'只接受 GET。'},405);
  const url=new URL(request.url);if(url.search.length>1800)throw new ServiceError('INPUT','查詢參數過長。',0,400);
  const parts=url.pathname.split('/').filter(Boolean);const kind=parts[1];
  if(kind==='config')return response({languages,countries,registryVersion});
  if(kind==='health')return response({status:'ok',service:'Steam Lens',registryVersion,time:new Date().toISOString()});
  if(parts.length!==3||!['app','reviews','compare'].includes(kind))return response({error:'查無此介面。'},404);
  const appId=parseAppId(parts[2]);const purchase=url.searchParams.get('purchase')??'all',offtopic=url.searchParams.get('offtopic')??'exclude';
  const language=url.searchParams.get('language')??'all',country=url.searchParams.get('country')??'TW';
  if(!['all','steam','nonsteam'].includes(purchase)||!['exclude','include'].includes(offtopic)||(!languages.some(x=>x.code===language)&&language!=='all')||!Object.hasOwn(countries,country))throw new ServiceError('INPUT','不支援的語言、商店或篩選條件。',0,400);
  const ip=request.headers.get('cf-connecting-ip')??'unknown';
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(new Date().toISOString().slice(0,10)+ip));
  const visitor=Array.from(new Uint8Array(digest)).slice(0,12).map(x=>x.toString(16).padStart(2,'0')).join('');
  await budget('visitor:'+visitor,900,600);
  if(kind==='app'){
   await budget('app:'+visitor,12,600);await cleanup();
   const us=await quote(appId,'US');const token=crypto.randomUUID();await putCache('snapshot:'+appId+':'+token,us,60*60e3);
   return response({appId,appName:us.appName??'Steam App '+appId,usQuote:us,baseToken:token,fetchedAt:new Date().toISOString()} satisfies AppResult);
  }
  if(kind==='reviews'){
   const key=['reviews:v1',appId,language,purchase,offtopic].join(':');
   const r=await cached<Review>(key,30*60e3,async()=>{
    try{
     const u=new URL(reviewSource);u.searchParams.set('input_json',JSON.stringify({appid:appId,filter:1,languages:[language],review_type:0,purchase_type:({steam:0,all:1,nonsteam:2} as const)[purchase as 'all'],cursor:'*',num_per_page:1,filter_offtopic_activity:offtopic==='exclude'}));
     return parseReview(await upstream(u,'reviews'),appId,language,purchase,offtopic);
    }catch(e){if(e instanceof ServiceError&&(e.code==='BUSY'||e.code==='RATE_LIMIT'))throw e;return {appId,languageCode:language,purchaseFilter:purchase,offTopicFilter:offtopic,total:null,positive:null,negative:null,positiveRate:null,source:'Steam IUserReviewsService v1',...stateError(e)};}
   });return response(r);
  }
  const token=url.searchParams.get('us')??'';if(!/^[\da-f-]{36}$/.test(token))throw new ServiceError('INPUT','缺少有效的美國基準快照。',0,400);
  const snap=await readCache('snapshot:'+appId+':'+token);if(!snap?.value||snap.expires<Date.now())throw new ServiceError('EXPIRED','本次價格基準已過期，請重新整理。',0,409);
  const us=JSON.parse(snap.value) as Quote;
  const local=country==='US'?us:await quote(appId,country);
  const rates=local.currency&&local.currency!=='USD'?await fx():null;
  return response({localQuote:local,usQuote:us,comparisons:{final:compare(local,us,'final',rates),initial:compare(local,us,'initial',rates)}});
 }catch(e){const status=e instanceof ServiceError?e.http:400;return response({error:e instanceof Error?e.message:'查詢失敗。',...stateError(e)},status);}
}
function response(data:unknown,status=200){const retry=(data as {retryAfter?:number})?.retryAfter;return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',...(retry?{'Retry-After':String(retry)}:{})}});}
