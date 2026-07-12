# oleg-agent-skills

Personal Claude Code skills and plugins, distributed as a **plugin marketplace**.
This repo is both the marketplace catalogue (`.claude-plugin/marketplace.json`) and
the home of the plugins themselves (one subdirectory per plugin).

## Use the marketplace

```
/plugin marketplace add https://github.com/okazakov/agent-skills.git
/plugin install <plugin-name>@oleg-agent-skills
```

`/plugin marketplace add` also accepts a local filesystem path (e.g. a clone at
`path/to/oleg-agent-skills`) instead of the git URL.

## Plugins

| Plugin | What it does |
|---|---|
| `using-munch-tools` | Routes native code/doc search through jcodemunch / jdocmunch (SessionStart voice + PreToolUse guardrail, observe mode). See `using-munch-tools/README.md`. |
| `munch-search-scout` | Replaces `using-munch-tools`: forces the main agent to delegate code/doc search to a disposable `search-scout` subagent (nudge/fastpath/hardwall mode switch). Enable this OR `using-munch-tools`, never both. See `munch-search-scout/README.md`. |
| `setup-issue-tracker` | Installs a local markdown status-board issue tracker into a repo (committed tickets in `docs/issues/`, gitignored rebuildable board in `docs/issue-tracker/`). See `setup-issue-tracker/README.md`. |

## Repo layout

```
oleg-agent-skills/                        (git repo root = marketplace)
  .claude-plugin/marketplace.json    catalogue of plugins
  using-munch-tools/                 a plugin (see its own README)
    .claude-plugin/plugin.json
    hooks/...
    skills/...
  <future-plugin>/                   add more the same way
```

## Adding a new skill/plugin

1. Create `<plugin-name>/.claude-plugin/plugin.json` (at minimum `name` +
   `description`; add `version` and bump it on every change you want delivered).
2. Put skills under `<plugin-name>/skills/<skill>/SKILL.md`, hooks under
   `<plugin-name>/hooks/hooks.json` (reference bundled scripts with
   `${CLAUDE_PLUGIN_ROOT}`), commands under `<plugin-name>/commands/`, agents under
   `<plugin-name>/agents/` - all auto-discovered at the plugin root.
3. Add an entry to `.claude-plugin/marketplace.json` `plugins[]` with
   `name`, `description`, and `source: "./<plugin-name>"`.
4. Commit. Consumers run `/plugin marketplace update oleg-agent-skills` then
   `/plugin install <plugin-name>@oleg-agent-skills`.

## Notes

- **Node.js** must be on PATH for any plugin whose hooks are Node scripts.
- Marketplace plugins are COPIED into `~/.claude/plugins/cache/` on install, so a
  `git pull` does not auto-update a consumer - they must bump the plugin `version`
  and run `/plugin marketplace update oleg-agent-skills`.
- All paths use forward slashes (valid on Windows, macOS, and Linux).
