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

// The bundled-MCP template (NOT active — rename to .mcp.json + add your keys to enable). ORDO's value-add is
// routing each tool's output through the inbound compactor (spec/mcp-bundle.md). PDFs/images are native to Claude
// Code (the Read tool); video has no standard server yet — add one to the "video" slot when you have it.
const MCP_EXAMPLE = JSON.stringify({
  _README: "Rename to .mcp.json and add your keys to enable. ORDO compacts every tool's output (spec/mcp-bundle.md).",
  mcpServers: {
    firecrawl: { command: "npx", args: ["-y", "firecrawl-mcp"], env: { FIRECRAWL_API_KEY: "<your-key>" } },
    "video (add your video-understanding MCP here)": { command: "npx", args: ["-y", "<video-mcp-package>"], env: {} },
  },
}, null, 2) + "\n";

/** Install ORDO into <targetDir or cwd>/.claude/. opts.lean → the compaction-only tier. Returns a status string. */
export function initProject(targetDir, opts = {}) {
  const target = targetDir || process.cwd();

  if (opts.lean) {
    const dir = join(target, ".claude", "skills", "ordo-lean");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), readFileSync(join(ROOT, "skills", "ordo-lean", "SKILL.md"), "utf8"));
    return `ORDO Lean installed → ${dir}\n  SKILL.md (compaction + verbosity only — token saving, stateless).\n` +
      "  Auto-fires on data/output tasks. Restart the session to pick it up.";
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
    ".ordo/ (ledger + lessons + mcp.json.example — grows with the project).\n" +
    "  Auto-fires + auto-routes on coding/agentic tasks. Bundled-tool output is compaction-wrapped (spec/mcp-bundle.md).\n" +
    "  Restart the session to pick it up.";
}
