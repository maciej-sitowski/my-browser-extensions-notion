import { getSettings, maskToken, saveDatabaseId, saveParaDatabaseId, saveToken } from "./storage.js";

const SECTION_DAY_OPTIONS = [
  "ALL",
  "07:00 Learning",
  "08:00 Improving",
  "09:00 Planning",
  "10:00 Deep Working",
  "15:00 Work Closure",
  "15:30 Training",
  "16:30 Family Time",
  "20:30 Close Day"
];

const DEFAULT_STATUS_OPTIONS = ["Not started", "In progress", "Waiting on", "Done"];

const SECTION_DAY_THEMES = {
  ALL: "section-tone-all",
  "07:00 Learning": "section-tone-morning",
  "08:00 Improving": "section-tone-morning",
  "09:00 Planning": "section-tone-morning",
  "10:00 Deep Working": "section-tone-deep",
  "15:00 Work Closure": "section-tone-work",
  "15:30 Training": "section-tone-training",
  "16:30 Family Time": "section-tone-family",
  "20:30 Close Day": "section-tone-close"
};

const SECTION_THEME_CLASSES = [
  "section-tone-default",
  "section-tone-all",
  "section-tone-morning",
  "section-tone-deep",
  "section-tone-work",
  "section-tone-training",
  "section-tone-family",
  "section-tone-close"
];

const openSettingsBtn = document.getElementById("openSettingsBtn");
const taskPanel = document.getElementById("taskPanel");
const settingsPanel = document.getElementById("settingsPanel");
const settingsHintEl = document.getElementById("settingsHint");

const refreshTodayBtn = document.getElementById("refreshTodayBtn");
const tasksFilter = document.getElementById("tasksFilter");
const sectionFilter = document.getElementById("sectionFilter");
const statusFilterDropdown = document.getElementById("statusFilterDropdown");
const statusFilterBtn = document.getElementById("statusFilterBtn");
const statusFilterMenu = document.getElementById("statusFilterMenu");
const paraFilter = document.getElementById("paraFilter");
const todayTasksBody = document.getElementById("todayTasksBody");
const todayEmpty = document.getElementById("todayEmpty");
const todayCaption = document.getElementById("todayCaption");

const tokenInput = document.getElementById("token");
const databaseIdInput = document.getElementById("databaseId");
const paraDatabaseIdInput = document.getElementById("paraDatabaseId");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const testBtn = document.getElementById("testBtn");
const toastEl = document.getElementById("toast");

let toastTimer;
let settingsOpen = false;
let allTasksCache = [];
let statusOptionsCache = [];
let paraItemsCache = [];
let selectedStatusValues = new Set();
const paraNameById = new Map();

init().catch((error) => {
  showToast(error.message || "Failed to initialize popup.", "fail");
});

openSettingsBtn.addEventListener("click", () => setSettingsPanelOpen(!settingsOpen));
refreshTodayBtn.addEventListener("click", async () => {
  await fetchAndRenderTasks();
});

tasksFilter.addEventListener("change", () => renderFilteredTasks());
sectionFilter.addEventListener("change", () => renderFilteredTasks());
paraFilter.addEventListener("change", () => renderFilteredTasks());

statusFilterBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleStatusMenu();
});

statusFilterMenu.addEventListener("click", (event) => {
  event.stopPropagation();
});

statusFilterMenu.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") {
    return;
  }

  if (target.checked) {
    selectedStatusValues.add(target.value);
  } else {
    selectedStatusValues.delete(target.value);
  }

  updateStatusFilterButtonLabel();
  renderFilteredTasks();
});

document.addEventListener("click", () => {
  closeStatusMenu();
});

