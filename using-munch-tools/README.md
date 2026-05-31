# using-munch-tools (Claude Code plugin)

Routes native code/doc search through **jcodemunch** (code) and **jdocmunch** (docs).
Two layers, mirroring the self-targeted enforcement design:

- **Voice** - a SessionStart hook (`munch-inject.js`) that injects an
  `<EXTREMELY_IMPORTANT>` block (the `using-munch-tools` skill) on
  `startup|clear|compact`, so it survives compaction.
- **Guardrail** - a PreToolUse hook (`munch-guard.js`) on `Grep|Glob|Bash`,
  currently in **OBSERVE mode**: it ALWAYS allows the call and emits NO reminder;
  it only logs search-style calls to `~/.claude/munch-guard.log` for calibration.

## Layout

```
using-munch-tools/                 (plugin root = ${CLAUDE_PLUGIN_ROOT})
  .claude-plugin/plugin.json       manifest (name, version, ...)
  hooks/
    hooks.json                     declares the two hooks (auto-discovered)
    munch-inject.js                SessionStart voice
    munch-guard.js                 PreToolUse guardrail (observe mode)
  skills/using-munch-tools/SKILL.md  the routing cheat-sheet / Red Flags table
```

Hooks reference their scripts via `${CLAUDE_PLUGIN_ROOT}` so there is no hardcoded
username or path - it works on any machine after install.

## Prerequisites

- **Node.js on PATH** - both hooks are Node scripts.
- **The jcodemunch / jdocmunch MCP servers** must be configured separately. This
  plugin enforces *using* them; it does not install them. On a machine without the
  munch servers the voice still fires and the guard still logs, but the routing
  advice points at tools that are not there - install/enable the servers too.

## Install

From any Claude Code session (the marketplace is the parent repo of this plugin):

```
/plugin marketplace add C:/Git/MyCode/agent-skills
/plugin install using-munch-tools@agent-skills
```

That copies the plugin into `~/.claude/plugins/cache/` and adds
`"using-munch-tools@agent-skills": true` to `enabledPlugins`. No manual
`settings.json` editing. Plugin hooks MERGE with your existing hooks - nothing you
already have is disturbed.

Verify after install: open a new session (or `/compact`) and confirm the
`<EXTREMELY_IMPORTANT>` munch block appears; run a `Grep` and confirm a line lands
in `~/.claude/munch-guard.log` and the call was allowed.

## Updating (git pull does NOT auto-update)

Marketplace plugins are COPIED into a cache, so pulling the repo is not enough:

1. Bump `version` in `using-munch-tools/.claude-plugin/plugin.json` (required - an
   unbumped version is treated as "already latest").
2. Commit + push (or just commit, for a local marketplace).
3. In a session: `/plugin marketplace update agent-skills` then
   `/plugin update using-munch-tools@agent-skills`.

For live iteration without the cache, launch with `claude --plugin-dir
C:/Git/MyCode/agent-skills/using-munch-tools` (references in place for that session
only).

## Quiet marker

Create `~/.claude/.munch-guard-quiet` to suppress logging (e.g. during warden
re-audits of the munch tools). In observe mode it just silences the log; if you
later escalate to block mode it must hard-bypass the deny.

## Modes (current: OBSERVE)

- **observe** (now): log only, never reminds, never blocks.
- **warn** (later): also emit a reroute reminder via PreToolUse
  `additionalContext` (still allow). Edit `munch-guard.js`, bump the version,
  update.
- **block** (last resort): switch `Grep`/`Glob` to `permissionDecision: "deny"`,
  leave `Bash` in warn, and make `.munch-guard-quiet` a hard bypass so warden
  neutral-tool audits are never blocked.

## Migrating from the manual ~/.claude install

If you previously wired these two hooks directly into `~/.claude/settings.json`
(the SessionStart `munch-inject` and the PreToolUse `Grep|Glob|Bash` `munch-guard`
entries), the plugin will ADD a second copy and they will double-fire (double
injection, double logging). After confirming the plugin works, remove the two
manual entries from `~/.claude/settings.json` and optionally delete
`~/.claude/hooks/munch-inject.js`, `~/.claude/hooks/munch-guard.js`, and
`~/.claude/skills/using-munch-tools/`. Keep `~/.claude/munch-guard.log` and
`~/.claude/.munch-guard-quiet` - the plugin still uses those.

## Uninstall

`/plugin uninstall using-munch-tools@agent-skills` (or disable it in `/plugin`).
The log and quiet marker in `~/.claude` are left in place.
