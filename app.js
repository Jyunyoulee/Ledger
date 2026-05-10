const STORAGE_KEY = "neon-ledger-state-v1";

const defaultState = {
  categories: [
    { id: crypto.randomUUID(), name: "餐飲", color: "#38d9a9" },
    { id: crypto.randomUUID(), name: "交通", color: "#42e8f5" },
    { id: crypto.randomUUID(), name: "學習", color: "#f6c85f" },
    { id: crypto.randomUUID(), name: "設備", color: "#ff4fa3" }
  ],
  reminders: ["12:30", "21:20"],
  records: []
};

let state = loadState();
let toastTimer = null;
let reminderTimer = null;
let lastReminderKey = "";

const els = {
  amount: document.querySelector("#amountInput"),
  category: document.querySelector("#categorySelect"),
  date: document.querySelector("#dateInput"),
  payment: document.querySelector("#paymentInput"),
  note: document.querySelector("#noteInput"),
  recordForm: document.querySelector("#recordForm"),
  cardForm: document.querySelector("#cardForm"),
  cardDate: document.querySelector("#cardDateInput"),
  cardAmount: document.querySelector("#cardAmountInput"),
  cardCategory: document.querySelector("#cardCategorySelect"),
  cardNote: document.querySelector("#cardNoteInput"),
  cardCsv: document.querySelector("#cardCsvInput"),
  cardImportMessage: document.querySelector("#cardImportMessage"),
  categoryForm: document.querySelector("#categoryForm"),
  categoryName: document.querySelector("#categoryNameInput"),
  categoryColor: document.querySelector("#categoryColorInput"),
  categoryList: document.querySelector("#categoryList"),
  categoryBars: document.querySelector("#categoryBars"),
  reminderForm: document.querySelector("#reminderForm"),
  reminderTime: document.querySelector("#reminderTimeInput"),
  reminderList: document.querySelector("#reminderList"),
  recordList: document.querySelector("#recordList"),
  todayExpense: document.querySelector("#todayExpense"),
  monthBalance: document.querySelector("#monthBalance"),
  monthInput: document.querySelector("#monthInput"),
  monthExpense: document.querySelector("#monthExpense"),
  cardExpense: document.querySelector("#cardExpense"),
  topCategory: document.querySelector("#topCategory"),
  savingTips: document.querySelector("#savingTips"),
  recordCount: document.querySelector("#recordCount"),
  formMessage: document.querySelector("#formMessage"),
  clearRecords: document.querySelector("#clearRecordsBtn"),
  enableNotify: document.querySelector("#enableNotifyBtn"),
  notifyState: document.querySelector("#notifyState"),
  nextReminder: document.querySelector("#nextReminder"),
  pulse: document.querySelector(".pulse"),
  toast: document.querySelector("#toast")
};

init();

function init() {
  els.date.value = todayISO();
  els.cardDate.value = todayISO();
  els.monthInput.value = todayISO().slice(0, 7);
  bindEvents();
  render();
  updateNotificationStatus();
  startReminderLoop();
  registerServiceWorker();
}

