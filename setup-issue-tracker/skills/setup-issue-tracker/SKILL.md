---
name: setup-issue-tracker
description: Install the local-markdown status-board issue tracker into the current repo.
argument-hint: "[auto|interactive]"
disable-model-invocation: true
---

Install the **status board** issue tracker into the current repository: canonical ticket files live flat in `docs/issues/` as committed permalinks, and a board under `docs/issue-tracker/` shows each ticket's phase. The board is a local, gitignored, rebuildable view: each ticket is hard-linked into the phase folder matching its `Status:` line. Only the canonical tickets are committed; the board is regenerated from them, so it can never drift and is never a source of truth.

Hard links (not symlinks) are used because tools like Obsidian ignore within-vault symlinks but show hard links as ordinary files. Because the board is gitignored, git's non-preservation of hard links does not matter.

This skill ships no executable. You perform each action yourself with commands appropriate to the platform you are running on. The installable docs live in `templates/` beside this file:

```
SKILL_DIR="$HOME/.claude/skills/setup-issue-tracker"   # adjust for your OS if not a POSIX shell
```

Work against the repository root (the current working directory unless the operator says otherwise).

## Execution mode

This skill takes one optional argument, the mode. Read it before doing anything and let it govern how much you decide versus ask:

- **`auto`** (the default, used whenever no argument is given): set the tracker up with sensible defaults, prompting only when a genuine ambiguity or an existing tracker forces a decision. Report what you did.
- **`interactive`**: the operator leads with precision. Confirm every material choice with them before acting, one decision at a time, even in a clean greenfield repo. Do not apply a default without their say-so.

The argument need not be a literal `auto`/`interactive`. Read the operator's intent from whatever they wrote: phrasings like "manual", "guide me", "step by step", or "-i" mean interactive; "just do it", "go ahead", or silence mean auto. Only ask which mode they meant when the wording is genuinely ambiguous.

Migrating an existing tracker (Step 3) is operator-led in **both** modes, because migration decisions are never yours to assume. The mode only changes how much a greenfield setup (Step 2) confirms before acting.

## Step 0: Know your platform

Before running any command, determine the OS and shell you are operating in, and use matching commands for the rest of the run. The only step that genuinely diverges by platform is creating a hard link:

- **macOS / Linux / any POSIX shell:** `ln <canonical-file> <board-link>` (no `-s`)
- **Windows PowerShell:** `New-Item -ItemType HardLink -Path <board-link> -Target <canonical-file>`
- **Windows cmd:** `mklink /H <board-link> <canonical-file>`

Hard-link caveats to keep in mind, none of them blocking because the board is disposable:

- A hard link only works when both paths are on the **same filesystem/volume**. A repo and its own `docs/` always are.
- Some editors save by writing a temp file and renaming it over the original, which **breaks the hard link** (the board copy becomes a separate file and stops tracking edits). This is harmless here: the board is regenerated from the canonical tickets, so just rebuild it (see "Rebuilding the board"). Always edit the canonical file in `docs/issues/`, not the board copy.
- Hard links need no special permission on any platform (unlike Windows symlinks).

Everything else (creating directories, empty files, copying, reading files) has a natural equivalent on every platform; use it.

Completion criterion: you know your OS/shell and the hard-link command you will use.

## Step 1: Read the terrain

Determine whether this repo already tracks issues. Look for `docs/issues/`, an existing issue tracker (GitHub issues in use, a `TODO`/`BACKLOG` file, a `.github/ISSUE_TEMPLATE`, an existing `docs/agents/issue-tracker.md`), and any files that look like tickets.

- **No existing issue tracking** (greenfield): go to Step 2. Stray scaffolding docs with no actual tickets behind them (a lone `docs/agents/triage-labels.md`, an empty `docs/issues/`, a `.gitkeep`-only board) still count as greenfield; the non-overwrite rule in Step 2 preserves whatever is already there.
- **Existing tickets in any form** (real ticket files, a populated backlog, live GitHub issues): go to Step 3.

In `interactive` mode, confirm your read of the terrain with the operator before proceeding, and let them override the branch (for example, force a full migration even if you saw only a stray doc).

Completion criterion: you can state which branch applies and why.

## Step 2: Greenfield scaffold

In `interactive` mode, surface each decision below to the operator before you act (docs root, which agent-instructions file to weave into, whether to seed an example ticket, and whether to stage or commit), one at a time, and follow their answers. In `auto` mode, apply the defaults described and report what you did.

