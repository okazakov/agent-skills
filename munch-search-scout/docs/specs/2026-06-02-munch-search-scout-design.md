# Design spec: `munch-search-scout`

- Status: approved design (pre-implementation)
- Date: 2026-06-02
- Author: okazakov
- Supersedes: `using-munch-tools` (this plugin is a replacement superset, not an add-on)

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

- Conserve the main agent's context window by keeping search churn out of it.
- Delegate searching to a disposable subagent whose context is torn down after use.
- Preserve a clean, reversible rollback to the current `using-munch-tools` behavior.
- Keep enforcement tunable, from a soft nudge to a hard wall.

**Non-goals**

- Minimizing *total* token cost across all agents (the explicit goal is main-thread
  context, not aggregate tokens; scout tokens are a secondary, separately tunable cost).
- Installing the munch MCP servers (configured separately, as today).
- Changing how *subagents* search (they keep searching with munch directly).

## 3. Premise and the pattern

Completely delegate searching to a dedicated **Search Scout** subagent. The main agent
hands the scout a *goal*; the scout uses its own dispensable context as scratch space
for the munch tools, runs the entire multi-step retrieval internally, returns a compact
result, and is torn down - taking all the search churn with it. The main thread only
ever sees the distillate.

This is the proven "context firewall" / research-subagent pattern. The harness's own
built-in `Explore` agent works exactly this way: it sweeps many files and returns only
the conclusion, reading excerpts rather than whole files, so the verbose middle never
touches the caller's context.

The win scales with how multi-step the search is. It is near-zero (and net-negative on
latency and total tokens) for a single trivial lookup. That asymmetry is the entire
reason a mode switch exists: the operator chooses how aggressively to force delegation.

## 4. Settled design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Packaging | New plugin replacing `using-munch-tools` (a superset). Mutually exclusive - never enable both. | Clean uninstall/reinstall rollback; the proven original stays pristine as the revert target. Two voices + two guards would contradict and double-log if both ran. |
| Enforcement | Three-mode switch (`nudge` / `fastpath` / `hardwall`), default `hardwall`, scoped to the **main thread only**. | Mirrors the existing observe/warn/block ladder. Subagents cannot nest, so they keep searching directly. |
| Scout role | Thick / goal-owning: retrieval + retrieval-shaped reduction. No task reasoning. | The thin pass-through has the worst economics (max overhead, minimal offload). The win comes from offloading the *iteration churn*, not one final call. |
| Return contract | Trust + transparent return: lean answer (synthesis + locators) plus goal-interpretation + confidence/coverage + "what I ruled out". Brief may request inlined source for named hits. | The main thread stays lean; the transparency fields hand back the sliver of situational awareness that compression discards. |
| Verification posture | Main agent trusts by default and sanity-*reads* the return. An active spot-check (one `Read` of a returned locator) is reserved for results feeding high-blast-radius / irreversible actions. | A standing verification habit would rebuild the round-trips we are eliminating. A scout using the same tools and goal produces near-equivalent retrieval. |
| Scout model | Pinned `sonnet`. | Cheap disposable searcher. Weakens scout/main parity, which makes the transparent return + re-dispatch load-bearing rather than optional. |

### The scout's boundary (load-bearing)

The scout does **retrieval and retrieval-shaped reduction**: list, filter, locate,
cross-reference, dedupe, rank, map relationships, summarize *what exists*. It does
**not** do **task reasoning**: deciding what to change, judging correctness, designing a
fix, or writing code. Litmus test: *"what / where is X"* is the scout's job; *"what
should we do about X"* is the main agent's. Two reasons the line is hard: the main agent
needs the situational understanding to make good edits, and the scout cannot fan out
helpers, so piling reasoning onto it creates a bottleneck.

## 5. Architecture

Three cooperating pieces, all reading one **mode** config file.

