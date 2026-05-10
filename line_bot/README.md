# Ledger LINE Bot

這個後端用來接收 LINE Messaging API webhook，解析轉傳的刷卡通知，並寫入 Supabase `records` 資料表。

## Render 環境變數

請在 Render 的 Environment 設定以下變數，不要寫進 GitHub：

```text
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

## Webhook URL

部署完成後，把 Render 網址加上 `/webhook` 填回 LINE：

```text
https://your-service.onrender.com/webhook
```

## 本機檢查

```bash
npm install
npm run check
```
