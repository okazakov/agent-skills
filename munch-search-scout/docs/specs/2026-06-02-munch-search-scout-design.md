# Design spec: `munch-search-scout`

- Status: approved design (pre-implementation), revision v6
- Date: 2026-06-02
- Author: okazakov
- Supersedes: `using-munch-tools` (this plugin is a replacement superset, not an add-on)
- v2 note: incorporates the design + plan review (2026-06-02). Changes: fully-qualified
  tool-name classification; arg-aware `fastpath`; enumerated scout tool allowlist;
  `plan_turn`/`get_session_context` removed from the hardwall allowlist; role-scoped
  SKILL.md split; honest accounting of destination reads, latency, and lost munch
  session continuity; "no results" treated as a normal outcome; dispatch-tool naming
  kept name-robust.
- v3 note: the plugin CREATES the mode file itself (default `hardwall`, create-if-absent
  on SessionStart); the operator edits it with any editor. All operator-facing
  PowerShell and UTF-16/encoding handling removed - it is a plain one-word UTF-8 file.
- v4 note: second review round. Bootstrap hardened (exclusive-create `wx`; its own
  try/catch that CONTINUES rather than exits; gated to the `SessionStart` event only);
  documented that `.trim()` already absorbs a UTF-8 BOM so no encoding code is needed
  (a UTF-16 save fails safe to `hardwall`); clarified `plan_turn`/`resolve_repo`
  scout-vs-main-thread; added named-symbol relationship lookups to the fastpath PINPOINT
  set; guard fail-open-on-unparseable made explicit.
- v5 note: third review round (independent fresh reviewer). Status line corrected to
  match the revision; the PreToolUse matcher is now stated in 5.2 (the fork's
  `Grep|Glob|Bash` alone would leave munch search unguarded); `~/.claude/munch-scout.log`
  added to the 5.1 state-file list; `get_section_excerpt` added to the scout allowlist to
  match the fastpath PINPOINT set.
