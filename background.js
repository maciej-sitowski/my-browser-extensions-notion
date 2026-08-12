import {
  createTask,
  fetchAllTasks,
  fetchInitialData,
  fetchParaInstances,
  fetchTodayTasks,
  testConnection,
  updateTaskFields,
  updateTaskStatus
} from "./notionClient.js";

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?view=tab") });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) {
    sendResponse({ ok: false, error: "Invalid message." });
    return;
  }

  handleMessage(message)
    .then((result) => sendResponse({ ok: true, data: result }))
    .catch((error) => sendResponse({ ok: false, error: error.message || "Unknown error." }));

  return true;
});

async function handleMessage(message) {
  const { type, token } = message;

  if (type === "notion:testConnection") {
    return testConnection(token);
  }

  if (type === "notion:fetchInitialData") {
    return fetchInitialData(token);
  }

  if (type === "notion:createTask") {
    return createTask(token, message.databaseId, message.task);
  }

  if (type === "notion:fetchParaInstances") {
    return fetchParaInstances(token, message.paraDatabaseId);
  }

  if (type === "notion:fetchTodayTasks") {
    return fetchTodayTasks(token, message.databaseId, message.dateString);
  }

  if (type === "notion:fetchAllTasks") {
    return fetchAllTasks(token, message.databaseId);
  }

  if (type === "notion:updateTaskStatus") {
    return updateTaskStatus(token, message.databaseId, message.pageId, message.statusName);
  }

  if (type === "notion:updateTaskFields") {
    return updateTaskFields(token, message.databaseId, message.pageId, message.task);
  }

  throw new Error("Unsupported action.");
}
