# setup-issue-tracker (Claude Code plugin)

Installs a **local, markdown, status-board issue tracker** into whatever repo you
point it at. No SaaS, no database - just committed markdown and a rebuildable
view.

Two parts:

- **Canonical tickets** live flat in `docs/issues/NN-slug.md`, one file per
  ticket, committed. Each carries a `Status:` line. Their paths are permalinks
  other docs can reference, so they never move.
- **The board** under `docs/issue-tracker/<phase>/` is a local, **gitignored,
  rebuildable** view: each ticket is hard-linked into the phase folder matching
  its `Status:` line. Only the canonical tickets are committed; the board is
  regenerated from them, so it can never drift and is never a source of truth.

Hard links (not symlinks) are used so tools like Obsidian show board entries as
ordinary files rather than ignoring them. Because the board is gitignored, git's
non-preservation of hard links does not matter - a fresh clone just rebuilds it.

## The skill

`setup-issue-tracker` is a manual skill (`disable-model-invocation: true`) - you
invoke it explicitly; the model will not auto-run it. It takes one optional
argument, the mode:

- **`auto`** (default): scaffold the tracker with sensible defaults, prompting
  only on a genuine ambiguity or an existing tracker.
- **`interactive`**: confirm every material choice first, one decision at a time.

Adopting a repo that already tracks issues (migration) is always operator-led,
in both modes.

The skill ships no executable: it performs each step itself with commands
appropriate to the host OS/shell (POSIX, Windows PowerShell, or cmd for the
hard-link step). The installable docs it copies in live in `skills/
setup-issue-tracker/templates/`:

| Template | Installed to |
|---|---|
| `issue-tracker.md` | `docs/agents/issue-tracker.md` (the workflow) |
| `triage-labels.md` | `docs/agents/triage-labels.md` (the status vocabulary) |
| `issues-README.md` | `docs/issues/README.md` |
| `agents-pointer.md` | woven into the repo's `AGENTS.md` / `CLAUDE.md` |

## Layout

```
setup-issue-tracker/                        (plugin root)
  .claude-plugin/plugin.json                manifest
  README.md                                 this file
  skills/setup-issue-tracker/
    SKILL.md                                the skill
    templates/                              docs copied into the target repo
```

## Prerequisites

- A git repository to install into (the tracker commits markdown and adds a
  `.gitignore` rule for the board).
- A shell whose platform can create **hard links** on the repo's filesystem
  (POSIX `ln`, PowerShell `New-Item -ItemType HardLink`, or cmd `mklink /H`).
  The board and `docs/` are always on the same volume, so this holds normally.

No Node.js needed - this plugin ships no hooks or scripts.

## Install

```
/plugin marketplace add https://github.com/okazakov/agent-skills.git
/plugin install setup-issue-tracker@oleg-agent-skills
```

Then, in a target repo, invoke the `setup-issue-tracker` skill (optionally with
`auto` or `interactive`).

## Uninstall

```
/plugin uninstall setup-issue-tracker@oleg-agent-skills
```

Uninstalling removes the plugin, not any tracker it already installed into a
repo. To remove a tracker from a repo, delete `docs/issues/`,
`docs/issue-tracker/`, the installed docs under `docs/agents/`, the woven pointer
in the agent-instructions file, and the `docs/issue-tracker/*` `.gitignore` rule.
