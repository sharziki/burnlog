import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as zlib from "zlib";
import { DshAdapter, isDshSessionLog, parseDshTranscript, servedModel } from "./dsh.js";

const hasZstd = typeof (zlib as unknown as { zstdCompressSync?: unknown }).zstdCompressSync === "function";
const zstd = (s: string): Buffer =>
  (zlib as unknown as { zstdCompressSync: (b: Buffer) => Buffer }).zstdCompressSync(Buffer.from(s));

const parse = (lines: string[], folder = "folder-sid") => parseDshTranscript(lines.join("\n"), folder);

async function withRoot(fn: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "bl-dsh-"));
  const prev = process.env.BURNLOG_DSH_DIR;
  process.env.BURNLOG_DSH_DIR = root;
  try {
    await fn(root);
  } finally {
    if (prev === undefined) delete process.env.BURNLOG_DSH_DIR;
    else process.env.BURNLOG_DSH_DIR = prev;
  }
}

test("dsh: file name pattern", () => {
  for (const ok of ["session.jsonl", "session.jsonl.zstd", "session.v2.jsonl", "session.v12.jsonl.zstd"])
    assert.ok(isDshSessionLog(ok), ok);
  for (const no of ["session.v.jsonl", "session.vx.jsonl", "other.jsonl", "session.json"])
    assert.ok(!isDshSessionLog(no), no);
});

test("dsh: parses assistant messages with usage, seq-fallback key", () => {
  const m = parse([
    `{"type":"session","version":0,"id":"session-abc","createdAt":1786669406484,"cwd":"E:\\\\repo\\\\proj"}`,
    `{"type":"user/message","seq":7,"time":1786669450001,"data":{"turn":1}}`,
    `{"type":"assistant/message","seq":301,"time":1786669454772,"data":{"turn":1,"step":1,"message":{"role":"assistant","content":[],"source":{"kind":"model","provider":"irix","model":"deepseek-v4-flash"}},"usage":{"inputTokens":130,"outputTokens":159,"cacheReadTokens":13824}}}`,
    `{"type":"assistant/message","seq":414,"time":1786669459063,"data":{"turn":1,"step":2,"message":{"role":"assistant","content":[],"source":{"kind":"model","provider":"irix","model":"deepseek-v4-flash"}},"usage":{"inputTokens":130,"outputTokens":159,"cacheReadTokens":13824}}}`,
  ]);
  assert.equal(m.length, 2);
  assert.equal(m[0].model, "deepseek-v4-flash");
  assert.equal(m[0].provider, "irix");
  assert.equal(m[0].sessionId, "session-abc");
  assert.equal(m[0].timestamp, 1786669454772);
  assert.deepEqual([m[0].input, m[0].output, m[0].cacheRead, m[0].cacheWrite, m[0].reasoning], [130, 159, 13824, 0, 0]);
  assert.equal(m[0].key, "dsh:seq:301:1786669454772:irix:deepseek-v4-flash:130:159:13824:0:0");
});

test("dsh: served model beats configured model", () => {
  const m = parse([
    `{"type":"session","id":"session-served","createdAt":1,"cwd":"/work"}`,
    `{"type":"assistant/message","seq":42,"time":1787122684043,"data":{"turn":1,"message":{"id":"m-served","source":{"kind":"model","provider":"zai-coding-cn","model":"glm-5.2","replayState":{"response":{"model":"glm-5.2","responseModel":"glm-5.3"}}}},"usage":{"inputTokens":8425,"outputTokens":207,"cacheReadTokens":576}}}`,
  ]);
  assert.equal(m.length, 1);
  assert.equal(m[0].model, "glm-5.3");
  assert.equal(m[0].key, "dsh:msg:m-served:1787122684043:zai-coding-cn:glm-5.3:8425:207:576:0:0");
  assert.equal(servedModel({ model: " configured ", replayState: { response: { responseModel: " served " } } }), "served");
  assert.equal(servedModel({ model: " configured ", replayState: { response: { responseModel: "   " } } }), "configured");
  assert.equal(servedModel({ model: " configured ", replayState: { response: { responseModel: 123 } } }), "configured");
  assert.equal(servedModel({ model: "   " }), undefined);
  assert.equal(servedModel(undefined), undefined);
});