1. Create the board skeleton: under `docs/issue-tracker/`, make the seven phase folders `00-triage`, `10-ready`, `20-in-progress`, `30-blocked`, `40-in-review`, `50-done`, `wontfix`, each containing an empty `.gitkeep` file. The `.gitkeep` files are the only board content that is committed; they keep the empty phase folders in git.

2. Gitignore the board's contents so the hard links are never committed, while keeping the folders. Add to the repo's `.gitignore` (create it if absent):
   ```
   docs/issue-tracker/*/*
   !docs/issue-tracker/*/.gitkeep
   ```

3. Create `docs/issues/` and `docs/agents/` if absent. A directory that already holds a tracked file (for example `docs/issues/` once `README.md` lands in step 4) needs nothing extra; add a `.gitkeep` only to a directory you would otherwise leave empty.

4. Copy the workflow docs into place. Check each destination first and copy only if it is absent, so you never clobber a doc the repo already has (if one exists, keep it and tell the operator):
   - `templates/issue-tracker.md` -> `docs/agents/issue-tracker.md`
   - `templates/triage-labels.md` -> `docs/agents/triage-labels.md`
   - `templates/issues-README.md` -> `docs/issues/README.md`

5. Weave the pointer in `templates/agents-pointer.md` into the repo's agent-instructions file (`AGENTS.md`, or `CLAUDE.md` if that is the convention here) so future agents find the tracker. Place it under the file's agent-skills or conventions section if one exists, otherwise append it after the last existing section. Its sections are authored at H2, which drops in verbatim under an H1 title or beside existing H2 sections; only shift the heading level if the pointer needs to sit at a different depth to match the surrounding structure. If no such file exists, create one with an H1 title (for example `# Agent Instructions`) and add the pointer beneath it.

6. If the repo uses a docs root other than `docs/`, adapt the installed paths (including the `.gitignore` rule) to match and tell the operator what you changed.

7. Stage the new files (`git add -A`). Only the `.gitkeep` files, the docs, and `.gitignore` are tracked; the board hard links are ignored. Commit only if that matches the repo's workflow; otherwise leave the change staged for the operator.

Completion criterion: the phase folders exist, the board contents are gitignored, the three docs are present, the pointer is woven in at a sensible heading level, and the new files are staged. Report the tree and stop.

## Step 3: Adopt an existing tracker (interactive)

An existing tracker means migration, and migration is the operator's call, not yours. Switch into an interactive, operator-led session: you supply the knowledge of both systems, they steer.

First, understand what exists. Inventory the current practice: where tickets live, their id scheme, what states/labels they use, and roughly how many there are. Reconcile the count: note any entries that exist only as a backlog line with no ticket body, and any ticket files not listed in the backlog, so the operator can tell you how to treat each. Summarize it all back so the operator can correct you.

Then hand them the wheel with concrete questions, one decision at a time. Cover at least:

- **Convert or coexist**: migrate the existing tickets into `docs/issues/` + the board, or stand the board up fresh alongside the old system and migrate later.
- **Id scheme**: default to preserving each ticket's existing id as its permanent `NN-` prefix (zero-pad for consistent sorting, for example `3` becomes `03`, but keep the number). Renumber only if the operator explicitly asks, and warn first that ids become permalinks other docs may already reference, so renumbering is a one-time cost and can break outside links.
- **Status mapping**: map each existing state/label onto the board's status vocabulary (`templates/triage-labels.md`). Propose a mapping; let them adjust it.
- **Scope**: all tickets, or only open ones (closed ones map to `50-done`). For backlog-only entries with no body, decide per the operator: stub a canonical file or skip.
- **Old sources**: what happens to the pre-existing files once converted (delete them, or keep them read-only alongside). Default to deleting, so the canonical folder is not duplicated.

Once the operator has decided, execute:

