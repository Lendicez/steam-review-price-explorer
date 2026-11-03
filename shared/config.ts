export const registryVersion = '2026-11-03';
export const languages = [
 ['tchinese','繁體中文','TW'],['schinese','簡體中文','CN'],['english','英文','US'],['japanese','日文','JP'],['koreana','韓文','KR'],['arabic','阿拉伯文','SA'],['bulgarian','保加利亞文','BG'],['czech','捷克文','CZ'],['danish','丹麥文','DK'],['dutch','荷蘭文','NL'],['finnish','芬蘭文','FI'],['french','法文','FR'],['german','德文','DE'],['greek','希臘文','GR'],['hungarian','匈牙利文','HU'],['indonesian','印尼文','ID'],['italian','義大利文','IT'],['malay','馬來文','MY'],['norwegian','挪威文','NO'],['polish','波蘭文','PL'],['portuguese','葡萄牙文','PT'],['brazilian','巴西葡萄牙文','BR'],['romanian','羅馬尼亞文','RO'],['russian','俄文','RU'],['spanish','西班牙文（西班牙）','ES'],['latam','西班牙文（拉丁美洲）','MX'],['swedish','瑞典文','SE'],['thai','泰文','TH'],['turkish','土耳其文','TR'],['ukrainian','烏克蘭文','UA'],['vietnamese','越南文','VN'],
].map(([code,name,country])=>({code,name,country}));
export const countries: Record<string,string> = {TW:'台灣',CN:'中國',US:'美國',JP:'日本',KR:'韓國',SA:'沙烏地阿拉伯',BG:'保加利亞',CZ:'捷克',DK:'丹麥',NL:'荷蘭',FI:'芬蘭',FR:'法國',DE:'德國',GR:'希臘',HU:'匈牙利',ID:'印尼',IT:'義大利',MY:'馬來西亞',NO:'挪威',PL:'波蘭',PT:'葡萄牙',BR:'巴西',RO:'羅馬尼亞',RU:'俄羅斯',ES:'西班牙',MX:'墨西哥',SE:'瑞典',TH:'泰國',TR:'土耳其',UA:'烏克蘭',VN:'越南',HK:'香港',GB:'英國',CA:'加拿大',AU:'澳洲',NZ:'紐西蘭',AR:'阿根廷',CL:'智利',CO:'哥倫比亞',AE:'阿拉伯聯合大公國',EG:'埃及',KZ:'哈薩克'};
export const purchaseLabels: Record<string,string> = {all:'全部購買來源',steam:'Steam 直接購買',nonsteam:'非 Steam 直接購買（含序號）'};
export const reviewSource = 'https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/';
export const priceSource = 'https://store.steampowered.com/api/appdetails';
export const fxSource = 'https://open.er-api.com/v6/latest/USD';
export const disclaimer = '評論依撰寫語言分類，並非依玩家國家分類。售價取自各列選定的代表商店，不代表該語言所有玩家的所在地或實付金額。';
