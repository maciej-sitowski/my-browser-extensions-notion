import {
  getSettings,
  maskToken,
  saveSettings
} from "./storage.js";
import { getDateString, matchesDateFilter, normalizeDateInputValue, parseDateOnly } from "./dates.js";

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

const ICONS = {
  open: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  save: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>`
};

const SECTION_DAY_THEMES = {
  ALL: "section-tone-all",
  "07:00 Learning": "section-tone-learning",
  "08:00 Improving": "section-tone-improving",
  "09:00 Planning": "section-tone-planning",
  "10:00 Deep Working": "section-tone-deep",
  "15:00 Work Closure": "section-tone-work",
  "15:30 Training": "section-tone-training",
  "16:30 Family Time": "section-tone-family",
  "20:30 Close Day": "section-tone-close"
};

const EMPTY_NOTES_SCHEMA = {
  titleProperty: "Name",
  paraProperty: "PARA",
  dateProperty: "Date Created",
  dateType: "date",
  statusProperty: "Status",
  statusType: "status",
  statusOptions: []
};

const SECTION_THEME_CLASSES = [
  "section-tone-default",
  "section-tone-all",
  "section-tone-learning",
  "section-tone-improving",
  "section-tone-planning",
  "section-tone-deep",
  "section-tone-work",
  "section-tone-training",
  "section-tone-family",
  "section-tone-close"
];

const openSettingsBtn = document.getElementById("openSettingsBtn");
const viewTabs = document.getElementById("viewTabs");
const tasksTabBtn = document.getElementById("tasksTabBtn");
const notesTabBtn = document.getElementById("notesTabBtn");
const taskPanel = document.getElementById("taskPanel");
const notesPanel = document.getElementById("notesPanel");
const settingsPanel = document.getElementById("settingsPanel");
const settingsHintEl = document.getElementById("settingsHint");

const refreshTodayBtn = document.getElementById("refreshTodayBtn");
const tasksFilter = document.getElementById("tasksFilter");
const sectionFilter = document.getElementById("sectionFilter");
const statusFilterDropdown = document.getElementById("statusFilterDropdown");
const statusFilterBtn = document.getElementById("statusFilterBtn");
const statusFilterMenu = document.getElementById("statusFilterMenu");
const paraFilter = document.getElementById("paraFilter");
const tasksSort = document.getElementById("tasksSort");
const todayTasksBody = document.getElementById("todayTasksBody");
const todayEmpty = document.getElementById("todayEmpty");
const todayCaption = document.getElementById("todayCaption");

const refreshNotesBtn = document.getElementById("refreshNotesBtn");
const newNoteBtn = document.getElementById("newNoteBtn");
const notesFilter = document.getElementById("notesFilter");
const notesParaFilter = document.getElementById("notesParaFilter");
const notesBody = document.getElementById("notesBody");
const notesEmpty = document.getElementById("notesEmpty");
const notesCaption = document.getElementById("notesCaption");
const notesListSection = document.getElementById("notesListSection");
const noteReader = document.getElementById("noteReader");
const noteReaderTitle = document.getElementById("noteReaderTitle");
const noteReaderCaption = document.getElementById("noteReaderCaption");
const noteReaderBody = document.getElementById("noteReaderBody");
const noteReaderNotionLink = document.getElementById("noteReaderNotionLink");
const closeNoteReaderBtn = document.getElementById("closeNoteReaderBtn");
const editNoteBtn = document.getElementById("editNoteBtn");
const saveNoteContentBtn = document.getElementById("saveNoteContentBtn");
const cancelNoteEditBtn = document.getElementById("cancelNoteEditBtn");
const noteEditor = document.getElementById("noteEditor");
const noteFormatHelp = document.getElementById("noteFormatHelp");
const newNoteModal = document.getElementById("newNoteModal");
const newNoteName = document.getElementById("newNoteName");
const newNotePara = document.getElementById("newNotePara");
const newNoteStatus = document.getElementById("newNoteStatus");
const newNoteBody = document.getElementById("newNoteBody");
const closeNewNoteModalBtn = document.getElementById("closeNewNoteModalBtn");
const cancelNewNoteBtn = document.getElementById("cancelNewNoteBtn");
const saveNewNoteBtn = document.getElementById("saveNewNoteBtn");

const tokenInput = document.getElementById("token");
const databaseIdInput = document.getElementById("databaseId");
const paraDatabaseIdInput = document.getElementById("paraDatabaseId");
const notesDatabaseIdInput = document.getElementById("notesDatabaseId");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const testBtn = document.getElementById("testBtn");
const toastEl = document.getElementById("toast");

let toastTimer;
let settingsOpen = false;
let activeView = "tasks";
let allTasksCache = [];
let allNotesCache = [];
let notesSchemaCache = { ...EMPTY_NOTES_SCHEMA };
let statusOptionsCache = [];
let paraItemsCache = [];
let selectedStatusValues = new Set();
const paraNameById = new Map();
let openNoteItem = null;
let openNoteText = "";
let noteEditMode = false;

init().catch((error) => {
  showToast(error.message || "Failed to initialize popup.", "fail");
});

openSettingsBtn.addEventListener("click", () => setSettingsPanelOpen(!settingsOpen));
tasksTabBtn.addEventListener("click", () => setActiveView("tasks"));
notesTabBtn.addEventListener("click", () => setActiveView("notes"));
refreshTodayBtn.addEventListener("click", async () => {
  await fetchAndRenderTasks();
});
refreshNotesBtn.addEventListener("click", async () => {
  await fetchAndRenderNotes();
});
newNoteBtn.addEventListener("click", () => openNewNoteModal());
closeNewNoteModalBtn.addEventListener("click", () => closeNewNoteModal());
cancelNewNoteBtn.addEventListener("click", () => closeNewNoteModal());
saveNewNoteBtn.addEventListener("click", () => saveNewNote());
newNoteModal.addEventListener("click", (event) => {
  if (event.target === newNoteModal) {
    closeNewNoteModal();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (!newNoteModal.classList.contains("hidden")) {
    closeNewNoteModal();
  }

  closeSectionDropdowns();
});
closeNoteReaderBtn.addEventListener("click", () => closeNoteReader());
editNoteBtn.addEventListener("click", () => setNoteEditMode(true));
cancelNoteEditBtn.addEventListener("click", () => setNoteEditMode(false));
saveNoteContentBtn.addEventListener("click", () => saveOpenNoteContent());
noteEditor.addEventListener("input", () => syncNoteContentSaveState());

tasksFilter.addEventListener("change", () => renderFilteredTasks());
sectionFilter.addEventListener("change", () => renderFilteredTasks());
paraFilter.addEventListener("change", () => renderFilteredTasks());
tasksSort.addEventListener("change", () => renderFilteredTasks());
notesFilter.addEventListener("change", () => renderFilteredNotes());
notesParaFilter.addEventListener("change", () => renderFilteredNotes());

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
  closeSectionDropdowns();
});

window.addEventListener("resize", () => closeSectionDropdowns());
window.addEventListener(
  "scroll",
  (event) => {
    if (event.target?.closest?.(".section-dropdown-menu")) {
      return;
    }
    closeSectionDropdowns();
  },
  true
);

saveSettingsBtn.addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  const databaseId = databaseIdInput.value.trim();
  const paraDatabaseId = paraDatabaseIdInput.value.trim();
  const notesDatabaseId = notesDatabaseIdInput.value.trim();

  if (!token || !databaseId || !paraDatabaseId) {
    showToast("Token, task DB ID, and PARA DB ID are required.", "fail");
    return;
  }

  await saveSettings({ token, databaseId, paraDatabaseId, notesDatabaseId });
  settingsHintEl.textContent = `Saved token: ${maskToken(token)}`;
  showToast("Settings updated.", "ok");

  await loadParaItems();
  await fetchAndRenderTasks();
  if (notesDatabaseId) {
    await fetchAndRenderNotes();
  }
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
  mountFormatHelp();

  const settings = await getSettings();
  tokenInput.value = settings.token;
  databaseIdInput.value = settings.databaseId;
  paraDatabaseIdInput.value = settings.paraDatabaseId;
  notesDatabaseIdInput.value = settings.notesDatabaseId;
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
  viewTabs.classList.toggle("hidden", open);
  settingsPanel.classList.toggle("hidden", !open);
  settingsPanel.setAttribute("aria-hidden", String(!open));
  openSettingsBtn.textContent = open ? "Close settings" : "Settings";
  if (open) {
    closeNoteReader();
    closeNewNoteModal();
  }
  renderActiveView();
}

function setActiveView(view) {
  activeView = view;
  tasksTabBtn.classList.toggle("is-active", view === "tasks");
  notesTabBtn.classList.toggle("is-active", view === "notes");
  if (view !== "notes") {
    closeNoteReader();
    closeNewNoteModal();
  }
  renderActiveView();

  if (view === "notes") {
    fetchAndRenderNotes();
  }
}

function renderActiveView() {
  const showTasks = !settingsOpen && activeView === "tasks";
  const showNotes = !settingsOpen && activeView === "notes";

  taskPanel.classList.toggle("hidden", !showTasks);
  notesPanel.classList.toggle("hidden", !showNotes);
  taskPanel.setAttribute("aria-hidden", String(!showTasks));
  notesPanel.setAttribute("aria-hidden", String(!showNotes));
}

async function loadParaItems() {
  const settings = await getSettings();

  if (!settings.token || !settings.paraDatabaseId) {
    paraItemsCache = [];
    paraNameById.clear();
    populateIdSelect(paraFilter, [], "All PARA");
    populateIdSelect(notesParaFilter, [], "All PARA");
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
          .map((item) => [item.id, { id: item.id, title: item.title.trim(), icon: item.icon || "" }])
      ).values()
    );

    paraItemsCache = uniqueItems;
    paraNameById.clear();
    for (const item of uniqueItems) {
      paraNameById.set(item.id, item.title);
    }

    populateIdSelect(paraFilter, uniqueItems, "All PARA");
    populateIdSelect(notesParaFilter, uniqueItems, "All PARA");
  } catch (error) {
    paraItemsCache = [];
    paraNameById.clear();
    populateIdSelect(paraFilter, [], "All PARA");
    populateIdSelect(notesParaFilter, [], "All PARA");
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

function mountFormatHelp() {
  const template = document.getElementById("noteFormatHelpTemplate");
  if (!template) {
    return;
  }

  [noteFormatHelp, document.getElementById("newNoteFormatHelp")].forEach((host) => {
    if (!host) {
      return;
    }

    host.replaceChildren(template.content.cloneNode(true));
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
    populateIdSelect(paraFilter, paraItemsCache, "All PARA");
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

async function fetchAndRenderNotes() {
  const settings = await getSettings();

  if (!settings.token || !settings.notesDatabaseId) {
    allNotesCache = [];
    notesSchemaCache = { ...EMPTY_NOTES_SCHEMA };
    populateIdSelect(notesParaFilter, paraItemsCache, "All PARA");
    renderFilteredNotes();
    notesCaption.textContent = "Set token and notes DB ID in Settings to load notes.";
    return;
  }

  try {
    const response = await sendMessage({
      type: "notion:fetchNotes",
      token: settings.token,
      notesDatabaseId: settings.notesDatabaseId
    });

    allNotesCache = response.data.items || [];
    notesSchemaCache = response.data.schema || notesSchemaCache;
    populateIdSelect(notesParaFilter, paraItemsCache, "All PARA");
    renderFilteredNotes();
  } catch (error) {
    allNotesCache = [];
    renderFilteredNotes();
    notesCaption.textContent = "Could not load notes.";
    showToast(error.message || "Failed to fetch notes.", "fail");
  }
}

function renderFilteredNotes() {
  const selectedParaId = notesParaFilter.value;
  const filtered = allNotesCache.filter((note) => {
    if (!matchesDateFilter(note.date, notesFilter.value)) {
      return false;
    }

    if (selectedParaId && !(note.paraRelationIds || []).includes(selectedParaId)) {
      return false;
    }

    return true;
  });

  notesCaption.textContent = "";
  renderNotesTable(filtered);
}

function renderNotesTable(items) {
  notesBody.innerHTML = "";

  if (!items || items.length === 0) {
    notesEmpty.classList.remove("hidden");
    return;
  }

  notesEmpty.classList.add("hidden");

  for (const item of items) {
    notesBody.appendChild(buildEditableNoteRow(item));
  }
}

function isNotesDateEditable() {
  return notesSchemaCache.dateType === "date";
}

function getNoteStatusOptions() {
  return uniqueNamedOptions(notesSchemaCache.statusOptions);
}

function buildNoteStatusSelect(selectedValue) {
  return buildChoiceSelect(getNoteStatusOptions(), selectedValue);
}

function buildEditableNoteRow(item) {
  const row = document.createElement("tr");

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.value = item.title || "";

  const paraSelect = buildParaSelect((item.paraRelationIds && item.paraRelationIds[0]) || "");
  const statusSelect = buildNoteStatusSelect(item.status || "");

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = normalizeDateInputValue(item.date);
  dateInput.disabled = !isNotesDateEditable();

  const saveBtn = createIconButton("save", "Save");
  saveBtn.disabled = true;

  const original = {
    title: (item.title || "").trim(),
    paraRelationId: (item.paraRelationIds && item.paraRelationIds[0]) || "",
    status: item.status || "",
    date: normalizeDateInputValue(item.date)
  };

  const current = () => ({
    title: titleInput.value.trim(),
    paraRelationId: paraSelect.value,
    status: statusSelect.value,
    date: dateInput.value
  });

  const syncSaveState = () => {
    const now = current();
    const changed =
      now.title !== original.title ||
      now.paraRelationId !== original.paraRelationId ||
      now.status !== original.status ||
      now.date !== original.date;
    saveBtn.disabled = !changed || !now.title;
  };

  [titleInput, paraSelect, statusSelect, dateInput].forEach((inputEl) => {
    inputEl.addEventListener("input", syncSaveState);
    inputEl.addEventListener("change", syncSaveState);
  });

  saveBtn.addEventListener("click", async () => {
    const settings = await getSettings();
    if (!settings.token || !settings.notesDatabaseId) {
      showToast("Open Settings and save token + notes database ID.", "fail");
      return;
    }

    const nextValues = current();
    saveBtn.disabled = true;

    try {
      await sendMessage({
        type: "notion:updateNoteFields",
        token: settings.token,
        notesDatabaseId: settings.notesDatabaseId,
        pageId: item.id,
        note: {
          title: nextValues.title,
          paraRelationId: nextValues.paraRelationId,
          statusName: nextValues.status,
          date: nextValues.date
        }
      });

      showToast("Note updated.", "ok");
      await fetchAndRenderNotes();
    } catch (error) {
      showToast(error.message || "Update failed.", "fail");
      syncSaveState();
    }
  });

  const openBtn = createIconButton("open", "Open note");
  openBtn.addEventListener("click", () => {
    openNoteReader(item);
  });

  row.appendChild(wrapTd(titleInput));
  row.appendChild(wrapTd(paraSelect));
  row.appendChild(wrapTd(statusSelect));
  row.appendChild(wrapTd(dateInput));
  row.appendChild(wrapActionCell(openBtn, saveBtn));

  return row;
}

async function openNoteReader(item) {
  const settings = await getSettings();
  if (!settings.token) {
    showToast("Open Settings and save your Notion token.", "fail");
    return;
  }

  openNoteItem = item;
  openNoteText = "";
  notesListSection.classList.add("hidden");
  noteReader.classList.remove("hidden");
  noteReader.setAttribute("aria-hidden", "false");
  noteReaderTitle.textContent = item.title || "Untitled";
  noteReaderBody.replaceChildren();
  setNoteEditMode(false);
  editNoteBtn.disabled = true;
  noteReaderCaption.textContent = "Loading note content...";

  if (item.url) {
    noteReaderNotionLink.href = item.url;
    noteReaderNotionLink.classList.remove("hidden");
  } else {
    noteReaderNotionLink.href = "#";
    noteReaderNotionLink.classList.add("hidden");
  }

  try {
    const response = await sendMessage({
      type: "notion:fetchNoteContent",
      token: settings.token,
      pageId: item.id
    });

    showLoadedNote(response.data.blocks || [], response.data.text || "");
  } catch (error) {
    editNoteBtn.disabled = true;
    noteReaderCaption.textContent = "Could not load note content.";
    showToast(error.message || "Failed to load note content.", "fail");
  }
}

function showLoadedNote(blocks, text) {
  openNoteText = text || "";
  noteEditor.value = openNoteText;
  noteReaderCaption.textContent = "";
  noteReaderBody.replaceChildren();
  renderNoteBlocks(noteReaderBody, blocks);
  editNoteBtn.disabled = false;

  if (!noteReaderBody.childElementCount) {
    const empty = document.createElement("p");
    empty.className = "note-empty-content";
    empty.textContent = "This note has no content yet.";
    noteReaderBody.appendChild(empty);
  }
}

function setNoteEditMode(editing) {
  noteEditMode = Boolean(editing && openNoteItem);
  noteReaderBody.classList.toggle("hidden", noteEditMode);
  noteEditor.classList.toggle("hidden", !noteEditMode);
  editNoteBtn.classList.toggle("hidden", noteEditMode || !openNoteItem);
  saveNoteContentBtn.classList.toggle("hidden", !noteEditMode);
  cancelNoteEditBtn.classList.toggle("hidden", !noteEditMode);
  noteFormatHelp.classList.toggle("hidden", !noteEditMode);

  if (noteEditMode) {
    noteEditor.value = openNoteText;
    noteReaderCaption.textContent = "";
    noteEditor.focus();
    syncNoteContentSaveState();
  } else {
    noteEditor.value = openNoteText;
    if (openNoteItem) {
      noteReaderCaption.textContent = "";
    }
    syncNoteContentSaveState();
  }
}

function syncNoteContentSaveState() {
  const dirty = noteEditMode && noteEditor.value !== openNoteText;
  saveNoteContentBtn.disabled = !dirty;
  saveNoteContentBtn.classList.toggle("is-ready", dirty);
}

async function saveOpenNoteContent() {
  if (!openNoteItem) {
    return;
  }

  const settings = await getSettings();
  if (!settings.token) {
    showToast("Open Settings and save your Notion token.", "fail");
    return;
  }

  const text = noteEditor.value;
  saveNoteContentBtn.disabled = true;
  noteReaderCaption.textContent = "Saving note...";

  try {
    const response = await sendMessage({
      type: "notion:replaceNoteContent",
      token: settings.token,
      pageId: openNoteItem.id,
      text
    });

    showLoadedNote(response.data.blocks || [], response.data.text || text);
    setNoteEditMode(false);
    showToast("Note content saved.", "ok");
  } catch (error) {
    noteReaderCaption.textContent = "Could not save note content.";
    showToast(error.message || "Failed to save note content.", "fail");
  } finally {
    syncNoteContentSaveState();
  }
}

function closeNoteReader() {
  setNoteEditMode(false);
  openNoteItem = null;
  openNoteText = "";
  noteEditor.value = "";
  editNoteBtn.disabled = false;
  noteReader.classList.add("hidden");
  noteReader.setAttribute("aria-hidden", "true");
  notesListSection.classList.remove("hidden");
  noteReaderBody.replaceChildren();
  noteReaderCaption.textContent = "";
}

function getJournalNoteName() {
  return `[${getDateString()}] `;
}

function populateNewNoteSelects() {
  populateIdSelect(newNotePara, paraItemsCache, "PARA");
  newNoteStatus.innerHTML = "";
  newNoteStatus.appendChild(buildOption("", "Status"));
  getNoteStatusOptions().forEach((value) => {
    newNoteStatus.appendChild(buildOption(value, value));
  });
}

async function openNewNoteModal() {
  const settings = await getSettings();
  if (!settings.token || !settings.notesDatabaseId) {
    showToast("Open Settings and save token + notes database ID.", "fail");
    return;
  }

  populateNewNoteSelects();
  newNoteName.value = getJournalNoteName();
  newNotePara.value = "";
  newNoteStatus.value = "";
  newNoteBody.value = "";

  newNoteModal.classList.remove("hidden");
  newNoteModal.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => {
    newNoteName.focus();
    const cursor = newNoteName.value.length;
    newNoteName.setSelectionRange(cursor, cursor);
  });
}

function closeNewNoteModal() {
  newNoteModal.classList.add("hidden");
  newNoteModal.setAttribute("aria-hidden", "true");
  saveNewNoteBtn.disabled = false;
}

async function saveNewNote() {
  const settings = await getSettings();
  if (!settings.token || !settings.notesDatabaseId) {
    showToast("Open Settings and save token + notes database ID.", "fail");
    return;
  }

  const title = newNoteName.value.trim() || `[${getDateString()}]`;
  const body = newNoteBody.value;
  saveNewNoteBtn.disabled = true;

  try {
    const created = await sendMessage({
      type: "notion:createNote",
      token: settings.token,
      notesDatabaseId: settings.notesDatabaseId,
      note: {
        title,
        paraRelationId: newNotePara.value,
        statusName: newNoteStatus.value,
        date: isNotesDateEditable() ? getDateString() : ""
      }
    });

    if (body.trim()) {
      await sendMessage({
        type: "notion:replaceNoteContent",
        token: settings.token,
        pageId: created.data.id,
        text: body
      });
    }

    closeNewNoteModal();
    showToast("Note created.", "ok");
    await fetchAndRenderNotes();

    const createdItem = allNotesCache.find((item) => item.id === created.data.id) || {
      id: created.data.id,
      title,
      url: created.data.url || "",
      paraRelationIds: newNotePara.value ? [newNotePara.value] : [],
      status: newNoteStatus.value,
      date: getDateString()
    };

    await openNoteReader(createdItem);
  } catch (error) {
    showToast(error.message || "Note save failed.", "fail");
    saveNewNoteBtn.disabled = false;
  }
}

function renderNoteBlocks(container, blocks) {
  let index = 0;
  const items = blocks || [];

  while (index < items.length) {
    const block = items[index];

    if (block.type === "bulleted_list_item" || block.type === "numbered_list_item") {
      const listType = block.type;
      const list = document.createElement(listType === "numbered_list_item" ? "ol" : "ul");
      while (index < items.length && items[index].type === listType) {
        list.appendChild(createListItem(items[index]));
        index += 1;
      }
      container.appendChild(list);
      continue;
    }

    const node = createNoteBlockNode(block);
    if (node) {
      container.appendChild(node);
    }
    index += 1;
  }
}

function setMultilineText(el, text) {
  el.replaceChildren();
  const lines = String(text ?? "").split("\n");

  lines.forEach((line, index) => {
    if (index > 0) {
      el.appendChild(document.createElement("br"));
    }
    el.appendChild(document.createTextNode(line));
  });
}

function createNoteBlockNode(block) {
  const type = block?.type;
  const text = block?.text || "";

  if (type === "divider") {
    return document.createElement("hr");
  }

  if (type === "table") {
    return createNoteTable(block.children || []);
  }

  if (type === "table_row") {
    return null;
  }

  if (type === "to_do") {
    const wrap = document.createElement("label");
    wrap.className = "todo-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(block.checked);
    checkbox.disabled = true;
    const span = document.createElement("span");
    setMultilineText(span, text);
    wrap.appendChild(checkbox);
    wrap.appendChild(span);
    appendNoteChildren(wrap, block.children);
    return wrap;
  }

  if (type === "code") {
    const pre = document.createElement("pre");
    pre.textContent = text;
    return pre;
  }

  if (type === "quote" || type === "callout") {
    const quote = document.createElement("blockquote");
    setMultilineText(quote, text);
    appendNoteChildren(quote, block.children);
    return quote;
  }

  const headingMap = {
    heading_1: "h1",
    heading_2: "h2",
    heading_3: "h3"
  };

  const tagName = headingMap[type] || "p";
  const el = document.createElement(tagName);

  if (type === "paragraph" && !text) {
    el.className = "blank-line";
    el.appendChild(document.createElement("br"));
    return el;
  }

  setMultilineText(el, text || (type === "paragraph" ? "" : `[${type}]`));
  appendNoteChildren(el, block.children);
  return el;
}

function createListItem(block) {
  const li = document.createElement("li");
  setMultilineText(li, block.text || "");
  appendNoteChildren(li, block.children);
  return li;
}

function appendNoteChildren(parent, children) {
  if (!children || children.length === 0) {
    return;
  }

  const nested = document.createElement("div");
  renderNoteBlocks(nested, children);
  if (nested.childElementCount) {
    parent.appendChild(nested);
  }
}

function createNoteTable(rows) {
  const table = document.createElement("table");
  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    (row.cells || []).forEach((cell) => {
      const cellEl = document.createElement(index === 0 ? "th" : "td");
      setMultilineText(cellEl, cell);
      tr.appendChild(cellEl);
    });
    table.appendChild(tr);
  });
  return table.childElementCount ? table : null;
}

function renderFilteredTasks() {
  const selectedSection = sectionFilter.value;
  const selectedStatuses = getSelectedStatuses();
  const selectedParaId = paraFilter.value;
  const sortMode = tasksSort.value;

  const filtered = allTasksCache.filter((task) => {
    if (!matchesDateFilter(task.doOn, tasksFilter.value)) {
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
  renderTodayTasksTable(sortTasks(filtered, sortMode));
}

function sortTasks(tasks, mode) {
  const sorted = [...(tasks || [])];

  sorted.sort((a, b) => {
    if (mode === "section_asc") {
      return compareText(a.sectionDay, b.sectionDay);
    }

    if (mode === "para_asc") {
      const aParaId = (a.paraRelationIds && a.paraRelationIds[0]) || "";
      const bParaId = (b.paraRelationIds && b.paraRelationIds[0]) || "";
      const aPara = paraNameById.get(aParaId) || "";
      const bPara = paraNameById.get(bParaId) || "";
      return compareText(aPara, bPara);
    }

    if (mode === "status_asc") {
      return compareText(a.status, b.status);
    }

    const aDate = parseDateOnly(a.doOn || "");
    const bDate = parseDateOnly(b.doOn || "");

    if (!aDate && !bDate) {
      return 0;
    }

    if (!aDate) {
      return 1;
    }

    if (!bDate) {
      return -1;
    }

    const diff = aDate.getTime() - bDate.getTime();
    return mode === "do_on_desc" ? -diff : diff;
  });

  return sorted;
}

function compareText(a, b) {
  return (a || "").localeCompare(b || "", undefined, { sensitivity: "base", numeric: true });
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

  const sectionSelect = buildSectionSelect("", "Section day*");

  const paraSelect = buildParaSelect("");
  paraSelect.options[0].textContent = "PARA*";

  const statusSelect = buildStatusSelect(getDefaultTaskStatus());

  const dueInput = document.createElement("input");
  dueInput.type = "date";
  dueInput.value = getDateString();

  const saveBtn = createIconButton("save", "Save");
  saveBtn.disabled = true;

  const allRequiredInputs = [titleInput, sectionSelect, paraSelect];
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
          sectionDay: sectionSelect.value,
          title: titleInput.value.trim(),
          paraRelationId: paraSelect.value,
          dueDate: dueInput.value || getDateString(),
          statusName: statusSelect.value.trim() || getDefaultTaskStatus()
        }
      });

      showToast("Task created.", "ok");
      await fetchAndRenderTasks();
    } catch (error) {
      showToast(error.message || "Task save failed.", "fail");
      syncSaveState();
    }
  });

  row.appendChild(wrapTd(sectionSelect));
  row.appendChild(wrapTd(titleInput));
  row.appendChild(wrapTd(paraSelect));
  row.appendChild(wrapTd(statusSelect));
  row.appendChild(wrapTd(dueInput));
  row.appendChild(wrapActionCell(saveBtn));

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

  const saveBtn = createIconButton("save", "Save");
  saveBtn.disabled = true;

  const original = {
    sectionDay: item.sectionDay || "",
    title: (item.title || "").trim(),
    paraRelationId: (item.paraRelationIds && item.paraRelationIds[0]) || "",
    status: item.status || "",
    dueDate: normalizeDateInputValue(item.doOn)
  };

  const current = () => ({
    sectionDay: sectionSelect.value,
    title: titleInput.value.trim(),
    paraRelationId: paraSelect.value,
    status: statusSelect.value,
    dueDate: dueInput.value
  });

  const syncSaveState = () => {
    const now = current();
    const changed =
      now.sectionDay !== original.sectionDay ||
      now.title !== original.title ||
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

  row.appendChild(wrapTd(sectionSelect));
  row.appendChild(wrapTd(titleInput));
  row.appendChild(wrapTd(paraSelect));
  row.appendChild(wrapTd(statusSelect));
  row.appendChild(wrapTd(dueInput));
  row.appendChild(wrapActionCell(saveBtn));

  return row;
}

function wrapTd(child) {
  const td = document.createElement("td");
  td.appendChild(child);
  return td;
}

function createIconButton(action, label) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `icon-btn icon-btn-${action}`;
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.innerHTML = ICONS[action];
  return btn;
}

function wrapActionCell(...buttons) {
  const actions = document.createElement("div");
  actions.className = "row-actions";
  buttons.forEach((btn) => actions.appendChild(btn));
  return wrapTd(actions);
}

function getSectionTheme(value) {
  return SECTION_DAY_THEMES[value] || "section-tone-default";
}

function applySectionTone(el, value) {
  el.classList.remove(...SECTION_THEME_CLASSES);
  el.classList.add(getSectionTheme(value));
}

function closeSectionDropdowns(exceptRoot = null) {
  document.querySelectorAll(".section-dropdown.is-open").forEach((root) => {
    if (root !== exceptRoot) {
      root._closeSectionMenu?.();
    }
  });
}

function positionSectionMenu(trigger, menu) {
  const rect = trigger.getBoundingClientRect();
  const menuWidth = Math.max(rect.width, 210);
  const left = Math.min(rect.left, window.innerWidth - menuWidth - 8);

  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.width = `${menuWidth}px`;
}

function buildSectionSelect(selectedValue, emptyLabel = "-") {
  const root = document.createElement("div");
  root.className = "section-dropdown";

  let currentValue = selectedValue || "";
  const choices = [{ value: "", label: emptyLabel }, ...SECTION_DAY_OPTIONS.map((value) => ({ value, label: value }))];

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "section-select";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");

  const menu = document.createElement("div");
  menu.className = "section-dropdown-menu hidden";
  menu.setAttribute("role", "listbox");

  const syncTrigger = () => {
    const selected = choices.find((choice) => choice.value === currentValue) || choices[0];
    trigger.textContent = selected.label;
    applySectionTone(trigger, currentValue);
  };

  const emitChange = () => {
    root.dispatchEvent(new Event("input", { bubbles: true }));
    root.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const closeMenu = () => {
    menu.classList.add("hidden");
    root.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    if (menu.parentElement === document.body) {
      menu.remove();
    }
  };

  const openMenu = () => {
    closeStatusMenu();
    closeSectionDropdowns(root);
    document.body.appendChild(menu);
    menu.classList.remove("hidden");
    root.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    positionSectionMenu(trigger, menu);
  };

  choices.forEach((choice) => {
    const optionBtn = document.createElement("button");
    optionBtn.type = "button";
    optionBtn.className = "section-option";
    optionBtn.setAttribute("role", "option");
    optionBtn.dataset.value = choice.value;
    optionBtn.textContent = choice.label;
    applySectionTone(optionBtn, choice.value);

    optionBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      currentValue = choice.value;
      syncTrigger();
      closeMenu();
      emitChange();
    });

    menu.appendChild(optionBtn);
  });

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (root.classList.contains("is-open")) {
      closeMenu();
      return;
    }
    openMenu();
  });

  menu.addEventListener("click", (event) => event.stopPropagation());

  Object.defineProperty(root, "value", {
    get() {
      return currentValue;
    },
    set(next) {
      currentValue = next || "";
      syncTrigger();
    }
  });

  root._closeSectionMenu = closeMenu;
  syncTrigger();
  root.appendChild(trigger);
  return root;
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
  return buildChoiceSelect(getStatusOptions(), selectedValue);
}

function uniqueNamedOptions(values) {
  const options = Array.from(new Set((values || []).filter(Boolean)));
  return options.length ? options : DEFAULT_STATUS_OPTIONS;
}

function buildChoiceSelect(options, selectedValue) {
  const select = document.createElement("select");

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

function getStatusOptions() {
  return uniqueNamedOptions(statusOptionsCache);
}

function getDefaultTaskStatus() {
  const options = getStatusOptions();
  const notStarted = options.find((value) => value.toLowerCase() === "not started");
  return notStarted || options[0] || "Not started";
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

function populateIdSelect(selectEl, items, emptyLabel) {
  const previous = selectEl.value;
  selectEl.innerHTML = "";
  selectEl.appendChild(buildOption("", emptyLabel));

  (items || []).forEach((item) => {
    selectEl.appendChild(buildOption(item.id, formatParaLabel(item)));
  });

  if ((items || []).some((entry) => entry.id === previous)) {
    selectEl.value = previous;
  }
}

function formatParaLabel(item) {
  const icon = item?.icon?.trim();
  const title = item?.title || "Untitled";
  return icon ? `${icon} ${title}` : title;
}
