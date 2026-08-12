const NOTION_BASE_URL = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function buildHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
  };
}

async function notionRequest(path, options = {}, token) {
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
        "Task schema mismatch (HTTP 400). Check database property names, expected defaults: Name, Do on, Sekcja dnia, PARA, Status.";
    } else if (response.status === 401 || response.status === 403) {
      message = "Unauthorized token. Check token and workspace access.";
    } else if (response.status === 404) {
      message = "Database not found or not shared with integration.";
    } else if (response.status === 429) {
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

  const dueDate = task?.dueDate?.trim();
  const sectionDay = task?.sectionDay?.trim();
  const paraRelationId = task?.paraRelationId?.trim();
  const statusName = task?.statusName?.trim();

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
    if (statusConfig.propertyType === "select") {
      properties[statusConfig.propertyName] = {
        select: { name: statusName }
      };
    } else {
      properties[statusConfig.propertyName] = {
        status: { name: statusName }
      };
    }
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

async function getStatusPropertyConfig(token, databaseId) {
  const payload = await notionRequest(`/databases/${databaseId}`, { method: "GET" }, token);
  const properties = payload?.properties || {};

  const directStatus = properties.Status;
  if (directStatus?.type === "status") {
    return {
      propertyName: "Status",
      propertyType: "status",
      options: (directStatus.status?.options || []).map((option) => option.name).filter(Boolean)
    };
  }

  const directSelect = properties.Status;
  if (directSelect?.type === "select") {
    return {
      propertyName: "Status",
      propertyType: "select",
      options: (directSelect.select?.options || []).map((option) => option.name).filter(Boolean)
    };
  }

  const entries = Object.entries(properties);
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

export async function fetchTodayTasks(token, databaseId, dateString) {
  if (!databaseId) {
    throw new Error("Task database ID missing. Open Settings and save it.");
  }

  const statusConfig = await getStatusPropertyConfig(token, databaseId);

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

  const statusConfig = await getStatusPropertyConfig(token, databaseId);

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

  if (statusConfig.propertyType === "select") {
    properties[statusConfig.propertyName] = {
      select: { name: value }
    };
  } else {
    properties[statusConfig.propertyName] = {
      status: { name: value }
    };
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
    status: value,
    propertyName: statusConfig.propertyName,
    propertyType: statusConfig.propertyType
  };
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
    if (statusConfig.propertyType === "select") {
      properties[statusConfig.propertyName] = {
        select: { name: statusName }
      };
    } else {
      properties[statusConfig.propertyName] = {
        status: { name: statusName }
      };
    }
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
