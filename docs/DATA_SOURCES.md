# 資料定義與來源

- 評論：Valve `IUserReviewsService/GetAppReviews/v1/`，透過 `input_json` 傳遞參數。adapter v1 只接受 `response.query_summary` 的總數，必須驗證好評＋負評＝總數；不採當頁筆數。
- 口徑：`filter=1`、`review_type=0`、`cursor=*`、`num_per_page=1`；購買來源 `steam=0 / all=1 / nonsteam=2`，離題活動以布林 `filter_offtopic_activity` 控制。各語言與獨立 `all` 完全一致。
- 價格：Steam AppDetails，固定 `l=english`，以 `cc` 指定商店。`initial` 與 `final` 實測為本來源專用的百分之一單位，USD/TWD/JPY/KRW 均除以 100。計算用 Decimal.js；格式化字串僅作原始資料保留與核對。
- 單品：報價範圍 `app_overview`，比較狀態 `app_overview_unverified`，不宣稱套件或內容完全相同。偵測到 App ID 或產品類型不一致即停止比較；不選最便宜組合包。
- 每次查詢先固定一份 US 報價，建立一小時有效的隨機快照 ID；所有列均引用該快照。切換原價／售價使用同一份原始報價重新呈現。
- 匯率：ExchangeRate-API Open Access `https://open.er-api.com/v6/latest/USD`。服務端依下次更新時間快取；失敗時最多使用發布後 48 小時的資料，並標示過期。USD 原幣比較不依賴匯率。API 不散布完整匯率表。
- 語言登錄版本：2026-11-03，31 種 Steam 平台 API 語言，不依單款遊戲的介面語言縮減。所有代表商店均是本專案可調整預設，非 Valve 官方語言／國家歸類。
- 資料時間為 UTC ISO 8601，畫面顯示台灣時間 UTC+8。CSV 包含時間、來源狀態及失敗原因。零與缺值分開；合法負數保持數值，外部文字防範 CSV 公式注入。

官方參考：

- https://partner.steamgames.com/doc/webapi/IUserReviewsService
- https://partner.steamgames.com/doc/store/localization/languages
- https://partner.steamgames.com/doc/store/pricing
- https://www.exchangerate-api.com/docs/free
