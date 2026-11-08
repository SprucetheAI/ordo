"""Scan your own Claude Code transcripts for the continuity numbers ORDO quotes. Reads only, writes to --out.

  python -I tools/continuity_scan.py [--projects ~/.claude/projects] [--since 2026-10-01] [--out ~/.ordo/scan]
                                     [--window 400000]

Writes (all to --out, never into the repo: compactions.jsonl holds your own prompt text):
  daily.tsv        per day x effort x model: requests, zero-thinking %, thinking tokens (billed, from usage), context size
  versions.tsv     per day: Claude Code versions and thinkingDisplay modes seen
  compactions.tsv  per compaction: trigger, preTokens, prompts before it, keyword/verbatim recall of those prompts in the summary
  compactions.jsonl  the same plus the prompts and summary text, for tools/continuity_replay.mjs
  window.tsv       modeled context tokens if auto-compaction fired at --window instead (see model() for the assumptions)

Main-thread transcripts only (subagents/ excluded). Assistant entries are deduped by requestId, because one API
response is written as several entries that share a usage block.
"""
import argparse, collections, glob, json, os, re, statistics as st, time

ap = argparse.ArgumentParser()
ap.add_argument("--projects", default=os.path.expanduser("~/.claude/projects"))
ap.add_argument("--since", default="2026-10-01")
ap.add_argument("--out", default=os.path.expanduser("~/.ordo/scan"))
ap.add_argument("--window", type=int, default=400000)
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)

MACHINE = ("<task-notification", "<scheduled-task", "<cross-session", "<agent-message", "Another Claude session sent",
           "Stop hook feedback", "Base directory for this skill", "This session is being continued", "<system-reminder",
           "[SYSTEM NOTIFICATION", "<command-", "<local-command", "Caveat:", "<side-sessions-event", "<ci-monitor-event")
# Same keyword rule as recall() in hooks/ordo-continuity.mjs.
STOP = set("about above after again against because before being below between could doing during further having into itself more most other should their theirs them themselves then there these they this those through under until very were what when where which while would your yours also just like make want need sure think thing things dont cant that with from have will".split())
kw = lambda s: {w for w in re.findall(r"[a-z][a-z0-9_\-./]{5,}", s.lower()) if w not in STOP}

def recall(prompts, summary):
    s = summary.lower(); hits = [len([w for w in k if w in s]) / len(k) for k in map(kw, prompts) if k]
    verb = sum(1 for p in prompts if p.strip()[:80].lower() in s) / len(prompts) if prompts else 0
    return (st.mean(hits) if hits else None), verb

since = time.mktime(time.strptime(a.since, "%Y-%m-%d"))
files = [f for f in glob.glob(os.path.join(a.projects, "*", "*.jsonl")) if os.path.getmtime(f) >= since]
day = collections.defaultdict(lambda: collections.defaultdict(list))
ver, disp = collections.defaultdict(collections.Counter), collections.defaultdict(collections.Counter)
comps, seqs = [], []
for f in files:
    seen, prompts, seq, cur = set(), [], [], None
    try:
        for line in open(f, encoding="utf8"):
            if '"assistant"' not in line and '"user"' not in line and "compact_boundary" not in line: continue
            try: o = json.loads(line)
            except ValueError: continue
            t = o.get("type")
            if t == "system" and o.get("subtype") == "compact_boundary":
                md = o.get("compactMetadata") or {}
                cur = {"session": os.path.basename(f)[:8], "ts": o.get("timestamp"), "trigger": md.get("trigger"),
                       "preTokens": md.get("preTokens"), "prompts": list(prompts), "summary": None}
                comps.append(cur); seq.append(None); continue
            if o.get("isSidechain"): continue
            m = o.get("message") or {}
            if t == "assistant":
                rid = o.get("requestId"); u = m.get("usage") or {}
                if not rid or rid in seen or not u or str(m.get("model", "")).startswith("<"): continue
                seen.add(rid)
                ctx = (u.get("input_tokens") or 0) + (u.get("cache_read_input_tokens") or 0) + (u.get("cache_creation_input_tokens") or 0)
                ts = (o.get("timestamp") or "")[:10]
                d = day[(ts, o.get("perTurnEffort") or o.get("effort") or "?", m.get("model", "?"))]
                th = (u.get("output_tokens_details") or {}).get("thinking_tokens")
                if th is not None: d["think"].append(th)
                d["out"].append(u.get("output_tokens") or 0); d["ctx"].append(ctx); seq.append(ctx)
                ver[ts][o.get("version")] += 1; disp[ts][o.get("thinkingDisplay")] += 1
            else:
                c = m.get("content")
                txt = " ".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text") if isinstance(c, list) else (c or "")
                if o.get("isCompactSummary") or txt.startswith("This session is being continued"):
                    if cur is not None and cur["summary"] is None: cur["summary"] = txt
                    continue
                if txt and not o.get("isMeta") and len(txt) > 15 and not txt.lstrip().startswith(MACHINE): prompts.append(txt)
    except OSError: continue
    seqs.append(seq)

