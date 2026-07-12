# Triage Labels

This file defines the status strings used in this repo's local markdown issue tracker. A ticket's `Status:` line carries one of these values, and each maps to a board folder under `docs/issue-tracker/` (see `docs/agents/issue-tracker.md`).

## Triage statuses

The pre-work funnel.

| Status | Board folder | Meaning |
| --- | --- | --- |
| `needs-triage` | `00-triage` | Maintainer needs to evaluate this issue |
| `needs-info` | `00-triage` | Waiting on reporter for more information |
| `ready-for-agent` | `10-ready` | Fully specified, ready for an unattended agent |
| `ready-for-human` | `10-ready` | Requires human implementation |
| `wontfix` | `wontfix` | Will not be actioned |

## Lifecycle statuses

Once an issue is picked up it moves through the implementation lifecycle.

| Status | Board folder | Meaning |
| --- | --- | --- |
| `in-progress` | `20-in-progress` | Actively being implemented |
| `blocked` | `30-blocked` | Work started but stalled; the ticket body records why |
| `in-review` | `40-in-review` | Implementation complete, awaiting independent review |
| `done` | `50-done` | All acceptance criteria checked and review clean |

When recording state, write the matching status string in a `Status:` line near the top of the local markdown file, then rebuild the board so the ticket's hard link lands in the corresponding folder.
