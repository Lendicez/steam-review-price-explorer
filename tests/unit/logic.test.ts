import {describe,it,expect} from 'vitest';
import {parseAppId,parseReview,parseQuote,compare,positiveRate,csvCell,exportCsv,numericSort} from '../../shared/logic';
import {languages,countries} from '../../shared/config';
import type {Quote,Fx} from '../../shared/types';
const q=(cc='TW',currency='TWD',initial=32000,final=initial):Quote=>parseQuote({'620':{success:true,data:{name:'Test',steam_appid:620,type:'game',price_overview:{currency,initial,final,discount_percent:0}}}},620,cc);
const fx:Fx={rates:{TWD:32},asOf:new Date().toISOString(),nextUpdate:Date.now()+86400000};
describe('input validation',()=>{
 it.each(['620',' 620 ','https://store.steampowered.com/app/620/Portal_2/?l=tchinese'])('accepts %s',s=>expect(parseAppId(s)).toBe(620));
 it.each(['0','-1','1.5','4294967296','https://evil.com/app/620','https://store.steampowered.com.evil.test/app/620','https://store.steampowered.com/sub/620','https://store.steampowered.com/bundle/620','https://user:pass@store.steampowered.com/app/620','https://store.steampowered.com:444/app/620','file:///app/620'])('rejects %s',s=>expect(()=>parseAppId(s)).toThrow());
});
describe('review totals',()=>{
 it('uses the summary, not the page length',()=>{const r=parseReview({response:{query_summary:{num_reviews:1,total_positive:90,total_negative:10,total_reviews:100},reviews:[{}]}},620,'tchinese','all','exclude');expect(r.total).toBe(100);expect(r.positiveRate).toBe(90);});
 it('keeps zero percent undefined',()=>expect(positiveRate(0,0)).toBeNull());
 it('weighted overall is ten percent',()=>expect(positiveRate(1,10)).toBe(10));
 it('accepts explicitly proven no reviews with omitted protobuf zeros',()=>expect(parseReview({response:{query_summary:{},total_matching:0,reviews:[]}},620,'malay','all','exclude').total).toBe(0));
 it.each([{}, {response:{query_summary:{total_reviews:5}}}, {response:{query_summary:{total_positive:1,total_negative:2,total_reviews:4}}}])('rejects malformed summaries',raw=>expect(()=>parseReview(raw,620,'english','all','exclude')).toThrow());
 it('supports large counts',()=>expect(positiveRate(3000000000,4000000000)).toBe(75));
});
describe('provider-specific price scale',()=>{
 it.each([['USD',999,'9.99'],['TWD',19800,'198'],['JPY',140000,'1400'],['KRW',1100000,'11000']])('normalizes %s', (currency,raw,expected)=>expect(q('US',String(currency),Number(raw)).finalAmount).toBe(expected));
 it('does not guess free from missing price',()=>{const p=parseQuote({'620':{success:true,data:{}}},620,'TW');expect(p.isFree).toBe(false);expect(p.finalAmount).toBeNull();});
 it('recognizes permanent free',()=>expect(parseQuote({'620':{success:true,data:{is_free:true}}},620,'US').status).toBe('free'));
 it('recognizes temporary free',()=>expect(parseQuote({'620':{success:true,data:{price_overview:{currency:'USD',initial:2000,final:0,discount_percent:100}}}},620,'US').status).toBe('temporary_free'));
 it('retains missing initial price',()=>expect(parseQuote({'620':{success:true,data:{price_overview:{currency:'USD',final:999}}}},620,'US').initialAmount).toBeNull());
 it('does not infer region lock',()=>expect(parseQuote({'620':{success:false}},620,'RU').reason).toContain('原因未明'));
 it('rejects app substitution',()=>expect(parseQuote({'620':{success:true,data:{steam_appid:570}}},620,'US').status).toBe('incompatible'));
});
describe('price comparison',()=>{
 it('TWD 320 = USD 10 = -50%',()=>{const c=compare(q(),q('US','USD',2000),'final',fx);expect(c.localUsdAmount).toBe('10.00000000');expect(c.differencePercent).toBe(-50);});
 it('TWD 960 = +50%',()=>expect(compare(q('TW','TWD',96000),q('US','USD',2000),'final',fx).differencePercent).toBe(50));
 it('USD comparisons work offline',()=>expect(compare(q('TR','USD',1500),q('US','USD',2000),'final',null).differencePercent).toBe(-25));
 it('US zero never divides by zero',()=>expect(compare(q(),q('US','USD',0),'final',fx).differencePercent).toBeNull());
 it('local zero = -100%',()=>expect(compare(q('TW','TWD',0),q('US','USD',2000),'final',fx).differencePercent).toBe(-100));
 it('missing currency never invents a rate',()=>expect(compare(q(),q('US','USD',2000),'final',{...fx,rates:{}}).differencePercent).toBeNull());
 it('expired FX stops conversion after 48 hours',()=>expect(compare(q(),q('US','USD',2000),'final',{...fx,asOf:new Date(Date.now()-49*3600e3).toISOString()}).differencePercent).toBeNull());
 it('both sides use the same basis',()=>{const p=q('TW','TWD',64000,32000),us=q('US','USD',4000,1000);expect(compare(p,us,'final',fx).differencePercent).toBe(0);expect(compare(p,us,'initial',fx).differencePercent).toBe(-50);});
 it('incompatible versions stop calculation',()=>expect(compare({...q(),comparabilityStatus:'incompatible'},q('US','USD',2000),'final',fx).differencePercent).toBeNull());
 it('unverified app overview remains explicit',()=>expect(q().comparabilityStatus).toBe('app_overview_unverified'));
});
describe('display/export',()=>{
 it.each(['=HYPERLINK("x")','+cmd','-cmd','@SUM(A1)','  =bad','\tbad'])('protects formula text %s',s=>expect(csvCell(s)).toMatch(/^"'/));
 it('keeps a legitimate negative number numeric',()=>expect(csvCell(-35.2)).toBe('-35.2'));
 it('quotes multiline and quoted strings',()=>expect(csvCell('A,"B"\nC')).toBe('"A,""B""\nC"'));
 it('does not export NaN or Infinity',()=>{expect(csvCell(NaN)).toBe('');expect(csvCell(Infinity)).toBe('');expect(csvCell(null)).toBe('');});
 it('includes BOM and partial statuses',()=>{const csv=exportCsv([{code:'english',name:'英文',country:'US'}],620,'=danger','all','exclude','final');expect(csv.startsWith('\ufeff')).toBe(true);expect(csv).toContain("'=danger");expect(csv).toContain('"pending"');});
 it.each(['asc','desc'] as const)('missing data sorts last %s',direction=>{expect(numericSort(null,1,direction)).toBe(1);expect(numericSort(1,null,direction)).toBe(-1);});
 it('numeric sorting uses values',()=>expect(numericSort(100,20,'asc')).toBeGreaterThan(0));
 it('all languages have a valid explicit region',()=>{expect(languages.length).toBe(31);expect(new Set(languages.map(x=>x.code)).size).toBe(31);expect(languages.every(x=>countries[x.country])).toBe(true);});
});
