---
description: Create a Product Requirements Document (PRD) from the current context
argument-hint: [output-filename]
---

# Create PRD

## Goal
Generate a PRD that is specific enough to create Issues and an implementation plan.

## Output File
Write to: `$ARGUMENTS` (default: `docs/PRD.md`)

## PRD Structure

1) Executive Summary
- What we’re building and why (2–3 paragraphs)

2) Problem & Goals
- User problem
- Goals (measurable)
- Non-goals / out of scope

3) Users & Use Cases
- Personas (if known)
- Primary use cases
- Edge cases

4) Requirements
- Functional requirements (bullets)
- Non-functional requirements (performance, security, privacy, accessibility)

5) Acceptance Criteria (MVP)
- Clear, testable criteria

6) UX / UI Notes (if relevant)
- Key screens / flows
- Copy and error states

7) Technical Notes
- Constraints, dependencies, integrations
- Data model assumptions

8) Risks & Open Questions
- List unknowns that block planning/implementation

## Output extras
If possible, also output:
- Issue breakdown suggestions (titles + labels)
- Proposed milestones/sprints
