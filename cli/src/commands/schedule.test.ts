import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeCrontab, stripCrontab } from "./schedule.js";

test("mergeCrontab keeps other jobs and replaces an old burnlog line", () => {
  const before = "0 3 * * * backup.sh\n*/30 * * * * old burnlog >/dev/null 2>&1 # burnlog-sync\n";
  const after = mergeCrontab(before, "NEW");
  assert.equal(after, "0 3 * * * backup.sh\n*/30 * * * * NEW >/dev/null 2>&1 # burnlog-sync\n");
});

test("mergeCrontab on an empty table", () => {
  assert.equal(mergeCrontab("", "X"), "*/30 * * * * X >/dev/null 2>&1 # burnlog-sync\n");
});

test("stripCrontab removes only the burnlog line", () => {
  assert.equal(stripCrontab("a\n*/30 * * * * x # burnlog-sync\n"), "a\n");
  assert.equal(stripCrontab("*/30 * * * * x # burnlog-sync\n"), "");
});
