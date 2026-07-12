# Issue Tracker: Local Markdown

Issues and PRDs for this repo live as durable markdown documents in `docs/`.

## Conventions

- Durable PRDs live in `docs/prds/`.
- Durable implementation issues live in `docs/issues/`.
- Temporary workspace (for example `.scratch/`) must not hold durable PRDs, specs, plans, or implementation tickets.
- PRD filenames use a stable feature slug, for example `docs/prds/browsing-and-messaging.md`.
- Implementation issue filenames use a numeric prefix and a short slug, for example `docs/issues/12-navigation-guardrails.md`. The numeric prefix is the ticket's permanent id.
- Triage and lifecycle state is recorded as a `Status:` line near the top of each PRD or issue file. Use the status strings from `docs/agents/triage-labels.md`.
- Comments and conversation history may append to the bottom of a file under a `## Comments` heading when useful.

## Status Board

Implementation issues progress through a status board under `docs/issue-tracker/`. This is separate from `docs/issues/` on purpose:

- **`docs/issues/`** holds the canonical ticket markdown files and is the committed source of truth. A ticket's path here is a permalink: it never moves and never changes, so other docs, specs, ADRs, and code comments can reference `docs/issues/NN-slug.md` safely. **Always reference tickets by their canonical `docs/issues/` path, never by a board path.**
- **`docs/issue-tracker/`** is the board: a local, disposable view that answers "what phase is everything in" at a glance. It contains only status folders, and each ticket appears there as a hard link to its canonical file. The board contents are gitignored (only the empty phase folders are committed, via `.gitkeep`) and are regenerated from the canonical tickets, so nothing here is ever a source of truth. Hard links (not symlinks) are used because tools like Obsidian ignore within-vault symlinks but show hard links as ordinary files.

Status folders, in pipeline order:

| Folder | Status values | Phase |
| --- | --- | --- |
| `00-triage` | `needs-triage`, `needs-info` | Maintainer evaluating, or waiting on info |
| `10-ready` | `ready-for-agent`, `ready-for-human` | Fully specified, ready to pick up |
| `20-in-progress` | `in-progress` | Actively being implemented |
| `30-blocked` | `blocked` | Started but stalled; ticket body records why |
| `40-in-review` | `in-review` | Implementation done, awaiting independent review |
| `50-done` | `done` | All acceptance criteria checked, review clean |
| `wontfix` | `wontfix` | Terminal; will not be actioned |

### How the board stays correct

Because the board is a hard-link view generated from each ticket's `Status:` line, it can never disagree with the tickets: regenerate it (see **Rebuilding the board**) whenever it looks stale or after a fresh clone. A rebuild yields exactly one board hard link per canonical ticket, in the phase folder matching its `Status:` line.

### Moving a ticket between phases

1. Update the `Status:` line in the canonical `docs/issues/NN-slug.md` to the new phase's value.
2. Rebuild the board (or move that one hard link to the destination folder).

Never move or rename the canonical file in `docs/issues/`.

### New tickets

A canonical ticket file has a `Status:` line near the top, then a title and body. Minimal skeleton:

```
Status: needs-triage

# Short ticket title

One-paragraph description of the problem or change.

## Acceptance criteria

- [ ] ...
```

Add the canonical file to `docs/issues/`, then rebuild the board to place its hard link.

### Rebuilding the board

The board is derived, so regenerate it any time (and always after a fresh clone, which has only the empty phase folders). Rebuilding means: clear each phase folder except its `.gitkeep`, then for every `docs/issues/NN-slug.md`, read its `Status:` line and hard-link the file into the matching phase folder. POSIX example:

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

The `find` form iterates zero tickets cleanly (a bare glob would abort under zsh's `NOMATCH` when `docs/issues/` has no tickets yet). On Windows, create the hard link with `New-Item -ItemType HardLink` (PowerShell) or `mklink /H` (cmd). A project that rebuilds often may wrap this in its own script or task runner.

### Hard-link notes

The board contents are gitignored, so hard links are never committed and git's non-preservation of them is irrelevant. A hard link only works within one filesystem (a repo and its own `docs/` always qualify). Some editors save by writing a temp file and renaming over the original, which breaks the hard link; that is harmless because the board is regenerated. Always edit the canonical file in `docs/issues/`, not the board copy.

## Publishing To The Issue Tracker

Create a new durable markdown file in `docs/prds/` for PRDs and `docs/issues/` for implementation issues. For an implementation issue, give it a `Status:` line and rebuild the board.

Do not publish important planning, spec, PRD, or issue documents under temporary workspace.

## Fetching A Ticket

Read the referenced markdown file from `docs/prds/` or `docs/issues/`. The canonical `docs/issues/NN-slug.md` path is the stable reference.
