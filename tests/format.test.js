const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const formatSource = fs.readFileSync(path.join(__dirname, "..", "src", "format.js"), "utf8");

test("dashboard greeting follows local morning, afternoon, and evening hours", async () => {
  const { getGreeting } = await import(`data:text/javascript,${encodeURIComponent(formatSource)}`);

  assert.equal(getGreeting(new Date(2026, 0, 1, 0)), "Good morning.");
  assert.equal(getGreeting(new Date(2026, 0, 1, 11)), "Good morning.");
  assert.equal(getGreeting(new Date(2026, 0, 1, 12)), "Good afternoon.");
  assert.equal(getGreeting(new Date(2026, 0, 1, 17)), "Good afternoon.");
  assert.equal(getGreeting(new Date(2026, 0, 1, 18)), "Good evening.");
  assert.equal(getGreeting(new Date(2026, 0, 1, 23)), "Good evening.");
});
