'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Search,ArrowUpRight,ArrowDown,ArrowUp,Download,Link as LinkIcon,RefreshCw,Square,Globe2,Info,SlidersHorizontal,ChevronDown,Check,BarChart3,Clock3,Code2,ExternalLink,X,Languages} from 'lucide-react';
import {languages,countries,purchaseLabels,disclaimer} from '../shared/config';
import {parseAppId,numericSort,exportCsv} from '../shared/logic';
import type {AppResult,Basis,Purchase,Review,Row,PriceResult} from '../shared/types';
const count=(n:number|null|undefined)=>n==null?'—':n.toLocaleString('zh-TW');
const percent=(n:number|null|undefined)=>n==null?'—':n.toFixed(1)+'%';
function money(value:string|null|undefined,currency:string|null|undefined){if(value==null)return '—';return (currency??'')+' '+Number(value).toLocaleString('zh-TW',{maximumFractionDigits:2});}
const time=(s:string|undefined|null)=>s?new Date(s).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'—';
const blankRows=(over:Record<string,string>={})=>languages.map(l=>({...l,country:over[l.code]??l.country}));
async function pool<T>(items:T[],concurrency:number,fn:(item:T)=>Promise<void>,signal:AbortSignal){let index=0;await Promise.all(Array.from({length:concurrency},async()=>{while(index<items.length&&!signal.aborted){const item=items[index++];await fn(item);}}));}
async function getJson(url:string,signal:AbortSignal):Promise<any>{
 for(let attempt=0;attempt<3;attempt++){
  const response=await fetch(url,{signal});const data:any=await response.json();
  if(!response.ok){if(response.status===429&&data.retryAfter<=5&&attempt<2){await new Promise<void>((resolve,reject)=>{const id=setTimeout(resolve,Math.max(1,data.retryAfter)*1000);signal.addEventListener('abort',()=>{clearTimeout(id);reject(new DOMException('Aborted','AbortError'));},{once:true});});continue;}throw new Error(data.error??'伺服器暫時無法使用。');}
  return data;
 }throw new Error('來源忙碌，請稍後再試。');
}
export default function Home(){
 const [input,setInput]=useState(''),[appId,setAppId]=useState<number|null>(null),[app,setApp]=useState<AppResult|null>(null),[rows,setRows]=useState<Row[]>(blankRows()),[summary,setSummary]=useState<Review|null>(null);
 const [purchase,setPurchase]=useState<Purchase>('all'),[offtopic,setOfftopic]=useState('exclude'),[basis,setBasis]=useState<Basis>('final'),[overrides,setOverrides]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false),[stopped,setStopped]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[search,setSearch]=useState(''),[hideZero,setHideZero]=useState(false),[selected,setSelected]=useState<string[]>([]),[onlySelected,setOnlySelected]=useState(false),[settings,setSettings]=useState(false);
 const [sort,setSort]=useState({key:'total',direction:'desc' as 'asc'|'desc'}),[recent,setRecent]=useState<{id:number;name:string}[]>([]),[startedAt,setStartedAt]=useState(''),[finishedAt,setFinishedAt]=useState('');
 const seq=useRef(0),abort=useRef<AbortController|null>(null),rowSeq=useRef<Record<string,number>>({}),currentOverrides=useRef<Record<string,string>>({}),activeApp=useRef<number|null>(null);
 function shareUrl(id=appId,p=purchase,o=offtopic,b=basis,ov=overrides){const u=new URL(window.location.href);u.search='';if(id)u.searchParams.set('app',String(id));if(p!=='all')u.searchParams.set('purchase',p);if(o!=='exclude')u.searchParams.set('offtopic',o);if(b!=='final')u.searchParams.set('basis',b);if(Object.keys(ov).length)u.searchParams.set('stores',Object.entries(ov).map(([k,v])=>k+':'+v).join(','));return u.toString();}
 function updateUrl(id:number,p:Purchase,o:string,b:Basis,ov:Record<string,string>){history.replaceState(null,'',shareUrl(id,p,o,b,ov));}
 useEffect(()=>{
  try{const saved=JSON.parse(localStorage.getItem('steam-lens-recent')??'[]');if(Array.isArray(saved))setRecent(saved.filter(x=>Number.isSafeInteger(x.id)&&typeof x.name==='string').slice(0,10));}catch{}
  const p=new URLSearchParams(location.search);const purch=(['all','steam','nonsteam'].includes(p.get('purchase')??'')?p.get('purchase'):'all') as Purchase;
  const off=p.get('offtopic')==='include'?'include':'exclude',b=p.get('basis')==='initial'?'initial':'final';const ov:Record<string,string>={};
  for(const pair of (p.get('stores')??'').split(',')){const [code,country]=pair.split(':');if(languages.some(l=>l.code===code)&&Object.hasOwn(countries,country))ov[code]=country;}
  setPurchase(purch);setOfftopic(off);setBasis(b);setOverrides(ov);currentOverrides.current=ov;
  if(p.has('app')){try{const id=parseAppId(p.get('app')!);setInput(String(id));void run(id,purch,off,b,ov);}catch(e){setError((e as Error).message);}}
  return()=>{seq.current++;abort.current?.abort();};
 },[]);
 async function run(id:number,p=purchase,o=offtopic,b=basis,ov=overrides){
  abort.current?.abort();const controller=new AbortController();abort.current=controller;const ticket=++seq.current;rowSeq.current={};currentOverrides.current=ov;activeApp.current=id;
  setInput(String(id));setAppId(id);setApp(null);setRows(blankRows(ov));setSummary(null);setBusy(true);setStopped(false);setError('');setNotice('');setStartedAt(new Date().toISOString());setFinishedAt('');updateUrl(id,p,o,b,ov);
  const valid=()=>ticket===seq.current&&!controller.signal.aborted;
  const patch=(code:string,data:Partial<Row>)=>{if(valid())setRows(prev=>prev.map(r=>r.code===code?{...r,...data}:r));};
  const meta=getJson('/api/app/'+id,controller.signal).then((data:AppResult)=>{
   if(valid()){setApp(data);setRecent(old=>{const next=[{id,name:data.appName},...old.filter(x=>x.id!==id)].slice(0,10);try{localStorage.setItem('steam-lens-recent',JSON.stringify(next));}catch{}return next;});}return data;
  }).catch(e=>{if(valid())setError(e.message);return null;});
  const reviewTask=pool(['all',...languages.map(l=>l.code)],3,async code=>{
   try{const data=await getJson('/api/reviews/'+id+'?'+new URLSearchParams({language:code,purchase:p,offtopic:o}),controller.signal);if(valid()){if(code==='all')setSummary(data);else patch(code,{review:data});}}
   catch(e){if(valid()){const failure:Review={appId:id,languageCode:code,purchaseFilter:p,offTopicFilter:o,total:null,positive:null,negative:null,positiveRate:null,status:'error',reason:(e as Error).message,fetchedAt:new Date().toISOString(),source:'Steam IUserReviewsService v1'};if(code==='all')setSummary(failure);else patch(code,{review:failure});}}
  },controller.signal);
  const priceTask=meta.then(async data=>{
   if(!data){if(valid())setRows(rs=>rs.map(r=>({...r,priceError:'美國基準建立失敗，請重新整理。'})));return;}
   await pool(languages,2,async l=>{const country=currentOverrides.current[l.code]??l.country;const rowTicket=rowSeq.current[l.code]??0;
    try{const result=await getJson('/api/compare/'+id+'?'+new URLSearchParams({country,us:data.baseToken}),controller.signal);if((rowSeq.current[l.code]??0)===rowTicket)patch(l.code,{country,price:result});}
    catch(e){if((rowSeq.current[l.code]??0)===rowTicket)patch(l.code,{priceError:(e as Error).message});}
   },controller.signal);
  });
  await Promise.all([reviewTask,priceTask]);if(valid()){setBusy(false);setFinishedAt(new Date().toISOString());}
 }
 function submit(e?:React.FormEvent){e?.preventDefault();try{void run(parseAppId(input));}catch(e){setError((e as Error).message);}}
 function changeFilters(p:Purchase,o:string){setPurchase(p);setOfftopic(o);if(appId)void run(appId,p,o);}
 function changeBasis(b:Basis){setBasis(b);if(appId)updateUrl(appId,purchase,offtopic,b,overrides);}
 async function changeCountry(code:string,country:string){
  const ov={...currentOverrides.current,[code]:country};currentOverrides.current=ov;setOverrides(ov);if(appId)updateUrl(appId,purchase,offtopic,basis,ov);
  const n=(rowSeq.current[code]??0)+1;rowSeq.current[code]=n;const ticket=seq.current;
  setRows(rs=>rs.map(r=>r.code===code?{...r,country,price:undefined,priceError:undefined}:r));
  if(!app||!appId)return;
  const controller=abort.current?.signal.aborted?new AbortController():abort.current??new AbortController();abort.current=controller;
  try{const price:PriceResult=await getJson('/api/compare/'+appId+'?'+new URLSearchParams({country,us:app.baseToken}),controller.signal);if(seq.current===ticket&&rowSeq.current[code]===n)setRows(rs=>rs.map(r=>r.code===code?{...r,price}:r));}
  catch(e){if(seq.current===ticket&&rowSeq.current[code]===n)setRows(rs=>rs.map(r=>r.code===code?{...r,priceError:(e as Error).message}:r));}
 }
 const reviewsDone=rows.filter(r=>r.review).length,pricesDone=rows.filter(r=>r.price||r.priceError).length;
 const reviewErrors=rows.filter(r=>r.review?.status==='error').length+(summary?.status==='error'?1:0);
 const priceErrors=rows.filter(r=>r.priceError||r.price?.localQuote.status==='error'||r.price?.localQuote.status==='unavailable').length;
 const sum=rows.reduce((s,r)=>s+(r.review?.total??0),0);const discrepancy=reviewsDone===languages.length&&reviewErrors===0&&summary?.total!=null?sum-summary.total:null;
 const cacheCount=rows.filter(r=>r.review?.cacheState==='hit').length;
 const progress=Math.round((reviewsDone+pricesDone+(summary?1:0))/(languages.length*2+1)*100);
 const ready=appId!==null;const sourceDates=rows.filter(r=>r.review).map(r=>r.review!.fetchedAt).sort();
 const visible=useMemo(()=>{
  const get=(r:Row)=>{const c=r.price?.comparisons[basis];switch(sort.key){case 'local':return c?.localUsdAmount==null?null:Number(c.localUsdAmount);case 'us':return c?.usUsdAmount==null?null:Number(c.usUsdAmount);case 'difference':return c?.differencePercent;default:return r.review?.[sort.key as 'total'|'positive'|'negative'|'positiveRate'];}};
  return rows.filter(r=>(!hideZero||r.review?.total!==0)&&(!onlySelected||selected.includes(r.code))&&(!search||(r.name+' '+r.code).toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>numericSort(get(a),get(b),sort.direction));
 },[rows,search,hideZero,onlySelected,selected,sort,basis]);
 function sortBy(key:string){setSort(old=>({key,direction:old.key===key&&old.direction==='desc'?'asc':'desc'}));}
 async function copy(){try{await navigator.clipboard.writeText(shareUrl());setNotice('結果連結已複製。連結會重新查詢，不是歷史快照。');}catch{setNotice('請複製網址列，即可分享目前條件。');}}
 function download(all:boolean){if(!appId)return;const csv=exportCsv(all?rows:visible,appId,app?.appName??'Steam App '+appId,purchase,offtopic,basis);const a=document.createElement('a');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));a.href=url;a.download='steam-'+appId+'-'+(all?'all':'filtered')+'-'+basis+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice(busy||stopped?'已匯出目前取得的部分資料；未完成欄位留白。':'已匯出 CSV，可使用 Excel 開啟。');}
 const sortHead=(key:string,label:string)=><button className="sort" onClick={()=>sortBy(key)}>{label}{sort.key===key?(sort.direction==='desc'?<ArrowDown size={12}/>:<ArrowUp size={12}/>):<span className="sort-hint">↕</span>}</button>;
 return <>
  <header className="topbar"><a className="brand" href="/"><span className="brand-icon"><Search size={24}/></span><span>Steam <b>Lens</b><small>評論與售價觀測站</small></span></a><nav><span className="nav-current"><BarChart3 size={15}/> 遊戲分析</span><a href="#method">資料說明 <ArrowUpRight size={14}/></a><a href="https://github.com/Lendicez/steam-review-price-explorer" target="_blank" rel="noreferrer" aria-label="GitHub 原始碼"><Code2 size={19}/><span className="desktop">原始碼</span></a></nav></header>
  <main>
   <section className="intro"><div className="eyebrow"><span/> STEAM REVIEW & PRICE EXPLORER</div><h1>看見評論背後的<span>語言與價格。</span></h1><p>從一款遊戲出發，探索不同語言的玩家回饋，並比較各地 Steam 商店售價。</p></section>
   <section className="search-panel" aria-label="遊戲查詢">
    <form onSubmit={submit}><label htmlFor="appid">查詢 Steam 遊戲</label><div className="search-input"><Search size={22}/><input id="appid" value={input} onChange={e=>setInput(e.target.value)} placeholder="輸入 App ID 或貼上 Steam 商店網址" autoComplete="off"/><button type="submit" className="primary">開始分析 <ArrowUpRight size={17}/></button></div></form>
    <div className="search-bottom"><div className="examples"><span>試試看</span>{[{id:620,name:'Portal 2'},{id:570,name:'Dota 2'},{id:413150,name:'Stardew Valley'}].map(x=><button key={x.id} onClick={()=>void run(x.id)}>{x.name}<ArrowUpRight size={12}/></button>)}</div><span className="small quiet">免登入 · 免 API Key</span></div>
    {recent.length>0&&<div className="recent"><Clock3 size={13}/><span>最近查詢</span>{recent.map(x=><button key={x.id} onClick={()=>void run(x.id)}>{x.name}</button>)}<button className="clear" onClick={()=>{setRecent([]);try{localStorage.removeItem('steam-lens-recent');}catch{}}}>清除</button></div>}
   </section>
   {error&&<div className="message error" role="alert"><Info size={17}/>{error}<button onClick={()=>setError('')} aria-label="關閉錯誤"><X size={15}/></button></div>}
   {notice&&<div className="message notice" role="status"><Check size={16}/>{notice}<button onClick={()=>setNotice('')} aria-label="關閉通知"><X size={15}/></button></div>}
   <div className="definition"><Info size={16}/><p>{disclaimer}</p></div>
   {ready?<>
    <div className="result-heading"><div><div className="eyebrow quiet">GAME OVERVIEW <span className="appid">APP {appId}</span></div><h2>{app?.appName??'讀取遊戲資訊中…'}<a href={'https://store.steampowered.com/app/'+appId+'/'} target="_blank" rel="noreferrer" aria-label="前往 Steam 商店"><ExternalLink size={17}/></a></h2></div><div className="actions"><button disabled={busy} onClick={()=>appId&&void run(appId)}><RefreshCw size={15}/>重新整理</button>{busy&&<button onClick={()=>{abort.current?.abort();setBusy(false);setStopped(true);}}><Square size={13}/>停止載入</button>}<button onClick={copy}><LinkIcon size={15}/>複製連結</button><details className="export-menu"><summary><Download size={15}/>匯出 CSV<ChevronDown size={13}/></summary><div><button onClick={()=>download(false)}>匯出目前顯示列（{visible.length}）</button><button onClick={()=>download(true)}>匯出全部語言（{languages.length}）</button></div></details></div></div>
    <div className="stats">
     <div><span>全語言評論總數 <Languages size={16}/></span><strong>{summary?.status==='error'?'查詢失敗':count(summary?.total)}</strong><small>全部時間 · {purchaseLabels[purchase]}</small></div>
     <div><span>整體好評率 <BarChart3 size={16}/></span><strong className="green">{percent(summary?.positiveRate)}</strong><small>好評 {count(summary?.positive)} · 負評 {count(summary?.negative)}</small></div>
     <div><span>美國售價（USD） <Globe2 size={16}/></span><strong className="price-stat">{app?.usQuote.isFree?'免費':money(app?.usQuote[basis==='final'?'finalAmount':'initialAmount'],'USD')}</strong><small>{basis==='final'?'目前售價':'未折扣原價'} · {app?.usQuote.discountPercent?`折扣 ${app.usQuote.discountPercent}%`:'US 比較基準'}</small></div>
     <div><span>資料狀態 <span className={'status-dot '+(busy?'loading':'')}/></span><strong className="status-text">{busy?'正在讀取':stopped?'已停止載入':reviewErrors||priceErrors?'部分完成':'載入完成'}</strong><small>評論 {reviewsDone}／{languages.length} · 價格 {pricesDone}／{languages.length}{cacheCount>0?' · 含快取':''}</small></div>
    </div>
    {busy&&<div className="progress" role="progressbar" aria-label="資料載入進度" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div style={{width:progress+'%'}}/></div>}
    {discrepancy!==null&&discrepancy!==0&&<p className="data-note warn">語言列合計與獨立全語言總數相差 {count(discrepancy)} 則；可能來自查詢時間差、缺失語言或來源異常，未調整原始統計。</p>}
    <section className="table-panel">
     <div className="table-title"><h3>各語言評論與售價 <span>{languages.length} 種語言</span></h3><button className={settings?'toggle active':'toggle'} onClick={()=>setSettings(!settings)}><SlidersHorizontal size={15}/>統計條件<ChevronDown size={13}/></button></div>
     {settings&&<div className="settings"><label>購買來源<select value={purchase} onChange={e=>changeFilters(e.target.value as Purchase,offtopic)}>{Object.entries(purchaseLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>離題評論活動<select value={offtopic} onChange={e=>changeFilters(purchase,e.target.value)}><option value="exclude">依 Steam 機制排除（預設）</option><option value="include">納入離題活動評論</option></select></label><p>變更統計條件會重新查詢全部語言。期間固定為全部時間。</p></div>}
     <div className="table-toolbar"><div className="language-search"><Search size={15}/><input aria-label="搜尋語言" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜尋語言…"/></div><label className="checkbox"><input type="checkbox" checked={hideZero} onChange={e=>setHideZero(e.target.checked)}/>隱藏零評論</label><label className="checkbox"><input type="checkbox" checked={onlySelected} onChange={e=>setOnlySelected(e.target.checked)}/>只看已選（{selected.length}）</label><div className="basis" aria-label="價格基準"><button className={basis==='final'?'active':''} onClick={()=>changeBasis('final')}>目前售價</button><button className={basis==='initial'?'active':''} onClick={()=>changeBasis('initial')}>未折扣原價</button></div></div>
     <div className="table-scroll"><table><thead><tr><th>評論語言</th><th aria-sort={sort.key==='total'?(sort.direction==='desc'?'descending':'ascending'):'none'}>{sortHead('total','評論總數')}</th><th>{sortHead('positive','好評數')}</th><th>{sortHead('negative','負評數')}</th><th>{sortHead('positiveRate','好評率')}</th><th>{sortHead('local','代表商店售價')}<small>依約合美元排序</small></th><th>{sortHead('us','美國售價（USD）')}</th><th>{sortHead('difference','相對美國價差')}</th></tr></thead><tbody>
      {visible.map(row=>{const r=row.review,p=row.price?.localQuote,c=row.price?.comparisons[basis],us=row.price?.usQuote??app?.usQuote;const d=c?.differencePercent;const amount=p?.[basis==='final'?'finalAmount':'initialAmount'];const reviewTitle=r?`${r.source}｜${time(r.fetchedAt)}（台灣）｜${r.cacheState==='hit'?'快取資料':'本次讀取'}${r.reason?'｜'+r.reason:''}`:'';
       return <tr key={row.code} data-language={row.code} className={['tchinese','schinese','english','japanese','koreana'].includes(row.code)?'focus-language':''}>
        <td><label className="language-cell"><input type="checkbox" aria-label={'選取'+row.name} checked={selected.includes(row.code)} onChange={e=>setSelected(s=>e.target.checked?[...s,row.code]:s.filter(x=>x!==row.code))}/><span><b>{row.name}</b><small>{row.code}</small></span></label></td>
        <td title={reviewTitle}>{!r?<span className="pending">{stopped?'未完成':'讀取中…'}</span>:r.status==='error'?<span className="bad small">查詢失敗</span>:<><b className="tabular">{count(r.total)}</b><div className="mini-volume"><i style={{width:(summary?.total?Math.min(100,(r.total??0)/summary.total*100):0)+'%'}}/></div></>}</td>
        <td className="tabular" title={reviewTitle}>{count(r?.positive)}</td><td className="tabular muted" title={reviewTitle}>{count(r?.negative)}</td>
        <td title={reviewTitle}><span className={'rate '+(r?.positiveRate!=null?(r.positiveRate>=80?'high':r.positiveRate>=50?'medium':'low'):'')}>{percent(r?.positiveRate)}</span>{r?.positiveRate!=null&&<div className="ratio"><i style={{width:r.positiveRate+'%'}}/></div>}</td>
        <td className="local-price"><select aria-label={row.name+'代表商店'} value={row.country} onChange={e=>void changeCountry(row.code,e.target.value)} disabled={!app}>{Object.entries(countries).map(([code,name])=><option key={code} value={code}>{name} · {code}</option>)}</select>
         <div title={p?`${p.source}｜${time(p.fetchedAt)}（台灣）｜${p.cacheState==='hit'?'快取':'本次讀取'}｜${p.reason??'App 層級報價；未驗證跨區套件相同'}`:row.priceError}>{row.priceError?<span className="bad small">{row.priceError}</span>:!p?<span className="pending">{stopped?'未完成':'讀取中…'}</span>:p.isFree?<b>免費</b>:amount!=null?<><b className="tabular">{money(amount,p.currency)}</b>{p.status==='temporary_free'&&basis==='final'&&<em>限時免費</em>}{!!p.discountPercent&&p.discountPercent>0&&basis==='final'&&<em>−{p.discountPercent}%</em>}</>:<span className="unavailable">{p.status==='coming_soon'?'尚未發售／定價':p.status==='error'?'來源存取失敗':'無單品報價'}</span>}</div>
         {c?.localUsdAmount!=null&&p?.currency!=='USD'&&!p?.isFree&&<small>約 {money(c.localUsdAmount,'USD')}{c.fxStale?' · 過期匯率':''}</small>}
        </td>
        <td className="tabular us-price" title={time(us?.fetchedAt)}>{us?.isFree?'免費':money(us?.[basis==='final'?'finalAmount':'initialAmount'],'USD')}</td>
        <td title={c?.reason??(c?.fxAsOf?'匯率日期：'+time(c.fxAsOf):'美元原幣比較')}><span className={'difference '+(d==null?'':d<-.05?'cheaper':d>.05?'dearer':'same')}>{d==null?'—':(Math.abs(d)<.05?'0.0%':(d>0?'+':'−')+Math.abs(d).toFixed(1)+'%')}</span><small className="diff-caption">{d==null?(p?'無法比較':''):Math.abs(d)<.05?'相同':d<0?'較便宜':'較貴'}</small></td>
       </tr>;
      })}
      {visible.length===0&&<tr><td colSpan={8} className="no-rows">沒有符合目前篩選的語言。</td></tr>}
     </tbody></table></div>
     <div className="table-footer"><span>顯示 {visible.length}／{languages.length} 種語言 · 點擊欄名排序</span><span>{offtopic==='exclude'?'已排除':'已納入'}離題評論活動 · 全部時間</span></div>
    </section>
    <div className="timestamps"><Clock3 size={14}/><span>評論：{time(sourceDates[0])}{sourceDates.at(-1)!==sourceDates[0]?' ～ '+time(sourceDates.at(-1)):''}</span><span>美國價格：{time(app?.usQuote.fetchedAt)}</span><span>匯率：{time(rows.find(r=>r.price?.comparisons[basis].fxAsOf)?.price?.comparisons[basis].fxAsOf)}</span><span>台灣時間 UTC+8</span></div>
   </>:<section className="empty-state"><div className="empty-heading"><span className="empty-icon"><BarChart3 size={23}/></span><div><h2>你的下一次遊戲觀察，從這裡開始。</h2><p>貼上商店連結，即可將評論分布與區域售價放在同一張表。</p></div><span className="ready-tag"><span/> 準備就緒</span></div><div className="feature-grid"><article><span className="feature-no">01</span><Languages size={23}/><h3>31 種評論語言</h3><p>完整列出評論總數、好評與負評，<br/>看見熱門語言之外的回饋。</p></article><article><span className="feature-no">02</span><Globe2 size={23}/><h3>一張表，比較各地售價</h3><p>自選代表商店，換算美元後，<br/>以美國售價為基準比較差異。</p></article><article><span className="feature-no">03</span><Download size={23}/><h3>整理、分享，再深入分析</h3><p>篩選與排序所需語言，<br/>分享查詢連結或匯出 Excel 用 CSV。</p></article></div></section>}
   <section id="method" className="method"><details><summary><Info size={16}/><b>如何閱讀這些數據？</b><span>資料來源、計算方式與使用限制</span><ChevronDown size={16}/></summary><div className="method-body"><article><h4>評論數與好評率</h4><p>採用 Steam 新版評論 API 的全量摘要。整體總數獨立查詢，並非表格加總；好評率＝好評數 ÷ 評論總數。無評論時顯示「—」，來源失敗不當成零。</p><a href="https://partner.steamgames.com/doc/webapi/IUserReviewsService" target="_blank" rel="noreferrer">Steam 評論 API 文件 ↗</a></article><article><h4>價格與換匯</h4><p>AppDetails 提供 App 層級主要報價，尚未驗證跨區套件內容完全相同。價差＝（當地價格換算美元 ÷ 美國售價 − 1）× 100%。負數較便宜；美國價為零或缺價時不計算。</p><p>比較使用查詢時公開售價與參考匯率，未校正稅制、手續費或個人購買條件，也不代表評論發表時的售價。</p></article><article><h4>更新與可用性</h4><p>評論快取約 30 分鐘，價格約 15 分鐘，匯率每日更新。重新整理仍尊重快取與限流。資料可能因商店限制或上游服務變更而部分缺失。</p><p>最近查詢僅儲存在此瀏覽器。本站不儲存玩家帳號或評論全文。{startedAt&&`本次開始：${time(startedAt)}${finishedAt?'；完成：'+time(finishedAt):''}。`}</p></article></div></details></section>
  </main>
  <footer><a className="footer-brand" href="/">Steam Lens <span>讓遊戲數據更清楚。</span></a><div><span>非 Valve 官方服務</span><a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates By Exchange Rate API <ArrowUpRight size={12}/></a></div></footer>
 </>;
}
