# @sxna/burnlog-sdk

> Track AI token burn from your own agent, in ~3 lines. Part of [burnlog](https://github.com/sharziki/burnlog).

```
npm install @sxna/burnlog-sdk
```

```ts
import { Burnlog } from "@sxna/burnlog-sdk";
import Anthropic from "@anthropic-ai/sdk";

const burnlog = Burnlog.fromEnv({ source: "my-agent" });

const anthropic = new Anthropic();
const res = await anthropic.messages.create({ /* ... */ });

burnlog.trackResponse(res);   // that's it. batches + flushes in the background.
```

## Full API

```ts
const burnlog = new Burnlog({
  apiKey: string;                 // required
  source?: string;                 // default "custom"
  baseUrl?: string;                // default "https://burnlog.net"
  maxBatchSize?: number;           // default 100
  flushIntervalMs?: number;        // default 5000 (0 = disabled)
  debug?: boolean;                 // default false — logs errors to stderr
});

// Or bootstrap directly from env
const burnlog = Burnlog.fromEnv();

// Primary method
burnlog.track({
  requestId: "msg_01ABCxyz",
  model: "claude-opus-4-7",
  inputTokens: 1234,
  outputTokens: 567,
  cacheCreationTokens: 0,
  cacheReadTokens: 8000,
  timestamp: new Date(),         // optional — defaults to now
  source: "override-for-this-event", // optional
});

// Convenience for Anthropic, OpenAI, and common SDK response shapes
burnlog.trackResponse(response);

// Provider-specific helpers still work when you want them
burnlog.trackAnthropic(response);
burnlog.trackOpenAI(response);

// Flush manually
await burnlog.flush();

// Graceful shutdown — flushes, stops the timer
await burnlog.close();
```

`track()` **never throws**. Network errors are queued for retry on next flush.
Enable `debug: true` to see them on stderr.

## Self-hosting

Point at your instance:

```ts
new Burnlog({ apiKey, baseUrl: "https://burn.mycompany.com" });
```

## License

MIT © [Sharvil Saxena](https://github.com/sharziki) / SXNA Labs
