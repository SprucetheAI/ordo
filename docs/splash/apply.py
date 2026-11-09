"""The ORDO splash, kept as source: body.md, one file per tab, splash.json for the title, lead and stats.

No KLADDS tool reads a splash body back, so this folder is the copy of record. Edit here, then:

    python docs/splash/apply.py            dry: parses every part, checks its pictures exist, changes nothing
    python docs/splash/apply.py --apply    replaces the live body (tabs and cover stay as they are)
    python docs/splash/apply.py --apply --tabs    also sends the tabs

It calls the same handler as the pages_draft tool, in process, because that path accepts local pictures and
the tool takes https only. Needs a KLADDS backend checkout: BRAIN_OS=<path> (default: brain-os beside this
repo), and that checkout's venv python. Reload any editor tab open on the splash before editing it there.
"""
import hashlib, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
BO = os.environ.get("BRAIN_OS") or os.path.abspath(os.path.join(HERE, "..", "..", "..", "brain-os"))
meta = json.load(open(os.path.join(HERE, "splash.json"), encoding="utf-8"))


def md(name):
    """A part's markdown, local pictures (written relative to this folder) made absolute for the handler."""
    s = open(os.path.join(HERE, name), encoding="utf-8").read().rstrip("\n")
    fix = lambda m: m.group(1) + os.path.abspath(os.path.join(HERE, m.group(2))).replace("\\", "/")
    return re.sub(r"(!\[[^\]]*\]\()(?!https?:)([^ )]+)", fix, s)


body = {k: meta[k] for k in ("doc_id", "title", "summary", "keyword", "stats")} | {"markdown": md("body.md")}
tabs = [{"title": t["title"], "slug": t["slug"], "state": "live", "stats": t.get("stats", []),
         "markdown": md(t["file"])} for t in meta.get("tabs", [])]

os.chdir(BO)
sys.path[:0] = [os.path.join(BO, "scripts"), os.path.join(BO, "scripts", "strands")]
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(BO, ".env"))
import brain_mcp_server as m  # noqa: E402
import doc_store  # noqa: E402

row = doc_store.get(meta["doc_id"])
owner = row["owner"]
m._REQUEST_SCOPE.set({"user_id": owner, "principal_user_id": owner})

if "--apply" not in sys.argv:
    # Parse only. Rendering copies every picture into the doc's media under a fresh id, so a dry run must not.
    for name, part in [("body", body)] + [(t["slug"], t) for t in tabs]:
        m._splash_prepare(part["markdown"], part.get("stats"))  # raises ValueError on a bad chart or diagram
        pics = re.findall(r"!\[[^\]]*\]\(([^ )]+)", part["markdown"])
        gone = [p for p in pics if not p.startswith("http") and not os.path.isfile(p)]
        sha = hashlib.sha256(part["markdown"].encode("utf-8")).hexdigest()[:12]
        print(f"DRY {name}: {len(part['markdown'])} chars, {len(pics)} pictures, missing {gone}, markdown sha {sha}")
    sys.exit(0)

if "--tabs" in sys.argv:
    body["tabs"] = tabs
out = m._tool_pages_draft(body)
print(json.dumps({k: v for k, v in out.items() if k != "page"}, default=str)[:1200])
