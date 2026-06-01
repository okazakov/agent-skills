# Implementation plan: `munch-search-scout`

- Status: ready to execute
- Date: 2026-06-02
- Design spec: `munch-search-scout/docs/specs/2026-06-02-munch-search-scout-design.md`

This plan builds the plugin described in the design spec. Read the spec first; this
document is the build sequence, not the rationale.

## Prerequisites

- Node.js on PATH (both hooks are Node scripts).
- The jcodemunch and jdocmunch MCP servers configured at the session level (the plugin
  enforces *using* them; it does not install them).
- The existing `using-munch-tools` plugin is the fork source for the voice, guard, and
  skill.

## Build sequence

Each step is independently verifiable. Auto-commit after each completed step.

1. **Scaffold the plugin.** Create `munch-search-scout/.claude-plugin/plugin.json`:
   `name: munch-search-scout`, a one-line description, `version: 0.1.0`,
   `author { name: okazakov, email: okazakov@gmail.com }`, `license: MIT`.

2. **Fork the skill** to `munch-search-scout/skills/using-munch-tools/SKILL.md`. Keep
   the routing cheat-sheet (it still governs subagents) and ADD:
   - a main-thread delegation section (you do not search; dispatch `search-scout`);
   - the post-return protocol (trust by default; escalate on concrete signal; spot-check
     before high-blast-radius actions);
   - a Red Flags row for "I'll just search inline this once".

3. **Author the scout** `munch-search-scout/agents/search-scout.md`:
   - frontmatter `name: search-scout`, `description`, `model: sonnet`, and a `tools`
     allowlist (munch search/nav tools + `Read`; no `Agent`);
   - system prompt per design spec 5.4 (restate goal, retrieval+reduction only, iterate
     internally, the return contract, be terse).

4. **Write** `munch-search-scout/hooks/hooks.json`:
   - `SessionStart` matcher `startup|clear|compact` -> `scout-inject.js`;
   - `SubagentStart` matcher `*` -> `scout-inject.js`;
   - `PreToolUse` matcher `Grep|Glob|Bash|mcp__jcodemunch__.*|mcp__jdocmunch__.*` ->
     `scout-guard.js`.
   Reference scripts with `${CLAUDE_PLUGIN_ROOT}` (exact casing).

5. **Fork `munch-inject.js` -> `scout-inject.js`.** Add: read `munch-scout-mode`;
   branch on the echoed event (SessionStart = mode-aware delegation message;
   SubagentStart = the routing cheat-sheet). Reuse the event-echo and fail-safe
   (exit 0 on any error) patterns unchanged.

6. **Fork `munch-guard.js` -> `scout-guard.js`.** Add:
   - main-vs-subagent gate: if `agent_id` present -> allow (exit 0);
   - read `munch-scout-mode` (absent -> `hardwall`);
   - the mgmt allowlist (always allow in main thread);
   - the broad-vs-pinpoint classifier for `fastpath`;
   - `hookSpecificOutput.permissionDecision: "deny"` + actionable
     `permissionDecisionReason` for blocked main-thread search;
   - keep observe-style logging to `~/.claude/munch-scout.log` and the
     `~/.claude/.munch-scout-quiet` hard-bypass.
   Preserve the existing classifier helpers and "never throw out of a tool call ->
   exit 0 (allow)" guarantee.

7. **Write** `munch-search-scout/README.md`: prerequisites (Node, munch servers); the
   three modes and how to flip them (the `munch-scout-mode` file); the
   **mutual-exclusivity** warning and the swap workflow (uninstall `using-munch-tools`,
   install this; revert by swapping back); the rollback story; and the sharp edge that
   `hardwall` needs a working scout + munch servers.

8. **Register in the marketplace.** Append to `.claude-plugin/marketplace.json`
   `plugins[]`: `{ name: munch-search-scout, source: ./munch-search-scout,
   description: <one line>, category: development }`.

9. **Reindex.** Run the `/j-index` skill to rebuild the jcodemunch/jdocmunch indices
   after the new files land.

## Files to fork / reuse (do not write from scratch)

- `using-munch-tools/hooks/munch-inject.js` -> `scout-inject.js` (event echo, preamble
  wrap, fail-safe exit).
- `using-munch-tools/hooks/munch-guard.js` -> `scout-guard.js` (`CLAUDE_DIR`
  resolution, `isSearchStyle()` Bash classifier, quiet-marker bypass, safe append-log).
- `using-munch-tools/skills/using-munch-tools/SKILL.md` -> the forked skill.
- `using-munch-tools/README.md` and `using-munch-tools/.claude-plugin/plugin.json` ->
  templates for the new README and manifest.

## Verification (before claiming done)

JSON/JS validity:

```
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('munch-search-scout/.claude-plugin/plugin.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('munch-search-scout/hooks/hooks.json','utf8'))"
node --check munch-search-scout/hooks/scout-inject.js
node --check munch-search-scout/hooks/scout-guard.js
```

Hook behavior (pipe sample stdin, check stdout/exit):

```
# Voice: main thread delegation message
echo '{"hook_event_name":"SessionStart","source":"startup"}' | CLAUDE_PLUGIN_ROOT="$PWD/munch-search-scout" node munch-search-scout/hooks/scout-inject.js
# Voice: subagent gets routing message (echoes SubagentStart)
echo '{"hook_event_name":"SubagentStart","agent_type":"search-scout"}' | CLAUDE_PLUGIN_ROOT="$PWD/munch-search-scout" node munch-search-scout/hooks/scout-inject.js

# Guard: main-thread munch search DENIED under hardwall (no agent_id)
echo hardwall > ~/.claude/munch-scout-mode
echo '{"tool_name":"mcp__jcodemunch__search_symbols","tool_input":{}}' | node munch-search-scout/hooks/scout-guard.js
# Subagent munch search ALLOWED (agent_id present)
echo '{"agent_id":"x","agent_type":"search-scout","tool_name":"mcp__jcodemunch__search_symbols","tool_input":{}}' | node munch-search-scout/hooks/scout-guard.js
# Main-thread mgmt tool ALLOWED under hardwall
echo '{"tool_name":"mcp__jcodemunch__register_edit","tool_input":{}}' | node munch-search-scout/hooks/scout-guard.js
# nudge: nothing denied
echo nudge > ~/.claude/munch-scout-mode
echo '{"tool_name":"Grep","tool_input":{"pattern":"x"}}' | node munch-search-scout/hooks/scout-guard.js
```

End-to-end (live, no install): launch with
`claude --plugin-dir C:/Git/MyCode/oleg-agent-skills/munch-search-scout` and confirm:

- the main-thread delegation voice appears at session start;
- a main-thread search is denied with the scout-dispatch reason;
- dispatching `search-scout` returns the structured contract;
- flipping `munch-scout-mode` to `nudge` stops the blocking.

## Sequencing notes

- Steps 1-4 have no interdependencies beyond the manifest existing; 5-6 depend on the
  fork sources; 7-8 are docs/catalogue; 9 runs last.
- Hooks are reliably picked up only on a session restart; use `--plugin-dir` for live
  iteration during the build.

## Open / tunable (decide during or after build)

- `plan_turn` main-thread handling under `hardwall` (currently allowed; tunable to
  delegate).
- The `fastpath` broad-vs-pinpoint classification; tune from `munch-scout.log`.
