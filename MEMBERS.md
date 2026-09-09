# 會員測試版（2026-09-09）

## 本次功能
- 電子郵件與密碼註冊／登入／登出，姓名、生日、ISO 國家選擇，電話與地址可選填並修改。
- PBKDF2-SHA256 600,000 rounds + random salt；伺服器 session 使用隨機 token、資料庫僅保存 token hash，Secure / HttpOnly / SameSite Cookie，7 天到期。
- 登出撤銷 session，改密碼撤銷所有 session。資料庫 active=0 可停用會員，但管理 UI 尚未實作。
- 寫入檢查同源 Origin、限制 JSON 請求大小；註冊、登入、改密碼、送單有持久化限流。
- 結帳頁與送單 API 都必須登入；訂單 email、會員 ID、編號及建立時間由伺服器決定。
- 會員訂單列表／明細以會員 ID 限制查詢，有分頁；重送相同請求不建立重複訂單。
- 舊訂單不透過 email 自動歸戶。原 /api/orders 與 /api/order/status 已關閉，等待獨立管理員登入與權限功能。

## 部署
- GitHub wugong-pen/wugong 的 staging → wugong-test，DB 為 wugong-orders-test。
- 先執行 `wrangler d1 execute wugong-orders-test --remote --file=schema-members.sql`，再 `wrangler deploy`。
- schema 只新增會員、session、訂單關聯、限流資料表及索引，可重複執行；不修改或清空舊 orders。
- main / wugong / 正式 DB 不在本次發布範圍；正式部署仍需使用者確認版本。
- 後续正式發布需先遷移正式資料庫並調整部署命令為 `wrangler deploy --env production`。

## 驗證
- `node --test member.test.mjs runtime.test.mjs`：SQLite 行為與 Cloudflare workerd/D1 實際相容性測試。
- 測試內容：日期與國家檢核、重複帳號、錯誤密碼、Cookie、未登入阻擋、跨會員讀取、同源檢查、持久化限流、重複送單、登出與改密碼後 session 失效、重複 migration 不損失訂單。

## 尚未包含／正式發布前依賴
- 電子郵件所有權驗證與忘記密碼寄信尚未串接寄信服務。Email 目前是登入名稱，不能視為已驗證，生日不可用於找回密碼。
- 管理員 UI、會員停權 UI、舊訂單人工歸戶待後台功能處理。
- 商品價格目前仍來自購物車；雖伺服器重算加總，仍未對商品目錄核價。金流、庫存、贈品、運費與寄送限制尚未實作。
- 因此只允許 staging 建立測試訂單；production 的新送單流程在安全結帳完成前回傳 503。
- 所有國家可建立會員，不代表所有國家可寄送；收件國家另存訂單，供後續海外禁寄墨水規則使用。