test("dsh: stream usage, attempts, retry boundary and settlement replacement", () => {
  const m = parse([
    `{"type":"session","id":"session-stream-usage","createdAt":1,"cwd":"/work"}`,
    `{"type":"request/header","seq":1,"time":1786669450001,"data":{"header":{"config":{"provider":"fixture-provider","model":"fixture-model"}}}}`,
    `{"type":"user/message","seq":2,"time":1786669450002,"data":{"turn":1}}`,
    `{"type":"assistant/attempt","seq":3,"time":1786669450003,"data":{"turn":1,"step":1,"stream":[{"type":"chunk","time":1786669450003,"chunk":{"type":"usage","usage":{"inputTokens":10,"outputTokens":3}}},{"type":"chunk","time":1786669450004,"chunk":{"type":"usage","usage":{"inputTokens":20,"outputTokens":5}}},{"type":"chunk","time":1786669450005,"chunk":{"type":"finish","reason":{"kind":"error"}}}]}}`,
    `{"type":"llm/retry-started","seq":4,"time":1786669450005,"data":{"turn":1,"step":1,"retry":1,"retryId":"retry-1"}}`,
    `{"type":"assistant/message","seq":5,"time":1786669450006,"data":{"turn":1,"step":1,"message":{"source":{"provider":"fixture-provider","model":"fixture-model"}},"usage":{"inputTokens":30,"outputTokens":7},"stream":[{"type":"chunk","time":1786669450006,"chunk":{"type":"usage","usage":{"inputTokens":999,"outputTokens":999}}}]}}`,
    `{"type":"user/message","seq":6,"time":1786669450007,"data":{"turn":2}}`,
    `{"type":"assistant/message","seq":7,"time":1786669450008,"data":{"turn":2,"step":1,"message":{"source":{"provider":"fixture-provider","model":"fixture-model"}},"stream":[{"type":"chunk","time":1786669450008,"chunk":{"type":"usage","usage":{"inputTokens":41,"outputTokens":9}}},{"type":"chunk","time":1786669450009,"chunk":{"type":"finish","reason":{"kind":"stop"}}}]}}`,
    `{"type":"user/message","seq":8,"time":1786669450010,"data":{"turn":3}}`,
    `{"type":"assistant/attempt","seq":9,"time":1786669450011,"data":{"turn":3,"step":1,"stream":[{"type":"chunk","time":1786669450011,"chunk":{"type":"usage","usage":{"inputTokens":50,"outputTokens":8}}},{"type":"chunk","time":1786669450012,"chunk":{"type":"finish","reason":{"kind":"error"}}}]}}`,
    `{"type":"assistant/message","seq":10,"time":1786669450013,"data":{"turn":3,"step":1,"message":{"source":{"provider":"fixture-provider","model":"fixture-model"}},"usage":{"inputTokens":52,"outputTokens":10}}}`,
  ]);
  assert.deepEqual(
    m.map((c) => [c.input, c.output]),
    [
      [20, 5],
      [30, 7],
      [41, 9],
      [52, 10],
    ],
  );
  assert.equal(m[0].model, "fixture-model");
  assert.equal(m[0].provider, "fixture-provider");
});

test("dsh: attempt seq fallback is scoped to its session", () => {
  const attempt = `{"type":"assistant/attempt","seq":9,"time":1786669450011,"data":{"turn":3,"step":1,"stream":[{"type":"chunk","time":1786669450011,"chunk":{"type":"usage","usage":{"inputTokens":50,"outputTokens":8}}}]}}`;
  const a = parse([`{"type":"session","id":"session-attempt-a","createdAt":1}`, attempt]);
  const b = parse([`{"type":"session","id":"session-attempt-b","createdAt":1}`, attempt]);
  assert.notEqual(a[0].key, b[0].key);
  assert.ok(a[0].key.includes("attempt-session:session-attempt-a:seq:9"));
});

