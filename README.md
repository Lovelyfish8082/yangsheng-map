# 養生村地圖

桃園以北（台北、新北、桃園）養生村與公辦老人公寓的地圖網站，給長輩用：大字、大按鈕、可加到手機主畫面（PWA）。

## 功能（第一版）
- 地圖：公辦（藍）／私立（橘）圖釘，點選看月費與距離
- 自選「從哪裡算距離」：預設地點、目前位置、在地圖上點選並存成常用地點
- 列表篩選：地區、類型、每月預算、入住先付；依距離或月費排序
- 詳細頁：每月費用、入住先付、距離三個大數字；一鍵打電話、Google 地圖導航、LINE 分享；筆記
- 並排比較最多 3 間，不同處標色、最省的標示
- 圖表：月費範圍、住 10 年大約總花費
- 收藏與筆記存在手機上（localStorage）
- 字體三段放大

## 更新資料
只要改 `data/villages.json`。金額單位是「元」，查不到的填 `null`，並更新 `verified_at` 與 `confidence`（`official`／`phone`／`media`／`unverified`）。改完後把 `sw.js` 裡的 `VERSION` 加 1，手機才會抓到新版。

## 本機預覽
```
python3 -m http.server 8000
```
打開 http://localhost:8000

## 發佈
推到 GitHub 後，在 repo 的 Settings → Pages 選 `main` 分支、根目錄即可。

地圖圖磚 © OpenStreetMap 貢獻者；使用 Leaflet 1.9.4 與 Chart.js 4.4.1（授權見 `vendor/`）。費用為 2026 年媒體整理參考值，入住前請以各家公告為準。
