# Get-shit-done Overview (Reference)

Date captured: 2026-02-03
Source: `https://github.com/glittercowboy/get-shit-done`

## Project Summary
Get-shit-done (GSD) describes itself as a lightweight, spec-driven development system focused on reducing context degradation in long AI-assisted coding sessions.

## Upstream Signals
- Repository: `glittercowboy/get-shit-done`
- License: MIT
- Popularity snapshot (capture date): ~11k stars, ~1k forks
- Runtime focus in installer/docs: Claude Code, OpenCode, Gemini CLI

## Workflow Model
From the upstream README and workflow files, GSD centers around command-driven phases:
- project bootstrap (`/gsd:new-project`)
- phase discussion/planning/execution/verification
- milestone audit and completion
- ongoing progress/state continuity

## Artifact Model
GSD uses structured planning artifacts (project/requirements/roadmap/state/research) and command workflows as first-class operational objects. This aligns conceptually with this repo's `.agent/` plans + reports pattern, although naming and execution mechanics differ.

## Runtime Support Facts (as of capture)
- Explicit installer/runtime flags include: `--claude`, `--opencode`, `--gemini`, `--all`.
- No explicit Codex runtime flag was observed in upstream installer help/options.

## Notes
This file is descriptive, not prescriptive. See analysis docs for adoption recommendations.