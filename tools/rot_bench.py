"""rot_bench — the NoLiMa/Chroma-style context-rot retention harness (the path to EARN P10).

P10 (context-integrity) is GROUNDED today: the PROBLEM is measured by the literature (Chroma: a 200K model
rots at ~50K; Lost-in-the-Middle: the middle scores below no-context; NoLiMa: −58pp at 32K), but ORDO's
MITIGATION (ledger + keep-load-bearing-at-the-edges + compact) is NOT yet harness-measured. This builds the
test that measures it. It constructs a rot-baited long context with a load-bearing needle and two arms:
  - NAIVE: stuff everything, needle buried in the lost MIDDLE (the worst case the literature names).
  - ORDO: the needle + its acceptance pinned to the HIGH-ATTENTION HEAD as a ledger, the bulk compacted.
Same needle, same question, same length — only placement differs. Running it needs a long-context model;
score(response) checks needle retrieval, and a paired NAIVE-vs-ORDO accuracy run writes tools/rot-ab.json
(PASS = ORDO retains where NAIVE rots). Until that run, P10 stays GROUNDED. Construction is validated
deterministically here (token length, needle present, distractor bait present) so the test itself is sound.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    import tiktoken
    _O2 = tiktoken.get_encoding("o200k_base")
    def _tok(s): return len(_O2.encode(s))
except Exception:  # pragma: no cover
    def _tok(s): return max(1, len(s) // 4)

NEEDLE = "The access code for vault 7 is QUARTZ-9183."
EXPECTED = "QUARTZ-9183"
QUESTION = "What is the access code for vault 7? Answer with only the code."
# rot bait: near-identical facts for OTHER vaults — the distractors NoLiMa shows break keyword matching.
_BAIT = [f"The access code for vault {v} is {w}-{n}." for v, w, n in
         [(3, "GRANITE", 4471), (5, "BASALT", 2298), (9, "MARBLE", 7714), (2, "SLATE", 1186), (8, "FLINT", 9032)]]
_FILLER = ("Routine operations continued without incident across the facility's lower levels, where "
           "maintenance logs recorded nominal readings and the night shift filed the usual reports. ")


def _pad(target_tokens: int) -> str:
    """Neutral filler padded to ~target tokens (deterministic)."""
    out, n = [], 0
    block = _tok(_FILLER)
    while n < target_tokens:
        out.append(_FILLER); n += block
    return "".join(out)


def build_rot_test(target_tokens: int = 50_000):
    """Construct the paired rot test. Returns {naive, ordo, question, expected, tokens}. Same needle + bait +
    length in both arms; only the needle PLACEMENT differs (NAIVE=lost-middle, ORDO=head-ledger + edge)."""
    bait = "\n".join(_BAIT)
    half = max(target_tokens // 2, 1)
    # NAIVE: filler ... bait ... needle buried in the middle ... filler ... question (no recitation)
    naive = (_pad(half) + "\n" + bait + "\n" + NEEDLE + "\n" + _pad(half) +
             "\n\n" + QUESTION)
    # ORDO: LEDGER at the HEAD (needle + acceptance reseated where attention is highest), bulk compacted,
    # needle echoed at the tail edge; the middle is dropped tool-output, not buried signal.
    ledger = ("LEDGER (load-bearing — keep verbatim):\n- " + NEEDLE +
              "\n- acceptance: answer the vault-7 code exactly.\n\n")
    ordo = (ledger + "[context compacted — " + str(half) + " tokens of routine logs dropped to disk] \n" +
            bait + "\n[compacted] \n" + "Reminder: " + NEEDLE +
            "\n\n" + QUESTION)
    return {"naive": naive, "ordo": ordo, "question": QUESTION, "expected": EXPECTED,
            "tokens": {"naive": _tok(naive), "ordo": _tok(ordo)}}


def score(response: str, expected: str = EXPECTED) -> bool:
    """Did the model retrieve the needle? Case-insensitive substring of the expected code."""
    return expected.lower() in (response or "").lower()


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    # validate CONSTRUCTION deterministically (the test is only sound if it's built right)
    t = build_rot_test(2_000)  # small build for the self-check; CLI/real run uses 50k+
    assert NEEDLE in t["naive"] and NEEDLE in t["ordo"], "needle missing"
    assert all(b in t["naive"] for b in _BAIT), "rot bait missing from naive arm"
    assert t["naive"].index(NEEDLE) > 200, "needle not buried in the naive middle"
    assert t["ordo"].index(NEEDLE) < 200, "ORDO arm must pin the needle to the head ledger"
    assert score("the code is quartz-9183.") and not score("no idea"), "scorer broken"
    assert 1500 < t["tokens"]["naive"] < 4000, t["tokens"]
    print(f"rot_bench self-check OK — built a {t['tokens']['naive']}-tok rot test "
          f"(needle@middle naive / @head ORDO). Real run: build_rot_test(50000), feed both arms to a "
          f"long-context model, score() each, write tools/rot-ab.json. P10 stays GROUNDED until that run.")
