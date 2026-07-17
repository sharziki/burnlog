# @sxna/burnlog-sdk

> Track AI token burn from your own agent, in ~3 lines. Part of [burnlog](https://github.com/sharziki/burnlog).

```
npm install @sxna/burnlog-sdk
```

```ts
import { Burnlog } from "@sxna/burnlog-sdk";
import Anthropic from "@anthropic-ai/sdk";

const burnlog = new Burnlog({
  apiKey: process.env.BURNLOG_API_KEY!,
  source: "my-agent", // any lowercase id, 1-32 chars [a-z0-9-]
});

const anthropic = new Anthropic();
const res = await anthropic.messages.create({ /* ... */ });

burnlog.trackAnthropic(res);   // that's it. batches + flushes in the background.
```

## Full API

```ts
const burnlog = new Burnlog({
  apiKey: string;                 // required
  source?: string;                 // default "custom"
  baseUrl?: string;                // default "https://burnlog.sxna.dev"
  maxBatchSize?: number;           // default 100
  flushIntervalMs?: number;        // default 5000 (0 = disabled)
  debug?: boolean;                 // default false — logs errors to stderr
});

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

// Convenience for Anthropic SDK responses
burnlog.trackAnthropic(response);

// Convenience for OpenAI SDK responses (Chat and Responses APIs)
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
