import { getDateString } from "./dates.js";

const NOTION_BASE_URL = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function buildHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
  };
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function notionRequest(path, options = {}, token, attempt = 0) {
  if (!token) {
    throw new Error("Token is missing. Save your Notion token first.");
  }

  const response = await fetch(`${NOTION_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...buildHeaders(token),
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Notion API returned non-JSON response.");
  }

  if (!response.ok) {
    let message = data?.message || `Notion API error (${response.status}).`;

    if (response.status === 400) {
      message =
        "Database schema mismatch (HTTP 400). Check property names. Tasks expect Name, Do on, Sekcja dnia, PARA, Status. Notes need a title property and optional PARA relation.";
    } else if (response.status === 401 || response.status === 403) {
      message = "Unauthorized token. Check token and workspace access.";
    } else if (response.status === 404) {
      message = "Database not found or not shared with integration.";
    } else if (response.status === 429) {
      if (attempt < 4) {
        await wait(400 * (attempt + 1));
        return notionRequest(path, options, token, attempt + 1);
      }
      message = "Rate limited by Notion. Wait and retry.";
    }

    throw new Error(message);
  }

  return data;
}

function extractTitle(item) {
  if (!item || typeof item !== "object") {
    return "Untitled";
  }

  if (item.object === "page") {
    const titleProp = item.properties
      ? Object.values(item.properties).find((prop) => prop?.type === "title")
      : undefined;
    const title = titleProp?.title?.map((t) => t.plain_text).join("").trim();
    return title || "Untitled page";
  }

  if (item.object === "database") {
    const title = item.title?.map((t) => t.plain_text).join("").trim();
    return title || "Untitled database";
  }

  return item.name || "Untitled";
}

function extractIconLabel(icon) {
  if (!icon || typeof icon !== "object") {
    return "";
  }

  if (icon.type === "emoji") {
    return icon.emoji || "";
  }

  // URL-based icons cannot be rendered in native <select> options, so use a neutral marker.
  if (icon.type === "external" || icon.type === "file") {
    return "🔗";
  }

  return "";
}

export async function testConnection(token) {
  const me = await notionRequest("/users/me", { method: "GET" }, token);
  return {
    ok: true,
    user: {
      id: me.id,
      name: me.name || me.bot?.owner?.user?.name || "unknown"
    }
  };
}

export async function fetchInitialData(token) {
  const payload = await notionRequest(
    "/search",
    {
      method: "POST",
      body: JSON.stringify({ page_size: 5 })
    },
    token
  );

  const items = (payload.results || []).slice(0, 5).map((item) => ({
    id: item.id,
    object: item.object,
    title: extractTitle(item),
    url: item.url || ""
  }));

  return {
    ok: true,
    count: items.length,
    items
  };
}

export async function createTask(token, databaseId, task) {
  if (!databaseId) {
    throw new Error("Database ID missing. Open settings and save your database ID.");
  }

  const title = task?.title?.trim();
  if (!title) {
    throw new Error("Task title is required.");
  }

  const dueDate = task?.dueDate?.trim() || getDateString();
  const sectionDay = task?.sectionDay?.trim();
  const paraRelationId = task?.paraRelationId?.trim();
  const statusName = task?.statusName?.trim() || "Not started";

  const properties = {
    Name: {
      title: [{ text: { content: title } }]
    }
  };

  if (dueDate) {
    properties["Do on"] = {
      date: { start: dueDate }
    };
  }

  if (sectionDay) {
    properties["Sekcja dnia"] = {
      select: { name: sectionDay }
    };
  }

  if (paraRelationId) {
    properties.PARA = {
      relation: [{ id: paraRelationId }]
    };
  }

  if (statusName) {
    const statusConfig = await getStatusPropertyConfig(token, databaseId);
    assignStatusProperty(properties, statusConfig, statusName);
  }

  const body = {
    parent: { database_id: databaseId },
    properties
  };

  const payload = await notionRequest(
    "/pages",
    {
      method: "POST",
      body: JSON.stringify(body)
    },
    token
  );

  return {
    ok: true,
    id: payload.id,
    url: payload.url || "",
    createdTime: payload.created_time || ""
  };
}

function findTitleFromProperties(properties) {
  if (!properties || typeof properties !== "object") {
    return "Untitled";
  }

  const titleProp = Object.values(properties).find((prop) => prop?.type === "title");
  const title = titleProp?.title?.map((part) => part.plain_text).join("").trim();
  return title || "Untitled";
}

function pickTextProperty(properties, key) {
  const prop = properties?.[key];
  if (!prop) {
    return "";
  }

  if (prop.type === "select") {
    return prop.select?.name || "";
  }

  if (prop.type === "rich_text") {
    return prop.rich_text?.map((part) => part.plain_text).join("") || "";
  }

  if (prop.type === "title") {
    return prop.title?.map((part) => part.plain_text).join("") || "";
  }

  return "";
}

export async function fetchParaInstances(token, paraDatabaseId) {
  if (!paraDatabaseId) {
    throw new Error("PARA database ID missing. Save it in Settings.");
  }

  const payload = await notionRequest(
    `/databases/${paraDatabaseId}/query`,
    {
      method: "POST",
      body: JSON.stringify({ page_size: 100 })
    },
    token
  );

  const items = (payload.results || []).map((row) => {
    const properties = row.properties || {};
    return {
      id: row.id,
      title: findTitleFromProperties(properties),
      icon: extractIconLabel(row.icon),
      para: pickTextProperty(properties, "PARA"),
      day: pickTextProperty(properties, "Day"),
      url: row.url || ""
    };
  });

  return {
    ok: true,
    count: items.length,
    items
  };
}

function pickDateProperty(properties, key) {
  const prop = properties?.[key];
  if (!prop || prop.type !== "date") {
    return "";
  }

  return prop.date?.start || "";
}

function pickRelationIds(properties, key) {
  const prop = properties?.[key];
  if (!prop || prop.type !== "relation") {
    return [];
  }

  return (prop.relation || []).map((item) => item.id).filter(Boolean);
}

function pickStatusProperty(properties, key) {
  const prop = properties?.[key];
  if (!prop) {
    return "";
  }

  if (prop.type === "status") {
    return prop.status?.name || "";
  }

  if (prop.type === "select") {
    return prop.select?.name || "";
  }

  return "";
}

function extractStatusConfig(properties) {
  const props = properties || {};
  const directStatus = props.Status;
  if (directStatus?.type === "status") {
    return {
      propertyName: "Status",
      propertyType: "status",
      options: (directStatus.status?.options || []).map((option) => option.name).filter(Boolean)
    };
  }

  if (directStatus?.type === "select") {
    return {
      propertyName: "Status",
      propertyType: "select",
      options: (directStatus.select?.options || []).map((option) => option.name).filter(Boolean)
    };
  }

  const entries = Object.entries(props);
  const fallbackStatus = entries.find(([, value]) => value?.type === "status");
  if (fallbackStatus) {
    const [propertyName, property] = fallbackStatus;
    return {
      propertyName,
      propertyType: "status",
      options: (property.status?.options || []).map((option) => option.name).filter(Boolean)
    };
  }

  const fallbackSelect = entries.find(
    ([name, value]) => value?.type === "select" && /status/i.test(name)
  );
  if (fallbackSelect) {
    const [propertyName, property] = fallbackSelect;
    return {
      propertyName,
      propertyType: "select",
      options: (property.select?.options || []).map((option) => option.name).filter(Boolean)
    };
  }

  return {
    propertyName: "Status",
    propertyType: "status",
    options: []
  };
}

function assignStatusProperty(properties, statusConfig, statusName) {
  const value = statusName?.trim();
  const propertyName = statusConfig?.propertyName || statusConfig?.statusProperty;
  const propertyType = statusConfig?.propertyType || statusConfig?.statusType;
  if (!value || !propertyName) {
    return;
  }

  if (propertyType === "select") {
    properties[propertyName] = {
      select: { name: value }
    };
    return;
  }

  properties[propertyName] = {
    status: { name: value }
  };
}

const SECTION_DAY_NOTION_COLORS = {
  ALL: "red",
  "07:00 Learning": "gray",
  "08:00 Improving": "brown",
  "09:00 Planning": "orange",
  "10:00 Deep Working": "yellow",
  "15:00 Work Closure": "green",
  "15:30 Training": "blue",
  "16:30 Family Time": "purple",
  "20:30 Close Day": "default"
};

async function getDatabase(token, databaseId) {
  return notionRequest(`/databases/${databaseId}`, { method: "GET" }, token);
}

async function getStatusPropertyConfig(token, databaseId) {
  const payload = await getDatabase(token, databaseId);
  return extractStatusConfig(payload?.properties || {});
}

function buildSectionDaySelectOptions(existingOptions = []) {
  const leftover = new Map(existingOptions.map((option) => [option.name, option]));
  const options = [];

  for (const [name, color] of Object.entries(SECTION_DAY_NOTION_COLORS)) {
    const current = leftover.get(name);
    leftover.delete(name);

    if (current?.id) {
      options.push({ id: current.id, name, color });
    } else {
      options.push({ name, color });
    }
  }

  for (const current of leftover.values()) {
    options.push({
      id: current.id,
      name: current.name,
      color: current.color || "default"
    });
  }

  return options;
}

function sectionDayColorsNeedUpdate(existingOptions = []) {
  const desired = Object.entries(SECTION_DAY_NOTION_COLORS);
  const byName = new Map(existingOptions.map((option) => [option.name, option]));

  return desired.some(([name, color]) => {
    const current = byName.get(name);
    return !current || current.color !== color;
  });
}

async function ensureSectionDayOptionColors(token, databaseId, database) {
  const property = database?.properties?.["Sekcja dnia"];
  if (!property || property.type !== "select") {
    return;
  }

  const existingOptions = property.select?.options || [];
  if (!sectionDayColorsNeedUpdate(existingOptions)) {
    return;
  }

  try {
    await notionRequest(
      `/databases/${databaseId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          properties: {
            "Sekcja dnia": {
              select: {
                options: buildSectionDaySelectOptions(existingOptions)
              }
            }
          }
        })
      },
      token
    );
  } catch {
    // Color sync is best-effort and must not block loading tasks.
  }
}