pct = lambda xs, q: sorted(xs)[min(len(xs) - 1, int(q * len(xs)))] if xs else ""
with open(os.path.join(a.out, "daily.tsv"), "w", encoding="utf8") as w:
    w.write("date\teffort\tmodel\trequests\tzero_think_pct\tmed_think\tmean_think\tp90_think\tmed_ctx\tp90_ctx\n")
    for (ts, eff, mod), d in sorted(day.items()):
        th, n = d["think"], len(d["out"])
        if n < 5: continue
        z = round(100 * sum(1 for x in th if x == 0) / len(th), 1) if th else ""
        w.write(f"{ts}\t{eff}\t{mod}\t{n}\t{z}\t{pct(th, .5)}\t{round(st.mean(th)) if th else ''}\t{pct(th, .9)}\t{pct(d['ctx'], .5)}\t{pct(d['ctx'], .9)}\n")
with open(os.path.join(a.out, "versions.tsv"), "w", encoding="utf8") as w:
    w.write("date\tversions\tthinkingDisplay\n")
    for ts in sorted(ver): w.write(f"{ts}\t{dict(ver[ts].most_common(3))}\t{dict(disp[ts])}\n")
with open(os.path.join(a.out, "compactions.tsv"), "w", encoding="utf8") as w, open(os.path.join(a.out, "compactions.jsonl"), "w", encoding="utf8") as j:
    w.write("session\tts\ttrigger\tpreTokens\tprompts_before\tkeyword_recall\tverbatim_recall\tsummary_chars\n")
    for c in comps:
        if not c["summary"] or not c["prompts"]: continue
        r, v = recall(c["prompts"], c["summary"])
        w.write(f"{c['session']}\t{c['ts']}\t{c['trigger']}\t{c['preTokens']}\t{len(c['prompts'])}\t{'' if r is None else round(r, 3)}\t{round(v, 3)}\t{len(c['summary'])}\n")
        j.write(json.dumps(c) + "\n")

def model(seq, W, restore_tokens=8000):
    """Modeled context per request if auto-compaction fired at W. Assumptions, stated: the session grows by the
    same per-request increments it really did; a modeled compaction drops the window to the session's first
    request size + restore_tokens (summary ~4.4k + ORDO restore ~2.4k + slack) and costs one pass over W."""
    real = sim = comp = 0; base = prev = s = None
    for ctx in seq:
        if ctx is None: prev = None; continue          # a real compaction: both timelines reset
        if base is None: base = ctx
        if prev is None: s = ctx if s is None or ctx < s else min(s, ctx)
        else:
            s += ctx - prev
            if s > W: comp += 1; sim += W; s = base + restore_tokens + max(0, ctx - prev)
        real += ctx; sim += s; prev = ctx
    return real, sim, comp
R = S = C = 0
for seq in seqs:
    r, s, c = model(seq, a.window); R += r; S += s; C += c
with open(os.path.join(a.out, "window.tsv"), "w", encoding="utf8") as w:
    w.write("window\treal_ctx_tokens\tmodeled_ctx_tokens\tmodeled_extra_compactions\treduction_pct\n")
    w.write(f"{a.window}\t{R}\t{S}\t{C}\t{round(100 * (1 - S / R), 1) if R else ''}\n")
print(f"sessions {len(files)}  compactions {len(comps)}  out {a.out}")
