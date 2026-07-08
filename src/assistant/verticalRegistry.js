const verticals = new Map();
let activeVerticalId = null;

function validateVertical(vertical) {
  if (!vertical || typeof vertical !== "object") {
    throw new TypeError("Vertical must be an object.");
  }

  if (!vertical.id || typeof vertical.id !== "string") {
    throw new TypeError("Vertical must define a string id.");
  }

  if (!vertical.name || typeof vertical.name !== "string") {
    throw new TypeError("Vertical must define a string name.");
  }
}

function registerVertical(vertical, options = {}) {
  validateVertical(vertical);

  verticals.set(vertical.id, vertical);

  if (options.active || !activeVerticalId) {
    activeVerticalId = vertical.id;
  }

  return vertical;
}

function resolveVertical(id = activeVerticalId) {
  if (!id) {
    return null;
  }

  return verticals.get(id) || null;
}

function setActiveVertical(id) {
  if (!verticals.has(id)) {
    throw new Error(`Unknown assistant vertical "${id}".`);
  }

  activeVerticalId = id;
  return resolveVertical(id);
}

function getActiveVertical() {
  return resolveVertical(activeVerticalId);
}

function listVerticals() {
  return Array.from(verticals.values());
}

function clearVerticalRegistryForTests() {
  verticals.clear();
  activeVerticalId = null;
}

module.exports = {
  clearVerticalRegistryForTests,
  getActiveVertical,
  listVerticals,
  registerVertical,
  resolveVertical,
  setActiveVertical,
};