saveSettingsBtn.addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  const databaseId = databaseIdInput.value.trim();
  const paraDatabaseId = paraDatabaseIdInput.value.trim();

  if (!token || !databaseId || !paraDatabaseId) {
    showToast("Token, task DB ID, and PARA DB ID are required.", "fail");
    return;
  }

  await saveToken(token);
  await saveDatabaseId(databaseId);
  await saveParaDatabaseId(paraDatabaseId);
  settingsHintEl.textContent = `Saved token: ${maskToken(token)}`;
  showToast("Settings updated.", "ok");

  await loadParaItems();
  await fetchAndRenderTasks();
  setSettingsPanelOpen(false);
});

testBtn.addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    showToast("Enter token in Settings first.", "fail");
    return;
  }

  try {
    await sendMessage({ type: "notion:testConnection", token });
    showToast("Connection successful.", "ok");
  } catch (error) {
    showToast(error.message || "Connection failed.", "fail");
  }
});

async function init() {
  document.body.classList.add("tab-mode");

  const settings = await getSettings();
  tokenInput.value = settings.token;
  databaseIdInput.value = settings.databaseId;
  paraDatabaseIdInput.value = settings.paraDatabaseId;
  settingsHintEl.textContent = settings.token
    ? `Saved token: ${maskToken(settings.token)}`
    : "Token not configured yet.";

  if (settings.token && settings.paraDatabaseId) {
    await loadParaItems();
  }

  await fetchAndRenderTasks();
}

function setSettingsPanelOpen(open) {
  settingsOpen = open;
  taskPanel.classList.toggle("hidden", open);
  settingsPanel.classList.toggle("hidden", !open);
  taskPanel.setAttribute("aria-hidden", String(open));
  settingsPanel.setAttribute("aria-hidden", String(!open));
  openSettingsBtn.textContent = open ? "Close settings" : "Settings";
}

async function loadParaItems() {
  const settings = await getSettings();

  if (!settings.token || !settings.paraDatabaseId) {
    paraItemsCache = [];
    paraNameById.clear();
    populateParaFilter([]);
    return;
  }

  try {
    const response = await sendMessage({
      type: "notion:fetchParaInstances",
      token: settings.token,
      paraDatabaseId: settings.paraDatabaseId
    });

    const uniqueItems = Array.from(
      new Map(
        (response.data.items || [])
          .filter((item) => Boolean(item?.id && item?.title?.trim()))
          .map((item) => [item.id, { id: item.id, title: item.title.trim() }])
      ).values()
    );

    paraItemsCache = uniqueItems;
    paraNameById.clear();
    for (const item of uniqueItems) {
      paraNameById.set(item.id, item.title);
    }

    populateParaFilter(uniqueItems);
  } catch (error) {
    paraItemsCache = [];
    paraNameById.clear();
    populateParaFilter([]);
    showToast(error.message || "Failed to load PARA options.", "fail");
  }
}

function sendMessage(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      if (!response) {
        reject(new Error("No response from extension background."));
        return;
      }

      if (!response.ok) {
        reject(new Error(response.error || "Request failed."));
        return;
      }

      resolve(response);
    });
  });
}