export async function fetchTodayTasks(token, databaseId, dateString) {
  if (!databaseId) {
    throw new Error("Task database ID missing. Open Settings and save it.");
  }

  const database = await getDatabase(token, databaseId);
  const statusConfig = extractStatusConfig(database?.properties || {});
  await ensureSectionDayOptionColors(token, databaseId, database);

  const payload = await notionRequest(
    `/databases/${databaseId}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        filter: {
          property: "Do on",
          date: {
            equals: dateString
          }
        }
      })
    },
    token
  );

  const items = (payload.results || []).map((row) => {
    const properties = row.properties || {};
    return {
      id: row.id,
      title: findTitleFromProperties(properties),
      sectionDay: pickTextProperty(properties, "Sekcja dnia"),
      paraRelationIds: pickRelationIds(properties, "PARA"),
      status: pickStatusProperty(properties, statusConfig.propertyName),
      doOn: pickDateProperty(properties, "Do on"),
      url: row.url || ""
    };
  });

  return {
    ok: true,
    count: items.length,
    date: dateString,
    items
  };
}

export async function fetchAllTasks(token, databaseId) {
  if (!databaseId) {
    throw new Error("Task database ID missing. Open Settings and save it.");
  }

  const database = await getDatabase(token, databaseId);
  const statusConfig = extractStatusConfig(database?.properties || {});
  await ensureSectionDayOptionColors(token, databaseId, database);

  const payload = await notionRequest(
    `/databases/${databaseId}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        sorts: [
          {
            property: "Do on",
            direction: "ascending"
          }
        ]
      })
    },
    token
  );

  const items = (payload.results || []).map((row) => {
    const properties = row.properties || {};
    return {
      id: row.id,
      title: findTitleFromProperties(properties),
      sectionDay: pickTextProperty(properties, "Sekcja dnia"),
      paraRelationIds: pickRelationIds(properties, "PARA"),
      status: pickStatusProperty(properties, statusConfig.propertyName),
      doOn: pickDateProperty(properties, "Do on"),
      url: row.url || ""
    };
  });

  return {
    ok: true,
    count: items.length,
    statusConfig,
    items
  };
}

