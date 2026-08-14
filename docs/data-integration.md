# 巴士資料整合層

本階段以同源 Serverless API 統一九巴／龍運及城巴的公開資料。前端不需要讓使用者選擇營辦商；`internalOperator` 只供程式內部取得正確端點。

## 官方資料來源

- 九巴／龍運：`https://data.etabus.gov.hk/v1/transport/kmb`
- 城巴：`https://rt.data.gov.hk/v2/transport/citybus`

現行路線與即時到站端點沒有提供可安全套用至每筆結果的完整車費，因此 `fare` 明確為 `null`。系統不會估算或捏造車費。

交通通知使用運輸署實時「特別交通消息（第二代）」XML，並只保留正文明確提及巴士服務受影響的項目。普通 ETA 備註只會保留在 `remark`，純道路事故亦不會被推測成指定路線的服務警報。

全程車費來自運輸署每兩星期更新的 `JSON_BUS.json`。`npm run data:fares` 會下載並建立只含支援營辦商、路線、方向、目的地及全程車費的精簡索引；ETA 只有在路線、方向、目的地和營辦商能可靠配對時才加入車費。介面會標示為「全程車費」，不會把尚未逐站配對的分段收費當成目前上車站的實付金額。

## API

所有功能使用 `GET /api/bus`，以 `action` 選擇資料：

- `?action=routes`：合併路線及方向。
- `?action=stops`：合併巴士站及座標。
- `?action=routeStops&operator=kmb-lwb&route=1&direction=outbound&serviceType=1`：指定方向的途經站。
- `?action=eta&operator=citybus&route=1&stopId=002403&serviceType=1`：指定站及路線的即時到站資料。
- `?action=nearby&latitude=22.288274&longitude=114.150422`：按位置取得去重及按下一班 ETA 排序的附近巴士。
- `?action=nearestRoute&operator=kmb-lwb&route=1&direction=outbound&serviceType=1&latitude=22.345&longitude=114.192`：由近至遠自動尋找有正確方向 ETA 的可乘搭站。

每個回應均包括 `data` 及 `cache`。當 `cache.isStale` 為 `true`，前端必須顯示 `cache.updatedAt`，不可把資料標示為即時。

九巴／龍運提供全站批次端點，因此 `action=stops` 會先回傳其完整站點。城巴沒有全站批次端點；城巴站點會在讀取指定路線站序時按需並行取得、共用及長期快取，並包含於 `routeStops` 回應，避免為了單一路線下載全港逐站資料。

附近搜尋使用 `npm run data:citybus` 從城巴官方路線、站序及站點端點重建版本化索引。索引保存來源和生成時間，網站執行時只對附近的路線呼叫 ETA。九巴／龍運則使用官方全站資料及整站 ETA 端點。

## 快取及可靠性

- 路線與全站資料：新鮮快取 14 日，最多保留 30 日作失效回退。
- 路線站序：新鮮快取 7 日，最多保留 30 日作失效回退。
- ETA：新鮮快取 20 秒，最後成功結果保留 24 小時作失效回退。
- 過了新鮮期限後先回傳舊資料，再在背景更新。
- 相同快取鍵的同時請求共用同一個上游請求。
- 上游請求預設 8 秒逾時。
- 若更新失敗但仍有最後成功結果，回應標示為失效資料；沒有成功資料才回傳錯誤。
- API 只接受 `GET`，輸入會先驗證，再組成官方端點網址。

## 附近巴士與最近站流程

- 瀏覽器只把使用者座標傳給同源中介 API；介面不顯示精確位置、地址、地圖或範圍控制。
- 附近巴士會合併兩個來源、按路線／目的地／方向去重，選擇最近站，再按下一班 ETA 排序。
- 跨來源比較鍵會忽略目的地括號及空格差異，但畫面保留官方繁中名稱。
- 指定路線會把正確方向的所有站按地理距離排列，分批由近至遠確認 ETA，找到第一個可乘搭站即停止。
- 只有整條路線都沒有可用 ETA 時才回傳最多三個最近替代站。
