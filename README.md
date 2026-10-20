# Cozy 業務助理 (Business Assistant)

Cozy 是一套專為個人工作室、接案者與中小型業務設計的輕量級管理系統。
支援 **手機 PWA（可直接加入主畫面當 App 使用）** 與 **電腦瀏覽器** 操作，並已完整整合 **Railway** 雲端平台與 **Railway MySQL** 資料庫。

---

## 🚀 系統核心功能

1. **客戶資料管理 (`Customers`)**
   - 記錄姓名、電話、LINE ID、地址、Email 與特殊備註。
   - 即時關鍵字搜尋與一鍵查看該客戶所有關聯紀錄（專案案場、保養/安裝/維修工單、收款紀錄）。

2. **工作與行程記錄 (`WorkLogs`)**
   - 記錄任務標題、類型（保養 / 安裝 / 維修）、預定執行時間、工作地點、詳細內容。
   - 狀態管理：`待處理`、`進行中`、`已完成`。
   - 儀表板自動列出今日待辦行程。

3. **專案 / 案場管理 (`Projects`)**
   - 自動編號（如 `PRJ-20260904-01`），記錄案場地址、現場窗口、預算與開工/完工日期。
   - 案場附件庫：可上傳 Word、PDF、設計圖與施工照片（僅登入者可下載）。

4. **收費與帳務管理 (`Payments`)**
   - 支援「**⚡ 快速記帳**」（例如一鍵登記某客戶收款 $5,000）。
   - 記錄收款方式（現金、匯款、LINE Pay、信用卡等）、發票/收據號碼與收款狀態。
   - 儀表板自動統計本月營收與未收款總額。

---

## ☁️ 如何在 Railway 上部署與連接 MySQL

### 步驟 1：建立 Railway 專案與 MySQL 資料庫
1. 登入 [Railway.app](https://railway.app/)。
2. 點擊 **New Project** -> 選擇 **Provision MySQL**。
3. Railway 會自動建立一個 MySQL 服務。

### 步驟 2：部署 Cozy 應用程式
1. 將本專案（`D:\程式碼\VS2017\Cozy`）推送到您的 **GitHub** 儲存庫。
2. 在 Railway 專案畫面上，點擊 **New** -> **GitHub Repo** -> 選擇此專案。
3. Railway 會自動讀取專案內的 `Dockerfile` 並以 **.NET 8** 進行建置。

### 步驟 3：連接 MySQL
- 本系統內建 **Railway MySQL 環境變數自動解析**：
  - 只要 Cozy 與 MySQL 放在同一個 Railway Project，或在 Cozy 服務的 **Variables** 中將 MySQL 的變數加入（Railway 通常會自動注入 `MYSQL_URL` 或 `MYSQLHOST` / `MYSQLPASSWORD` 等），系統在啟動時就會自動連線並自動建立所需資料表（不需要手動執行 SQL 建立指令）。

### 步驟 3.5：設定登入安全相關環境變數
在 Cozy 服務的 **Variables** 中設定：
- `GOOGLE_CLIENT_ID`（**必填**）：Google OAuth 用戶端 ID，後端會用它驗證 Google 登入憑證的簽章與對象，未設定時無法登入。
- `SUPER_ADMIN_EMAIL`（建議）：超級管理者的 Google 帳號，首次登入時自動建立為 Admin。
- `ICAL_TOKEN`（選填）：一組隨機長字串。設定後可用 `https://<網址>/api/worklogs/calendar.ics?token=<ICAL_TOKEN>` 讓外部行事曆訂閱；未設定時只有已登入的使用者能下載行事曆檔。
- 建議為 Cozy 掛載 Railway Volume 到 `/app/data`：登入 Session 的加密金鑰與案場附件檔案都會保存在此，重新部署後使用者不必重新登入、上傳的檔案也不會遺失。

### 步驟 4：產生公開網址
- 在 Cozy 服務的 **Settings** -> **Networking** -> 點擊 **Generate Domain**，即可獲得可公開存取的網址（例如 `https://cozy-production-xxxx.up.railway.app`）。

---

## 📱 如何在手機上當作 App (PWA) 使用

1. 使用手機瀏覽器開啟您的 Railway 網址：
   - **iPhone / iOS (Safari)**：點擊底部的「**分享**」圖示（帶箭頭的方框） -> 向下滑動選擇「**加入主畫面**」。
   - **Android (Chrome)**：點擊右上角「**選單 (三個點)**」 -> 選擇「**加到主畫面**」或「**安裝應用程式**」。
2. 加入後，手機桌面上會出現「Cozy 業務助理」圖示。
3. 點開後即為全螢幕 App 模式，操作順暢且無瀏覽器網址列干擾！
