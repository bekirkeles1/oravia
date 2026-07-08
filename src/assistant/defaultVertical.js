const {
  getActiveVertical,
  registerVertical,
  resolveVertical,
} = require("./verticalRegistry");
const { assertVerticalCapabilities } = require("./verticalContract");
const { dentalVertical } = require("../verticals/dental/dentalVertical");

const DEFAULT_VERTICAL_ID = "dental";

function ensureDefaultAssistantVerticalRegistered() {
  if (!resolveVertical(DEFAULT_VERTICAL_ID)) {
    registerVertical(dentalVertical, { active: !getActiveVertical() });
  }

  const defaultVertical = resolveVertical(DEFAULT_VERTICAL_ID);
  assertVerticalCapabilities(defaultVertical);
  return defaultVertical;
}

function getActiveAssistantVertical() {
  ensureDefaultAssistantVerticalRegistered();
  const activeVertical = getActiveVertical();
  assertVerticalCapabilities(activeVertical);
  return activeVertical;
}

function getDefaultAssistantVertical() {
  return ensureDefaultAssistantVerticalRegistered();
}

module.exports = {
  DEFAULT_VERTICAL_ID,
  ensureDefaultAssistantVerticalRegistered,
  getActiveAssistantVertical,
  getDefaultAssistantVertical,
};
