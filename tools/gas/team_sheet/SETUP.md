# Team 班表 Google Sheet 自動讀取 — 部署步驟

讓 tutor-billing 網站直接讀「班表」Google Sheet 的「當月 + 上月」分頁,取代手動匯出 Excel。

## 一次性設定(你來做)

1. **打開「班表」Google Sheet**(底部有一堆 `2026.5`、`2026.6` 分頁那份)。
2. 上方選單 **擴充功能 → Apps Script**。
3. 把 `Code.gs` 整份內容貼進去(蓋掉預設的 `function myFunction(){}`),按 💾 存檔。
4. 右上 **部署 → 新增部署**:
   - 齒輪選類型 → **網頁應用程式**
   - 執行身分(Execute as):**我(Me)**
   - 誰可以存取(Who has access):**所有人(Anyone)** ← 一定選這個,網站不會登入 Google
   - 按 **部署**,第一次會要你授權(選你的帳號 → 進階 → 前往…(不安全)→ 允許)
5. 複製出現的「網頁應用程式 URL」(長得像 `https://script.google.com/macros/s/AKfyc.../exec`),貼給 Claude。

## 驗證(部署後)

瀏覽器直接開(把 `XXX` 換成你的 exec URL):

```
XXX?token=TBTEAM_k7n2qx9w&callback=test
```

應該看到 `test({"ok":true,"months":[{"name":"2026.6","found":true,"values":[[...]]},{"name":"2026.5",...}]})`。
日期欄會是 `yyyy-MM-dd` 字串。

## 之後改了 Code.gs 要重新部署

GAS 不會自動更新已部署版本:**管理部署 → 編輯(鉛筆)→ 版本選「New version」→ 部署**。

## 備註

- `TEAM_TOKEN`(`TBTEAM_k7n2qx9w`)是公開防亂打字串,會出現在網站原始碼,**不是真密碼**,只擋亂打。
- 分頁名是「年.月」(`2026.6`,不補零);若某月你補了零(`2026.06`)也找得到。
- 當月分頁還沒建(月初)→ 網站只會載到上月,不會報錯。
