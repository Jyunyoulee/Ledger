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
  note: document.querySelector("#noteInput"),
  recordForm: document.querySelector("#recordForm"),
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
  bindEvents();
  render();
  updateNotificationStatus();
  startReminderLoop();
  registerServiceWorker();
}

function bindEvents() {
  els.recordForm.addEventListener("submit", addRecord);
  els.categoryForm.addEventListener("submit", addCategory);
  els.reminderForm.addEventListener("submit", addReminder);
  els.clearRecords.addEventListener("click", clearRecords);
  els.enableNotify.addEventListener("click", requestNotificationPermission);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      categories: Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : structuredClone(defaultState.categories),
      reminders: Array.isArray(parsed.reminders) && parsed.reminders.length ? parsed.reminders : structuredClone(defaultState.reminders),
      records: Array.isArray(parsed.records) ? parsed.records : []
    };
  } catch (error) {
    console.warn("讀取本機資料失敗，已使用預設設定：", error);
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    createdAt: new Date().toISOString()
  });

  saveState();
  els.recordForm.reset();
  document.querySelector("#expenseType").checked = true;
  els.date.value = todayISO();
  showMessage("帳目已新增。", false);
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
  renderReminders();
  updateNextReminder();
}

function renderCategories() {
  els.category.innerHTML = state.categories
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`)
    .join("");

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
        <div class="record-meta">${escapeHtml(record.date)}${record.note ? ` · ${escapeHtml(record.note)}` : ""}</div>
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
