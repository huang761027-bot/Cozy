# Cozy 業務助理 (Business Assistant)

Cozy 是一套專為個人工作室、接案者與中小型業務設計的輕量級管理系統。
支援 **手機 PWA（可直接加入主畫面當 App 使用）** 與 **電腦瀏覽器** 操作，並已完整整合 **Railway** 雲端平台與 **Railway MySQL** 資料庫。

---

## 🚀 系統核心功能

1. **客戶資料管理 (`Customers`)**
   - 記錄姓名、電話、LINE ID、地址、Email 與特殊備註。
   - 即時關鍵字搜尋與一鍵查看該客戶所有關聯紀錄（行程、報價單、收款紀錄）。

2. **工作與行程記錄 (`WorkLogs`)**
   - 記錄任務標題、預定執行時間、工作地點、詳細內容。
   - 狀態管理：`待處理`、`進行中`、`已完成`。
   - 儀表板自動列出今日待辦行程。

3. **報價單管理與列印 (`Quotations`)**
   - 自動編號（如 `QT-20260904-001`）。
   - 動態新增多筆品項、數量、單價，系統自動計算小計與報價總額。
   - 內建美化**報價單預覽與列印 / 另存 PDF** 功能。

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

### 步驟 4：產生公開網址
- 在 Cozy 服務的 **Settings** -> **Networking** -> 點擊 **Generate Domain**，即可獲得可公開存取的網址（例如 `https://cozy-production-xxxx.up.railway.app`）。

---

## 📱 如何在手機上當作 App (PWA) 使用

1. 使用手機瀏覽器開啟您的 Railway 網址：
   - **iPhone / iOS (Safari)**：點擊底部的「**分享**」圖示（帶箭頭的方框） -> 向下滑動選擇「**加入主畫面**」。
   - **Android (Chrome)**：點擊右上角「**選單 (三個點)**」 -> 選擇「**加到主畫面**」或「**安裝應用程式**」。
2. 加入後，手機桌面上會出現「Cozy 業務助理」圖示。
3. 點開後即為全螢幕 App 模式，操作順暢且無瀏覽器網址列干擾！