- v6 note: plan-vs-spec review round (two independent reviewers). Enumerated the real
  jdocmunch mgmt verbs in 5.2 (jdocmunch does NOT share jcodemunch's mgmt names, so
  `/j-index`'s `index_local` must be explicitly allowlisted or it breaks under hardwall);
  made 5.4 the canonical scout-tools home (removed the circular "pinned in the plan"
  reference).

## 1. Context and problem

The existing `using-munch-tools` plugin forces code/doc *search* through the
jcodemunch (code) and jdocmunch (docs) MCP servers instead of native Grep/Glob/Bash.
That makes search faster (it rides their indices), but it does **not** conserve the
**main agent's context window**. Every verbose intermediate the search produces - file
listings, rejected symbol matches, dead-end queries, broad outlines - still lands in
the main thread and stays there for the rest of the session.

For long agentic sessions, that accumulated search churn is a real cost: it crowds out
the working context the main agent needs for the actual task.

## 2. Goals and non-goals

**Goals**

- Conserve the main agent's context window by keeping search *churn* out of it.
- Delegate searching to a disposable subagent whose context is torn down after use.
- Preserve a clean, reversible rollback to the current `using-munch-tools` behavior.
- Keep enforcement tunable, from a soft nudge to a hard wall.

**Non-goals**

- Minimizing *total* token cost or latency across all agents (the explicit goal is
  main-thread context, not aggregate cost; scout tokens/latency are a secondary,
  separately tunable concern - see the honest accounting in section 7).
- Eliminating the main agent's *destination* reads. The scout removes the search churn,
  not the act of reading the specific code the main agent then edits (section 7).
- Installing the munch MCP servers (configured separately, as today).
- Changing how *subagents* search (they keep searching with munch directly).

## 3. Premise and the pattern

Completely delegate searching to a dedicated **Search Scout** subagent. The main agent
hands the scout a *goal*; the scout uses its own dispensable context as scratch space
for the munch tools, runs the entire multi-step retrieval internally, returns a compact
result, and is torn down per query - taking all the search churn with it. The main
thread only ever sees the distillate.

This is the proven "context firewall" / research-subagent pattern. The harness's own
built-in `Explore` agent works exactly this way: it sweeps many files and returns only
the conclusion, reading excerpts rather than whole files, so the verbose middle never
touches the caller's context.

The win is on the *search iteration*, and it scales with how multi-step the search is.
It is near-zero (and net-negative on latency and total tokens) for a single trivial
lookup, and it does not remove the reads the main agent must do on the few locations it
actually edits. That asymmetry is the entire reason a mode switch exists: the operator
chooses how aggressively to force delegation.

## 4. Settled design decisions

| Decision             | Choice                                                                                                                                                                                        | Rationale                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Packaging            | New plugin replacing `using-munch-tools` (a superset). Mutually exclusive - never enable both.                                                                                                | Clean uninstall/reinstall rollback; the proven original stays pristine. Two voices + two guards would contradict and double-log if both ran.                  |
| Enforcement          | Three-mode switch (`nudge` / `fastpath` / `hardwall`), default `hardwall`, scoped to the **main thread only**.                                                                                | Mirrors the existing observe/warn/block ladder. Subagents cannot nest, so they keep searching directly.                                                       |
| Scout lifetime       | **Per-query disposable**: one fresh scout per search, torn down after.                                                                                                                        | Matches the premise and maximizes isolation. The lost munch session continuity is the cheap Sonnet scout's, not the main agent's (accepted trade, section 7). |
| Scout role           | Thick / goal-owning: retrieval + retrieval-shaped reduction. No task reasoning.                                                                                                               | The thin pass-through has the worst economics. The win comes from offloading the *iteration churn*, not one final call.                                       |
| Return contract      | Trust + transparent return: lean answer (synthesis + locators) plus goal-interpretation + confidence/coverage + "what I ruled out". Brief may request inlined source for named hits.          | The main thread stays lean; the transparency fields hand back the sliver of situational awareness that compression discards.                                  |
| Verification posture | Main agent trusts by default and sanity-*reads* the return. An active spot-check (one `Read` of a returned locator) is reserved for results feeding high-blast-radius / irreversible actions. | A standing verification habit would rebuild the round-trips we are eliminating. A scout using the same tools and goal produces near-equivalent retrieval.     |
| Scout model          | Pinned `sonnet`.                                                                                                                                                                              | Cheap disposable searcher. Weakens scout/main parity, which makes the transparent return + cause-directed re-dispatch load-bearing rather than optional.      |

### The scout's boundary (load-bearing)

The scout does **retrieval and retrieval-shaped reduction**: list, filter, locate,
cross-reference, dedupe, rank, map relationships, summarize *what exists*. It does
**not** do **task reasoning**: deciding what to change, judging correctness, designing a
fix, or writing code. Litmus test: *"what / where is X"* is the scout's job; *"what
should we do about X"* is the main agent's.

This boundary is enforced **structurally** by the scout's `tools` allowlist (section
5.4), not by prose alone: the scout is given retrieval/navigation/relationship tools and
is denied the munch impact/refactor/health/diagram/mutation tools that would let it
drift into task reasoning.

## 5. Architecture

Three cooperating pieces, all reading one **mode** config file.

```
munch-search-scout/                       (plugin root = ${CLAUDE_PLUGIN_ROOT})
  .claude-plugin/plugin.json              manifest
  README.md                               modes, mutual-exclusivity, swap/rollback
  agents/search-scout.md                  the scout (model: sonnet, enumerated tools, the contract)
  skills/using-munch-tools/SKILL.md        role-split cheat-sheet (forked; dir name kept)
  hooks/
    hooks.json                            SessionStart + SubagentStart + PreToolUse
    scout-inject.js                       VOICE: mode-aware + role-aware injection
    scout-guard.js                        GUARD: mode-aware main-thread enforcement
  docs/
    specs/                                this document
    plans/                                the implementation plan
```

### 5.1 Mode config (single source of truth)

