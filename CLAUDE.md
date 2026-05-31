# agent-skills - agent guide

You are working in **a Claude Code plugin marketplace**. This single git repo is
BOTH the marketplace catalogue and the home of the plugins it serves. People clone
it and install plugins from it with `/plugin`; there is no separate install script.

Your job when asked to "add a skill", "add a plugin", or "change a skill" is to edit
the right files in the layout below and keep the marketplace catalogue in sync.
Read `README.md` (repo overview) and the per-plugin `README.md` for specifics.

## Mental model (read this first)

- A **plugin** is a directory bundling any of: `skills/`, `hooks/`, `commands/`,
  `agents/`, plus a manifest at `.claude-plugin/plugin.json`. Claude Code
  auto-discovers those subdirectories at the plugin root.
- A **skill** is just a `SKILL.md` inside a plugin at
  `skills/<skill-name>/SKILL.md`. A plugin can carry several skills.
- The **marketplace** is `.claude-plugin/marketplace.json` at the repo root. It
  lists every plugin in this repo so `/plugin install` can find them.
- "Add a skill" usually means EITHER add a `skills/<name>/SKILL.md` to an existing
  plugin, OR create a whole new plugin (manifest + marketplace entry). Ask which if
  it is ambiguous; default to a new plugin when the new thing has its own hooks.

## Repo layout

```
agent-skills/                         repo root = marketplace
  .claude-plugin/marketplace.json     catalogue: one entry per plugin
  CLAUDE.md                           this guide
  README.md                           human-facing repo overview
  .gitattributes                      pins LF line endings (keep it)
  <plugin-name>/                      a plugin (one dir per plugin)
    .claude-plugin/plugin.json        manifest (ONLY this file goes in .claude-plugin/)
    README.md                         per-plugin docs
    skills/<skill>/SKILL.md           auto-discovered skills
    hooks/hooks.json                  auto-discovered hook config (optional)
    hooks/*.js                        scripts the hooks invoke (optional)
    commands/, agents/                optional, auto-discovered
```

Current plugins: see the table in `README.md`. As of writing: `using-munch-tools`.

## How to add a NEW plugin (step by step)

1. `mkdir <plugin-name>/.claude-plugin` and write `plugin.json`:
   ```json
   {
     "name": "<plugin-name>",
     "description": "<one line, shown in the plugin manager>",
     "version": "0.1.0",
     "author": { "name": "okazakov", "email": "okazakov@gmail.com" },
     "license": "MIT"
   }
   ```
   `name` and `description` are required. `version` is optional but see "Updating".
   Only `plugin.json` lives in `.claude-plugin/`; everything else is at the plugin
   root.
2. Add content:
   - Skill: `<plugin-name>/skills/<skill>/SKILL.md` with YAML frontmatter
     (`name`, `description`) then the body.
   - Hooks (if any): `<plugin-name>/hooks/hooks.json` using the SAME schema as
     `settings.json` hooks. Reference bundled scripts with `${CLAUDE_PLUGIN_ROOT}`
     (exact casing), e.g.
     `"command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/my-hook.js\""`.
   - Commands: `<plugin-name>/commands/<name>.md`. Agents:
     `<plugin-name>/agents/<name>.md`.
3. Register it in `.claude-plugin/marketplace.json` -> append to `plugins[]`:
   ```json
   { "name": "<plugin-name>", "source": "./<plugin-name>",
     "description": "<one line>", "category": "development" }
   ```
   `source` is a relative path from `marketplace.json` to the plugin dir.
4. Validate, commit, done. Consumers then run
   `/plugin marketplace update agent-skills` and
   `/plugin install <plugin-name>@agent-skills`.

## How to add a skill to an EXISTING plugin

Create `<plugin-name>/skills/<new-skill>/SKILL.md`. No manifest change needed
(skills are auto-discovered). If you want consumers to receive it, bump the
plugin's `version` (see "Updating"). No marketplace.json change is required for a
skill-only addition.