- Do the Step 2 scaffold for the folders, gitignore, and docs. If a workflow doc was preserved because it already existed (Step 2.4), reconcile the woven pointer text with the kept doc, or tell the operator the pointer's blurb may not match their custom file, rather than describing a vocabulary the repo does not use.
- For each in-scope ticket, write its canonical `docs/issues/NN-slug.md` with a `Status:` line, then hard-link it into the matching phase folder with your platform's command from Step 0.
- Retire the old sources per the operator's decision: when converting, remove the pre-existing ticket files and any old backlog/index file (`git rm` if tracked) so `docs/issues/` ends up holding only the new canonical `NN-slug.md` files. A renumbered old file left behind (for example `1-foo.md` next to the new `01-foo.md`) becomes a second, unlinked canonical ticket.
- Update references to any renamed ticket. Whenever a ticket's id or filename changes (renumbering, or a slug rewrite), every reference to the old name elsewhere in the repo goes stale. Search the whole repo (docs, specs, ADRs, code comments, CI config, links between tickets), grepping several spellings of the old ticket so you do not miss any: the old filename (`5-alpha.md`), path (`issues/5-alpha`), and bare-id forms (`issue 5`, `#5`, `ticket 5`). Anchor bare-id searches to a word boundary so `issue 5` does not also match `issue 50` or `5 languages`, for example `grep -rnE 'issue 5\b|#5\b|ticket 5\b'`. Run this search once per renamed ticket, and be especially careful with single-digit old ids (`#2` collides with `#250` without the `\b`). Rewrite each confirmed hit to the new name: full-path references become the new `docs/issues/NN-slug.md` path; a bare prose id becomes the new zero-padded id (for example `issue 5` becomes `issue 01`), or upgrade it to the full path where that reads naturally. A bare number is ambiguous, so do not auto-rewrite a bare-number hit you are not sure refers to the ticket; hand it to the operator. This is the main cost of renumbering and the reason preserving ids is the default. Report any reference you could not confidently resolve rather than guessing.
- Stage everything (`git add -A`); the board hard links stay ignored. Commit only if that matches the repo's workflow.

Per-ticket sequence (renumbering example, POSIX shell):

```
git mv docs/issues/1-foo.md docs/issues/01-foo.md   # rename the canonical file, preserving history
# edit docs/issues/01-foo.md so its Status: line reads the mapped value
ln docs/issues/01-foo.md docs/issue-tracker/10-ready/01-foo.md   # hard link onto the board
```

If the body is being rewritten rather than renamed, write the new `docs/issues/NN-slug.md`, `git rm` the old file, then hard-link it. Retire the old backlog/index file the same way (`git rm`). Note: git may render a rename-plus-status-edit as `R old -> new` in `git status`; that is expected and does not mean the old file is still present.

Keep the operator in the loop across the run; do not silently make migration decisions they did not authorize.

Completion criterion: `docs/issues/` holds exactly the in-scope canonical tickets and no orphaned old files, each is hard-linked into the operator-approved phase folder, all references to any renamed ticket have been updated repo-wide (or reported as unresolved), the docs and pointer are installed, the change is staged, and you have reported what was migrated and anything left for the operator to finish.

## Rebuilding the board

The board is a derived view, so it can be regenerated from the canonical tickets at any time, and must be after a fresh clone (a clone has only the empty phase folders). Rebuilding means: for every `docs/issues/NN-slug.md`, read its `Status:` line, and hard-link the file into the matching phase folder, after clearing each phase folder of everything except its `.gitkeep`. POSIX example:

```
for d in docs/issue-tracker/*/; do find "$d" -type f ! -name .gitkeep -delete; done
find docs/issues -maxdepth 1 -type f -name '[0-9]*.md' | while read -r t; do
  st=$(sed -n '/^Status:/{s/^Status:[[:space:]]*//;s/[[:space:]]*$//;p;}' "$t" | head -1)   # `st`, not `status` (readonly in zsh); trims surrounding space
  case "$st" in
    needs-triage|needs-info)         phase=00-triage ;;
    ready-for-agent|ready-for-human) phase=10-ready ;;
    in-progress)                     phase=20-in-progress ;;
    blocked)                         phase=30-blocked ;;
    in-review)                       phase=40-in-review ;;
    done)                            phase=50-done ;;
    wontfix)                         phase=wontfix ;;
    *) echo "skip $t: unknown Status '$st'" >&2; continue ;;
  esac
  ln "$t" "docs/issue-tracker/$phase/$(basename "$t")"
done
```

The `find` form iterates zero tickets cleanly (a bare glob would abort under zsh's `NOMATCH` when `docs/issues/` has no tickets yet). On Windows, use the hard-link command from Step 0 in place of `ln`. A project may wrap this in its own script or task runner if it rebuilds often; the skill does not install one.

## The board model (reference)

- `docs/issues/NN-slug.md`: canonical ticket, flat, immutable, committed. Its path is a permalink; other docs reference it and it must never move.
- `docs/issue-tracker/<phase>/NN-slug.md`: a hard link to the canonical ticket, representing its current phase. Gitignored and disposable.
- Phase change = update the ticket's `Status:` line, then rebuild the board (or move that one hard link between folders).

The full workflow the skill installs is `templates/issue-tracker.md`; the status vocabulary is `templates/triage-labels.md`. There is no automated guard; the board is simply regenerated from the canonical `Status:` lines.
