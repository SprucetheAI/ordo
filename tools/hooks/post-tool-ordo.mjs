#!/usr/bin/env node
// ORDO PostToolUse hook — meters the inbound-compaction savings on every tool result.
//
// Claude Code pipes a JSON event on stdin ({ tool_name, tool_input, tool_response, ... }).
// We pull the textual tool output, run it through the savings tracker, and exit 0 — NEVER blocking
// the tool, never erroring out (a hook that breaks the session is worse than no metering).
//
// Enable (opt-in — it runs node per tool call + logs tool output to ~/.ordo/savings.jsonl locally):
//   add a PostToolUse hook to ~/.claude/settings.json (see tools/hooks/settings.snippet.json),
//   then `ordo savings` shows the running total.
import { readFileSync } from "node:fs";
import { track } from "../savings.mjs";

try {
  let raw = "";
  try { raw = readFileSync(0, "utf8"); } catch { /* no stdin */ }
  let text = raw;
  try {
    const ev = JSON.parse(raw);
    const tr = ev.tool_response ?? ev.toolResponse ?? ev;
    text = typeof tr === "string" ? tr : JSON.stringify(tr);
  } catch { /* not JSON — meter the raw text */ }
  if (text && text.length > 40) track(text);
} catch { /* swallow — must never disrupt the session */ }
process.exit(0);
