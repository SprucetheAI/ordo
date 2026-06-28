// ORDO savings — a running ledger of the tokens ORDO's lossless inbound compaction saves.
//
// "before" = your raw text; "after" = compressInbound(text) (JSON->TSV / whitespace dedup, with
// measured-revert so it never inflates). Each tracked event appends to ~/.ordo/savings.jsonl, and
// `report()` rolls up the cumulative total, % and an estimated $ saved.
//
// HONESTY (ORDO's whole point): token counts are the chars/4 proxy (same one ORDO uses everywhere) —
// DIRECTIONAL, re-validate against billed truth with `ordo measure`. This meters ONE lever: inbound
// tool-output compaction. It does NOT capture the output-discipline savings (terser answers), which
// only the on-vs-off A/B in `ordo measure` can show. Pricing saved tokens at the input rate slightly
// over-states when prompt-caching is in play. Estimate, clearly marked — never a fabricated number.
import { readFileSync, appendFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { compressInbound } from "../src/index.js";
import { PRICES } from "./measure.mjs";

const estTokens = (s) => Math.ceil((s || "").length / 4); // chars/4 proxy — matches src/index.js
const home = () => process.env.ORDO_HOME || join(homedir(), ".ordo");
export const ledgerPath = () => join(home(), "savings.jsonl");

const pct = (before, saved) => (before ? Math.round((1000 * saved) / before) / 10 : 0);

/** Compress one piece of text and return the before/after/saved token delta. Pure. */
export function compress(text) {
  const before = estTokens(text);
  const after = estTokens(compressInbound(text || ""));
  const saved = before - after;
  return { before, after, saved, pct: pct(before, saved) };
}

/** Compress + append the event to the ledger. Returns the delta. */
export function track(text, ts = new Date().toISOString()) {
  const r = compress(text);
  mkdirSync(home(), { recursive: true });
  appendFileSync(ledgerPath(), JSON.stringify({ ts, ...r }) + "\n");
  return r;
}

/** Roll up the whole ledger into a cumulative savings report. */
export function report(model = "claude-opus-4") {
  let before = 0, after = 0, events = 0, first = null, last = null;
  const p = ledgerPath();
  if (existsSync(p)) {
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const s = line.trim();
      if (!s) continue;
      let o;
      try { o = JSON.parse(s); } catch { continue; }
      before += o.before || 0; after += o.after || 0; events++;
      if (o.ts) { first = first ?? o.ts; last = o.ts; }
    }
  }
  const saved = before - after;
  const inputRate = (PRICES[model] || PRICES["claude-opus-4"])[0]; // $/1M input tokens
  return {
    events, beforeTokens: before, afterTokens: after, savedTokens: saved,
    pct: pct(before, saved), estUsdSaved: (saved / 1e6) * inputRate, model, first, last,
  };
}

export function reset() {
  mkdirSync(home(), { recursive: true });
  writeFileSync(ledgerPath(), "");
}

export function renderReport(r, json = false) {
  if (json) return JSON.stringify(r, null, 2);
  return [
    "ORDO savings — inbound compaction (chars/4 proxy · DIRECTIONAL)",
    `events\t${r.events}`,
    `before\t${r.beforeTokens} tok`,
    `after\t${r.afterTokens} tok`,
    `saved\t${r.savedTokens} tok  (${r.pct}%)`,
    `est $\t$${r.estUsdSaved.toFixed(2)} saved @ ${r.model} input rate`,
    "# billed ground truth: ordo measure   |   captures inbound only, not output terseness",
  ].join("\n");
}
