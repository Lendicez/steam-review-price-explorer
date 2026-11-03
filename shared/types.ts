export type Basis = 'final'|'initial';
export type Purchase = 'all'|'steam'|'nonsteam';
export interface State { status:string; reason?:string; errorCode?:string; fetchedAt:string; cacheState?:string; source:string; retryAfter?:number; }
export interface Review extends State {appId:number; languageCode:string; total:number|null; positive:number|null; negative:number|null; positiveRate:number|null; purchaseFilter:string; offTopicFilter:string;}
export interface Quote extends State {appId:number; countryCode:string; appName?:string; appType?:string; currency:string|null; initialAmount:string|null; finalAmount:string|null; discountPercent:number|null; formattedInitial?:string; formattedFinal?:string; isFree:boolean; quoteScope:'app_overview'; sourceAmountScale:number|null; comparabilityStatus:string; rawInitial?:number; rawFinal?:number;}
export interface Comparison {status:string; reason?:string; localUsdAmount:string|null; usUsdAmount:string|null; differencePercent:number|null; basis:Basis; fxProvider:string; fxAsOf:string|null; fxStale:boolean; calculatedAt:string;}
export interface PriceResult {localQuote:Quote; usQuote:Quote; comparisons:Record<Basis,Comparison>;}
export interface AppResult {appId:number; appName:string; usQuote:Quote; baseToken:string; fetchedAt:string;}
export interface Row {code:string; name:string; country:string; review?:Review; price?:PriceResult; priceError?:string;}
export interface Fx {rates:Record<string,number>; asOf:string; nextUpdate:number; stale?:boolean;}