function showToast(text, type = "ok") {
  toastEl.textContent = text;
  toastEl.classList.remove("hidden", "ok", "fail");
  toastEl.classList.add(type);

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.textContent = "";
    toastEl.classList.add("hidden");
    toastEl.classList.remove("ok", "fail");
  }, 2800);
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value) {
  if (!value) {
    return null;
  }

  const part = value.slice(0, 10);
  const [year, month, day] = part.split("-").map((item) => Number(item));
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function isInCurrentWeek(value) {
  const date = parseDateOnly(value);
  if (!date) {
    return false;
  }

  const today = new Date();
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const dayOfWeek = current.getDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const weekStart = new Date(current);
  weekStart.setDate(current.getDate() - daysSinceMonday);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  return date >= weekStart && date <= weekEnd;
}

async function fetchAndRenderTasks() {
  const settings = await getSettings();

  if (!settings.token || !settings.databaseId) {
    allTasksCache = [];
    statusOptionsCache = [];
    populateSectionFilter([]);
    populateStatusFilter([]);
    renderFilteredTasks();
    todayCaption.textContent = "Set token and task DB ID in Settings to load tasks.";
    return;
  }

  try {
    const response = await sendMessage({
      type: "notion:fetchAllTasks",
      token: settings.token,
      databaseId: settings.databaseId
    });

    allTasksCache = response.data.items || [];
    statusOptionsCache = response.data.statusConfig?.options || [];

    populateSectionFilter(allTasksCache);
    populateStatusFilter(allTasksCache);
    populateParaFilter(paraItemsCache);
    renderFilteredTasks();
  } catch (error) {
    allTasksCache = [];
    statusOptionsCache = [];
    populateSectionFilter([]);
    populateStatusFilter([]);
    renderFilteredTasks();
    todayCaption.textContent = "Could not load tasks.";
    showToast(error.message || "Failed to fetch tasks.", "fail");
  }
}

function renderFilteredTasks() {
  const mode = tasksFilter.value;
  const today = getTodayDateString();
  const selectedSection = sectionFilter.value;
  const selectedStatuses = getSelectedStatuses();
  const selectedParaId = paraFilter.value;

  const filtered = allTasksCache.filter((task) => {
    if (mode === "today" && (task.doOn || "").slice(0, 10) !== today) {
      return false;
    }

    if (mode === "week" && !isInCurrentWeek(task.doOn || "")) {
      return false;
    }

    if (selectedSection && (task.sectionDay || "") !== selectedSection) {
      return false;
    }

    if (selectedStatuses.length > 0 && !selectedStatuses.includes(task.status || "")) {
      return false;
    }

    if (selectedParaId && !(task.paraRelationIds || []).includes(selectedParaId)) {
      return false;
    }

    return true;
  });

  todayCaption.textContent = "";

  renderTodayTasksTable(filtered);
}

function getSelectedStatuses() {
  return Array.from(selectedStatusValues);
}

function renderTodayTasksTable(items) {
  todayTasksBody.innerHTML = "";
  todayTasksBody.appendChild(buildCreateRow());

  if (!items || items.length === 0) {
    todayEmpty.classList.remove("hidden");
    return;
  }

  todayEmpty.classList.add("hidden");

  for (const item of items) {
    todayTasksBody.appendChild(buildEditableTaskRow(item));
  }
}

function buildCreateRow() {
  const row = document.createElement("tr");
  row.className = "create-row";

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.placeholder = "New task title";

  const sectionSelect = buildSectionSelect("");
  sectionSelect.options[0].textContent = "Section day*";

  const paraSelect = buildParaSelect("");
  paraSelect.options[0].textContent = "PARA*";

  const statusSelect = buildStatusSelect("");
  statusSelect.insertBefore(buildOption("", "Status*"), statusSelect.firstChild);
  statusSelect.value = "";

  const dueInput = document.createElement("input");
  dueInput.type = "date";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "primary-btn table-save-btn";
  saveBtn.textContent = "Save";
  saveBtn.disabled = true;

  const allRequiredInputs = [titleInput, sectionSelect, paraSelect, statusSelect];
  const syncSaveState = () => {
    const isReady = allRequiredInputs.every((el) => el.value.trim());
    saveBtn.disabled = !isReady;
  };

  for (const inputEl of allRequiredInputs) {
    inputEl.addEventListener("input", syncSaveState);
    inputEl.addEventListener("change", syncSaveState);
  }

  saveBtn.addEventListener("click", async () => {
    const settings = await getSettings();
    if (!settings.token || !settings.databaseId) {
      showToast("Open Settings and save token + task database ID.", "fail");
      return;
    }

    saveBtn.disabled = true;

    try {
      await sendMessage({
        type: "notion:createTask",
        token: settings.token,
        databaseId: settings.databaseId,
        task: {
          title: titleInput.value.trim(),
          sectionDay: sectionSelect.value,
          paraRelationId: paraSelect.value,
          dueDate: dueInput.value,
          statusName: statusSelect.value
        }
      });

      showToast("Task created.", "ok");
      await fetchAndRenderTasks();
    } catch (error) {
      showToast(error.message || "Task save failed.", "fail");
      syncSaveState();
    }
  });

  row.appendChild(wrapTd(titleInput));
  row.appendChild(wrapTd(sectionSelect));
  row.appendChild(wrapTd(paraSelect));
  row.appendChild(wrapTd(statusSelect));
  row.appendChild(wrapTd(dueInput));
  row.appendChild(wrapTd(saveBtn));

  return row;
}

function buildEditableTaskRow(item) {
  const row = document.createElement("tr");

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.value = item.title || "";

  const sectionSelect = buildSectionSelect(item.sectionDay || "");
  const paraSelect = buildParaSelect((item.paraRelationIds && item.paraRelationIds[0]) || "");
  const statusSelect = buildStatusSelect(item.status || "");

  const dueInput = document.createElement("input");
  dueInput.type = "date";
  dueInput.value = normalizeDateInputValue(item.doOn);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "row-save-btn";
  saveBtn.textContent = "Save";
  saveBtn.disabled = true;

  const original = {
    title: (item.title || "").trim(),
    sectionDay: item.sectionDay || "",
    paraRelationId: (item.paraRelationIds && item.paraRelationIds[0]) || "",
    status: item.status || "",
    dueDate: normalizeDateInputValue(item.doOn)
  };

  const current = () => ({
    title: titleInput.value.trim(),
    sectionDay: sectionSelect.value,
    paraRelationId: paraSelect.value,
    status: statusSelect.value,
    dueDate: dueInput.value
  });

  const syncSaveState = () => {
    const now = current();
    const changed =
      now.title !== original.title ||
      now.sectionDay !== original.sectionDay ||
      now.paraRelationId !== original.paraRelationId ||
      now.status !== original.status ||
      now.dueDate !== original.dueDate;

    saveBtn.disabled = !changed || !now.title || !now.status;
  };

  [titleInput, sectionSelect, paraSelect, statusSelect, dueInput].forEach((inputEl) => {
    inputEl.addEventListener("input", syncSaveState);
    inputEl.addEventListener("change", syncSaveState);
  });

  saveBtn.addEventListener("click", async () => {
    const settings = await getSettings();
    if (!settings.token || !settings.databaseId) {
      showToast("Open Settings and save token + task database ID.", "fail");
      return;
    }

    const nextValues = current();
    saveBtn.disabled = true;

    try {
      await sendMessage({
        type: "notion:updateTaskFields",
        token: settings.token,
        databaseId: settings.databaseId,
        pageId: item.id,
        task: {
          title: nextValues.title,
          sectionDay: nextValues.sectionDay,
          paraRelationId: nextValues.paraRelationId,
          statusName: nextValues.status,
          dueDate: nextValues.dueDate
        }
      });

      showToast("Task updated.", "ok");
      await fetchAndRenderTasks();
    } catch (error) {
      showToast(error.message || "Update failed.", "fail");
      syncSaveState();
    }
  });

  row.appendChild(wrapTd(titleInput));
  row.appendChild(wrapTd(sectionSelect));
  row.appendChild(wrapTd(paraSelect));
  row.appendChild(wrapTd(statusSelect));
  row.appendChild(wrapTd(dueInput));
  row.appendChild(wrapTd(saveBtn));

  return row;
}

function wrapTd(child) {
  const td = document.createElement("td");
  td.appendChild(child);
  return td;
}

function buildSectionSelect(selectedValue) {
  const select = document.createElement("select");
  select.classList.add("section-select");
  select.appendChild(buildOption("", "-"));

  for (const value of SECTION_DAY_OPTIONS) {
    select.appendChild(buildOption(value, value));
  }

  if (selectedValue) {
    select.value = selectedValue;
  }

  applySectionTone(select);
  select.addEventListener("change", () => applySectionTone(select));

  return select;
}

function applySectionTone(selectEl) {
  const value = selectEl.value;
  const theme = SECTION_DAY_THEMES[value] || "section-tone-default";
  selectEl.classList.remove(...SECTION_THEME_CLASSES);
  selectEl.classList.add(theme);
}

function buildParaSelect(selectedValue) {
  const select = document.createElement("select");
  select.appendChild(buildOption("", "-"));

  for (const item of paraItemsCache) {
    select.appendChild(buildOption(item.id, formatParaLabel(item)));
  }

  if (selectedValue) {
    select.value = selectedValue;
  }

  return select;
}

function buildStatusSelect(selectedValue) {
  const select = document.createElement("select");
  const options = getStatusOptions();

  for (const value of options) {
    select.appendChild(buildOption(value, value));
  }

  if (selectedValue && !options.includes(selectedValue)) {
    select.appendChild(buildOption(selectedValue, selectedValue));
  }

  if (selectedValue) {
    select.value = selectedValue;
  }

  return select;
}

function buildOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function normalizeDateInputValue(value) {
  return (value || "").slice(0, 10);
}

function getStatusOptions() {
  const options = Array.from(new Set(statusOptionsCache.filter(Boolean)));
  return options.length ? options : DEFAULT_STATUS_OPTIONS;
}

function populateSectionFilter(tasks) {
  const previous = sectionFilter.value;
  const sections = Array.from(
    new Set((tasks || []).map((task) => task.sectionDay).filter((value) => Boolean(value)))
  ).sort((a, b) => a.localeCompare(b));

  sectionFilter.innerHTML = "";
  sectionFilter.appendChild(buildOption("", "All sections"));
  sections.forEach((value) => sectionFilter.appendChild(buildOption(value, value)));

  if (sections.includes(previous)) {
    sectionFilter.value = previous;
  }
}

function populateStatusFilter(tasks) {
  const previous = new Set(getSelectedStatuses());
  const statuses = Array.from(
    new Set([
      ...getStatusOptions(),
      ...(tasks || []).map((task) => task.status).filter((value) => Boolean(value))
    ])
  ).sort((a, b) => a.localeCompare(b));

  selectedStatusValues = new Set(Array.from(previous).filter((value) => statuses.includes(value)));
  statusFilterMenu.innerHTML = "";

  for (const value of statuses) {
    const label = document.createElement("label");
    label.className = "multi-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = value;
    checkbox.checked = selectedStatusValues.has(value);

    const text = document.createElement("span");
    text.textContent = value;

    label.appendChild(checkbox);
    label.appendChild(text);
    statusFilterMenu.appendChild(label);
  }

  updateStatusFilterButtonLabel();
}

function toggleStatusMenu() {
  const isOpen = !statusFilterMenu.classList.contains("hidden");
  if (isOpen) {
    closeStatusMenu();
    return;
  }

  statusFilterMenu.classList.remove("hidden");
  statusFilterBtn.setAttribute("aria-expanded", "true");
}

function closeStatusMenu() {
  statusFilterMenu.classList.add("hidden");
  statusFilterBtn.setAttribute("aria-expanded", "false");
}

function updateStatusFilterButtonLabel() {
  const selected = getSelectedStatuses();
  if (selected.length === 0) {
    statusFilterBtn.textContent = "All statuses";
    return;
  }

  if (selected.length === 1) {
    statusFilterBtn.textContent = selected[0];
    return;
  }

  statusFilterBtn.textContent = `${selected.length} statuses`;
}

function populateParaFilter(paraItems) {
  const previous = paraFilter.value;
  paraFilter.innerHTML = "";
  paraFilter.appendChild(buildOption("", "All PARA"));

  (paraItems || []).forEach((item) => {
    paraFilter.appendChild(buildOption(item.id, formatParaLabel(item)));
  });

  if ((paraItems || []).some((item) => item.id === previous)) {
    paraFilter.value = previous;
  }
}

function formatParaLabel(item) {
  const icon = item?.icon?.trim();
  const title = item?.title || "Untitled";
  return icon ? `${icon} ${title}` : title;
}