test("dsh: compaction summaries count, keep keys, respect seed", () => {
  const m = parse([
    `{"type":"session","id":"session-abc","createdAt":1,"cwd":"/work"}`,
    `{"type":"assistant/message","seq":301,"time":1786669454772,"data":{"turn":1,"step":1,"message":{"source":{"provider":"minimax-cn","model":"MiniMax-M3"}},"usage":{"inputTokens":130,"outputTokens":159,"cacheReadTokens":13824}}}`,
    `{"type":"compaction/summary","seq":402,"time":1786669470000,"data":{"message":{"source":{"provider":"minimax-cn","model":"MiniMax-M3"}},"usage":{"inputTokens":536,"outputTokens":2436,"cacheReadTokens":41472}}}`,
  ]);
  assert.equal(m.length, 2);
  assert.equal(m[1].input + m[1].output + m[1].cacheRead, 44_444);

  assert.equal(
    parse([
      `{"type":"session","id":"s","createdAt":1}`,
      `{"type":"compaction/summary","seq":8,"time":1786669450002,"data":{"shadowedTokenCount":19962}}`,
      `{"type":"compaction/summary","seq":9,"time":1786669450003,"data":{"usage":{"inputTokens":0,"outputTokens":0}}}`,
    ]).length,
    0,
  );

  const seeded = parse([
    `{"type":"session","id":"child","createdAt":1,"seedLength":10}`,
    `{"type":"compaction/summary","seq":4,"time":1786669450002,"data":{"message":{"source":{"provider":"p","model":"m"}},"usage":{"inputTokens":10,"outputTokens":20}}}`,
    `{"type":"compaction/summary","seq":11,"time":1786669450003,"data":{"message":{"source":{"provider":"p","model":"m"}},"usage":{"inputTokens":30,"outputTokens":40}}}`,
  ]);
  assert.equal(seeded.length, 1);
  assert.equal(seeded[0].input, 30);

  const withId = parse([
    `{"type":"session","id":"x","createdAt":1}`,
    `{"type":"compaction/summary","seq":4,"time":1786669450002,"data":{"compactionId":"compact-a","message":{"source":{"provider":"p","model":"m"}},"usage":{"inputTokens":10,"outputTokens":20,"cacheReadTokens":30}}}`,
  ]);
  assert.equal(withId[0].key, "dsh:summary:cmp:compact-a:1786669450002:p:m:10:20:30:0:0");
  const legacy = parse([
    `{"type":"session","id":"legacy-summary","createdAt":1}`,
    `{"type":"compaction/summary","seq":9,"time":1786669450002,"data":{"message":{"source":{"provider":"p","model":"m"}},"usage":{"inputTokens":10,"outputTokens":20}}}`,
  ]);
  assert.equal(legacy[0].key, "dsh:summary:seq:9:1786669450002:p:m:10:20:0:0:0");
});

test("dsh: reasoning is a subset of output", () => {
  const m = parse([
    `{"type":"session","id":"s","createdAt":1}`,
    `{"type":"assistant/message","time":1786669454772,"data":{"turn":1,"message":{"source":{"provider":"deepseek","model":"deepseek-reasoner"}},"usage":{"inputTokens":10,"outputTokens":60,"cacheReadTokens":30,"cacheWriteTokens":40,"reasoningTokens":50}}}`,
    `{"type":"assistant/message","time":1786669454773,"data":{"turn":2,"message":{"source":{"provider":"p","model":"m"}},"usage":{"inputTokens":0,"outputTokens":31,"reasoningTokens":31}}}`,
  ]);
  assert.deepEqual([m[0].input, m[0].output, m[0].cacheRead, m[0].cacheWrite, m[0].reasoning], [10, 10, 30, 40, 50]);
  assert.deepEqual([m[1].output, m[1].reasoning], [0, 31]);
});

test("dsh: header fallback routing, folder session id, zero/missing-time skipped, in-file dedupe", () => {
  const m = parse(
    [
      `{"type":"request/header","seq":11,"time":1786669450062,"data":{"header":{"config":{"provider":"irix","model":"deepseek-v4-flash"}}}}`,
      `{"type":"assistant/message","time":1786669454772,"data":{"turn":1,"message":{"role":"assistant","content":[]},"usage":{"inputTokens":5,"outputTokens":7}}}`,
      `{"type":"assistant/message","time":1786669454773,"data":{"message":{"source":{"provider":"p","model":"m"}},"usage":{"inputTokens":0,"outputTokens":0}}}`,
      `{"type":"assistant/message","data":{"message":{"source":{"provider":"p","model":"m"}},"usage":{"inputTokens":1,"outputTokens":1}}}`,
    ],
    "the-folder",
  );
  assert.equal(m.length, 1);
  assert.equal(m[0].sessionId, "the-folder");
  assert.equal(m[0].model, "deepseek-v4-flash");
  assert.equal(m[0].provider, "irix");

  const line = `{"type":"assistant/message","time":1786669454772,"data":{"turn":1,"message":{"source":{"provider":"p","model":"m"}},"usage":{"inputTokens":10,"outputTokens":20}}}`;
  assert.equal(parse([`{"type":"session","id":"s","createdAt":1}`, line, line]).length, 1);

  const placeholder = parse([
    `{"type":"session","id":"s","createdAt":1}`,
    `{"type":"assistant/message","time":1786669454772,"data":{"turn":1,"message":{"id":"{{sessionId}}","source":{"provider":"p","model":"m"}},"usage":{"inputTokens":20,"outputTokens":8}}}`,
    `{"type":"assistant/message","time":1786669455000,"data":{"turn":1,"message":{"id":"{{sessionId}}","source":{"provider":"p","model":"m"}},"usage":{"inputTokens":28,"outputTokens":2}}}`,
  ]);
  assert.equal(placeholder.length, 2);
});

