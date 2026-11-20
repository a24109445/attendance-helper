# 打卡小幫手

適合小型團隊使用的手機打卡 PWA。資料只儲存在使用者目前的瀏覽器中，不需要登入或伺服器。

正式網址：https://a24109445.github.io/attendance-helper/

GitHub 儲存庫：https://github.com/a24109445/attendance-helper

## 初版功能

- 新增、編輯與刪除員工
- 設定每位員工的時薪
- 選擇員工並進行上班／下班打卡
- 自動計算工時與預估薪資
- 依月份與員工篩選紀錄
- 下載 CSV 紀錄到手機
- 可安裝至 iPhone 主畫面，並支援離線開啟

## 本機預覽

PWA 需要透過 HTTP 服務，請勿直接雙擊 `index.html`：

```powershell
python -m http.server 4173
```

接著開啟 <http://localhost:4173>。

## iPhone 安裝方式

使用 Safari 開啟部署後的網址，點選「分享」→「加入主畫面」。

## 資料說明

所有員工與打卡資料目前使用 `localStorage` 儲存在單一裝置。清除 Safari 網站資料會一併刪除紀錄，建議定期下載 CSV 備份。
