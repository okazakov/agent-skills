#!/usr/bin/env node
// scout-inject.js - the voice (munch-search-scout plugin). Forked from
// using-munch-tools/munch-inject.js. Wired to SessionStart and SubagentStart.
//
// Two added responsibilities over the fork source:
//   1. MODE-FILE BOOTSTRAP (SessionStart only): exclusive-create
//      ~/.claude/munch-scout-mode pre-filled with "hardwall\n" so the plugin
//      ships its own default and never overwrites an operator edit. Runs in its
//      OWN try/catch that swallows any error and CONTINUES to the injection - it
//      must never exit or suppress the delegation voice.
//   2. ROLE-AWARE INJECTION: SessionStart emits ONLY the main-thread delegation
//      section for the active mode; SubagentStart emits ONLY the subagent routing
//      section. The wrong message can never reach the wrong audience.
//
// The output's hookEventName ECHOES the triggering event so one script serves
// both (emitting the wrong event name can make the harness ignore the output).
// Never throws out of the session: any failure exits 0 silently.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Real user config dir (never the plugin cache dir, which is wiped on update).
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const MODE_PATH = path.join(CLAUDE_DIR, 'munch-scout-mode');
const MODES = ['nudge', 'fastpath', 'hardwall'];

// Read the mode simply: trim + lowercase, match the three values; absent or
// unrecognized falls back to hardwall (so correctness never depends on the
// bootstrap having run). .trim() also absorbs a UTF-8 BOM and trailing CRLF; a
// UTF-16-saved file would not match and falls back to the safe default.
function readMode() {
  try {
    const raw = fs.readFileSync(MODE_PATH, 'utf8').trim().toLowerCase();
    if (MODES.indexOf(raw) !== -1) return raw;
  } catch (e) { /* absent/unreadable -> default */ }
  return 'hardwall';
}

// Extract the text strictly between an HTML-comment START and END marker.
// Returns null if either marker is absent (caller falls back to the whole skill).
function extractSection(skill, name) {
  const start = '<!-- ' + name + ':START -->';
  const end = '<!-- ' + name + ':END -->';
  const i = skill.indexOf(start);
  const j = skill.indexOf(end);
  if (i === -1 || j === -1 || j < i) return null;
  return skill.slice(i + start.length, j).trim();
}

try {
  // Echo the actual triggering event back as hookEventName. Default to
  // SessionStart if stdin is missing/unparseable (this script is only wired to
  // SessionStart and SubagentStart).
  let eventName = 'SessionStart';
  try {
    const payload = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
    if (payload && (payload.hook_event_name === 'SessionStart' ||
                    payload.hook_event_name === 'SubagentStart')) {
      eventName = payload.hook_event_name;
    }
  } catch (e) { /* keep default */ }

  // MODE-FILE BOOTSTRAP - SessionStart only, exclusive-create, never overwrite,
  // in its OWN try/catch that CONTINUES to the injection on any error.
  if (eventName === 'SessionStart') {
    try {
      fs.writeFileSync(MODE_PATH, 'hardwall\n', { flag: 'wx' });
    } catch (e) {
      // already-exists / read-only dir / etc. - intentionally ignored. Do NOT
      // exit; the delegation voice must still fire.
    }
  }

  // Resolve the skill (plugin install dir, or relative fallback for standalone).
  const root = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..');
  const skillPath = path.join(root, 'skills', 'using-munch-tools', 'SKILL.md');

  let skill;
  try {
    skill = fs.readFileSync(skillPath, 'utf8');
  } catch (e) {
    // Skill file missing - do not break session start, just inject nothing.
    process.exit(0);
  }

  let preamble;
  let body;
  if (eventName === 'SubagentStart') {
    // Subagent: emit ONLY the routing section ("use munch, not native").
    preamble =
      'You have munch-powers: jcodemunch (code navigation) and jdocmunch (doc ' +
      'navigation), both audited and pinned. They are your sanctioned way to ' +
      'SEARCH. Below is your search routing rule:';
    body = extractSection(skill, 'SCOUT:SUBAGENT-ROUTING');
  } else {
    // Main thread: emit ONLY the delegation section for the active mode.
    const mode = readMode();
    preamble =
      'You have a disposable search-scout subagent. On the main thread you ' +
      'DELEGATE all code/doc search to it; you do not search yourself ' +
      '(mode=' + mode + '). Below is your delegation protocol:';
    const common = extractSection(skill, 'SCOUT:DELEGATION:COMMON');
    const modeSec = extractSection(skill, 'SCOUT:DELEGATION:MODE:' + mode);
    if (common !== null && modeSec !== null) {
      body = common + '\n\n' + modeSec;
    } else if (common !== null) {
      body = common;
    } else {
      body = null;
    }
  }

  // Fail-safe: if section extraction failed (markers changed/missing), fall back
  // to the whole skill so the voice is never silent.
  if (body === null || body === '') {
    body = skill.trim();
  }

  const additionalContext =
    '<EXTREMELY_IMPORTANT>\n' +
    preamble + '\n\n---\n' +
    body + '\n' +
    '</EXTREMELY_IMPORTANT>';

  const out = {
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext: additionalContext
    }
  };

  process.stdout.write(JSON.stringify(out));
  process.exit(0);
} catch (e) {
  // Absolutely never strand a session because of this hook.
  process.exit(0);
}
