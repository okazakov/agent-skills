# agent-skills

Personal Claude Code skills and plugins, distributed as a **plugin marketplace**.
This repo is both the marketplace catalogue (`.claude-plugin/marketplace.json`) and
the home of the plugins themselves (one subdirectory per plugin).

## Use the marketplace

```
/plugin marketplace add C:/Git/MyCode/agent-skills
/plugin install <plugin-name>@agent-skills
```

`/plugin marketplace add` also accepts a git URL (e.g.
`https://github.com/<you>/agent-skills.git`) once this is pushed to a remote.

## Plugins

| Plugin | What it does |
|---|---|
| `using-munch-tools` | Routes native code/doc search through jcodemunch / jdocmunch (SessionStart voice + PreToolUse guardrail, observe mode). See `using-munch-tools/README.md`. |

## Repo layout

```
agent-skills/                        (git repo root = marketplace)
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
4. Commit. Consumers run `/plugin marketplace update agent-skills` then
   `/plugin install <plugin-name>@agent-skills`.

## Notes

- **Node.js** must be on PATH for any plugin whose hooks are Node scripts.
- Marketplace plugins are COPIED into `~/.claude/plugins/cache/` on install, so a
  `git pull` does not auto-update a consumer - they must bump the plugin `version`
  and run `/plugin marketplace update agent-skills`.
- All paths use forward slashes (valid on Windows, macOS, and Linux).