- File: `~/.claude/munch-scout-mode` (resolved via `CLAUDE_CONFIG_DIR || ~/.claude`,
  the same pattern the existing `munch-guard.js` uses). A plain one-word UTF-8 text
  file: `nudge` | `fastpath` | `hardwall`.
- **The plugin creates this file itself.** Gated on the echoed `SessionStart` event
  only (never on `SubagentStart`), `scout-inject.js` writes the file pre-filled with
  `hardwall\n` using an exclusive-create write -
  `writeFileSync(path, 'hardwall\n', { flag: 'wx' })` - so it creates the file only when
  absent and can never overwrite an operator edit (this also makes the `resume` re-fire
  a no-op and is race-safe). The write is wrapped in its OWN try/catch that swallows any
  error (already-exists, read-only dir) and **falls through to the injection** - the
  bootstrap must never `exit` or otherwise suppress the delegation voice. The operator
  then edits the file with any editor, whenever they want; there is no prescribed shell
  command. Changes take effect on the next hook invocation (a new session for the voice).
- The guard and inject read it simply (`trim().toLowerCase()`, match the three values);
  an **absent or unrecognized** value falls back to `hardwall`, so correctness never
  depends on the bootstrap having run. No special encoding handling is needed: `.trim()`
  already absorbs a leading UTF-8 BOM (verified) and trailing CRLF, so a file saved by
  any common editor reads correctly; a UTF-16-saved file would not match and falls back
  to the safe `hardwall` default.
- Quiet/bypass marker `~/.claude/.munch-scout-quiet`: hard-bypass (guard allows
  silently) for warden re-audits. Names are distinct from the original plugin's
  `munch-guard.log` / `.munch-guard-quiet` to avoid cross-talk during a swap.
- Decision log `~/.claude/munch-scout.log` (same `CLAUDE_CONFIG_DIR || ~/.claude`
  resolution; never the plugin cache dir): the guard appends mode + decision
  (allow/deny/delegated) per main-thread call. It is the calibration source for the
  fastpath tuning (section 8) and is append-safe under parallel scouts (section 7).

### 5.2 Mode semantics (what the GUARD enforces in the MAIN thread)

The guard acts only when neither `agent_id` nor `agent_type` is present (main thread).
Any subagent call (either field present) is always allowed - the scout and other
subagents search directly. The guard classifies on the **fully-qualified**
`mcp__<server>__<tool>` name, never the bare suffix: tool names collide across the two
servers (both expose `analyze_perf`, `get_session_stats`, `tune_weights`,
`check_embedding_drift`), so suffix-only matching would mis-bucket them.

The guard only sees a call if `hooks.json` routes it there: the PreToolUse matcher must
be `Grep|Glob|Bash|mcp__jcodemunch__.*|mcp__jdocmunch__.*`. The fork source's
`Grep|Glob|Bash` alone matches no munch tool, which would make `hardwall`/`fastpath`
inert against munch search - this extension is load-bearing, not optional.

| Mode | Native search (Grep/Glob/search-Bash) | munch search/retrieval tools | munch session/index mgmt tools |
|---|---|---|---|
| `nudge` | allow (+ log) | allow (+ log) | allow |
| `fastpath` | deny | deny BROAD; allow PINPOINT (see below) | allow |
| `hardwall` | deny | deny ALL | allow |

