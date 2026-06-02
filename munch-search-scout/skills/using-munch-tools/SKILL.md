---
name: using-munch-tools
description: Use when about to search code or docs - on the main thread, delegate the search to the disposable search-scout subagent; in a subagent, search directly through jcodemunch (code) and jdocmunch (docs) instead of native Grep/Glob/Bash
---

# munch-search-scout routing

This skill has two role-scoped halves. The voice hook injects exactly one: the
main thread receives the delegation half (for the active mode); a subagent
receives the routing half. Read the half that was injected for you.

<!-- SCOUT:DELEGATION:COMMON:START -->
## Main-thread search delegation

You have a disposable `search-scout` subagent: hand it a search GOAL and it runs
the entire multi-step retrieval in its own context, returning only the distillate
so the search churn (file listings, rejected matches, dead-end queries) never
lands in your context window. How strongly you are expected to delegate (versus
search directly) depends on the active mode, stated at the end of this rule.
Dispatch the scout with your subagent-dispatch tool (the `Agent` / `Task` tool).

How to delegate:
- Give the scout a GOAL ("find where X is implemented", "what docs cover Y"), not
  step-by-step tool instructions - it owns the retrieval and iterates internally.
- If you already know you will edit specific hits, ask it to inline their source
  so you do not have to re-read them.

What the scout returns (the only thing you see):
- `goal_understood` - its restatement of your brief (catch a misread cheaply).
- `answer` - tight synthesis, or an explicit negative result.
- `locators` - file:line, symbol names/IDs, doc section IDs.
- `inlined_source` - only for hits you asked it to inline.
- `confidence` + `coverage` - what it searched and what it ruled out.

Post-return protocol:
- Trust by default and read the transparent return. Most outcomes need nothing
  more.
- A confident "found nothing" is a VALID, complete answer. Report the gap; do NOT
  re-search or assume a nearby file implements the missing thing.
- Escalate only on a concrete signal the search itself was incomplete or
  unreliable (low confidence with an addressable cause, a flagged coverage gap,
  internal inconsistency, contradiction with known facts). Cheapest first: read a
  returned locator, then cause-directed re-dispatch - fix the cause (index the
  repo, sharpen the brief), not a blind retry. If it cannot be fixed in a bounded
  number of re-dispatches, surface to the user.
- A spot-check `Read` of a returned locator is MANDATORY before any
  high-blast-radius or irreversible action.

You may still do these yourself (no scout needed):
- `Read` a specific file whose path you already know (e.g. before an `Edit`).
- git / npm / build / test / file-move `Bash` commands.
- Checking one known path's existence.
<!-- SCOUT:DELEGATION:COMMON:END -->

<!-- SCOUT:DELEGATION:MODE:hardwall:START -->
Mode: **hardwall** (strict). You do NOT search code or docs yourself on the main
thread. Every search - munch search/retrieval AND native Grep/Glob/search-Bash -
is blocked by the guard, so your only search recourse is dispatching `search-scout`
(or cause-directed re-dispatch). Index-management calls (reindex, register-edit)
still work.
<!-- SCOUT:DELEGATION:MODE:hardwall:END -->

<!-- SCOUT:DELEGATION:MODE:fastpath:START -->
Mode: **fastpath** (compromise). Broad or exploratory search is blocked and must
go to `search-scout`; a narrow pinpoint lookup of something you already
identified (a known symbol's source, a known file's outline, a named symbol's
references) may go through directly. Prefer delegating any multi-step retrieval.
Do NOT request semantic search - it is treated as broad and blocked; lexical is
the default.
<!-- SCOUT:DELEGATION:MODE:fastpath:END -->

<!-- SCOUT:DELEGATION:MODE:nudge:START -->
Mode: **nudge** (soft). Nothing is blocked - searching yourself is fine. The win
still comes from delegation, so prefer handing multi-step retrieval to
`search-scout` to keep the churn out of your context; reach for it on the big
sweeps. For a trivial single lookup, searching directly is perfectly fine. Your
call.
<!-- SCOUT:DELEGATION:MODE:nudge:END -->

<!-- SCOUT:SUBAGENT-ROUTING:START -->
## Subagent search routing

You are a subagent. You search DIRECTLY with the munch tools - you cannot nest or
dispatch your own scout. jcodemunch (code) and jdocmunch (docs) are your ONLY
sanctioned search path; use them instead of native Grep, Glob, or search-style
Bash.

What counts as searching (use the munch tools):
- finding a symbol / function / class / route -> jcodemunch `search_symbols`
  (lexical by default; semantic only when lexical underperforms).
- finding a string / comment / config value in code -> jcodemunch `search_text`.
- understanding a file before opening it -> jcodemunch `get_file_outline`.
- finding files by pattern / repo layout -> jcodemunch `get_file_tree` /
  `get_repo_outline`.
- finding anything in docs / markdown -> jdocmunch `search_sections` / `get_toc`.
- reading a doc section -> jdocmunch `get_section`.

Carve-outs (native tools ARE allowed here):
- `Read` a specific file you already know the path of (e.g. before an `Edit`).
- git / npm / build / test / file-move `Bash` commands.
- Checking one known path's existence: `Read` it, or `test -f <path>`.

Red Flags - these thoughts mean STOP, you are sliding back:
| Thought | Reality |
|---|---|
| "I'll just grep real quick" | A quick grep is still a search. Use jcodemunch search_text. |
| "It is one tiny find" | One find is a search. Use jcodemunch get_file_tree. |
| "The munch tool is overkill here" | It is one call. Use it. |
| "I already know roughly where it is" | Then the search is cheap - via the munch tool. |

Subagent tool calls are always allowed (the wall is main-thread only), so no
reminder will fire - but route through munch anyway so your retrieval rides the
index.
<!-- SCOUT:SUBAGENT-ROUTING:END -->
