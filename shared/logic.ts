import Decimal from 'decimal.js';
import type {Basis,Quote,Comparison,Fx,Review,Row} from './types';
export function parseAppId(input:string):number {
 let value=input.trim();
 if(!/^\d+$/.test(value)){
  let url:URL;try{url=new URL(value);}catch{throw new Error('請輸入正整數 App ID，或完整 Steam 商店網址。');}
  if(!['http:','https:'].includes(url.protocol)||url.hostname!=='store.steampowered.com'||url.username||url.password||url.port)throw new Error('只接受 store.steampowered.com 的遊戲網址。');
  const m=url.pathname.match(/^\/app\/(\d+)(?:\/|$)/);if(!m)throw new Error('目前只支援遊戲 App ID，不支援 sub 套件或 bundle 組合包。');value=m[1];
 }
 const id=Number(value);if(!Number.isSafeInteger(id)||id<1||id>4294967295)throw new Error('App ID 必須是 1～4294967295 的正整數。');return id;
}
export const positiveRate=(p:number,t:number)=>t>0?p/t*100:null;
export function parseReview(raw:any,appId:number,languageCode:string,purchaseFilter:string,offTopicFilter:string):Review{
 const body=raw?.response;const q=body?.query_summary;
 let total=q?.total_reviews,positive=q?.total_positive,negative=q?.total_negative;
 if(q&&body.total_matching===0&&Array.isArray(body.reviews)&&body.reviews.length===0){total??=0;positive??=0;negative??=0;}
 if(![total,positive,negative].every(n=>Number.isSafeInteger(n)&&n>=0)||positive+negative!==total)throw new Error('評論摘要結構不符或總數不一致，未以樣本代替。');
 return {appId,languageCode,purchaseFilter,offTopicFilter,total,positive,negative,positiveRate:positiveRate(positive,total),status:'ok',fetchedAt:new Date().toISOString(),source:'Steam IUserReviewsService v1'};
}
export function parseQuote(raw:any,appId:number,countryCode:string):Quote{
 const entry=raw?.[String(appId)],d=entry?.data;
 const base:Quote={appId,countryCode,currency:null,initialAmount:null,finalAmount:null,discountPercent:null,isFree:false,quoteScope:'app_overview',sourceAmountScale:null,comparabilityStatus:'app_overview_unverified',status:'unavailable',fetchedAt:new Date().toISOString(),source:'Steam AppDetails'};
 if(entry?.success!==true||!d)return {...base,reason:'此商店未取得價格，原因未明。'};
 base.appName=typeof d.name==='string'?d.name.slice(0,300):undefined;base.appType=typeof d.type==='string'?d.type:undefined;
 if(d.steam_appid!==undefined&&d.steam_appid!==appId)return {...base,status:'incompatible',comparabilityStatus:'incompatible',reason:'來源回傳不同 App，版本不可直接比較。'};
 if(d.is_free===true)return {...base,isFree:true,status:'free',finalAmount:'0',initialAmount:'0',sourceAmountScale:100};
 const p=d.price_overview;
 if(!p){return {...base,status:d.release_date?.coming_soon?'coming_soon':'no_price',reason:d.release_date?.coming_soon?'尚未發售／尚未提供單品價格。':'未取得單品價格；不以套件或組合包價格代替。'};}
 if(typeof p.currency!=='string'||!/^([A-Z]{3})$/.test(p.currency)||!Number.isSafeInteger(p.final)||p.final<0)throw new Error('價格格式或幣別不符，無法換算。');
 const initial=Number.isSafeInteger(p.initial)&&p.initial>=0?p.initial:null;
 return {...base,currency:p.currency,initialAmount:initial===null?null:new Decimal(initial).div(100).toFixed(),finalAmount:new Decimal(p.final).div(100).toFixed(),discountPercent:Number.isFinite(p.discount_percent)?p.discount_percent:null,formattedInitial:p.initial_formatted,formattedFinal:p.final_formatted,rawInitial:initial??undefined,rawFinal:p.final,sourceAmountScale:100,status:p.final===0&&p.discount_percent===100?'temporary_free':'ok'};
}
export function compare(local:Quote,us:Quote,basis:Basis,fx:Fx|null):Comparison{
 const c:Comparison={status:'unavailable',localUsdAmount:null,usUsdAmount:null,differencePercent:null,basis,fxProvider:'ExchangeRate-API',fxAsOf:fx?.asOf??null,fxStale:!!fx?.stale,calculatedAt:new Date().toISOString()};
 const l=local[basis==='final'?'finalAmount':'initialAmount'],u=us[basis==='final'?'finalAmount':'initialAmount'];
 if(local.comparabilityStatus==='incompatible'||us.comparabilityStatus==='incompatible'||(local.appType&&us.appType&&local.appType!==us.appType))return {...c,reason:'區域版本不可直接比較。'};
 if(l===null)return {...c,reason:local.reason??'缺少所選基準的當地價格。'};
 const fxAge=fx?Date.now()-Date.parse(fx.asOf):Infinity;
 const r=local.currency==='USD'||local.isFree?1:(fxAge<=48*3600e3?fx?.rates[local.currency??'']:undefined);
 if(r!==undefined&&Number.isFinite(r)&&r>0)c.localUsdAmount=new Decimal(l).div(r).toFixed(8);
 if(u!==null&&us.currency==='USD')c.usUsdAmount=u;
 if(!c.usUsdAmount||new Decimal(c.usUsdAmount).lte(0))return {...c,reason:'美國基準價缺失或為零，無法計算百分比。'};
 if(c.localUsdAmount===null)return {...c,reason:fxAge>48*3600e3?'匯率不可用或已超過 48 小時。':'缺少此幣別的有效匯率。'};
 c.differencePercent=new Decimal(l).div(r!).div(c.usUsdAmount).minus(1).times(100).toNumber();c.status='ok';return c;
}
export function numericSort(a:number|null|undefined,b:number|null|undefined,direction:'asc'|'desc'){
 if(a==null&&!Number.isFinite(b))return 0;if(a==null)return 1;if(b==null)return -1;return direction==='asc'?a-b:b-a;
}
export function csvCell(value:unknown):string{
 if(value===null||value===undefined)return '';if(typeof value==='number')return Number.isFinite(value)?String(value):'';
 let s=String(value);if(/^[\s]*[=+@\-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';
}
export function exportCsv(rows:Row[],appId:number,appName:string,purchase:string,offtopic:string,basis:Basis){
 const header=['app_id','app_name','language_code','language_name','review_count','positive_count','negative_count','positive_rate_percent','purchase_filter','offtopic_filter','representative_country','currency','price_basis','local_initial_price','local_final_price','local_selected_price','local_price_usd','us_price_usd','price_difference_percent','quote_scope','comparability_status','review_status','local_price_status','comparison_status','review_cache_state','local_price_cache_state','review_fetched_at','local_price_fetched_at','us_price_fetched_at','fx_provider','fx_as_of','fx_stale','exported_at','error_reason'];
 const num=(v:string|null|undefined)=>v==null?null:Number(v);
 const lines=rows.map(row=>{const r=row.review,p=row.price?.localQuote,u=row.price?.usQuote,c=row.price?.comparisons[basis];return [appId,appName,row.code,row.name,r?.total,r?.positive,r?.negative,r?.positiveRate,purchase,offtopic,row.country,p?.currency,basis,num(p?.initialAmount),num(p?.finalAmount),num(p?.[basis==='final'?'finalAmount':'initialAmount']),num(c?.localUsdAmount),num(c?.usUsdAmount),c?.differencePercent,p?.quoteScope,p?.comparabilityStatus,r?.status??'pending',p?.status??(row.priceError?'error':'pending'),c?.status??'pending',r?.cacheState,p?.cacheState,r?.fetchedAt,p?.fetchedAt,u?.fetchedAt,c?.fxProvider,c?.fxAsOf,c?.fxStale,new Date().toISOString(),[r?.reason,p?.reason,c?.reason,row.priceError].filter(Boolean).join('；')].map(csvCell).join(',');});
 return '\ufeff'+[header.join(','),...lines].join('\r\n');
}