export async function updateTaskStatus(token, databaseId, pageId, statusName) {
  if (!databaseId) {
    throw new Error("Task database ID missing. Open Settings and save it.");
  }

  if (!pageId) {
    throw new Error("Task ID is required.");
  }

  if (!statusName || !statusName.trim()) {
    throw new Error("Status value is required.");
  }

  const statusConfig = await getStatusPropertyConfig(token, databaseId);
  const value = statusName.trim();
  const properties = {};
  assignStatusProperty(properties, statusConfig, value);

  const payload = await notionRequest(
    `/pages/${pageId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ properties })
    },
    token
  );

  return {
    ok: true,
    id: payload.id,
    status: value,
    propertyName: statusConfig.propertyName,
    propertyType: statusConfig.propertyType
  };
}

function parseNotesSchema(properties) {
  const props = properties || {};
  const entries = Object.entries(props);
  const titleEntry = entries.find(([, property]) => property?.type === "title");
  const paraEntry =
    entries.find(([name, property]) => property?.type === "relation" && name === "PARA") ||
    entries.find(([name, property]) => property?.type === "relation" && /para/i.test(name));
  const dateEntry =
    entries.find(([name]) => name === "Date Created") ||
    entries.find(([, property]) => property?.type === "date") ||
    entries.find(([, property]) => property?.type === "created_time");
  const statusConfig = extractStatusConfig(props);

  return {
    titleProperty: titleEntry?.[0] || "Name",
    paraProperty: paraEntry?.[0] || "PARA",
    dateProperty: dateEntry?.[0] || "Date Created",
    dateType: dateEntry?.[1]?.type || "date",
    statusProperty: statusConfig.propertyName,
    statusType: statusConfig.propertyType,
    statusOptions: statusConfig.options || []
  };
}

function pickDateLikeProperty(properties, key) {
  const prop = properties?.[key];
  if (!prop) {
    return "";
  }

  if (prop.type === "date") {
    return prop.date?.start || "";
  }

  if (prop.type === "created_time") {
    return prop.created_time || "";
  }

  if (prop.type === "last_edited_time") {
    return prop.last_edited_time || "";
  }

  return "";
}

function buildNotesSort(schema) {
  if (schema.dateType === "date" && schema.dateProperty) {
    return [
      {
        property: schema.dateProperty,
        direction: "descending"
      }
    ];
  }

  return [
    {
      timestamp: "created_time",
      direction: "descending"
    }
  ];
}

function assignNoteDateProperty(properties, schema, dateValue) {
  if (schema.dateType !== "date" || !schema.dateProperty) {
    return;
  }

  properties[schema.dateProperty] = {
    date: dateValue ? { start: dateValue } : null
  };
}

export async function fetchNotes(token, notesDatabaseId) {
  if (!notesDatabaseId) {
    throw new Error("Notes database ID missing. Open Settings and save it.");
  }

  const database = await notionRequest(`/databases/${notesDatabaseId}`, { method: "GET" }, token);
  const schema = parseNotesSchema(database?.properties);

  const payload = await notionRequest(
    `/databases/${notesDatabaseId}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        sorts: buildNotesSort(schema)
      })
    },
    token
  );

  const items = (payload.results || []).map((row) => {
    const properties = row.properties || {};
    return {
      id: row.id,
      title: findTitleFromProperties(properties),
      paraRelationIds: schema.paraProperty ? pickRelationIds(properties, schema.paraProperty) : [],
      status: pickStatusProperty(properties, schema.statusProperty),
      date: pickDateLikeProperty(properties, schema.dateProperty) || row.created_time || "",
      url: row.url || ""
    };
  });

  return {
    ok: true,
    count: items.length,
    schema,
    items
  };
}

