// End-to-end HTTP verification of the deployed application, without browser automation.
import {writeFile} from 'node:fs/promises';
const base=process.env.VERIFY_BASE_URL??'https://steam-review-price-explorer-lendicez.lendicez.chatgpt.site';
const results=[];
async function check(path,validate){const r=await fetch(base+path,{signal:AbortSignal.timeout(45000)});const d=await r.json();const ok=validate(d,r.status);const entry={path,status:r.status,ok,time:new Date().toISOString(),data:d};results.push(entry);console.log(path,r.status,ok?'PASS':'FAIL');return d;}
await check('/api/health',(d,s)=>s===200&&d.status==='ok');
const config=await check('/api/config',(d,s)=>s===200&&d.languages.length===31);
const meta=await check('/api/app/620',(d,s)=>s===200&&d.appName==='Portal 2'&&d.usQuote.currency==='USD'&&d.usQuote.status==='ok');
const validReviews=(d,s)=>s===200&&d.status==='ok'&&d.positive+d.negative===d.total;
const all=await check('/api/reviews/620?language=all',validReviews);
let index=0;await Promise.all(Array.from({length:2},async()=>{while(index<config.languages.length){const l=config.languages[index++];await check('/api/reviews/620?language='+l.code,validReviews);}}));
for(const country of ['US','TW','JP','KR'])await check('/api/compare/620?'+new URLSearchParams({country,us:meta.baseToken}),(d,s)=>s===200&&d.usQuote.fetchedAt===meta.usQuote.fetchedAt&&d.comparisons.final.status==='ok'&&Number.isFinite(d.comparisons.final.differencePercent));
for(const p of ['steam','nonsteam'])await check('/api/reviews/620?'+new URLSearchParams({language:'tchinese',purchase:p,offtopic:'include'}),(d,s)=>validReviews(d,s)&&d.purchaseFilter===p&&d.offTopicFilter==='include');
for(const id of [570,4706950]){const app=await check('/api/app/'+id,(d,s)=>s===200&&(id===570?d.usQuote.isFree:d.usQuote.status==='ok'));await check('/api/reviews/'+id+'?language=all',validReviews);for(const country of ['US','TW','JP','KR'])await check('/api/compare/'+id+'?'+new URLSearchParams({country,us:app.baseToken}),(d,s)=>s===200&&(id===570?d.localQuote.isFree&&d.comparisons.final.differencePercent===null:d.comparisons.final.status==='ok'));}
await check('/api/reviews/0',(d,s)=>s===400);
await check('/api/reviews/620?language=invalid',(d,s)=>s===400);
await check('/api/compare/620?country=XX',(d,s)=>s===400);
const sanitized=results.map(({data,path,...r})=>({...r,path:path.replace(/us=[^&]+/,'us=[snapshot]'),data:data?.baseToken?{...data,baseToken:'[snapshot]'}:data}));
await writeFile('docs/live-verification.json',JSON.stringify({base,results:sanitized},null,2)+'\n');
console.log('Result:',results.filter(x=>x.ok).length+'/'+results.length);if(results.some(x=>!x.ok))process.exitCode=1;
