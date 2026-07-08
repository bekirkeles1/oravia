const {
  getActiveVertical,
  registerVertical,
  resolveVertical,
} = require("./verticalRegistry");
const { dentalVertical } = require("../verticals/dental/dentalVertical");

const DEFAULT_VERTICAL_ID = "dental";

function ensureDefaultAssistantVerticalRegistered() {
  if (!resolveVertical(DEFAULT_VERTICAL_ID)) {
    registerVertical(dentalVertical, { active: !getActiveVertical() });
  }

  return resolveVertical(DEFAULT_VERTICAL_ID);
}

function getActiveAssistantVertical() {
  ensureDefaultAssistantVerticalRegistered();
  return getActiveVertical();
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
