export function getDateString(daysOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return formatDateOnly(date);
}

export function normalizeDateInputValue(value) {
  return (value || "").slice(0, 10);
}

export function parseDateOnly(value) {
  const part = normalizeDateInputValue(value);
  if (!part) {
    return null;
  }

  const [year, month, day] = part.split("-").map((item) => Number(item));
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

export function isInWeek(value, weeksAgo = 0) {
  const date = parseDateOnly(value);
  if (!date) {
    return false;
  }

  const today = new Date();
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysSinceMonday = (current.getDay() + 6) % 7;
  const weekStart = new Date(current);
  weekStart.setDate(current.getDate() - daysSinceMonday - weeksAgo * 7);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  return date >= weekStart && date <= weekEnd;
}

export function matchesDateFilter(value, mode) {
  if (!mode || mode === "all") {
    return true;
  }

  const date = normalizeDateInputValue(value);

  if (mode === "today") {
    return date === getDateString();
  }

  if (mode === "yesterday") {
    return date === getDateString(-1);
  }

  if (mode === "this_week") {
    return isInWeek(date, 0);
  }

  if (mode === "last_week") {
    return isInWeek(date, 1);
  }

  return true;
}

export function addDaysToDateString(value, days) {
  const date = parseDateOnly(value) || parseDateOnly(getDateString());
  date.setDate(date.getDate() + days);
  return formatDateOnly(date);
}

export function nextPostponeState(dueDate, counter) {
  return {
    dueDate: addDaysToDateString(dueDate, 1),
    counter: (Number(counter) || 0) + 1
  };
}

function formatDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