function bindEvents() {
  els.recordForm.addEventListener("submit", addRecord);
  els.cardForm.addEventListener("submit", addCardRecord);
  els.cardCsv.addEventListener("change", importCardCsv);
  els.monthInput.addEventListener("change", renderMonthlySummary);
  els.categoryForm.addEventListener("submit", addCategory);
  els.reminderForm.addEventListener("submit", addReminder);
  els.clearRecords.addEventListener("click", clearRecords);
  els.enableNotify.addEventListener("click", requestNotificationPermission);
  document.querySelectorAll("[data-panel-link]").forEach((link) => {
    link.addEventListener("click", switchPanel);
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      categories: Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : structuredClone(defaultState.categories),
      reminders: Array.isArray(parsed.reminders) && parsed.reminders.length ? parsed.reminders : structuredClone(defaultState.reminders),
      records: Array.isArray(parsed.records) ? parsed.records.map(normalizeRecord) : []
    };
  } catch (error) {
    console.warn("讀取本機資料失敗，已使用預設設定：", error);
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeRecord(record) {
  return {
    ...record,
    payment: record.payment || (record.source === "card" ? "card" : "cash"),
    source: record.source || "manual"
  };
}

function addRecord(event) {
  event.preventDefault();
  const amount = Number(els.amount.value);
  const type = document.querySelector("input[name='type']:checked").value;
  const category = state.categories.find((item) => item.id === els.category.value);

  if (!Number.isFinite(amount) || amount <= 0) {
    showMessage("請輸入大於 0 的金額。", true);
    return;
  }

  if (!category) {
    showMessage("請先選擇有效的帳目類別。", true);
    return;
  }

  state.records.unshift({
    id: crypto.randomUUID(),
    type,
    amount,
    categoryId: category.id,
    categoryName: category.name,
    categoryColor: category.color,
    note: els.note.value.trim(),
    date: els.date.value || todayISO(),
    payment: els.payment.value,
    source: "manual",
    createdAt: new Date().toISOString()
  });

  saveState();
  els.recordForm.reset();
  document.querySelector("#expenseType").checked = true;
  els.date.value = todayISO();
  showMessage("帳目已新增。", false);
  render();
}

function addCardRecord(event) {
  event.preventDefault();
  const amount = Number(els.cardAmount.value);
  const category = state.categories.find((item) => item.id === els.cardCategory.value);

  if (!Number.isFinite(amount) || amount <= 0) {
    showCardMessage("請輸入有效的信用卡金額。", true);
    return;
  }

  if (!category) {
    showCardMessage("請先選擇信用卡帳目的類別。", true);
    return;
  }

  state.records.unshift({
    id: crypto.randomUUID(),
    type: "expense",
    amount,
    categoryId: category.id,
    categoryName: category.name,
    categoryColor: category.color,
    note: els.cardNote.value.trim() || "信用卡消費",
    date: els.cardDate.value || todayISO(),
    payment: "card",
    source: "card",
    createdAt: new Date().toISOString()
  });

  saveState();
  els.cardForm.reset();
  els.cardDate.value = todayISO();
  showCardMessage("信用卡帳目已加入。", false);
  render();
}

function addCategory(event) {
  event.preventDefault();
  const name = els.categoryName.value.trim();
  const exists = state.categories.some((item) => item.name === name);

  if (!name) {
    showToast("請輸入類別名稱。");
    return;
  }

  if (exists) {
    showToast("這個類別已經存在。");
    return;
  }

  state.categories.push({
    id: crypto.randomUUID(),
    name,
    color: els.categoryColor.value
  });

  saveState();
  els.categoryForm.reset();
  els.categoryColor.value = "#38d9a9";
  showToast(`已新增類別：${name}`);
  render();
}

function addReminder(event) {
  event.preventDefault();
  const time = els.reminderTime.value;
  if (!time) return;

  if (state.reminders.includes(time)) {
    showToast("這個提醒時間已經存在。");
    return;
  }

  state.reminders.push(time);
  state.reminders.sort();
  saveState();
  els.reminderForm.reset();
  showToast(`已加入每日 ${time} 記帳提醒。`);
  renderReminders();
  updateNextReminder();
}

function clearRecords() {
  if (!state.records.length) {
    showToast("目前沒有帳目可清除。");
    return;
  }

  const confirmed = confirm("確定要清除所有帳目嗎？此動作無法復原。");
  if (!confirmed) return;

  state.records = [];
  saveState();
  showToast("帳目已清除。");
  render();
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    showToast("這個瀏覽器不支援桌面通知。");
    return;
  }

  try {
    const result = await Notification.requestPermission();
    updateNotificationStatus();
    showToast(result === "granted" ? "通知已啟用。" : "通知未啟用，仍會顯示 App 內提醒。");
  } catch (error) {
    console.error("通知權限要求失敗：", error);
    showToast("通知權限要求失敗，請檢查瀏覽器設定。");
  }
}

function render() {
  renderCategories();
  renderRecords();
  renderSummary();
  renderMonthlySummary();
  renderReminders();
  updateNextReminder();
}

function renderCategories() {
  els.category.innerHTML = state.categories
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`)
    .join("");
  els.cardCategory.innerHTML = els.category.innerHTML;

  els.categoryList.innerHTML = state.categories.map((item) => `
    <div class="category-item">
      <span class="chip"><span class="swatch" style="background:${escapeHtml(item.color)}"></span>${escapeHtml(item.name)}</span>
      <button class="delete-btn" type="button" data-delete-category="${escapeHtml(item.id)}" aria-label="刪除 ${escapeHtml(item.name)}">×</button>
    </div>
  `).join("");

  document.querySelectorAll("[data-delete-category]").forEach((button) => {
    button.addEventListener("click", () => deleteCategory(button.dataset.deleteCategory));
  });
}

function deleteCategory(id) {
  if (state.categories.length <= 1) {
    showToast("至少需要保留一個類別。");
    return;
  }

  const used = state.records.some((record) => record.categoryId === id);
  if (used) {
    showToast("此類別已有帳目使用，為了資料穩定暫不刪除。");
    return;
  }

  state.categories = state.categories.filter((item) => item.id !== id);
  saveState();
  render();
}

function renderRecords() {
  els.recordCount.textContent = state.records.length.toString();

  if (!state.records.length) {
    els.recordList.innerHTML = `<p class="hint">尚未新增帳目，先從上方輸入第一筆資料。</p>`;
    return;
  }

  els.recordList.innerHTML = state.records.slice(0, 12).map((record) => `
    <article class="record-item">
      <div>
        <strong class="chip"><span class="swatch" style="background:${escapeHtml(record.categoryColor)}"></span>${escapeHtml(record.categoryName)}</strong>
        <div class="record-meta">${escapeHtml(record.date)} · ${record.payment === "card" ? "信用卡" : "現金/轉帳"}${record.note ? ` · ${escapeHtml(record.note)}` : ""}</div>
      </div>
      <strong class="amount ${record.type}">${record.type === "income" ? "+" : "-"}$${formatMoney(record.amount)}</strong>
    </article>
  `).join("");
}

function renderSummary() {
  const today = todayISO();
  const monthPrefix = today.slice(0, 7);
  const todayExpense = state.records
    .filter((record) => record.date === today && record.type === "expense")
    .reduce((sum, record) => sum + record.amount, 0);
  const monthBalance = state.records
    .filter((record) => record.date.startsWith(monthPrefix))
    .reduce((sum, record) => sum + (record.type === "income" ? record.amount : -record.amount), 0);

  els.todayExpense.textContent = `$${formatMoney(todayExpense)}`;
  els.monthBalance.textContent = `${monthBalance < 0 ? "-" : ""}$${formatMoney(Math.abs(monthBalance))}`;

  const totals = new Map();
  state.records
    .filter((record) => record.type === "expense")
    .forEach((record) => totals.set(record.categoryName, (totals.get(record.categoryName) || 0) + record.amount));

  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(...rows.map(([, amount]) => amount), 1);

  if (!rows.length) {
    els.categoryBars.innerHTML = `<p class="hint">尚無支出資料可分析。</p>`;
    return;
  }

  els.categoryBars.innerHTML = rows.map(([name, amount]) => {
    const category = state.categories.find((item) => item.name === name);
    const color = category?.color || "#42e8f5";
    const width = Math.max(6, Math.round((amount / max) * 100));
    return `
      <div class="bar-row">
        <div class="bar-top">
          <span class="chip"><span class="swatch" style="background:${escapeHtml(color)}"></span>${escapeHtml(name)}</span>
          <strong>$${formatMoney(amount)}</strong>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${width}%;background:${escapeHtml(color)}"></div></div>
      </div>
    `;
  }).join("");
}

function renderMonthlySummary() {
  const month = els.monthInput.value || todayISO().slice(0, 7);
  const monthRecords = state.records.filter((record) => record.date.startsWith(month));
  const expenses = monthRecords.filter((record) => record.type === "expense");
  const income = monthRecords
    .filter((record) => record.type === "income")
    .reduce((sum, record) => sum + record.amount, 0);
  const totalExpense = expenses.reduce((sum, record) => sum + record.amount, 0);
  const cardExpense = expenses
    .filter((record) => record.payment === "card")
    .reduce((sum, record) => sum + record.amount, 0);
  const categoryTotals = getCategoryTotals(expenses);
  const top = categoryTotals[0];

  els.monthExpense.textContent = `$${formatMoney(totalExpense)}`;
  els.cardExpense.textContent = `$${formatMoney(cardExpense)}`;
  els.topCategory.textContent = top ? `${top.name} $${formatMoney(top.amount)}` : "尚無";
  els.savingTips.innerHTML = buildSavingTips({
    income,
    totalExpense,
    cardExpense,
    top,
    categoryTotals,
    monthRecords
  }).map((tip) => `<div class="tip-item">${escapeHtml(tip)}</div>`).join("");
}

function getCategoryTotals(records) {
  const totals = new Map();
  records.forEach((record) => {
    const current = totals.get(record.categoryName) || {
      name: record.categoryName,
      amount: 0,
      count: 0
    };
    current.amount += record.amount;
    current.count += 1;
    totals.set(record.categoryName, current);
  });
  return [...totals.values()].sort((a, b) => b.amount - a.amount);
}

function buildSavingTips(data) {
  const tips = [];
  if (!data.monthRecords.length) {
    return ["這個月份還沒有資料。先記幾筆帳，月結就會開始給你建議。"];
  }

  if (data.top && data.totalExpense > 0) {
    const ratio = Math.round((data.top.amount / data.totalExpense) * 100);
    tips.push(`${data.top.name} 是本月最大支出，占 ${ratio}%。可以先從這一類設定下月預算。`);
    if (ratio >= 40) {
      tips.push(`建議把 ${data.top.name} 支出降低 10%，約可省下 $${formatMoney(data.top.amount * 0.1)}。`);
    }
  }

  const smallCardCount = data.monthRecords.filter((record) => record.payment === "card" && record.amount <= 300).length;
  if (smallCardCount >= 5) {
    tips.push(`本月有 ${smallCardCount} 筆 300 元以下刷卡，小額消費容易被忘記，建議每週固定匯入一次帳單。`);
  }

  if (data.cardExpense > data.totalExpense * 0.5) {
    tips.push("信用卡已超過本月支出一半，建議把帳單日加入 iOS 提醒事項，避免忘記刷了什麼。");
  }

  if (data.income > 0 && data.totalExpense > data.income * 0.8) {
    tips.push("本月支出已接近收入 80%，建議先暫停非必要採購，等月底再評估。");
  }

  if (!tips.length) {
    tips.push("目前支出分布還算平均。可以繼續保持每日記帳，月底再看趨勢。");
  }

  return tips;
}

function renderReminders() {
  els.reminderList.innerHTML = state.reminders.map((time) => `
    <div class="reminder-item">
      <strong>${escapeHtml(time)}</strong>
      <button class="delete-btn" type="button" data-delete-reminder="${escapeHtml(time)}" aria-label="刪除 ${escapeHtml(time)} 提醒">×</button>
    </div>
  `).join("");

  document.querySelectorAll("[data-delete-reminder]").forEach((button) => {
    button.addEventListener("click", () => deleteReminder(button.dataset.deleteReminder));
  });
}

function deleteReminder(time) {
  if (state.reminders.length <= 1) {
    showToast("至少需要保留一個提醒時間。");
    return;
  }

  state.reminders = state.reminders.filter((item) => item !== time);
  saveState();
  renderReminders();
  updateNextReminder();
}

async function importCardCsv(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const rows = parseCsv(text);
    const imported = rows.map(rowToCardRecord).filter(Boolean);

    if (!imported.length) {
      showCardMessage("沒有讀到可匯入的信用卡資料，請確認 CSV 欄位。", true);
      return;
    }

    state.records = [...imported, ...state.records];
    saveState();
    showCardMessage(`已匯入 ${imported.length} 筆信用卡帳目。`, false);
    render();
  } catch (error) {
    console.error("信用卡 CSV 匯入失敗：", error);
    showCardMessage("CSV 匯入失敗，請確認檔案格式。", true);
  } finally {
    els.cardCsv.value = "";
  }
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index]?.trim() || "";
      return row;
    }, {});
  });
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (const char of line) {
    if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function rowToCardRecord(row) {
  const date = pickValue(row, ["date", "日期", "消費日期", "交易日期", "刷卡日期"]);
  const amountText = pickValue(row, ["amount", "金額", "消費金額", "交易金額", "台幣金額"]);
  const note = pickValue(row, ["description", "摘要", "說明", "店家", "商店", "交易明細"]);
  const categoryName = pickValue(row, ["category", "類別"]) || guessCategory(note);
  const amount = Number(String(amountText).replace(/[$,\s]/g, ""));
  const normalizedDate = normalizeDate(date);

  if (!normalizedDate || !Number.isFinite(amount) || amount <= 0) return null;

  const category = findOrCreateCategory(categoryName || "信用卡", "#8ce99a");
  return {
    id: crypto.randomUUID(),
    type: "expense",
    amount,
    categoryId: category.id,
    categoryName: category.name,
    categoryColor: category.color,
    note: note || "信用卡帳單匯入",
    date: normalizedDate,
    payment: "card",
    source: "card-csv",
    createdAt: new Date().toISOString()
  };
}

function pickValue(row, keys) {
  const entries = Object.entries(row);
  for (const key of keys) {
    const found = entries.find(([header]) => header === key.toLowerCase() || header.includes(key.toLowerCase()));
    if (found) return found[1];
  }
  return "";
}

function normalizeDate(value) {
  const text = String(value || "").trim().replaceAll("/", "-").replaceAll(".", "-");
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const [year, month, day] = text.split("-");
    return `${year}-${pad(Number(month))}-${pad(Number(day))}`;
  }
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(text)) {
    const [month, day, year] = text.split("-");
    return `${year}-${pad(Number(month))}-${pad(Number(day))}`;
  }
  return "";
}

function guessCategory(note) {
  const text = String(note || "");
  if (/餐|咖啡|飲|food|restaurant|cafe/i.test(text)) return "餐飲";
  if (/車|捷運|高鐵|交通|uber|taxi|metro/i.test(text)) return "交通";
  if (/書|課|學|course|book/i.test(text)) return "學習";
  if (/電腦|手機|設備|3c|apple|electronics/i.test(text)) return "設備";
  return "信用卡";
}

function findOrCreateCategory(name, color) {
  const found = state.categories.find((category) => category.name === name);
  if (found) return found;

  const category = {
    id: crypto.randomUUID(),
    name,
    color
  };
  state.categories.push(category);
  return category;
}

function switchPanel(event) {
  const target = event.currentTarget.getAttribute("data-panel-link");
  if (!target) return;

  document.querySelectorAll("[data-panel-link]").forEach((link) => {
    link.classList.toggle("active", link === event.currentTarget);
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.classList.toggle("active-panel", panel.id === target || (target === "monthly-panel" && panel.id === "summary-panel"));
  });
}

function startReminderLoop() {
  if (reminderTimer) window.clearInterval(reminderTimer);
  checkReminder();
  reminderTimer = window.setInterval(checkReminder, 1000 * 20);
}

function checkReminder() {
  const now = new Date();
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const key = `${now.toDateString()}-${time}`;

  if (state.reminders.includes(time) && key !== lastReminderKey) {
    lastReminderKey = key;
    notifyAccounting(time);
  }

  updateNextReminder();
}

function notifyAccounting(time) {
  const message = `現在是 ${time}，記得補上今天的帳目。`;
  showToast(message);

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Neon Ledger 記帳提醒", {
      body: message,
      tag: `ledger-${time}`,
      silent: false
    });
  }
}

function updateNotificationStatus() {
  if (!("Notification" in window)) {
    els.notifyState.textContent = "瀏覽器不支援通知";
    els.pulse.classList.remove("ready");
    return;
  }

  const granted = Notification.permission === "granted";
  els.notifyState.textContent = granted ? "提醒已啟用" : "提醒待啟用";
  els.pulse.classList.toggle("ready", granted);
}

function updateNextReminder() {
  const next = getNextReminder();
  els.nextReminder.textContent = next ? `下一次：${next}` : "尚未設定提醒";
}

function getNextReminder() {
  if (!state.reminders.length) return "";
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const sorted = [...state.reminders].sort();
  const nextToday = sorted.find((time) => timeToMinutes(time) > nowMinutes);
  return nextToday || `${sorted[0]}（明天）`;
}

function showMessage(message, isError) {
  els.formMessage.textContent = message;
  els.formMessage.style.color = isError ? "var(--danger)" : "var(--mint)";
}

function showCardMessage(message, isError) {
  els.cardImportMessage.textContent = message;
  els.cardImportMessage.style.color = isError ? "var(--danger)" : "var(--mint)";
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 3200);
}

function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function timeToMinutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function pad(value) {
  return value.toString().padStart(2, "0");
}

function formatMoney(value) {
  return Number(value).toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.register("service-worker.js").catch((error) => {
    console.info("Service Worker 未啟用，通常是因為目前不是 HTTPS 或 localhost：", error);
  });
}
