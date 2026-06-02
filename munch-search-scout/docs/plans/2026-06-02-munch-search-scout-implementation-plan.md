# Implementation plan: `munch-search-scout`

- Status: ready to execute, revision v2
- Date: 2026-06-02
- Design spec: `munch-search-scout/docs/specs/2026-06-02-munch-search-scout-design.md`
- v2 note: incorporates the plan review (2026-06-02). Changes: PowerShell-correct
  verification commands; enumerated scout `tools` and inlined mgmt allowlist; arg-aware +
  fully-qualified classifier; `SessionStart` matcher adds `resume`; real description
  strings; keep the skill dir name; LF + authoring-convention checks; mode read `.trim()`.

This plan builds the plugin described in the design spec. Read the spec first; this
document is the build sequence, not the rationale.

## Authoring conventions (apply to every file created here)

- Forward slashes in all paths; **never** the long-dash character (hyphens only) - watch
  the from-scratch content most (the scout system prompt and README mode docs).
- LF line endings. Confirm `.gitattributes` covers the new files
  (`git ls-files --eol munch-search-scout/` after adding).
- Commit after each completed step with a `Feature:`/`Improvement:` prefix; no Claude
  co-authoring.

## Prerequisites

- Node.js on PATH (both hooks are Node scripts).
- The jcodemunch and jdocmunch MCP servers configured at the session level.
- The existing `using-munch-tools` plugin is the fork source for the voice, guard, skill.

## Build sequence

Each step is independently verifiable. Auto-commit after each completed step.

1. **Scaffold the plugin.** Create `munch-search-scout/.claude-plugin/plugin.json`:
   `name: munch-search-scout`, `version: 0.1.0`,
   `author { name: okazakov, email: okazakov@gmail.com }`, `license: MIT`, and a real
   `description` (not a placeholder), e.g.: *"Replaces using-munch-tools: forces the main
   agent to delegate code/doc search to a disposable search-scout subagent (conserving
   the main context window), with a three-mode switch (nudge/fastpath/hardwall) read from
   ~/.claude/munch-scout-mode. Enable this OR using-munch-tools, never both."*

2. **Fork the skill** to `munch-search-scout/skills/using-munch-tools/SKILL.md`
   (**keep the directory named `using-munch-tools`** - `scout-inject.js` resolves the
   skill at `skills/using-munch-tools/SKILL.md`; renaming it breaks the voice unless the
   path is also changed). Structure the body into two clearly delimited **role-scoped
   sections** so the inject script can emit exactly one:
   - a **main-thread delegation** section (per mode: you do not search, hand the goal to
     `search-scout`; the post-return protocol; spot-check before high-blast-radius
     actions). Do NOT tell the main agent to `search_symbols(semantic=true)`.
   - a **subagent routing** section (the existing "use munch, not native" cheat-sheet,
     for subagents which search directly and cannot nest).

3. **Author the scout** `munch-search-scout/agents/search-scout.md`:
   - frontmatter `name: search-scout`, a real `description`, `model: sonnet`, and a
     comma-separated `tools` allowlist enumerated to the retrieval/navigation/
     relationship tools + `Read` from spec 5.4. Confirm each tool ID against the live
     tool names; remember `get_section` and the other doc tools are
     `mcp__jdocmunch__*`, the rest `mcp__jcodemunch__*`. Do NOT include `Agent`,
     `index_*`, `register_edit`, `invalidate_cache`, `embed_repo`, `set_tool_tier`, or
     any impact/refactor/health/diagram tool.
   - system prompt per spec 5.4 (restate goal, retrieval+reduction only, iterate
     internally, "found nothing" is a valid answer, the return contract, be terse).

4. **Write** `munch-search-scout/hooks/hooks.json`:
   - `SessionStart` matcher `startup|resume|clear|compact` -> `scout-inject.js`
     (note `resume`, unlike the fork source);
   - `SubagentStart` matcher `*` -> `scout-inject.js`;
   - `PreToolUse` matcher `Grep|Glob|Bash|mcp__jcodemunch__.*|mcp__jdocmunch__.*` ->
     `scout-guard.js`.
   Reference scripts with `${CLAUDE_PLUGIN_ROOT}` (exact casing).

