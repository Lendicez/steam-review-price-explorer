# 部署與回復

## 現行部署

公開前後端採同源 Cloudflare Workers（Sites），來源保存在 GitHub。`.openai/hosting.json` 綁定 D1 `DB`，不使用 R2、不需要帳號密鑰或 Steam API Key。發布工具會執行版本化 D1 migrations，再部署建置輸出。

1. 使用 pnpm lockfile 安裝已鎖定相依套件。
2. `npm test`、`npm run typecheck`、`npm run build`。
3. 將同一份原始碼提交、推送，再封裝 `dist/` 及 hosting manifest。
4. 以 Sites 保存版本並部署；公開存取已由專案擁有人要求。
5. 上線後執行 `/api/health`、付費／免費／限制情境及 UI 查詢驗證。

回復：在 Sites 重新部署先前已保存的版本。D1 migration 為不可變歷史；本版只有快取、額度與短期租約資料，無使用者內容。不可為回復程式而隨意修改已執行 migration。

## 共用快取與流量控制

D1 為所有 Worker 實例共用。以原子 UPSERT 實作每個來源最多 3 個並行租約、相同請求合併與跨實例額度。評論快取 30 分鐘、報價 15 分鐘、來源錯誤 60 秒；價格 key 包含國家碼，評論 key 包含語言及統計條件。

- 每個訪客 10 分鐘最多 900 個 API 請求及 12 次完整遊戲查詢。每次完整查詢約 64 個請求，不會因正常單次查詢而被誤擋。
- 各來源全站每分鐘 120 次、每小時 1,800 次上游預算，跨實例共享；快取命中不消耗上游額度。
- IP 只用每日輪替摘要作短期額度 key，不儲存原始 IP；額度過期清理。
- 快取容量上限約 10,000 筆；來源回應上限 2 MB，請求逾時 12 秒，5xx 最多重試 2 次。
- 429 遵守 Retry-After（最多冷卻 1 小時），403 也觸發冷卻，無永久失敗重試。
- 所有價格比較只接受已建立的 US 快照，不提供任意 URL proxy 或通用匯率 API。

本服務不保證無限免費流量。實際 Sites/Cloudflare 帳戶額度、費用與 Steam 可用性由其服務政策決定。本次未建立另行付費的雲端訂閱。

## 本機與 Docker

Dockerfile 為本機可攜式 Worker 執行環境，不替代正式 Cloudflare 邊緣服務。容器會啟動 Wrangler 本機模擬與 SQLite，便於自用及重現。若需改成 Express/Node 原生服務，必須另外替換 D1 adapter 與 SSR 執行環境，不能直接當作已完成。

```sh
docker build -t steam-lens .
docker run --rm -p 8787:8787 -v steam-lens-data:/app/.wrangler steam-lens
```

Windows 操作詳見 README。平台需能連線 `api.steampowered.com`、`store.steampowered.com`、`open.er-api.com`。不可使用第三方代理繞過來源限制。
