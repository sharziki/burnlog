import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { querySqlite } from "./sqlite.js";

test("querySqlite reads rows read-only", async () => {
  const db = join(mkdtempSync(join(tmpdir(), "bl-")), "t.db");
  execFileSync("sqlite3", [db, "create table t(a int, b text); insert into t values (1,'x'),(2,'y');"]);
  const rows = await querySqlite(db, "select a, b from t order by a");
  assert.deepEqual(rows.map((r) => ({ ...r })), [{ a: 1, b: "x" }, { a: 2, b: "y" }]);
});
