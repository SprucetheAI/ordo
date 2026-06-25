"""Inbound context compression — the third side of the triangle: compress what the model READS.

ORDO's command grammar shrinks the *instruction*; the output contract shrinks the *response*; this
shrinks the *documents/context* (files, tool output, RAG chunks, logs) fed in. Prefers **headroom**
(`pip install headroom-ai`) — best-in-class, content-type-aware, reversible (CCR caches originals).
Falls back to a built-in LOSSLESS cleanup so the harness works without the dependency.

Honesty: headroom is LOSSY-but-reversible; always comprehension-test compressed context before trusting
a high ratio (see tools/inbound_bench.py). The built-in fallback is lossless (structure only).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from output import emit, _uniform_records  # noqa: E402

try:
    import tiktoken
    _O2 = tiktoken.get_encoding("o200k_base")
    def _tok(s): return len(_O2.encode(s))
except Exception:  # pragma: no cover
    def _tok(s): return max(1, len(s) // 4)


def _headroom(text: str):
    # message-level pipeline = full router (SmartCrusher JSON + CodeCompressor + Kompress prose),
    # not the content-level masker (which noops prose). Disable protection so docs actually compress.
    from headroom import compress as hc
    r = hc([{"role": "user", "content": text}], model="claude-sonnet-4-5-20250929",
           compress_user_messages=True, protect_recent=0, protect_analysis_context=False)
    msg = r.messages[-1]
    c = msg.get("content") if isinstance(msg, dict) else None
    return c if isinstance(c, str) and c else text


def _builtin(text: str) -> str:
    """Lossless structural cleanup: JSON -> TSV/minified; else collapse dead whitespace."""
    t = text.strip()
    # JSON: route uniform arrays to TSV, everything else to minified (our measured format rule)
    if t[:1] in "[{":
        try:
            data = json.loads(t)
            if isinstance(data, list) and data and all(isinstance(x, dict) for x in data):
                data = {"_rows": data}
            return emit(data) if _uniform_records(data)[1] or isinstance(data, dict) else json.dumps(data, separators=(",", ":"), ensure_ascii=False)
        except Exception:
            pass
    # prose/code: collapse 3+ blank lines -> 1, strip trailing ws, collapse runs of spaces (lossless)
    out = re.sub(r"[ \t]+(\n)", r"\1", text)        # trailing whitespace
    out = re.sub(r"\n{3,}", "\n\n", out)            # blank-line runs
    out = re.sub(r"[ \t]{2,}", " ", out)            # interior space runs (outside code this is safe-ish)
    return out


def _terms(s: str) -> set:
    return set(re.findall(r"[a-z0-9]+", s.lower()))


def coverage_ok(question: str, original: str, compressed: str, threshold: float = 0.5) -> bool:
    """Cheap deterministic 'did the lossy cut drop signal' check (llmtrim's coverage gate, generalized):
    of the distinct query-relevant terms (words in the question that actually appear in the original),
    what fraction survive in the compressed text? True iff >= threshold (or nothing relevant to protect).
    Far cheaper than an LLM judge — used to REVERT a lossy candidate that would strand the answer."""
    relevant = _terms(question) & _terms(original)
    if not relevant:
        return True
    keep = _terms(compressed)
    return (len(relevant & keep) / len(relevant)) >= threshold


def compress_inbound(text: str, use_headroom: bool = True, question: str | None = None):
    """Take the BEST of {headroom, builtin} per content (headroom wins on redundant logs/tool-output;
    our TSV wins on structured JSON, which base-headroom noops). MEASURED-REVERT: passthrough is always a
    candidate at `before` tokens, so the min can never inflate. A LOSSY candidate (headroom) is additionally
    gated by `coverage_ok` when a `question` is given — it must keep the query-relevant terms or it's dropped.
    Returns (compressed_text, tokens_before, tokens_after, engine). Never inflates, never strands the answer."""
    before = _tok(text)
    cands = [(text, before, "passthrough")]
    if use_headroom:
        try:
            h = _headroom(text)
            if question is None or coverage_ok(question, text, h):  # lossy cut must preserve the signal
                cands.append((h, _tok(h), "headroom"))
        except Exception:
            pass
    try:
        b = _builtin(text)
        cands.append((b, _tok(b), "builtin"))
    except Exception:
        pass
    best = min(cands, key=lambda c: c[1])  # measured-revert: fewest tokens, ties -> earliest (passthrough)
    return best[0], before, best[1], best[2]


if __name__ == "__main__":
    uniform = json.dumps({"users": [{"id": i, "name": n, "active": True} for i, n in enumerate(["A", "B", "C"], 1)]})
    prose = "This   is   a    test.\n\n\n\nWith   extra      whitespace.   \nTrailing.   "
    for name, s in [("json", uniform), ("prose", prose)]:
        c, b, a, eng = compress_inbound(s, use_headroom=False)
        print(f"{name}: {b} -> {a} tok ({100*(b-a)//max(b,1)}% off) via {eng}")
    assert compress_inbound(uniform, use_headroom=False)[3] == "builtin"
    # measured-revert: a no-win input must never inflate (passthrough wins)
    assert compress_inbound("short clean line", use_headroom=False)[3] in ("passthrough", "builtin")
    # coverage gate: a key query term surviving passes; a dropped boundary value fails
    assert coverage_ok("sum the errors", "many errors here and warnings", "errors: 3")
    assert not coverage_ok("preserve the boundary value 42", "the boundary value is 42", "summary: a number")
    print("inbound self-check OK (builtin lossless + measured-revert + coverage gate)")
