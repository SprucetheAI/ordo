// clock.mjs — the wall-clock LATENCY harness (the path to EARN the "faster" claim, which is a fallacy today).
//
// measure.mjs reads token + $ from the logs; this times WALL-CLOCK. The honesty mandate: "faster" is forbidden
// until a paired per-task latency A/B is recorded here. Fewer output tokens is NOT lower latency (TTFT, thinking
// time, and tool round-trips dominate; a denser prompt can cost MORE thinking time) — so the token proxy may
// never wear a "faster" hat. PASS = ORDO-on median per-task latency lower than OFF AT equal-or-better quality
// (quality is judged separately by the blind judge; this file only times). Until tools/clock-ab.json exists,
// P3 stays cost-only.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Time a synchronous task `n` times. Returns {medianMs, minMs, maxMs, runs}. The task is whatever you pass —
 *  a function, or (via timeCommand) a shell command that runs one full task end-to-end. */
export function timeRuns(task, n = 5) {
  const runs = [];
  for (let i = 0; i < n; i++) { const t0 = performance.now(); task(); runs.push(performance.now() - t0); }
  return { medianMs: median(runs), minMs: Math.min(...runs), maxMs: Math.max(...runs), runs };
}

/** Time a shell command (one full task execution) n times — use this to time a real ORDO-on vs OFF agent run. */
export function timeCommand(cmd, n = 5) {
  return timeRuns(() => execSync(cmd, { stdio: "ignore" }), n);
}

/** Paired A/B: time the OFF command and the ON command, write the pair to clock-ab.json. PASS = ON median lower
 *  than OFF. Quality is NOT timed here — pair this with the blind judge; ON must be faster AND not worse. */
export function clockAB(offCmd, onCmd, n = 5, out = "tools/clock-ab.json") {
  const off = timeCommand(offCmd, n), on = timeCommand(onCmd, n);
  const result = { off, on, fasterPct: Math.round(100 * (off.medianMs - on.medianMs) / Math.max(off.medianMs, 1)),
    note: "latency only — pair with the blind quality judge; ON must be lower AND not worse to earn 'faster'." };
  writeFileSync(out, JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("clock.mjs")) {
  const [off, on, n] = process.argv.slice(2);
  if (!off || !on) {
    console.log("usage: node tools/clock.mjs '<off-cmd>' '<on-cmd>' [n=5]\n" +
      "  times a paired ORDO-off vs ORDO-on task run, writes tools/clock-ab.json.\n" +
      "  Until a real paired run is recorded, P3 stays COST-ONLY — no 'faster' claim (it is a fallacy on a token proxy).");
  } else {
    console.log(JSON.stringify(clockAB(off, on, Number(n) || 5), null, 2));
  }
}