test("dsh adapter: forks collapse across files, plain + zstd + torn frame, since filter", async () => {
  await withRoot(async (root) => {
    const parentRow = `{"type":"assistant/message","seq":39,"time":1785730448979,"data":{"turn":1,"message":{"id":"7ac2e3d7","source":{"provider":"deepseek","model":"deepseek-reasoner"}},"usage":{"inputTokens":2885,"outputTokens":25,"reasoningTokens":23}}}`;
    const mk = (rel: string, _unused = "") => {
      const dir = join(root, "enc-cwd", rel, _unused);
      mkdirSync(dir, { recursive: true });
      return dir;
    };
    // Parent and a seedLength-less fork: the copied row collapses.
    writeFileSync(join(mk("parent", ""), "session.jsonl"), [`{"type":"session","id":"parent"}`, parentRow].join("\n"));
    writeFileSync(
      join(mk("child", ""), "session.v2.jsonl"),
      [`{"type":"session","id":"child","parentSession":"parent"}`, parentRow].join("\n"),
    );

    let expected = 1;
    if (hasZstd) {
      const header = zstd(`{"type":"session","id":"session-torn"}\n`);
      const committed = zstd(
        `{"type":"assistant/message","time":1786669454772,"data":{"turn":1,"message":{"id":"m-committed","source":{"provider":"p","model":"m"}},"usage":{"inputTokens":10,"outputTokens":20}}}\n`,
      );
      const torn = zstd(
        `{"type":"assistant/message","time":1786669455000,"data":{"turn":2,"message":{"id":"m-torn","source":{"provider":"p","model":"m"}},"usage":{"inputTokens":11,"outputTokens":21}}}\n`,
      );
      writeFileSync(
        join(mk("torn", ""), "session.jsonl.zstd"),
        Buffer.concat([header, committed, torn.subarray(0, Math.floor(torn.length / 2))]),
      );
      expected = 2;
    }
    writeFileSync(join(mk("junk", ""), "session.jsonl"), "this is not zstd");

    const res = await new DshAdapter().scan();
    assert.equal(res.events.length, expected);
    const fork = res.events.find((e) => e.model === "deepseek-reasoner")!;
    assert.equal(fork.inputTokens, 2885);
    assert.equal(fork.outputTokens, 25, "reasoning is inside output, not added again");
    assert.equal(fork.timestamp, new Date(1785730448979).toISOString());
    assert.match(fork.requestId, /^[0-9a-f]{32}$/);
    if (hasZstd) {
      const t = res.events.find((e) => e.model === "m")!;
      assert.deepEqual([t.inputTokens, t.outputTokens], [10, 20]);
    }

    const later = await new DshAdapter().scan({ since: new Date(Date.now() + 3_600_000) });
    assert.equal(later.events.length, 0);
  });
});

test("dsh adapter: not installed", async () => {
  const prev = process.env.BURNLOG_DSH_DIR;
  process.env.BURNLOG_DSH_DIR = join(tmpdir(), "bl-dsh-missing-" + process.pid);
  try {
    const a = new DshAdapter();
    assert.equal(a.detect(), false);
    assert.equal((await a.scan()).note, "not installed");
  } finally {
    if (prev === undefined) delete process.env.BURNLOG_DSH_DIR;
    else process.env.BURNLOG_DSH_DIR = prev;
  }
});