5. **Fork `munch-inject.js` -> `scout-inject.js`.** Add: read `munch-scout-mode`
   (`.trim()`, absent -> `hardwall`); branch on the echoed event (SessionStart = emit
   ONLY the mode-aware delegation section; SubagentStart = emit ONLY the subagent
   routing section). Preserve the event-echo, the
   `CLAUDE_PLUGIN_ROOT || path.join(__dirname,'..')` fallback, and the fail-safe
   (exit 0 on any error). Keep the skill path `skills/using-munch-tools/SKILL.md`.

6. **Fork `munch-guard.js` -> `scout-guard.js`.** Add:
   - main-vs-subagent gate: if `agent_id` OR `agent_type` present -> allow (exit 0);
   - read `munch-scout-mode` (`.trim()`, absent -> `hardwall`);
   - classify on the **fully-qualified** `mcp__<server>__<tool>` name (not the suffix);
   - the **mgmt allowlist** (inline it, do not cross-reference): `resolve_repo`,
     `index_file`, `index_folder`, `index_repo`, `register_edit`, `invalidate_cache`,
     `announce_model`, `set_tool_tier`, `embed_repo` (jcodemunch + jdocmunch index/mgmt
     equivalents) -> always allow in main thread. `plan_turn`, `get_session_context`,
     `get_session_stats` are NOT allowlisted (denied under fastpath/hardwall);
   - the **arg-aware** `fastpath` broad/pinpoint split per spec 5.2 (inspect
     `tool_input.semantic` for `search_symbols`; PINPOINT vs BROAD lists);
   - `hardwall`: deny all non-allowlisted munch search + native search;
   - emit `hookSpecificOutput.permissionDecision: "deny"` + an actionable, name-robust
     `permissionDecisionReason` (reference the `search-scout` subagent by intent, not a
     hardcoded dispatch-tool name);
   - log mode + decision (allow/deny/delegated) per call to `~/.claude/munch-scout.log`;
     keep the `~/.claude/.munch-scout-quiet` hard-bypass and the `CLAUDE_DIR =
     CLAUDE_CONFIG_DIR || homedir/.claude` resolution.
   Preserve the existing `isSearchStyle()` Bash classifier and the "never throw out of a
   tool call -> exit 0 (allow)" guarantee.

7. **Write** `munch-search-scout/README.md`: prerequisites (Node, munch servers); the
   three modes and how to flip them (the `munch-scout-mode` file, with PowerShell and
   bash examples); the **mutual-exclusivity** warning and the swap workflow (uninstall
   `using-munch-tools`, install this; revert by swapping back); the rollback story; and
   the sharp edge that `hardwall` needs a working scout + munch servers (and how to flip
   to `nudge` to disable).

8. **Register in the marketplace.** Append to `.claude-plugin/marketplace.json`
   `plugins[]`: `{ name: "munch-search-scout", source: "./munch-search-scout",
   description: "<one line, may differ slightly from plugin.json>", category:
   "development" }` (same shape as the existing `using-munch-tools` entry).

9. **Reindex.** Run the `/j-index` skill to rebuild the jcodemunch/jdocmunch indices.

## Files to fork / reuse (do not write from scratch)

- `using-munch-tools/hooks/munch-inject.js` -> `scout-inject.js` (event echo, preamble
  wrap, `CLAUDE_PLUGIN_ROOT`-with-`__dirname` fallback, fail-safe exit).
- `using-munch-tools/hooks/munch-guard.js` -> `scout-guard.js` (`CLAUDE_DIR`
  resolution, `isSearchStyle()` Bash classifier, quiet-marker bypass, safe append-log,
  exit-0 guarantee).
- `using-munch-tools/skills/using-munch-tools/SKILL.md` -> the forked, role-split skill.
- `using-munch-tools/README.md` and `using-munch-tools/.claude-plugin/plugin.json` ->
  templates.

## Verification (before claiming done)

The repo's working shell is Windows PowerShell 7.x. Commands below are PowerShell; the
bash-tool equivalents work too. JSON/JS validity:

