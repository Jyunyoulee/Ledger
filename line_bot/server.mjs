import crypto from "node:crypto";
import express from "express";
import { createClient } from "@supabase/supabase-js";

const {
  LINE_CHANNEL_SECRET,
  LINE_CHANNEL_ACCESS_TOKEN,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  PORT = 3000
} = process.env;

const requiredEnv = {
  LINE_CHANNEL_SECRET,
  LINE_CHANNEL_ACCESS_TOKEN,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
};

for (const [name, value] of Object.entries(requiredEnv)) {
  if (!value) {
    console.warn(`Missing environment variable: ${name}`);
  }
}

const app = express();
const supabase = createClient(SUPABASE_URL || "http://localhost", SUPABASE_SERVICE_ROLE_KEY || "missing-key", {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  })
);

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "ledger-line-bot" });
});

app.post("/webhook", async (req, res) => {
  if (!verifyLineSignature(req)) {
    res.status(401).json({ error: "Invalid LINE signature" });
    return;
  }

  res.status(200).end();

  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  await Promise.all(events.map(handleLineEvent));
});

async function handleLineEvent(event) {
  if (event.type !== "message" || event.message?.type !== "text") return;

  const text = event.message.text.trim();
  const parsed = parseCardNotice(text);

  if (!parsed) {
    await replyMessage(event.replyToken, "我目前無法解析這則刷卡通知。請確認訊息內有日期、金額或店家名稱。");
    return;
  }

  const { error } = await supabase.from("records").insert({
    date: parsed.date,
    type: "expense",
    amount: parsed.amount,
    category_name: parsed.categoryName,
    category_color: parsed.categoryColor,
    note: parsed.note,
    payment: "card",
    source: "line-card",
    raw_text: text
  });

  if (error) {
    console.error("Supabase insert failed:", error);
    await replyMessage(event.replyToken, "資料庫寫入失敗，請稍後再試，或檢查 Supabase 設定。");
    return;
  }

  await replyMessage(
    event.replyToken,
    `已加入帳目：${parsed.note} $${formatMoney(parsed.amount)}，類別：${parsed.categoryName}`
  );
}

function verifyLineSignature(req) {
  const signature = req.get("x-line-signature");
  if (!signature || !LINE_CHANNEL_SECRET || !req.rawBody) return false;

  const digest = crypto
    .createHmac("sha256", LINE_CHANNEL_SECRET)
    .update(req.rawBody)
    .digest("base64");

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

async function replyMessage(replyToken, text) {
  if (!replyToken || !LINE_CHANNEL_ACCESS_TOKEN) return;

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("LINE reply failed:", response.status, body);
  }
}

function parseCardNotice(text) {
  const compact = text.replace(/\s+/g, " ").trim();
  const amountMatch =
    compact.match(/(?:NT\$|NTD|TWD|新臺幣|新台幣|台幣|金額[:：]?|消費[:：]?)\s*\$?\s*([\d,]+)/i) ||
    compact.match(/([\d,]+)\s*元/);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const dateMatch =
    compact.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/) ||
    compact.match(/(\d{1,2})[/-](\d{1,2})/);
  const date = dateMatch ? dateFromMatch(dateMatch) : todayISO();
  const note = extractMerchant(compact) || "國泰 LINE 刷卡通知";
  const categoryName = guessCategory(note || compact);

  return {
    amount,
    date,
    note,
    categoryName,
    categoryColor: "#8ce99a"
  };
}

function dateFromMatch(match) {
  if (match.length === 4) {
    return `${match[1]}-${pad(Number(match[2]))}-${pad(Number(match[3]))}`;
  }
  const year = new Date().getFullYear();
  return `${year}-${pad(Number(match[1]))}-${pad(Number(match[2]))}`;
}

function extractMerchant(text) {
  const patterns = [
    /(?:商店|特店|店家|消費地|交易說明|摘要)[:：]\s*([^，。,;；]+)/,
    /(?:於|在)\s*([^，。,;；]+?)\s*(?:消費|刷卡|交易)/,
    /(?:消費|刷卡|交易)\s*(?:於|在)\s*([^，。,;；]+)/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function guessCategory(note) {
  if (/餐|咖啡|飲|food|restaurant|cafe/i.test(note)) return "餐飲";
  if (/車|捷運|高鐵|交通|uber|taxi|metro/i.test(note)) return "交通";
  if (/書|課|學|course|book/i.test(note)) return "學習";
  if (/電腦|手機|設備|3c|apple|electronics/i.test(note)) return "設備";
  return "信用卡";
}

function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function pad(value) {
  return value.toString().padStart(2, "0");
}

function formatMoney(value) {
  return Number(value).toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}

app.listen(Number(PORT), () => {
  console.log(`Ledger LINE bot listening on port ${PORT}`);
});
