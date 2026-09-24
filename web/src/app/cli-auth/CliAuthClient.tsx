"use client";

import { useState } from "react";

type Status = "idle" | "working" | "done" | "error";

export function CliAuthClient({
  port,
  state,
  username,
}: {
  port: number;
  state: string;
  username: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");

  async function approve() {
    setStatus("working");
    setMessage("");
    try {
      const res = await fetch("/api/me/key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "cli-login" }),
      });
      if (!res.ok) {
        throw new Error(`could not mint key (${res.status})`);
      }
      const data = (await res.json()) as { key?: string };
      if (!data.key) throw new Error("no key returned");

      // Hand the key back to the CLI's localhost listener. Top-level navigation
      // to 127.0.0.1 is allowed (not blocked as mixed content).
      const url = `http://127.0.0.1:${port}/callback?key=${encodeURIComponent(
        data.key,
      )}&state=${encodeURIComponent(state)}`;
      setStatus("done");
      window.location.href = url;
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "something went wrong");
    }
  }

  if (status === "done") {
    return (
      <p className="m-0 text-[15px] leading-relaxed text-soft">
        Connected as <span className="font-mono text-ink">@{username}</span>. You can close this tab
        and return to your terminal.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <p className="m-0 text-[15px] leading-relaxed text-soft">
        Connect the burnlog CLI / MCP on this machine as{" "}
        <span className="font-mono text-ink">@{username}</span>? This creates an API key stored only on
        your computer.
      </p>
      <button onClick={approve} disabled={status === "working"} className="btn btn-primary mt-8">
        {status === "working" ? "connecting…" : "Approve & connect"}
      </button>
      <a href="/" className="mt-4 text-[14px] text-dim underline decoration-faint underline-offset-4 hover:text-ink">
        Cancel
      </a>
      {status === "error" && (
        <p className="m-0 mt-5 text-[13px] text-[#F28B82]">{message}</p>
      )}
    </div>
  );
}
