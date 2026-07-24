function stringifyJson(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(String(value || "null"));

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function parseJsonValue(value) {
  try {
    return JSON.parse(String(value || "null"));
  } catch {
    return null;
  }
}

function freezeClone(value) {
  return deepFreeze(cloneValue(value));
}

function cloneValue(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }

  return value;
}

module.exports = {
  cloneValue,
  freezeClone,
  parseJsonObject,
  parseJsonValue,
  stringifyJson,
};
