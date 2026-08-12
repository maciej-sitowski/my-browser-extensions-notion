const TOKEN_KEY = "notionApiToken";
const DATABASE_ID_KEY = "notionDatabaseId";
const PARA_DATABASE_ID_KEY = "notionParaDatabaseId";

export async function saveToken(token) {
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
}

export async function getToken() {
  const data = await chrome.storage.local.get([TOKEN_KEY]);
  return data[TOKEN_KEY] || "";
}

export async function saveDatabaseId(databaseId) {
  await chrome.storage.local.set({ [DATABASE_ID_KEY]: databaseId });
}

export async function getDatabaseId() {
  const data = await chrome.storage.local.get([DATABASE_ID_KEY]);
  return data[DATABASE_ID_KEY] || "";
}

export async function getSettings() {
  const data = await chrome.storage.local.get([TOKEN_KEY, DATABASE_ID_KEY, PARA_DATABASE_ID_KEY]);
  return {
    token: data[TOKEN_KEY] || "",
    databaseId: data[DATABASE_ID_KEY] || "",
    paraDatabaseId: data[PARA_DATABASE_ID_KEY] || ""
  };
}

export async function saveParaDatabaseId(databaseId) {
  await chrome.storage.local.set({ [PARA_DATABASE_ID_KEY]: databaseId });
}

export function maskToken(token) {
  if (!token || token.length < 10) {
    return "(not set)";
  }

  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}
