"""formatbench — measure token cost of output FORMATS across data shapes (is JSON best? is TOON real?).

Answers empirically: for each common data shape, which serialization costs the fewest tokens while
staying machine-parseable. cl100k + o200k (GPT proxies). Formats:
  json_pretty, json_min, jsonl, toon, yaml, tsv, md_table, xml, kv
TOON (Token-Oriented Object Notation) declares keys once then emits CSV-like rows — measured here with
a real (measurement-grade) encoder, not a cited claim.
"""
from __future__ import annotations

import json
import tiktoken
import yaml

CL = tiktoken.get_encoding("cl100k_base")
O2 = tiktoken.get_encoding("o200k_base")


def cost(s):
    return len(CL.encode(s)), len(O2.encode(s))


# ---- data shapes (realistic) ----
UNIFORM = {"users": [
    {"id": i, "name": n, "role": r, "active": a, "score": s}
    for i, (n, r, a, s) in enumerate([
        ("Alice", "admin", True, 92), ("Bob", "user", True, 71), ("Carol", "user", False, 64),
        ("Dan", "editor", True, 88), ("Eve", "user", True, 55), ("Frank", "admin", False, 79),
        ("Grace", "user", True, 81), ("Heidi", "editor", True, 67), ("Ivan", "user", False, 49),
        ("Judy", "user", True, 73), ("Mallory", "admin", True, 90), ("Niaj", "user", True, 60),
    ], 1)]}

NESTED = {"service": {"name": "api", "version": "2.3.1", "limits": {"rps": 100, "burst": 200},
    "auth": {"type": "oauth2", "scopes": ["read", "write"], "ttl_seconds": 3600},
    "db": {"engine": "postgres", "pool": {"min": 2, "max": 10}, "replicas": ["r1", "r2"]},
    "features": {"beta": False, "logging": {"level": "info", "sinks": ["stdout", "file"]}}}}

NUMERIC = {"rows": [{"t": t, "cpu": c, "mem": m, "rps": q, "p99": p} for t, c, m, q, p in [
    (0, 12, 340, 50, 21), (1, 18, 355, 62, 24), (2, 25, 360, 71, 28), (3, 31, 372, 80, 33),
    (4, 22, 358, 64, 25), (5, 19, 350, 58, 23), (6, 27, 365, 75, 30), (7, 35, 380, 88, 36)]]}

STRINGS = {"tags": ["python", "tokenizer", "llm", "compression", "grammar", "json", "toon", "yaml",
    "benchmark", "spec", "glyph", "lexicon", "ordo", "verify", "encode"]}

SHAPES = {"uniform_array": UNIFORM, "nested_config": NESTED, "numeric_table": NUMERIC, "string_list": STRINGS}


# ---- format encoders ----
def f_json_pretty(o): return json.dumps(o, indent=2)
def f_json_min(o): return json.dumps(o, separators=(",", ":"))
def f_yaml(o): return yaml.safe_dump(o, default_flow_style=False, sort_keys=False).rstrip()


def f_jsonl(o):
    # only meaningful if the top value is a list
    k = next(iter(o)); v = o[k]
    if isinstance(v, list):
        return "\n".join(json.dumps(x, separators=(",", ":")) for x in v)
    return f_json_min(o)


def _scalar(v):
    if isinstance(v, bool): return "true" if v else "false"
    if v is None: return ""
    return str(v)


def _toon(o, indent=0):
    pad = "  " * indent
    out = []
    if isinstance(o, dict):
        for k, v in o.items():
            if isinstance(v, list) and v and all(isinstance(x, dict) for x in v) and \
               all(x.keys() == v[0].keys() for x in v):
                fields = list(v[0].keys())
                out.append(f"{pad}{k}[{len(v)}]{{{','.join(fields)}}}:")
                for row in v:
                    out.append(f"{pad}  " + ",".join(_scalar(row[f]) for f in fields))
            elif isinstance(v, list) and all(not isinstance(x, (dict, list)) for x in v):
                out.append(f"{pad}{k}[{len(v)}]: " + ",".join(_scalar(x) for x in v))
            elif isinstance(v, dict):
                out.append(f"{pad}{k}:")
                out.append(_toon(v, indent + 1))
            elif isinstance(v, list):
                out.append(f"{pad}{k}:")
                for x in v:
                    out.append(_toon(x, indent + 1))
            else:
                out.append(f"{pad}{k}: {_scalar(v)}")
    else:
        out.append(f"{pad}{_scalar(o)}")
    return "\n".join(out)


def f_toon(o): return _toon(o)


def _tabular(o):
    k = next(iter(o)); v = o[k]
    if isinstance(v, list) and v and all(isinstance(x, dict) for x in v):
        return list(v[0].keys()), v
    return None, None


def f_tsv(o):
    fields, rows = _tabular(o)
    if not fields: return None
    out = ["\t".join(fields)]
    for r in rows: out.append("\t".join(_scalar(r[f]) for f in fields))
    return "\n".join(out)


def f_md_table(o):
    fields, rows = _tabular(o)
    if not fields: return None
    out = ["| " + " | ".join(fields) + " |", "|" + "|".join("---" for _ in fields) + "|"]
    for r in rows: out.append("| " + " | ".join(_scalar(r[f]) for f in fields) + " |")
    return "\n".join(out)


def f_kv(o):
    # flat key=value; only clean for flat dicts, else fall back
    k = next(iter(o)); v = o[k]
    if isinstance(v, dict) and all(not isinstance(x, (dict, list)) for x in v.values()):
        return "\n".join(f"{kk}={_scalar(vv)}" for kk, vv in v.items())
    return None


FORMATS = {"json_pretty": f_json_pretty, "json_min": f_json_min, "jsonl": f_jsonl,
           "toon": f_toon, "yaml": f_yaml, "tsv": f_tsv, "md_table": f_md_table, "kv": f_kv}


def main():
    for shape, data in SHAPES.items():
        print(f"\n=== {shape} ===")
        base = None
        results = []
        for fname, fn in FORMATS.items():
            try:
                s = fn(data)
            except Exception:
                s = None
            if not s:
                continue
            c, o = cost(s)
            results.append((fname, c, o, s))
        base = next((o for n, c, o, s in results if n == "json_min"), None)
        results.sort(key=lambda r: r[2])
        for fname, c, o, s in results:
            rel = f"{100*(base-o)/base:+.0f}% vs json_min" if base else ""
            print(f"  {fname:12} cl100k={c:4} o200k={o:4}  {rel}")
        win = results[0]
        print(f"  -> WINNER: {win[0]} (o200k={win[2]})")


if __name__ == "__main__":
    main()