```
munch-search-scout/                       (plugin root = ${CLAUDE_PLUGIN_ROOT})
  .claude-plugin/plugin.json              manifest
  README.md                               modes, mutual-exclusivity, swap/rollback
  agents/search-scout.md                  the scout (model: sonnet, the contract)
  skills/using-munch-tools/SKILL.md        routing + delegation cheat-sheet (forked)
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
  the same pattern the existing `munch-guard.js` uses). Contents: one word -
  `nudge` | `fastpath` | `hardwall`. **Absent file means `hardwall`** (the shipped
  default).
- Both hooks read it on each invocation. Operators flip modes by writing the word; no
  script edit, survives plugin-cache wipes.
- Quiet/bypass marker `~/.claude/.munch-scout-quiet`: hard-bypass (guard allows
  silently) for warden re-audits. Names are distinct from the original plugin's
  `munch-guard.log` / `.munch-guard-quiet` to avoid any cross-talk during a swap.

### 5.2 Mode semantics (what the GUARD enforces in the MAIN thread)

The guard acts only when `agent_id` is **absent** (main thread). Any subagent call is
always allowed - the scout and other subagents search directly.

| Mode | Native search (Grep/Glob/search-Bash) | munch search/retrieval tools | munch session/index mgmt tools |
|---|---|---|---|
| `nudge` | allow (+ log) | allow (+ log) | allow |
| `fastpath` | deny | deny BROAD (`get_file_tree`, `get_repo_outline`, `search_text`, semantic `search_symbols`); allow PINPOINT (lexical `search_symbols`, `get_symbol_source`, `get_file_outline`, `get_section`, `find_references`) | allow |
| `hardwall` | deny | deny ALL | allow |

- **Always-allowed mgmt allowlist** (every mode, main thread): `resolve_repo`,
  `index_file` / `index_folder` / `index_repo`, `register_edit`, `invalidate_cache`,
  `announce_model`, `set_tool_tier`, `embed_repo`, `get_session_context` /
  `get_session_stats`, `plan_turn`. Keeps the main agent's index hygiene and routing
  working.
- Classification is an **allowlist of mgmt tools**; everything else under the
  `mcp__jcodemunch__*` / `mcp__jdocmunch__*` namespaces counts as search/retrieval.
  Default-deny is the safe direction (a new munch search tool is delegated, not leaked).
- The `fastpath` broad-vs-pinpoint split is best-effort and tunable. `hardwall` is the
  strict mode; `fastpath` is the soft compromise.
- The deny `permissionDecisionReason` is actionable, for example: *"Search is delegated
  in this thread (mode=hardwall). Dispatch the `search-scout` subagent with a
  goal-oriented brief; it returns synthesis + locators + confidence."* The reason string
  is surfaced to the model.

### 5.3 The voice (`scout-inject.js`)

Forked from `munch-inject.js`. Wired to `SessionStart` (`startup|clear|compact`) and
`SubagentStart` (`*`), echoing the triggering `hook_event_name` back as `hookEventName`
(the same one-script-two-events pattern). Role-aware via the event:

- `SessionStart` (main thread): inject the **delegation** instructions for the current
  mode. Under `hardwall` / `fastpath`: "you do not search; dispatch `search-scout` via
  the Agent tool with a goal; trust its transparent return; spot-check only before
  high-blast-radius actions." Under `nudge`: steer toward delegation without forbidding.
- `SubagentStart` (`*`, any subagent including the scout): inject the existing
  **"use munch, not native"** routing cheat-sheet (subagents search directly and cannot
  nest). The scout's specialized contract lives in its agent definition, not here, so no
  scout-specific matcher is required.

### 5.4 The scout (`agents/search-scout.md`)

Frontmatter: `name: search-scout`, a `description`, `model: sonnet`, and a `tools`
allowlist of the munch search/nav tools plus `Read` (for its own confirmation reads).
No `Agent` tool (cannot nest regardless). Its system prompt encodes, tight and
Sonnet-appropriate against drift:

1. **Restate the goal** you understood, first thing, in the return.
2. **Scope:** retrieval + reduction only; never reason about the task, judge
   correctness, or propose changes.
3. **Use munch tools** for all search; iterate internally (query, inspect, filter,
   re-query) and keep all churn in your own context.
4. **Return contract** (the only thing the main thread sees), below.
5. Be terse; never dump raw tool output.

### 5.5 Return contract (the scout's output schema)

- `goal_understood`: one line restating the brief (catches a misread cheaply).
- `answer`: tight synthesis of findings.
- `locators`: precise pointers (file:line, symbol IDs/names, doc section IDs).
- `inlined_source`: only for hits the brief explicitly asked to inline.
- `confidence` and `coverage`: honest, including what was ruled out or not searched.

### 5.6 Main-agent post-return protocol

Receive, then **trust by default** and read the transparent return. Escalate only on a
concrete signal (low confidence, a coverage gap, internal inconsistency, or
contradiction with known facts), cheapest first: read a returned locator, then
re-dispatch the scout with a sharper/corrective brief, then optionally a second
independent scout. Under `hardwall` the main agent never self-searches; its only
search recourse is re-dispatch. A spot-check `Read` is mandatory before a
high-blast-radius action.

## 6. Mechanism verified against the current Claude Code build

Confirmed via the `claude-code-guide` agent against the official hooks/plugins/subagents
references:

1. PreToolUse stdin carries `agent_id` and `agent_type` **only** for subagent calls;
   both absent on main-thread calls -> reliable main-vs-subagent test.
2. PreToolUse `matcher` is a regex over the tool name and matches MCP names like
   `mcp__jcodemunch__search_symbols`. No auto-anchoring (fine for our use).
3. Deny via `hookSpecificOutput.permissionDecision: "deny"` plus
   `permissionDecisionReason` (surfaced to the model), exit 0.
4. SubagentStart matcher is evaluated over `agent_type` and supports
   `additionalContext`; a specific matcher and `*` both fire if both match.
5. Agent frontmatter `model: sonnet` pins the tier (resolution: env >
   per-invocation > frontmatter > main conversation).
6. Subagents cannot spawn subagents (the `Agent` tool is unavailable to them), which
   confirms delegation can only originate from the main thread and that all subagents
   search with munch directly.

Note: plugin agent definitions cannot declare `hooks`, `mcpServers`, or
`permissionMode`. That is fine here - the hooks live in `hooks/hooks.json` and the
munch MCP servers are session-level, inherited by the scout.

## 7. Risks and mitigations

- **Goal drift on a cheaper scout.** A Sonnet scout under `hardwall` is the most exposed
  configuration: the Opus main agent fully depends on a weaker searcher it cannot
  bypass. Mitigation: the transparent return (interpretation + confidence + coverage)
  and tight anti-drift scout instructions, plus easy mode flip to `nudge`.
- **Over-applying delegation to trivial lookups.** Net-negative for one-shot lookups.
  Mitigation: `fastpath` mode keeps a pinpoint path; the observe-style log informs
  whether the trivial:exploratory ratio justifies it.
- **`hardwall` with a broken scout or missing munch servers strands all search.**
  Mitigation: loud README prerequisites; fail-safe guard (any error exits 0/allow);
  the `.munch-scout-quiet` hard-bypass; flip to `nudge` to disable.
- **Accidentally running both plugins.** Mitigation: documented mutual exclusivity and
  the swap workflow; distinct log/marker filenames.

## 8. Open / tunable questions

- `plan_turn` is allowed in the main thread under `hardwall` (it returns recommended
  files, a mild retrieval signal). Tunable to "delegate" for a purer wall.
- The `fastpath` broad-vs-pinpoint tool split is heuristic; start with the table in 5.2
  and adjust from `munch-scout.log` data.