```
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('munch-search-scout/.claude-plugin/plugin.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('munch-search-scout/hooks/hooks.json','utf8'))"
node --check munch-search-scout/hooks/scout-inject.js
node --check munch-search-scout/hooks/scout-guard.js
```

Hook behavior (PowerShell - set the env var on its own line; bash inline `VAR=... node`
is a hard parse error in PowerShell, so do NOT use that form):

```
# Voice: main-thread delegation message
$env:CLAUDE_PLUGIN_ROOT = "$PWD/munch-search-scout"
'{"hook_event_name":"SessionStart","source":"startup"}' | node munch-search-scout/hooks/scout-inject.js
# Voice: subagent routing message (echoes SubagentStart)
'{"hook_event_name":"SubagentStart","agent_type":"search-scout"}' | node munch-search-scout/hooks/scout-inject.js

# Guard: main-thread munch search DENIED under hardwall (no agent_id/agent_type)
'hardwall' | Set-Content -NoNewline ~/.claude/munch-scout-mode
'{"tool_name":"mcp__jcodemunch__search_symbols","tool_input":{}}' | node munch-search-scout/hooks/scout-guard.js
# Subagent munch search ALLOWED (agent_id present)
'{"agent_id":"x","agent_type":"search-scout","tool_name":"mcp__jcodemunch__search_symbols","tool_input":{}}' | node munch-search-scout/hooks/scout-guard.js
# Main-thread mgmt tool ALLOWED under hardwall
'{"tool_name":"mcp__jcodemunch__register_edit","tool_input":{}}' | node munch-search-scout/hooks/scout-guard.js
# fastpath: lexical search_symbols ALLOWED, semantic DENIED
'fastpath' | Set-Content -NoNewline ~/.claude/munch-scout-mode
'{"tool_name":"mcp__jcodemunch__search_symbols","tool_input":{"semantic":false}}' | node munch-search-scout/hooks/scout-guard.js
'{"tool_name":"mcp__jcodemunch__search_symbols","tool_input":{"semantic":true}}' | node munch-search-scout/hooks/scout-guard.js
# nudge: nothing denied
'nudge' | Set-Content -NoNewline ~/.claude/munch-scout-mode
'{"tool_name":"Grep","tool_input":{"pattern":"x"}}' | node munch-search-scout/hooks/scout-guard.js
```

(Single-quoted JSON piped to `node` works in PowerShell 7.x; the JSON arrives with a
trailing CRLF and parses fine. `Set-Content -NoNewline` avoids a UTF-16/BOM mode file.)

LF check: `git ls-files --eol munch-search-scout/` (expect `lf` working-tree eol).

End-to-end (live, no install): launch with
`claude --plugin-dir C:/Git/MyCode/oleg-agent-skills/munch-search-scout` and confirm:

- the main-thread delegation voice appears at session start (and is the delegation
  message, NOT the "use munch yourself" cheat-sheet);
- a main-thread search is denied with the scout-dispatch reason;
- dispatching `search-scout` returns the structured contract;
- a confident "found nothing" return is accepted (not retried);
- flipping `munch-scout-mode` to `nudge` stops the blocking.

## Sequencing notes

- Steps 1-4 have no interdependencies beyond the manifest existing; 5-6 depend on the
  fork sources; 7-8 are docs/catalogue; 9 runs last.
- Hooks are reliably picked up only on a session restart; use `--plugin-dir` for live
  iteration during the build.
- Confirm the exact subagent-dispatch tool name (`Agent` vs `Task`) against the target
  build while writing step 2/5 so the delegation wording references a tool that exists;
  the deny reason stays name-robust regardless (references `search-scout` by intent).

## Open / tunable (decide during or after build)

- `plan_turn` main-thread handling under `fastpath`/`hardwall` (currently denied;
  tunable to allow as a routing signal).
- The `fastpath` broad-vs-pinpoint classification; tune from `munch-scout.log`.
- Optional future hardening: `scout-inject.js` detects the sibling `using-munch-tools`
  plugin and warns (mutual-exclusivity is documentation-only today).
