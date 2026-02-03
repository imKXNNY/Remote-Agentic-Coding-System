# Plan: Issue #11 - WebUI layout flexibility and responsive design

## Execution Contract
- Issue: #11
- Branch: `feature/11-webui-layout-responsive`
- Plan file: `.agent/plans/11-webui-layout-responsiveness.md`

## Goal
Make WebUI layout adaptive and productivity-friendly by allowing explorer/preview toggles, responsive narrow-screen behavior, and persisted layout state.

## Acceptance Criteria
- [ ] Users can toggle explorer and preview visibility independently.
- [ ] Chat panel expands when panels are hidden or collapsed.
- [ ] Layout adapts to narrow screens with a stacked view or drawer.
- [ ] Panel state is persisted between reloads.
- [ ] Keyboard and mouse interactions remain accessible.

## Touch Points
- `webui/src/App.svelte`
- `README.md` (feature note)

## Implementation Slices
1. Add layout state model (`showExplorer`, `showPreview`, `mobilePanel`) and localStorage persistence.
2. Restructure main shell into independently toggleable explorer/chat/preview panes.
3. Add responsive mode with panel tabs on narrow viewports.
4. Ensure controls are accessible (`button`, `aria-pressed`, keyboard focus behavior).
5. Validate + document behavior.

## Verification
- `npm --prefix webui run check`
- `npm run type-check`
- `npm run lint`
- `npm test`
- `npm run build`

## Risks / Notes
- Large layout refactor concentrated in one file; keep follow-up style cleanup scoped.
- Persisted layout is per-browser local state by design.
