# munch-search-scout (Claude Code plugin)

Forces the main agent to DELEGATE all code/doc search to a disposable,
Sonnet-pinned `search-scout` subagent instead of searching itself. The scout runs
the whole multi-step retrieval in its own throwaway context and returns only a
compact distillate (synthesis + locators + confidence/coverage), so the search
churn never lands in - and never crowds - the main agent's context window.

This plugin is a **superset replacement** for `using-munch-tools`. Enable ONE of
them, never both (see "Mutual exclusivity" below).

## How it works

Three cooperating pieces, all reading one mode file:

- **Voice** (`scout-inject.js`, on `SessionStart` + `SubagentStart`) - injects a
  role-scoped rule. The main thread gets the delegation protocol for the active
  mode ("hand the goal to `search-scout`; trust its transparent return; spot-check
  before high-blast-radius actions"). Every subagent (including the scout) gets
  the "search directly with munch, not native" routing rule. Subagents cannot
  nest, so search delegation only ever originates on the main thread.
- **Guard** (`scout-guard.js`, PreToolUse on
  `Grep|Glob|Bash|mcp__jcodemunch__.*|mcp__jdocmunch__.*`) - enforces the mode on
  the MAIN THREAD ONLY. Any subagent call is always allowed. It logs each
  search-relevant main-thread decision to `~/.claude/munch-scout.log`.
- **Scout** (`agents/search-scout.md`, `model: sonnet`) - the disposable searcher.
  Its tool allowlist is restricted to retrieval/navigation/relationship tools plus
  `Read`, structurally keeping it to "what / where is X" and out of task reasoning.

## Layout

```
munch-search-scout/                    (plugin root = ${CLAUDE_PLUGIN_ROOT})
  .claude-plugin/plugin.json           manifest
  README.md                            this file
  agents/search-scout.md               the scout (sonnet, retrieval-only)
  skills/using-munch-tools/SKILL.md    role-split routing cheat-sheet
  hooks/
    hooks.json                         SessionStart + SubagentStart + PreToolUse
    scout-inject.js                    voice
    scout-guard.js                     guard
```

## Prerequisites

- **Node.js on PATH** - both hooks are Node scripts.
- **The jcodemunch / jdocmunch MCP servers** configured separately. This plugin
  enforces delegating to them; it does not install them. Under `hardwall`, search
  only works if the scout can reach the munch servers (see the sharp edge below).

## Modes (default: hardwall)

The guard reads one plain-text, one-word file: `~/.claude/munch-scout-mode`
(or `$CLAUDE_CONFIG_DIR/munch-scout-mode` if you relocated the config dir).

| Mode | Native search (Grep/Glob/search-Bash) | munch search/retrieval | munch index/session mgmt |
|---|---|---|---|
| `nudge` | allowed (logged) | allowed (logged) | allowed |
| `fastpath` | denied | broad denied, narrow pinpoint allowed | allowed |
| `hardwall` | denied | all denied | allowed |

- **nudge** - nothing is blocked; the voice just steers you to delegate. Use this
  to effectively disable the wall.
- **fastpath** - broad/exploratory search must go to the scout; a narrow pinpoint
  lookup of something already identified (a known symbol's source/outline/refs, a
  known doc section) goes through directly. Semantic `search_symbols` counts as
  broad and is denied.
- **hardwall** (default) - every code/doc search on the main thread is delegated;
  the main agent's only search recourse is dispatching the scout.

Index-management tools (reindex, register-edit, and the jdocmunch index verbs that
`/j-index` uses) are allowed in every mode, so index hygiene keeps working.

### Switching modes (no shell command needed)

The plugin CREATES `~/.claude/munch-scout-mode` for you on first session start,
pre-filled with `hardwall`. To switch, open that file in any editor and replace
its contents with exactly one of `nudge`, `fastpath`, or `hardwall` (a plain UTF-8
file; a trailing newline is fine). The change takes effect on the next session.

The plugin only ever CREATES the file when it is absent - it never overwrites your
edit. An absent or unrecognized value falls back to the safe `hardwall` default.

## Mutual exclusivity with using-munch-tools

`munch-search-scout` is a superset of `using-munch-tools`; running both at once
means two voices and two guards that contradict and double-log. Enable exactly
one. The two use distinct state filenames (`munch-scout.log` /
`.munch-scout-quiet` here vs `munch-guard.log` / `.munch-guard-quiet` there) so a
swap does not cross-talk.

### Swap workflow (from using-munch-tools to this)

```
/plugin uninstall using-munch-tools@oleg-agent-skills
/plugin marketplace update oleg-agent-skills
/plugin install munch-search-scout@oleg-agent-skills
```

Open a new session afterward (hooks are picked up reliably only on restart).

### Rollback (back to using-munch-tools)

```
/plugin uninstall munch-search-scout@oleg-agent-skills
/plugin install using-munch-tools@oleg-agent-skills
```

`using-munch-tools` is left pristine as the rollback target. Your
`~/.claude/munch-scout-*` files are harmless to leave in place.

## Install

```
/plugin marketplace add https://github.com/okazakov/agent-skills.git
/plugin install munch-search-scout@oleg-agent-skills
```

Live-test without installing (references the plugin in place for one session):

```
claude --plugin-dir path/to/oleg-agent-skills/munch-search-scout
```

## Updating (git pull does NOT auto-update)

Marketplace plugins are copied into a cache, so pulling the repo is not enough:

1. Bump `version` in `munch-search-scout/.claude-plugin/plugin.json`.
2. Commit.
3. `/plugin marketplace update oleg-agent-skills` then
   `/plugin update munch-search-scout@oleg-agent-skills`.

## Sharp edge: hardwall needs a working scout + munch servers

Under `hardwall` the main agent cannot search at all - it can only dispatch the
scout. If the munch servers are down or unconfigured, or the scout cannot run, all
main-thread search is stranded. Recovery, in order of preference:

- Edit `~/.claude/munch-scout-mode` to `nudge` and start a new session (search
  works directly again).
- Or drop a `~/.claude/.munch-scout-quiet` marker file: the guard then allows
  every call silently (a hard bypass, e.g. for tool re-audits). Delete it to
  re-arm the wall.

The guard also fails OPEN by design: a malformed hook payload allows the call
rather than stranding the session.

## Uninstall

`/plugin uninstall munch-search-scout@oleg-agent-skills` (or disable it in
`/plugin`). The `~/.claude/munch-scout-mode`, `munch-scout.log`, and
`.munch-scout-quiet` files are left in place; delete them by hand if you want a
clean slate.
