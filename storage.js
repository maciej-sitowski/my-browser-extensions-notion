const TOKEN_KEY = "notionApiToken";
const DATABASE_ID_KEY = "notionDatabaseId";
const PARA_DATABASE_ID_KEY = "notionParaDatabaseId";
const NOTES_DATABASE_ID_KEY = "notionNotesDatabaseId";

export async function getSettings() {
  const data = await chrome.storage.local.get([
    TOKEN_KEY,
    DATABASE_ID_KEY,
    PARA_DATABASE_ID_KEY,
    NOTES_DATABASE_ID_KEY
  ]);

  return {
    token: data[TOKEN_KEY] || "",
    databaseId: data[DATABASE_ID_KEY] || "",
    paraDatabaseId: data[PARA_DATABASE_ID_KEY] || "",
    notesDatabaseId: data[NOTES_DATABASE_ID_KEY] || ""
  };
}

export async function saveSettings({ token, databaseId, paraDatabaseId, notesDatabaseId }) {
  await chrome.storage.local.set({
    [TOKEN_KEY]: token,
    [DATABASE_ID_KEY]: databaseId,
    [PARA_DATABASE_ID_KEY]: paraDatabaseId,
    [NOTES_DATABASE_ID_KEY]: notesDatabaseId ?? ""
  });
}

export function maskToken(token) {
  if (!token || token.length < 10) {
    return "(not set)";
  }

  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}
