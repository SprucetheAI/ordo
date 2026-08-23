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


// Two hooks, one installer. The settings merge (append never replace, back up first, refuse
// malformed JSON, leave other people's hooks alone) is the part that is easy to get wrong, so it is
// written once. `srcImport` marks a hook that needs an absolute import back into this package: the
// copy lands in someone else's .claude/ where "ordo-llm" does not resolve.
const HOOKS = {
  enforce:  { file: "ordo-enforce.mjs",  event: "Stop",             timeout: 15, srcImport: false,
              blurb: "VACUOUS (a check that executed nothing reported as proof) and NARRATED (work announced, nothing done). Both err toward allowing; releases itself after 4 blocks." },
  dispatch: { file: "ordo-dispatch.mjs", event: "UserPromptSubmit", timeout: 10, srcImport: true,
              blurb: "Classifies each prompt and injects the ORDO discipline only on STRICT tasks. A LIGHT verdict injects nothing, so trivial turns pay nothing." },
};

function hookSource(spec) {
  const src = readFileSync(join(ROOT, "hooks", spec.file), "utf8");
  if (!spec.srcImport) return src;
  // file:// URL, forward slashes: a Windows backslash path is not a valid ESM specifier.
  const url = "file:///" + join(ROOT, "src", "index.js").replace(/\\/g, "/").replace(/^\//, "");
  return src.replace("__ORDO_SRC__", url);
}

// ---- ordo enforce: the Stop hook that makes the gates fire (spec/enforcement.md) ----
// PRINT-BY-DEFAULT. A hook is executable configuration: it runs a program on every stop, so it gets
// read before it gets installed, the same way an inherited check does. --install is the consent.
// Default target is settings.local.json: project-local, gitignored, and the installed command
// carries absolute paths that are neither portable nor anyone else's business.
export function installEnforcement(targetDir, opts = {}) {
  const target = targetDir || process.cwd();
  const hookDir = join(target, ".claude", "hooks");
  const settingsPath = join(target, ".claude", opts.shared ? "settings.json" : "settings.local.json");
  // default: both. --only enforce / --only dispatch narrows it.
  const picked = (opts.only ? [opts.only] : Object.keys(HOOKS)).filter((k) => k in HOOKS);
  if (!picked.length) return `Unknown hook. Pick one of: ${Object.keys(HOOKS).join(", ")}`;

  if (opts.uninstall) {
    if (!existsSync(settingsPath)) return `Nothing to uninstall: ${settingsPath} does not exist.`;
    const cfg = JSON.parse(readFileSync(settingsPath, "utf8"));
    if (!cfg?.hooks) return "Nothing to uninstall: no hooks configured.";
    const marks = picked.map((k) => HOOKS[k].file.replace(".mjs", ""));
    let removed = 0;
    for (const ev of Object.keys(cfg.hooks)) {
      if (!Array.isArray(cfg.hooks[ev])) continue;
      cfg.hooks[ev] = cfg.hooks[ev]
        .map((e) => ({ ...e, hooks: (e.hooks || []).filter((h) => {
          const hit = marks.some((m) => String(h.command || "").includes(m));
          if (hit) removed++;
          return !hit;
        }) }))
        .filter((e) => (e.hooks || []).length > 0);   // drop entries we emptied, leave every other hook alone
    }
    writeFileSync(settingsPath, JSON.stringify(cfg, null, 2) + "\n");
    return `Removed ${removed} ordo hook(s) from ${settingsPath}. Files left in ${hookDir}; delete them by hand if you want them gone.`;
  }

  const plan = picked.map((k) => {
    const spec = HOOKS[k];
    const path = join(hookDir, spec.file);
    return { k, spec, path, src: hookSource(spec), entry: { hooks: [{ type: "command", command: `node "${path}"`, timeout: spec.timeout }] } };
  });
  if (!opts.install) {
    const out = ["ordo enforce — DRY RUN. Nothing was written.", ""];
    for (const { k, spec, path, src, entry } of plan) {
      out.push(`  ${k}  ->  ${path}   (${src.split("\n").length} lines, read it before you install it)`);
      out.push(`      hooks.${spec.event}: ${JSON.stringify(entry)}`);
      out.push(`      ${spec.blurb}`, "");
    }
    out.push(`  settings -> ${settingsPath}`, "",
      "  Read spec/enforcement.md, then re-run with --install. --only <name> narrows it.");
    return out.join("\n");
  }

  mkdirSync(hookDir, { recursive: true });
  for (const { path, src } of plan) writeFileSync(path, src);
  let cfg = {};
  if (existsSync(settingsPath)) {
    try { cfg = JSON.parse(readFileSync(settingsPath, "utf8")); }
    catch { return `Refusing to touch ${settingsPath}: it is not valid JSON. Fix it first — a malformed settings file silently disables EVERY setting in it.`; }
    writeFileSync(settingsPath + ".ordo.bak", JSON.stringify(cfg, null, 2) + "\n");
  }
  cfg.hooks = cfg.hooks || {};
  const lines = ["ordo enforce installed."];
  for (const { k, spec, path, entry } of plan) {
    cfg.hooks[spec.event] = cfg.hooks[spec.event] || [];
    const dup = JSON.stringify(cfg.hooks[spec.event]).includes(spec.file.replace(".mjs", ""));
    if (!dup) cfg.hooks[spec.event].push(entry);   // append: never replace someone else's hooks
    lines.push(`  ${k}  ->  ${path}  [${spec.event}]${dup ? " (already registered, not duplicated)" : ""}`);
  }
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(cfg, null, 2) + "\n");
  lines.push(`  settings -> ${settingsPath}`,
    "  Add .ordo/ and .claude/settings.local.json to your ignore rules. Restart the session to load it.",
    "  Remove with: npx ordo enforce --uninstall");
  return lines.join("\n");
}
