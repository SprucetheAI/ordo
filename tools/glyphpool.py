"""glyphpool — harvest the maximal pool of 1-token glyphs across ALL writing systems.

Per the GLOSSOPETRAE (Pliny) finding, human-illegibility is fine for an AI reading from a spec, so we
drop the readability constraint and cross-breed scripts to maximize the 1-token symbol space. A glyph
is admitted by MEASURED token cost only (Design Law 1), not by appearance.

Tiers:
  A = 1 token in BOTH cl100k_base and o200k_base   (safest; works on GPT-3.5/4 and GPT-4o/o1)
  B = 1 token in o200k_base only (cl100k >= 2)      (modern-frontier tier; o200k has wider coverage)

Claude/Gemini tokenizers are proprietary; these are GPT proxies (see DISCLAIMERS). Re-validate per model.

Usage:
  python tools/glyphpool.py            # harvest, print per-block summary, write spec/glyph-pool.tsv
"""
from __future__ import annotations

import unicodedata
from pathlib import Path

import tiktoken

CL = tiktoken.get_encoding("cl100k_base")
O2 = tiktoken.get_encoding("o200k_base")

# (block name, start, end-inclusive). CJK/Yi sampled to keep the run bounded but representative.
BLOCKS = [
    ("greek", 0x0370, 0x03FF), ("greek_ext", 0x1F00, 0x1FFF),
    ("cyrillic", 0x0400, 0x04FF), ("cyrillic_supp", 0x0500, 0x052F),
    ("armenian", 0x0531, 0x058F), ("hebrew", 0x05D0, 0x05EA),
    ("arabic", 0x0620, 0x06FF), ("syriac", 0x0710, 0x074F),
    ("georgian", 0x10A0, 0x10FF), ("devanagari", 0x0900, 0x097F),
    ("bengali", 0x0980, 0x09FF), ("tamil", 0x0B80, 0x0BFF),
    ("thai", 0x0E01, 0x0E5B), ("lao", 0x0E81, 0x0EDF),
    ("tibetan", 0x0F00, 0x0FBC), ("myanmar", 0x1000, 0x109F),
    ("hiragana", 0x3041, 0x3096), ("katakana", 0x30A1, 0x30FA),
    ("bopomofo", 0x3105, 0x312F), ("hangul_jamo", 0x3131, 0x318E),
    ("kangxi_radicals", 0x2F00, 0x2FD5), ("cjk_radicals_supp", 0x2E80, 0x2EF3),
    ("cjk_unified", 0x4E00, 0x4E00 + 4000), ("yi", 0xA000, 0xA000 + 600),
    ("tifinagh", 0x2D30, 0x2D67), ("runic", 0x16A0, 0x16F8),
    ("ethiopic", 0x1200, 0x12FF), ("cherokee", 0x13A0, 0x13FF),
    ("math_operators", 0x2200, 0x22FF), ("misc_math_sym_a", 0x27C0, 0x27EF),
    ("supp_math_operators", 0x2A00, 0x2AFF), ("letterlike", 0x2100, 0x214F),
    ("arrows", 0x2190, 0x21FF), ("supp_arrows_a", 0x27F0, 0x27FF),
    ("supp_arrows_b", 0x2900, 0x297F), ("geometric_shapes", 0x25A0, 0x25FF),
    ("misc_symbols", 0x2600, 0x26FF), ("dingbats", 0x2700, 0x27BF),
    ("misc_technical", 0x2300, 0x23FF), ("enclosed_alnum", 0x2460, 0x24FF),
    ("braille", 0x2800, 0x28FF), ("box_drawing", 0x2500, 0x257F),
    ("block_elements", 0x2580, 0x259F), ("cjk_symbols", 0x3000, 0x303F),
]

_BAD_CATS = {"Cc", "Cf", "Cn", "Cs", "Co", "Zl", "Zp", "Zs", "Mn", "Mc", "Me"}


def harvest():
    rows, per_block = [], {}
    for name, lo, hi in BLOCKS:
        a = b = 0
        for cp in range(lo, hi + 1):
            ch = chr(cp)
            try:
                cat = unicodedata.category(ch)
            except ValueError:
                continue
            if cat in _BAD_CATS or not ch.isprintable() or ch.isspace():
                continue
            cl, o2 = len(CL.encode(ch)), len(O2.encode(ch))
            if o2 == 1 and cl == 1:
                tier = "A"; a += 1
            elif o2 == 1:
                tier = "B"; b += 1
            else:
                continue
            uname = unicodedata.name(ch, "?")
            rows.append((ch, f"U+{cp:04X}", name, cl, o2, tier, uname))
        if a or b:
            per_block[name] = (a, b)
    return rows, per_block


def main():
    rows, per_block = harvest()
    tier_a = [r for r in rows if r[5] == "A"]
    tier_b = [r for r in rows if r[5] == "B"]
    print("=== 1-token glyph harvest (per block: A=both, B=o200k-only) ===")
    for name, (a, b) in sorted(per_block.items(), key=lambda kv: -(kv[1][0] + kv[1][1])):
        print(f"  {name:22} A={a:4}  B={b:4}")
    print(f"\nTOTAL  Tier A (both cl100k+o200k) = {len(tier_a)}   Tier B (o200k only) = {len(tier_b)}   "
          f"grand pool = {len(rows)}")
    # write the FULL pool (maximal): every 1-token glyph found, Tier A then Tier B.
    out = Path(__file__).resolve().parent.parent / "spec" / "glyph-pool.tsv"
    with out.open("w", encoding="utf-8") as f:
        f.write("glyph\tcodepoint\tblock\tcl100k\to200k\ttier\tunicode_name\n")
        for r in tier_a + tier_b:
            f.write("\t".join(str(x) for x in r) + "\n")
    print(f"\nwrote {out.name}: {len(tier_a)} Tier-A + {len(tier_b)} Tier-B = {len(rows)} glyphs (full pool)")
    # a quick alien-string demo: 12 cross-bred Tier-A glyphs, measured as a run
    demo = "".join(r[0] for r in tier_a[:: max(1, len(tier_a) // 12)][:12])
    print(f"\ncross-bred demo (12 Tier-A glyphs): {demo!r}  -> cl100k={len(CL.encode(demo))} o200k={len(O2.encode(demo))} tokens")


if __name__ == "__main__":
    main()