export async function createNote(token, notesDatabaseId, note) {
  if (!notesDatabaseId) {
    throw new Error("Notes database ID missing. Open Settings and save it.");
  }

  const title = note?.title?.trim();
  if (!title) {
    throw new Error("Note title is required.");
  }

  const database = await notionRequest(`/databases/${notesDatabaseId}`, { method: "GET" }, token);
  const schema = parseNotesSchema(database?.properties);
  const paraRelationId = note?.paraRelationId?.trim();
  const dateValue = note?.date?.trim();

  const properties = {
    [schema.titleProperty]: {
      title: [{ text: { content: title } }]
    }
  };

  if (schema.paraProperty && paraRelationId) {
    properties[schema.paraProperty] = {
      relation: [{ id: paraRelationId }]
    };
  }

  assignStatusProperty(properties, schema, note?.statusName);
  assignNoteDateProperty(properties, schema, dateValue);

  const payload = await notionRequest(
    "/pages",
    {
      method: "POST",
      body: JSON.stringify({
        parent: { database_id: notesDatabaseId },
        properties
      })
    },
    token
  );

  return {
    ok: true,
    id: payload.id,
    url: payload.url || "",
    createdTime: payload.created_time || ""
  };
}

export async function updateNoteFields(token, notesDatabaseId, pageId, note) {
  if (!notesDatabaseId) {
    throw new Error("Notes database ID missing. Open Settings and save it.");
  }

  if (!pageId) {
    throw new Error("Note ID is required.");
  }

  const title = note?.title?.trim();
  if (!title) {
    throw new Error("Note title is required.");
  }

  const database = await notionRequest(`/databases/${notesDatabaseId}`, { method: "GET" }, token);
  const schema = parseNotesSchema(database?.properties);
  const paraRelationId = note?.paraRelationId?.trim() || "";
  const dateValue = note?.date?.trim() || "";

  const properties = {
    [schema.titleProperty]: {
      title: [{ text: { content: title } }]
    }
  };

  if (schema.paraProperty) {
    properties[schema.paraProperty] = {
      relation: paraRelationId ? [{ id: paraRelationId }] : []
    };
  }

  assignStatusProperty(properties, schema, note?.statusName);
  assignNoteDateProperty(properties, schema, dateValue);

  const payload = await notionRequest(
    `/pages/${pageId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ properties })
    },
    token
  );

  return {
    ok: true,
    id: payload.id,
    url: payload.url || ""
  };
}

function extractRichText(richText) {
  return (richText || []).map((part) => part.plain_text || "").join("");
}

function mapBlock(block) {
  const type = block?.type || "unsupported";
  const data = block?.[type] || {};
  const item = {
    id: block.id,
    type,
    text: extractRichText(data.rich_text || data.title || data.caption),
    checked: Boolean(data.checked),
    language: data.language || "",
    url: data.url || data.external?.url || data.file?.url || "",
    cells: Array.isArray(data.cells)
      ? data.cells.map((cell) => extractRichText(cell))
      : [],
    children: []
  };

  if (type === "child_page") {
    item.text = data.title || item.text || "Child page";
  }

  if (type === "child_database") {
    item.text = data.title || "Linked database";
  }

  if (type === "equation") {
    item.text = data.expression || item.text;
  }

  if (type === "bookmark" || type === "embed" || type === "link_preview") {
    item.text = item.text || item.url || type;
  }

  if (type === "image" && !item.text) {
    item.text = "Image";
  }

  return item;
}

function shouldFetchChildren(type) {
  return ![
    "child_page",
    "child_database",
    "link_to_page",
    "unsupported",
    "image",
    "video",
    "file",
    "pdf",
    "bookmark",
    "embed",
    "link_preview"
  ].includes(type);
}

async function listChildBlocks(token, blockId, maxResults = Infinity) {
  const results = [];
  let cursor = "";

  do {
    const params = new URLSearchParams({ page_size: "100" });
    if (cursor) {
      params.set("start_cursor", cursor);
    }

    const payload = await notionRequest(
      `/blocks/${blockId}/children?${params.toString()}`,
      { method: "GET" },
      token
    );

    results.push(...(payload.results || []));
    cursor = payload.has_more ? payload.next_cursor || "" : "";
  } while (cursor && results.length < maxResults);

  return results;
}

async function fetchBlockChildren(token, blockId, depth = 0) {
  if (!blockId || depth > 4) {
    return [];
  }

  const results = await listChildBlocks(token, blockId, 250);
  const items = [];

  for (const block of results) {
    const mapped = mapBlock(block);
    if (block.has_children && shouldFetchChildren(block.type)) {
      mapped.children = await fetchBlockChildren(token, block.id, depth + 1);
    }
    items.push(mapped);
  }

  return items;
}

export async function fetchNoteContent(token, pageId) {
  if (!pageId) {
    throw new Error("Note ID is required.");
  }

  const blocks = await fetchBlockChildren(token, pageId, 0);
  return {
    ok: true,
    pageId,
    blocks,
    text: blocksToEditableText(blocks)
  };
}

function blocksToEditableText(blocks) {
  const lines = [];

  const walk = (block) => {
    const type = block?.type;
    const text = block?.text || "";

    if (type === "table") {
      for (const row of block.children || []) {
        lines.push((row.cells || []).join(" | "));
      }
      return;
    }

    if (type === "code") {
      lines.push("```");
      if (text) {
        lines.push(text);
      }
      lines.push("```");
      return;
    }

    if (type === "divider") {
      lines.push("---");
    } else if (type === "heading_1") {
      lines.push(`# ${text}`);
    } else if (type === "heading_2") {
      lines.push(`## ${text}`);
    } else if (type === "heading_3") {
      lines.push(`### ${text}`);
    } else if (type === "bulleted_list_item") {
      lines.push(`- ${text}`);
    } else if (type === "numbered_list_item") {
      lines.push(`1. ${text}`);
    } else if (type === "to_do") {
      lines.push(block.checked ? `- [x] ${text}` : `- [ ] ${text}`);
    } else if (type === "quote" || type === "callout") {
      const quoteLines = text ? text.split("\n") : [""];
      quoteLines.forEach((line) => lines.push(`> ${line}`));
    } else if (text.includes("\n")) {
      text.split("\n").forEach((line) => lines.push(line));
    } else {
      lines.push(text);
    }

    for (const child of block.children || []) {
      walk(child);
    }
  };

  for (const block of blocks || []) {
    walk(block);
  }

  return lines.join("\n");
}

