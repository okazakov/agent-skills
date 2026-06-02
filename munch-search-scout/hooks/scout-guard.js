#!/usr/bin/env node
// scout-guard.js - PreToolUse hook (munch-search-scout plugin). Forked from
// using-munch-tools/munch-guard.js. Matcher (in hooks.json):
//   Grep|Glob|Bash|mcp__jcodemunch__.*|mcp__jdocmunch__.*
//
// Enforces the three-mode search wall on the MAIN THREAD ONLY:
//   nudge    -> allow everything (+ log search-relevant calls)
//   fastpath -> deny native search and BROAD munch search; allow PINPOINT munch
//   hardwall -> deny native search and ALL munch search/retrieval
// Index/session-management munch tools are always allowed (every mode) so the
// main agent keeps its index hygiene (notably /j-index).
//
// Subagent calls (agent_id OR agent_type present) are ALWAYS allowed - the scout
// and other subagents search directly and cannot nest. If the payload is
// unparseable we fail OPEN (allow): a leaked main-thread search beats stranding
// the session. The wall is best-effort, never a hard dependency.
//
// State (log + quiet marker) lives in the REAL user config dir (~/.claude), never
// next to this script (the plugin cache dir is wiped on update). Names are
// distinct from the original plugin's (munch-scout.log / .munch-scout-quiet) to
// avoid cross-talk during a swap.
//
// Deny is emitted via hookSpecificOutput.permissionDecision "deny" plus a
// name-robust permissionDecisionReason (references the search-scout subagent by
// intent, not a hardcoded dispatch-tool name). Never throws out of a tool call:
// any failure exits 0 silently (allow).

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Real user config dir. Honor CLAUDE_CONFIG_DIR if the user relocated ~/.claude.
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const LOG_PATH = path.join(CLAUDE_DIR, 'munch-scout.log');
const QUIET_MARKER = path.join(CLAUDE_DIR, '.munch-scout-quiet');
const MODE_PATH = path.join(CLAUDE_DIR, 'munch-scout-mode');
const MODES = ['nudge', 'fastpath', 'hardwall'];

// Always-allowed index/session-management tools, fully qualified. The jdocmunch
// verbs are NOT the same names as jcodemunch's - they must be listed explicitly
// or /j-index (which calls mcp__jdocmunch__index_local) breaks under hardwall.
const MGMT_ALLOW = {
  'mcp__jcodemunch__resolve_repo': true,
  'mcp__jcodemunch__index_file': true,
  'mcp__jcodemunch__index_folder': true,
  'mcp__jcodemunch__index_repo': true,
  'mcp__jcodemunch__register_edit': true,
  'mcp__jcodemunch__invalidate_cache': true,
  'mcp__jcodemunch__announce_model': true,
  'mcp__jcodemunch__set_tool_tier': true,
  'mcp__jcodemunch__embed_repo': true,
  'mcp__jdocmunch__index_local': true,
  'mcp__jdocmunch__doc_index_repo': true,
  'mcp__jdocmunch__delete_index': true,
  'mcp__jdocmunch__verify_index': true,
  'mcp__jdocmunch__define_repo_group': true
};

// fastpath PINPOINT set (narrow, allowed under fastpath), fully qualified.
// search_symbols is special-cased: pinpoint only when NOT semantic:true.
const PINPOINT = {
  'mcp__jcodemunch__search_symbols': true,
  'mcp__jcodemunch__get_symbol_source': true,
  'mcp__jcodemunch__get_file_outline': true,
  'mcp__jcodemunch__get_context_bundle': true,
  'mcp__jcodemunch__find_references': true,
  'mcp__jcodemunch__find_importers': true,
  'mcp__jcodemunch__check_references': true,
  'mcp__jcodemunch__get_call_hierarchy': true,
  'mcp__jcodemunch__find_implementations': true,
  'mcp__jdocmunch__get_section': true,
  'mcp__jdocmunch__get_sections': true,
  'mcp__jdocmunch__get_section_excerpt': true
};

// Read the mode simply: trim + lowercase, match the three values; absent or
// unrecognized falls back to hardwall. .trim() absorbs a UTF-8 BOM / trailing
// CRLF; a UTF-16-saved file would not match and falls back to the safe default.
function readMode() {
  try {
    const raw = fs.readFileSync(MODE_PATH, 'utf8').trim().toLowerCase();
    if (MODES.indexOf(raw) !== -1) return raw;
  } catch (e) { /* absent/unreadable -> default */ }
  return 'hardwall';
}

// Conservative search-style classifier for Bash commands (verbatim from the fork
// source). Flag ONLY when a recognized search binary leads a command/pipeline
// segment. Bias toward NOT flagging.
function isSearchStyle(command) {
  if (!command || typeof command !== 'string') return false;

  const cmd = command.trim();
  if (cmd.length === 0) return false;

  // Never flag git (incl. `git grep`) - flip later via config if wanted.
  if (/^git\b/i.test(cmd)) return false;

  // Segment-leading anchor: start of string, or just after a pipe / && / ; / & .
  const SEG = '(?:^|[|&;]\\s*)';

  const patterns = [
    new RegExp(SEG + '(?:grep|egrep|fgrep|rg|ripgrep|ag|ack|fd)\\b', 'i'),
    new RegExp(SEG + 'find\\s+\\S', 'i'),
    new RegExp(SEG + 'ls\\s+[^|;&]*-{1,2}(?:R\\b|recursive\\b)', 'i'),
    new RegExp(SEG + 'select-string\\b', 'i'),
    new RegExp('get-childitem\\b[^|;&]*-recurse\\b', 'i'),
    new RegExp(SEG + 'dir\\b[^|;&]*/s\\b', 'i'),
    new RegExp(SEG + 'findstr\\b', 'i')
  ];

  return patterns.some(function (re) { return re.test(cmd); });
}

