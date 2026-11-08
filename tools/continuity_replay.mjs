// Replay ORDO's post-compaction restore against your REAL past compactions.
//   node tools/continuity_replay.mjs [~/.ordo/scan/compactions.jsonl]
// For each compaction: what share of the user's own words the summary alone kept, versus summary + ORDO restore,
// and what the restore costs. Uses the hook's own restore() and recall(), so this measures the shipped code.
import { readFileSync, mkdtempSync, mkdirSync, appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { restore, recall, paths, constraints } from "../hooks/ordo-continuity.mjs";

const src = process.argv[2] || join(homedir(), ".ordo", "scan", "compactions.jsonl");
const rows = readFileSync(src, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const home = mkdtempSync(join(tmpdir(), "ordo-replay-"));
process.env.ORDO_HOME = home;
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const out = { before: [], after: [], vb: [], va: [], cb: [], ca: [], full: [], cost: [] };
for (const [i, c] of rows.entries()) {
  const p = paths(`replay-${i}`);
  mkdirSync(p.dir, { recursive: true });
  c.prompts.forEach((text, n) => appendFileSync(p.intent, JSON.stringify({ n: n + 1, text: text.slice(0, 20000) }) + "\n"));
  const r = restore(p, null);   // no anchor on the replay: the conservative case, intent log only
  const b = recall(c.prompts, c.summary), a = recall(c.prompts, c.summary + "\n" + r);
  if (b.recall == null) continue;
  out.before.push(b.recall); out.after.push(a.recall); out.vb.push(b.verbatim); out.va.push(a.verbatim);
  const rules = c.prompts.flatMap(constraints);
  if (rules.length) { out.cb.push(recall(rules, c.summary).recall ?? 0); out.ca.push(recall(rules, c.summary + "\n" + r).recall ?? 0); }
  out.full.push(c.prompts.filter((t) => r.includes(t.trim().slice(0, 300))).length / c.prompts.length);
  out.cost.push(Math.round(r.length / 4));
}
rmSync(home, { recursive: true, force: true });
const f = (x) => x.toFixed(3);
console.log("metric\tsummary_only\tsummary+ordo");
console.log(`keyword_recall_median\t${f(med(out.before))}\t${f(med(out.after))}`);
console.log(`keyword_recall_mean\t${f(mean(out.before))}\t${f(mean(out.after))}`);
console.log(`verbatim_recall_median\t${f(med(out.vb))}\t${f(med(out.va))}`);
console.log(`verbatim_recall_mean\t${f(mean(out.vb))}\t${f(mean(out.va))}`);
console.log(`constraint_recall_median\t${f(med(out.cb))}\t${f(med(out.ca))}`);
console.log(`constraint_recall_mean\t${f(mean(out.cb))}\t${f(mean(out.ca))}`);
console.log(`compactions\t${out.before.length}\t${out.after.length}`);
console.log(`prompts_restored_first300_mean\t-\t${f(mean(out.full))}`);
console.log(`restore_tokens_median(chars/4)\t-\t${med(out.cost)}`);