function toRichText(content) {
  const value = content ?? "";
  if (!value) {
    return [];
  }

  const parts = [];
  for (let index = 0; index < value.length; index += 2000) {
    parts.push({
      type: "text",
      text: { content: value.slice(index, index + 2000) }
    });
  }
  return parts;
}

function makeBlock(type, text = "", extra = {}) {
  if (type === "divider") {
    return { type: "divider", divider: {} };
  }

  if (type === "code") {
    return {
      type: "code",
      code: {
        rich_text: toRichText(text),
        language: "plain text"
      }
    };
  }

  const payload = { rich_text: toRichText(text), ...extra };
  return { type, [type]: payload };
}

function textToNotionBlocks(text) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.trim().startsWith("```")) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      blocks.push(makeBlock("code", codeLines.join("\n")));
      continue;
    }

    if (line.trim() === "---") {
      blocks.push(makeBlock("divider"));
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push(makeBlock("heading_3", line.slice(4)));
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push(makeBlock("heading_2", line.slice(3)));
      continue;
    }

    if (line.startsWith("# ")) {
      blocks.push(makeBlock("heading_1", line.slice(2)));
      continue;
    }

    if (/^- \[[xX]\](?: |$)/.test(line)) {
      blocks.push(makeBlock("to_do", line.replace(/^- \[[xX]\]\s?/, ""), { checked: true }));
      continue;
    }

    if (/^- \[ \](?: |$)/.test(line)) {
      blocks.push(makeBlock("to_do", line.replace(/^- \[ \]\s?/, ""), { checked: false }));
      continue;
    }

    if (line.startsWith("- ")) {
      blocks.push(makeBlock("bulleted_list_item", line.slice(2)));
      continue;
    }

    if (/^\d+\. /.test(line)) {
      blocks.push(makeBlock("numbered_list_item", line.replace(/^\d+\. /, "")));
      continue;
    }

    if (line.startsWith("> ")) {
      blocks.push(makeBlock("quote", line.slice(2)));
      continue;
    }

    blocks.push(makeBlock("paragraph", line));
  }

  return blocks;
}