## Hooks: the rules that bite

- Plugin hooks **MERGE** with the user's existing `settings.json` hooks - they do
  not replace them. Installing a plugin never disturbs hooks the user already has.
- Hook event names, matchers, and stdin/stdout JSON are **identical** to
  `settings.json` hooks. SessionStart matcher tokens: `startup|resume|clear|compact`.
  PreToolUse matcher is a regex over the tool name (`Grep|Glob|Bash`).
- A hook script runs from the plugin's CACHE copy
  (`~/.claude/plugins/cache/<id>/`), which is REPLACED on update. So a hook must
  NOT write state (logs, markers, dbs) inside the plugin dir - that data would be
  lost on update. Write to the real config dir instead:
  `process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')`.
  (See `using-munch-tools/hooks/munch-guard.js` for the pattern.)
- To find bundled files, prefer `process.env.CLAUDE_PLUGIN_ROOT`; keep a relative
  `__dirname`-based fallback so the script also works standalone.
- Hooks must fail safe: on any error, exit 0 (allow) and never strand the session.

## Install / test / update commands

```
# Install (one-time marketplace add per machine, then install):
/plugin marketplace add C:/Git/MyCode/agent-skills      # or a git URL once pushed
/plugin install <plugin-name>@agent-skills

# Live-test a plugin WITHOUT installing (references it in place, this session only):
claude --plugin-dir C:/Git/MyCode/agent-skills/<plugin-name>

# Update flow (git pull alone does NOT update consumers - plugins are cached):
#   1. edit files
#   2. BUMP version in <plugin-name>/.claude-plugin/plugin.json
#   3. commit
/plugin marketplace update agent-skills
/plugin update <plugin-name>@agent-skills
```

A consumer enabling a plugin gets `"<plugin-name>@agent-skills": true` written to
`enabledPlugins` in their `settings.json` - that is automatic, do not hand-edit it.

## Updating: version bump is mandatory

If `plugin.json` has a `version`, you MUST bump it for any change to reach
consumers. Pushing commits without bumping does nothing ("already at latest").
Bump `version` in `plugin.json` only (the marketplace entry does not need its own
version). Alternatively, omit `version` entirely and the git commit SHA is used, so
every commit is a new version - choose that only if you want zero-bookkeeping
updates and accept losing explicit version labels.

## Verify before you claim done

Do not assert success. After editing, run:

```
# JSON parses:
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('<plugin-name>/.claude-plugin/plugin.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('<plugin-name>/hooks/hooks.json','utf8'))"   # if hooks
# Hook scripts are syntactically valid:
node --check <plugin-name>/hooks/<script>.js
# A hook behaves: pipe a sample stdin payload and check stdout/exit, e.g.
echo '{"hook_event_name":"SessionStart","source":"startup"}' | CLAUDE_PLUGIN_ROOT="$PWD/<plugin-name>" node <plugin-name>/hooks/<inject>.js
```

For schema questions you cannot answer from here, the `claude-code-guide` agent or
the official docs (code.claude.com/docs/en/plugins-reference, .../plugin-marketplaces,
.../hooks) are the source of truth - the schema is version-sensitive, so verify
against the installed build rather than guessing.

## Conventions

- **Forward slashes in every path**, in docs, configs, and code. Valid on Windows,
  macOS, and Linux. Never write backslash paths.
- **Never use the long-dash character.** Use a regular hyphen.
- **Node.js** must be on PATH for any plugin whose hooks are Node scripts; say so in
  that plugin's README and prerequisites.
- Keep `.gitattributes` (LF pinning) so hook scripts behave identically across
  machines.
- Commit messages start with `Feature:`, `Fix:`, or `Improvement:` and never
  mention Claude co-authoring.
- Each plugin carries its own `README.md` (what it does, prerequisites, modes,
  uninstall). Keep it current when you change behavior.
