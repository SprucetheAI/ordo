// ordo init — drop ORDO into a project's .claude/ so it auto-activates without being invoked.
//   `ordo init`        → FULL: the skill + operating profile + gate specs + .ordo/ persistence (grows with the project)
//   `ordo init --lean` → LEAN: the compaction-only skill (token saving), stateless
// Lossless and additive: it changes no behavior, it removes the paste/invoke step.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const LEDGER_TEMPLATE = `# ORDO ledger — project state (ORDO reads this at the start of a STRICT task, appends as it works)

## Goal (immutable anchor — replace explicitly only, never silently)
<the end goal in your terms + the done-condition / success test>

## Decisions (append-only)
-

## Open blockers
-

## Files touched
-
`;

const LESSONS_TEMPLATE = `# ORDO lessons (evidence-gated — appended ONLY after a real gate caught a real failure)

<one line per lesson: pattern · cause · fix · gate-that-caught-it. ORDO reads matching lessons at gate-pre.
This is a human-run, evidence-gated loop — NOT autonomous self-growth.>
`;

// The bundled-tools template. ORDO's value-add is routing each tool's output through the inbound compactor
// (spec/mcp-bundle.md). SOCIAL/recent: install the last30days SKILL (`npx skills add` / `/plugin install`) — free
// tier, multi-source (Reddit/X/YouTube/TikTok/IG/HN/GitHub...), then /last30days <topic>; ORDO compacts its output.
// WEB (raw pages): firecrawl below. VIDEO: tools/video_frames.py (ffmpeg keyframes → native vision). PDFs/images: native.
const MCP_EXAMPLE = JSON.stringify({
  _README: "Rename to .mcp.json + add keys to enable. ORDO compacts every tool's output (spec/mcp-bundle.md). SOCIAL/recent: install the last30days skill (github.com/mvanhorn/last30days-skill, free tier) -> /last30days <topic>. VIDEO: tools/video_frames.py. PDFs/images: native (Read tool).",
  mcpServers: {
    firecrawl: { command: "npx", args: ["-y", "firecrawl-mcp"], env: { FIRECRAWL_API_KEY: "<your-firecrawl-key>" } },
  },
}, null, 2) + "\n";

// drop the /ordo slash command so it works in the project regardless of tier
function writeCommand(target) {
  const cmdDir = join(target, ".claude", "commands");
  mkdirSync(cmdDir, { recursive: true });
  writeFileSync(join(cmdDir, "ordo.md"), readFileSync(join(ROOT, "commands", "ordo.md"), "utf8"));
}

/** Install ORDO into <targetDir or cwd>/.claude/. opts.lean → the compaction-only tier. Returns a status string. */
export function initProject(targetDir, opts = {}) {
  const target = targetDir || process.cwd();
  writeCommand(target); // /ordo works in both tiers

  if (opts.lean) {
    const dir = join(target, ".claude", "skills", "ordo-lean");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), readFileSync(join(ROOT, "skills", "ordo-lean", "SKILL.md"), "utf8"));
    return `ORDO Lean installed → ${dir}\n  SKILL.md (compaction + verbosity only) + /ordo command.\n` +
      "  Auto-fires on data/output tasks; /ordo activates it on demand. Restart the session to pick it up.";
  }

  const skillDir = join(target, ".claude", "skills", "ordo");
  const refDir = join(skillDir, "references");
  mkdirSync(refDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), readFileSync(join(ROOT, "skills", "ordo", "SKILL.md"), "utf8"));
  writeFileSync(join(refDir, "OPERATING-PROFILE.md"), readFileSync(join(ROOT, "OPERATING-PROFILE.md"), "utf8"));
  let n = 0;
  const specDir = join(ROOT, "spec");
  if (existsSync(specDir)) for (const f of readdirSync(specDir)) {
    if (f.endsWith(".md")) { writeFileSync(join(refDir, f), readFileSync(join(specDir, f), "utf8")); n++; }
  }
  // persistence — the project-local ledger + lessons the skill reads + appends ("grows with the project").
  // Never overwrite an existing one (it holds the project's accreted state).
  const ordoDir = join(target, ".ordo");
  mkdirSync(ordoDir, { recursive: true });
  if (!existsSync(join(ordoDir, "ledger.md"))) writeFileSync(join(ordoDir, "ledger.md"), LEDGER_TEMPLATE);
  if (!existsSync(join(ordoDir, "lessons.md"))) writeFileSync(join(ordoDir, "lessons.md"), LESSONS_TEMPLATE);
  if (!existsSync(join(ordoDir, "mcp.json.example"))) writeFileSync(join(ordoDir, "mcp.json.example"), MCP_EXAMPLE);

  return `ORDO Full installed → ${skillDir}\n  SKILL.md + OPERATING-PROFILE.md + ${n} spec references + ` +
    ".ordo/ (ledger + lessons + mcp.json.example) + /ordo command — grows with the project.\n" +
    "  Auto-fires + auto-routes on coding/agentic tasks; /ordo activates on demand. Tool output is compaction-wrapped.\n" +
    "  Restart the session to pick it up.";
}