async function fetchTopLevelBlockIds(token, pageId) {
  const blocks = await listChildBlocks(token, pageId);
  return blocks.map((block) => block.id).filter(Boolean);
}

export async function replaceNoteContent(token, pageId, text) {
  if (!pageId) {
    throw new Error("Note ID is required.");
  }

  const children = textToNotionBlocks(text);
  const existingIds = await fetchTopLevelBlockIds(token, pageId);

  for (const blockId of existingIds) {
    await notionRequest(`/blocks/${blockId}`, { method: "DELETE" }, token);
  }

  for (let index = 0; index < children.length; index += 100) {
    const chunk = children.slice(index, index + 100);
    await notionRequest(
      `/blocks/${pageId}/children`,
      {
        method: "PATCH",
        body: JSON.stringify({ children: chunk })
      },
      token
    );
  }

  return fetchNoteContent(token, pageId);
}

export async function updateTaskFields(token, databaseId, pageId, task) {
  if (!databaseId) {
    throw new Error("Task database ID missing. Open Settings and save it.");
  }

  if (!pageId) {
    throw new Error("Task ID is required.");
  }

  const title = task?.title?.trim();
  if (!title) {
    throw new Error("Task title is required.");
  }

  const sectionDay = task?.sectionDay?.trim() || "";
  const paraRelationId = task?.paraRelationId?.trim() || "";
  const dueDate = task?.dueDate?.trim() || "";
  const statusName = task?.statusName?.trim() || "";

  const properties = {
    Name: {
      title: [{ text: { content: title } }]
    },
    "Sekcja dnia": {
      select: sectionDay ? { name: sectionDay } : null
    },
    PARA: {
      relation: paraRelationId ? [{ id: paraRelationId }] : []
    },
    "Do on": {
      date: dueDate ? { start: dueDate } : null
    }
  };

  if (statusName) {
    const statusConfig = await getStatusPropertyConfig(token, databaseId);
    assignStatusProperty(properties, statusConfig, statusName);
  }

  const payload = await notionRequest(
    `/pages/${pageId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ properties })
    },
    token
  );

  return {
    ok: true,
    id: payload.id,
    url: payload.url || ""
  };
}
