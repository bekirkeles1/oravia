const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const REPO_ROOT = path.join(__dirname, "..");

const MESSAGING_CORE_FILES = [
  "src/messaging/replyPlanner.js",
  "src/messaging/slotProposal.js",
];

const FORBIDDEN_PATTERNS = [
  /require\(["']\.\.\/clinic\//,
  /require\(["']\.\.\/\.\.\/clinic\//,
  /require\(["']\.\.\/verticals\/dental\//,
  /require\(["']\.\.\/\.\.\/verticals\/dental\//,
  /from ["']\.\.\/clinic\//,
  /from ["']\.\.\/\.\.\/clinic\//,
  /from ["']\.\.\/verticals\/dental\//,
  /from ["']\.\.\/\.\.\/verticals\/dental\//,
  /\bdentalVertical\b/,
];

test("messaging core does not directly import dental or clinic modules", () => {
  // Messaging core must stay reusable; dental-specific logic belongs behind the vertical boundary.
  for (const relativeFilePath of MESSAGING_CORE_FILES) {
    const absoluteFilePath = path.join(REPO_ROOT, relativeFilePath);
    const source = readFileSync(absoluteFilePath, "utf8");
    const violations = FORBIDDEN_PATTERNS.filter((pattern) =>
      pattern.test(source)
    );

    assert.deepEqual(
      violations.map((pattern) => pattern.toString()),
      [],
      `${relativeFilePath} must use assistant vertical abstractions instead of importing clinic/dental modules directly.`
    );
  }
});
