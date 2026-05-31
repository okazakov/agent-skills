---
name: using-munch-tools
description: Use when about to search code or docs - establishes that jcodemunch (code) and jdocmunch (docs) are the only sanctioned search path, routing native Grep/Glob/search-Bash through them instead
---

You have jcodemunch and jdocmunch: a code-navigation server and a doc-navigation
server, both audited and pinned. They are your ONLY sanctioned way to SEARCH.

If you are about to search code or docs - even a single quick grep, even one glob,
even "just to check" - you ABSOLUTELY MUST use jcodemunch (code) or jdocmunch
(docs) instead of the native Grep, Glob, or search-style Bash tools.

THIS IS NOT A PREFERENCE. For searching, you do not have a choice. The native
search tools feel faster because of habit; that habit is exactly the failure mode
this rule exists to defeat. You cannot rationalize your way out of it.

## What counts as "searching" (use the munch tools)
- finding a symbol / function / class / route -> jcodemunch search_symbols (semantic=true)
- finding a string / comment / config value in code -> jcodemunch search_text
- understanding a file before opening it -> jcodemunch get_file_outline
- finding files by pattern / repo layout -> jcodemunch get_file_tree / get_repo_outline
- finding anything in docs / markdown -> jdocmunch search_sections / get_toc
- reading a doc section -> jdocmunch get_section

## Carve-outs (native tools ARE allowed here - do not over-correct)
- Read a specific file you already know the path of (e.g. before an Edit): use Read.
- git / npm / build / test / file-move Bash commands: allowed.
- Checking one known path's existence: Read it, or `test -f <path>`.

## Red Flags - these thoughts mean STOP, you are sliding back
| Thought | Reality |
|---|---|
| "I'll just grep real quick" | A quick grep is still a search. Use jcodemunch search_text. |
| "It is one tiny find" | One find is a search. Use jcodemunch get_file_tree. |
| "The munch tool is overkill here" | It is one call. Use it. |
| "I already know roughly where it is" | Then the search is cheap - via the munch tool. |
| "Native is what I'm good at" | That habit is the bug. Use the munch tool. |
| "I'll use the munch tool next time" | Next time is now. |

A PreToolUse guardrail watches every search. If you reach for native search it will
fire an immediate reminder to reroute - heed it the FIRST time and route correctly,
so the reminder never has to repeat.