function isMunchTool(toolName) {
  return typeof toolName === 'string' &&
    (toolName.indexOf('mcp__jcodemunch__') === 0 ||
     toolName.indexOf('mcp__jdocmunch__') === 0);
}

function isPinpoint(toolName, toolInput) {
  if (toolName === 'mcp__jcodemunch__search_symbols') {
    // Lexical is pinpoint; semantic is broad.
    return !(toolInput && toolInput.semantic === true);
  }
  return PINPOINT[toolName] === true;
}

// Decide on a fully-qualified tool name. Returns { action, kind }:
//   action: 'allow' | 'deny'
//   kind:   'native' | 'munch' | 'mgmt' | 'bash-nonsearch' | 'other'
function classify(toolName, toolInput, mode) {
  if (toolName === 'Grep' || toolName === 'Glob') {
    return { action: mode === 'nudge' ? 'allow' : 'deny', kind: 'native' };
  }
  if (toolName === 'Bash') {
    if (!isSearchStyle(toolInput && toolInput.command)) {
      return { action: 'allow', kind: 'bash-nonsearch' };
    }
    return { action: mode === 'nudge' ? 'allow' : 'deny', kind: 'native' };
  }
  if (!isMunchTool(toolName)) {
    // Unexpected tool routed here -> do not interfere.
    return { action: 'allow', kind: 'other' };
  }
  if (MGMT_ALLOW[toolName] === true) {
    return { action: 'allow', kind: 'mgmt' };
  }
  // A munch search/retrieval tool.
  if (mode === 'nudge') return { action: 'allow', kind: 'munch' };
  if (mode === 'fastpath' && isPinpoint(toolName, toolInput)) {
    return { action: 'allow', kind: 'munch' };
  }
  // fastpath BROAD, or hardwall (all), or any unknown mode -> deny + delegate.
  return { action: 'deny', kind: 'munch' };
}

function detailFor(toolName, toolInput) {
  toolInput = toolInput || {};
  if (toolName === 'Grep') {
    return 'pattern=' + (toolInput.pattern || '') +
           (toolInput.path ? ' path=' + toolInput.path : '') +
           (toolInput.glob ? ' glob=' + toolInput.glob : '');
  }
  if (toolName === 'Glob') {
    return 'pattern=' + (toolInput.pattern || '') +
           (toolInput.path ? ' path=' + toolInput.path : '');
  }
  if (toolName === 'Bash') {
    return toolInput.command || '';
  }
  return 'semantic=' + (toolInput.semantic === true ? 'true' : 'false');
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (e) {
    return '';
  }
}

function logLine(mode, decision, toolName, detail) {
  try {
    const safeDetail = String(detail == null ? '' : detail).replace(/\r?\n/g, ' ');
    const line = new Date().toISOString() + '\t' + mode + '\t' + decision + '\t' +
                 (toolName || '') + '\t' + safeDetail + '\n';
    fs.appendFileSync(LOG_PATH, line);
  } catch (e) {
    // Logging must never break the tool call.
  }
}

function deny(mode, kind) {
  const reason = (kind === 'native')
    ? ('Native search is disabled on the main thread (mode=' + mode +
       '). Hand this search goal to the search-scout subagent (via your ' +
       'subagent-dispatch tool); it searches with jcodemunch/jdocmunch and ' +
       'returns synthesis + locators + confidence + coverage.')
    : ('Search is delegated on the main thread (mode=' + mode +
       '). Hand this goal to the search-scout subagent (via your ' +
       'subagent-dispatch tool); it returns synthesis + locators + confidence ' +
       '+ coverage. Do not search here.');
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

function main() {
  // Quiet marker present -> allow silently, no logging (e.g. warden re-audits).
  try {
    if (fs.existsSync(QUIET_MARKER)) {
      process.exit(0);
    }
  } catch (e) { /* ignore */ }

  let payload;
  try {
    payload = JSON.parse(readStdin() || '{}');
  } catch (e) {
    process.exit(0); // Malformed input -> fail open (allow).
  }

  // Main-vs-subagent gate. Either field present => subagent => always allow.
  // Neither present (and parsed) => main thread => enforce. (Unparseable already
  // failed open above.)
  if (payload && (payload.agent_id != null || payload.agent_type != null)) {
    process.exit(0);
  }

  const toolName = payload && payload.tool_name;
  const toolInput = (payload && payload.tool_input) || {};
  const mode = readMode();

  const result = classify(toolName, toolInput, mode);

  // Log search-relevant calls only (native + munch search), allow or deny.
  if (result.kind === 'native' || result.kind === 'munch') {
    const label = result.action === 'allow'
      ? 'allow'
      : (result.kind === 'native' ? 'deny' : 'delegated');
    logLine(mode, label, toolName, detailFor(toolName, toolInput));
  }

  if (result.action === 'deny') {
    deny(mode, result.kind);
  }

  // Allow: exit 0 with no stdout, deferring to the normal permission flow.
  process.exit(0);
}

main();