**Mgmt allowlist (always allowed in the main thread, every mode).** Fully qualified, on
both servers where applicable:
`mcp__jcodemunch__resolve_repo`, `..._index_file`, `..._index_folder`, `..._index_repo`,
`..._register_edit`, `..._invalidate_cache`, `..._announce_model`, `..._set_tool_tier`,
`..._embed_repo`; plus the jdocmunch index/mgmt verbs, which are **differently named**
(jdocmunch does not share jcodemunch's mgmt names): `mcp__jdocmunch__index_local`,
`..._doc_index_repo`, `..._delete_index`, `..._verify_index`, `..._define_repo_group`.
These keep the main agent's index hygiene working after edits - notably `/j-index`, which
calls `mcp__jdocmunch__index_local` and `mcp__jcodemunch__index_folder` and would be
denied under hardwall/fastpath if the jdocmunch verb were not allowlisted. Everything else under the
`mcp__jcodemunch__*` / `mcp__jdocmunch__*` namespaces is treated as search/retrieval
(default-deny is the safe direction: a new munch search tool is delegated, not leaked).

Note `plan_turn` and `get_session_context` / `get_session_stats` are deliberately **not**
in the allowlist: `plan_turn` returns recommended files/symbols (real retrieval signal)
and session-context tools belong to the scout, not the searchless main thread. They are
therefore denied under `fastpath`/`hardwall` (allowed only under `nudge`). See section 8
for the tunable.

**`fastpath` PINPOINT vs BROAD (arg-aware, best-effort, tunable).** The classifier
inspects `tool_input`, not just the name:

- PINPOINT (allowed): `search_symbols` only when `tool_input.semantic` is not `true`
  (lexical, the default), `get_symbol_source`, `get_file_outline`, `get_context_bundle`,
  and the named-symbol relationship lookups `find_references`, `find_importers`,
  `check_references`, `get_call_hierarchy`, `find_implementations`; doc side
  `get_section`, `get_sections`, `get_section_excerpt`.
- BROAD (denied): `get_file_tree`, `get_repo_outline`, `get_repo_map`, `search_text`,
  `search_ast`, `search_symbols` with `semantic: true`; doc side `search_sections`,
  `search_titles`, `get_toc`, `get_toc_tree`.

`hardwall` is the strict mode; `fastpath` is the soft compromise. The forked SKILL.md
must not tell the main agent to default to `semantic: true` (that would be denied under
`fastpath`); the global guidance already defaults `search_symbols` to lexical.

The deny `permissionDecisionReason` is actionable and **name-robust** (it references the
scout by intent, not a hardcoded dispatch-tool name), for example: *"Search is delegated
in this thread (mode=hardwall). Hand this goal to the `search-scout` subagent; it returns
synthesis + locators + confidence + coverage."* The reason string is surfaced to the
model.

### 5.3 The voice (`scout-inject.js`)

Forked from `munch-inject.js`. Wired to `SessionStart` (`startup|resume|clear|compact` -
note `resume` is added: a long-session context firewall must re-fire on resume) and
`SubagentStart` (`*`), echoing the triggering `hook_event_name` back as `hookEventName`
(the one-script-two-events pattern). Role-aware via the event, reading two
**role-scoped sections** of the forked SKILL.md so the wrong message can never reach the
wrong audience:

- `SessionStart` (main thread): inject ONLY the **delegation** section for the current
  mode. Under `hardwall` / `fastpath`: "you do not search; hand the goal to the
  `search-scout` subagent; trust its transparent return; spot-check only before
  high-blast-radius actions." Under `nudge`: steer toward delegation without forbidding.
  It must never inject the "use munch yourself" routing imperatives.
- `SubagentStart` (`*`, any subagent including the scout): inject ONLY the **subagent
  routing** section ("use munch, not native"; subagents search directly and cannot
  nest). The scout's specialized contract lives in its agent definition, not here.

(During live `--plugin-dir` testing *inside this repo*, the scout will also receive this
repo's own `SubagentStart *` self-defense voice; both fire, which is harmless.)

### 5.4 The scout (`agents/search-scout.md`)

Frontmatter: `name: search-scout`, a `description`, `model: sonnet`, and a comma-
separated `tools` allowlist enumerated to **retrieval/navigation/relationship** tools
plus `Read` - structurally excluding impact/refactor/health/diagram/mutation tools and
`Agent`. This is the **canonical** allowlist - the implementation pastes it verbatim into
the scout frontmatter, and the plan references this list rather than re-enumerating it:

- jcodemunch: `search_symbols`, `search_text`, `search_ast`, `get_file_outline`,
  `get_file_content`, `get_repo_outline`, `get_file_tree`, `get_symbol_source`,
  `get_context_bundle`, `get_related_symbols`, `find_references`, `find_importers`,
  `check_references`, `find_implementations`, `get_call_hierarchy`,
  `get_class_hierarchy`, `suggest_queries`, `resolve_repo`, `plan_turn`.
- jdocmunch: `search_sections`, `search_titles`, `get_toc`, `get_toc_tree`,
  `get_section`, `get_sections`, `get_section_excerpt`, `get_section_context`,
  `get_document_outline`, `get_related_sections`, `lookup_term`, `find_code_examples`.
- `Read`.
- Note: `resolve_repo` and `plan_turn` appear here for the scout even though they are
  denied to the searchless main thread (section 5.2). Inside a fresh per-query scout
  they are legitimate session warmup/routing; on the main thread `plan_turn` would leak
  a retrieval signal. `resolve_repo` also appears in the main-thread mgmt allowlist
  (5.2) - that dual listing is intentional, not a copy error.
- Excluded structurally: `get_blast_radius`, `get_impact_preview`, `plan_refactoring`,
  `get_extraction_candidates`, `find_dead_code` / `get_dead_code_v2`, `get_*_risk`,
  `get_hotspots`, `get_churn_rate`, `render_diagram`, `analyze_perf`, `tune_weights`,
  all `index_*` / `register_edit` / `invalidate_cache` / `embed_repo` / `set_tool_tier`,
  and `Agent`.

System prompt encodes, tight and Sonnet-appropriate against drift:

1. **Restate the goal** you understood, first thing, in the return.
2. **Scope:** retrieval + reduction only; never reason about the task, judge
   correctness, or propose changes.
3. **Use munch tools** for all search; iterate internally (query, inspect, filter,
   re-query) and keep all churn in your own context.
4. **A confident "found nothing" is a valid, complete answer** - report the negative
   result with what you searched; do not pad or speculate.
5. **Return contract** (the only thing the main thread sees), section 5.5.
6. Be terse; never dump raw tool output.

### 5.5 Return contract (the scout's output schema)

- `goal_understood`: one line restating the brief (catches a misread cheaply).
- `answer`: tight synthesis of findings, or an explicit negative result.
- `locators`: precise pointers (file:line, symbol IDs/names, doc section IDs).
- `inlined_source`: only for hits the brief explicitly asked to inline.
- `confidence` and `coverage`: honest, including what was ruled out, what was searched,
  and any reason the search could not be completed (e.g. repo not indexed).

### 5.6 Main-agent post-return protocol

Receive, then **trust by default** and read the transparent return. Most outcomes need
nothing further, including a **confident negative result** ("searched thoroughly, it is
not there") - that is a normal, valid answer; the main agent reports the gap and does
**not** re-search (consistent with the negative-evidence guidance in the global rules).

Escalate only on a concrete signal that the search itself was *incomplete or unreliable*
(low confidence with an addressable cause, a flagged coverage gap, internal
inconsistency, or contradiction with known facts), cheapest first: read a returned
locator, then **cause-directed re-dispatch** (fix the cause - e.g. index the repo, sharpen
the brief - not a blind retry). If the cause cannot be fixed in a bounded number of
re-dispatches, surface to the user. Under `hardwall` the main agent never self-searches;
its only search recourse is re-dispatch. A spot-check `Read` is mandatory before a
high-blast-radius action.

## 6. Mechanism verified against the current Claude Code build

Confirmed via the `claude-code-guide` agent against the official hooks/plugins/subagents
references:

1. PreToolUse stdin carries `agent_id` and `agent_type` for subagent calls and both are
   absent on main-thread calls. The guard treats **either** field's presence as
   "subagent" and allows. If neither parses, it fails open (allow) - which on a
   main-thread call lets a search leak rather than stranding the session; an acceptable,
   documented asymmetry (the wall is best-effort, never a hard dependency).
2. PreToolUse `matcher` is a regex over the tool name and matches MCP names like
   `mcp__jcodemunch__search_symbols`. No auto-anchoring.
3. Deny via `hookSpecificOutput.permissionDecision: "deny"` plus
   `permissionDecisionReason` (surfaced to the model), exit 0.
4. SubagentStart matcher is evaluated over `agent_type` and supports
   `additionalContext`; a specific matcher and `*` both fire if both match.
5. Agent frontmatter `model: sonnet` pins the tier (resolution: env >
   per-invocation > frontmatter > main conversation). Plugin agent definitions cannot
   declare `hooks`, `mcpServers`, or `permissionMode`; that is fine here (hooks live in
   `hooks/hooks.json`, the munch MCP servers are session-level and inherited).
6. Subagents cannot spawn subagents (the `Agent` tool is unavailable to them), so
   delegation can only originate from the main thread and all subagents search directly.

**Dispatch-tool naming (name-robustness).** The tool the main agent uses to launch the
scout is named `Agent` in this build; some Claude Code docs/builds call it the `Task`
tool. Because the exact name is install/version dependent, the voice and the deny reason
reference the scout **by intent** ("hand the goal to the `search-scout` subagent")
rather than hardcoding a tool name, and the implementation step includes a check to
confirm the correct name against the target build so `hardwall` can never deny search
while naming a dispatch tool that does not exist.

## 7. Risks, costs, and mitigations (honest accounting)

- **Destination reads are not eliminated.** The scout removes search churn; the main
  agent still `Read`s the specific locations it edits, and those reads land in the main
  context. Mitigation: the brief can request `inlined_source` for hits the main agent
  knows it will edit; otherwise it reads only the few returned locators. Net win is on
  the iteration, not the destination reads - stated plainly so the benefit is not
  oversold.
- **Per-search latency is a real fixed cost.** Every delegated search incurs a subagent
  spin-up, a cold munch session, and teardown before the main agent can proceed - a
  round-trip the original plugin never had. Accepted for the context-conservation goal;
  the operator can drop to `nudge`/`fastpath` if latency hurts.
- **Per-query disposability discards jcodemunch session continuity.** jcodemunch is
  session-aware (dedup, "already-read" memory, ranked context, per-model tool tier);
  tearing the scout down each query cold-starts that every time, which can increase total
  munch work/latency. This is an accepted trade given the per-query lifetime decision and
  the searchless main thread; revisit (per-task scouts) only if scout-side cost proves to
  matter.
- **Goal drift on a cheaper scout.** A Sonnet scout under `hardwall` is the most exposed
  configuration. Mitigation: the transparent return (interpretation + confidence +
  coverage), the structurally-restricted tool allowlist, tight anti-drift instructions,
  and an easy mode flip to `nudge`.
- **"No results" is a normal outcome, not a failure** (see 5.6); only a self-reported
  *incomplete* search triggers a bounded, cause-directed re-dispatch.
- **Concurrency.** The main agent may dispatch scouts in parallel; each cold-starts its
  own munch session, and the shared `~/.claude/munch-scout.log` is append-safe (inherited
  from `munch-guard.js`). No shared mutable state between scouts.
- **`hardwall` with a broken scout or missing munch servers strands all search.**
  Mitigation: loud README prerequisites; fail-open guard; the `.munch-scout-quiet`
  hard-bypass; flip to `nudge`.
- **Accidentally running both plugins.** Mitigation: documented mutual exclusivity, the
  swap workflow, and distinct log/marker filenames. There is no runtime cross-detection
  (see section 8).

## 8. Open / tunable questions

- `plan_turn` (and `get_session_context`) are denied in the main thread under
  `fastpath`/`hardwall`. If the main agent turns out to need the routing/confidence
  signal, allow `plan_turn` (it is planning, not content retrieval) as a tunable.
- The `fastpath` broad-vs-pinpoint classification is heuristic; start with the table in
  5.2 and adjust from `munch-scout.log` (which logs mode + decision per call).
- Mutual exclusivity is documentation-only. A future hardening: have `scout-inject.js`
  detect the sibling plugin's marker at startup and warn.
