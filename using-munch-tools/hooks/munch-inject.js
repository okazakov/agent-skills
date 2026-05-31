#!/usr/bin/env node
// munch-inject.js - the voice (plugin build). Wired to BOTH SessionStart and
// SubagentStart so the injection reaches the main thread AND every spawned
// subagent (subagents get a fresh context and do NOT inherit the parent's
// SessionStart injection - they only see their own SubagentStart hooks).
//
// Reads the using-munch-tools SKILL.md, wraps it in a pseudo-system frame, and
// emits it as additionalContext. The output's hookEventName ECHOES the actual
// event from stdin (SessionStart or SubagentStart) so one script serves both;
// emitting the wrong event name can make the harness ignore the output.
//
// Schema (verified against Claude Code hooks reference - identical for plugin and
// user-settings hooks; both SessionStart and SubagentStart support additionalContext):
//   stdin  JSON: { "hook_event_name": "SessionStart|SubagentStart", ... }
//   stdout JSON: { "hookSpecificOutput": {
//       "hookEventName": "<echoed event>", "additionalContext": "<string>" } }
// Never throws out of the session: any failure exits 0 silently.

'use strict';

const fs = require('fs');
const path = require('path');

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

  // As a plugin, CLAUDE_PLUGIN_ROOT is the absolute plugin install dir. Fall back
  // to a path relative to this script so it also works as a standalone hook.
  const root = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..');
  const skillPath = path.join(root, 'skills', 'using-munch-tools', 'SKILL.md');

  let skill;
  try {
    skill = fs.readFileSync(skillPath, 'utf8');
  } catch (e) {
    // Skill file missing - do not break session start, just inject nothing.
    process.exit(0);
  }

  const preamble =
    'You have munch-powers: jcodemunch (code navigation) and jdocmunch (doc ' +
    'navigation), both audited and pinned. They are your sanctioned way to SEARCH.\n\n' +
    "**Below is the full content of your 'using-munch-tools' skill. For all other " +
    "skills, use the 'Skill' tool:**";

  const additionalContext =
    '<EXTREMELY_IMPORTANT>\n' +
    preamble + '\n\n---\n' +
    skill.trim() + '\n' +
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
