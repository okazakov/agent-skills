#!/usr/bin/env node
// munch-guard.js - PreToolUse hook (plugin build). Matcher: Grep|Glob|Bash.
//
// MODE: OBSERVE (log only). It ALWAYS allows the call and emits NO reminder.
// When the call is search-style it appends one line to munch-guard.log for
// calibration. This is the pre-warn-mode build: never blocks, never reminds.
//
// Schema (verified against Claude Code hooks reference - identical for plugin and
// user-settings hooks):
//   stdin JSON: { "tool_name": "<string>", "tool_input": { ... }, ... }
//     - Bash command lives at tool_input.command
//   For OBSERVE mode we exit 0 with NO stdout, which defers to the normal
//   permission flow (does not block, does not disturb other hooks).
//
// IMPORTANT (plugin context): the log and quiet-marker live in the REAL user
// config dir (~/.claude), NOT next to this script. As a plugin this script runs
// from ~/.claude/plugins/cache/<id>/ which is wiped on update, so we must NOT
// write state there. We resolve the config dir via CLAUDE_CONFIG_DIR or homedir.
//
// Never throws out of a tool call: any failure exits 0 silently (allow).

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Real user config dir. Honor CLAUDE_CONFIG_DIR if the user relocated ~/.claude.
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const LOG_PATH = path.join(CLAUDE_DIR, 'munch-guard.log');
const QUIET_MARKER = path.join(CLAUDE_DIR, '.munch-guard-quiet');

// Conservative search-style classifier for Bash commands.
// Flag ONLY when a recognized search binary is invoked in search mode, at the
// start of a command or a pipeline/chain segment. Bias toward NOT flagging.
function isSearchStyle(command) {
  if (!command || typeof command !== 'string') return false;

  const cmd = command.trim();
  if (cmd.length === 0) return false;

  // Never flag git (incl. `git grep`) - flip later via config if wanted.
  if (/^git\b/i.test(cmd)) return false;

  // Segment-leading anchor: start of string, or just after a pipe / && / ; / & .
  // This catches search binaries mid-pipeline (e.g. `cat x | grep y`) while
  // ignoring the same word used as an argument (e.g. `echo grep`).
  const SEG = '(?:^|[|&;]\\s*)';

  const patterns = [
    // Classic + modern search binaries.
    new RegExp(SEG + '(?:grep|egrep|fgrep|rg|ripgrep|ag|ack|fd)\\b', 'i'),
    // find used as a tree traversal (has at least one argument).
    new RegExp(SEG + 'find\\s+\\S', 'i'),
    // ls -R / ls --recursive (recursive listing = a search).
    new RegExp(SEG + 'ls\\s+[^|;&]*-{1,2}(?:R\\b|recursive\\b)', 'i'),
    // Windows / PowerShell search idioms.
    new RegExp(SEG + 'select-string\\b', 'i'),
    new RegExp('get-childitem\\b[^|;&]*-recurse\\b', 'i'),
    new RegExp(SEG + 'dir\\b[^|;&]*/s\\b', 'i'),
    new RegExp(SEG + 'findstr\\b', 'i')
  ];

  return patterns.some(function (re) { return re.test(cmd); });
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (e) {
    return '';
  }
}

function logLine(toolName, detail) {
  try {
    const safeDetail = String(detail == null ? '' : detail).replace(/\r?\n/g, ' ');
    const line = new Date().toISOString() + '\tOBSERVE\t' + toolName + '\t' + safeDetail + '\n';
    fs.appendFileSync(LOG_PATH, line);
  } catch (e) {
    // Logging must never break the tool call.
  }
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
    process.exit(0); // Malformed input -> allow silently.
  }

  const toolName = payload && payload.tool_name;
  const toolInput = (payload && payload.tool_input) || {};

  let searchy = false;
  let detail = '';

  switch (toolName) {
    case 'Grep':
      searchy = true;
      detail = 'pattern=' + (toolInput.pattern || '') +
               (toolInput.path ? ' path=' + toolInput.path : '') +
               (toolInput.glob ? ' glob=' + toolInput.glob : '');
      break;
    case 'Glob':
      searchy = true;
      detail = 'pattern=' + (toolInput.pattern || '') +
               (toolInput.path ? ' path=' + toolInput.path : '');
      break;
    case 'Bash':
      searchy = isSearchStyle(toolInput.command);
      detail = toolInput.command || '';
      break;
    default:
      searchy = false;
  }

  if (searchy) {
    logLine(toolName, detail);
  }

  // OBSERVE mode: always allow, never remind. Exit 0 with no stdout.
  process.exit(0);
}

main();
