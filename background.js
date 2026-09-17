import {
  createNote,
  createTask,
  fetchAllTasks,
  fetchNoteContent,
  fetchNotes,
  fetchParaInstances,
  postponeTask,
  replaceNoteContent,
  testConnection,
  updateNoteFields,
  updateTaskFields
} from "./notionClient.js";

const MESSAGE_HANDLERS = {
  "notion:testConnection": (message) => testConnection(message.token),
  "notion:createTask": (message) => createTask(message.token, message.databaseId, message.task),
  "notion:fetchParaInstances": (message) => fetchParaInstances(message.token, message.paraDatabaseId),
  "notion:fetchAllTasks": (message) => fetchAllTasks(message.token, message.databaseId),
  "notion:updateTaskFields": (message) =>
    updateTaskFields(message.token, message.databaseId, message.pageId, message.task),
  "notion:postponeTask": (message) => postponeTask(message.token, message.databaseId, message.pageId, message.task),
  "notion:fetchNotes": (message) => fetchNotes(message.token, message.notesDatabaseId),
  "notion:createNote": (message) => createNote(message.token, message.notesDatabaseId, message.note),
  "notion:updateNoteFields": (message) =>
    updateNoteFields(message.token, message.notesDatabaseId, message.pageId, message.note),
  "notion:fetchNoteContent": (message) => fetchNoteContent(message.token, message.pageId),
  "notion:replaceNoteContent": (message) => replaceNoteContent(message.token, message.pageId, message.text)
};

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?view=tab") });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) {
    sendResponse({ ok: false, error: "Invalid message." });
    return;
  }

  const handler = MESSAGE_HANDLERS[message.type];
  if (!handler) {
    sendResponse({ ok: false, error: "Unsupported action." });
    return;
  }

  handler(message)
    .then((result) => sendResponse({ ok: true, data: result }))
    .catch((error) => sendResponse({ ok: false, error: error.message || "Unknown error." }));

  return true;
});
