# Felicia Project — Implementation Roadmap

**Purpose:** practical work order after the architecture reset
**Reference:** `MASTER_ARCHITECTURE.md`
**Last Updated:** April 29, 2026

## Phase 2 — Stabilize the Core

Goal: make sure the current system is fully understandable and safe to extend.

### 2.1 Verify the current refactor

- Confirm `api/chat.js` still behaves as the stable entry point.
- Check that orchestrator, prompt builder, intent parsing, and action routing still agree on the same payload shape.
- Validate that chat replies, calendar actions, and memory saves still work together.

### 2.2 Tighten the memory path

- Review how memory is saved and read.
- Make sure memory semantics are clear between profile facts, long-term memory, and transient context.
- Reconcile the documentation with the actual schema and code paths.

### 2.3 Run smoke checks

- Execute the current operational checklist.
- Fix any issue that impacts chat, profile, memory, quota, calendar, or case handling.

## Phase 2 — Connect the Remaining Pages

Goal: replace local-only dashboard pieces with real backend data.

### 2.4 Goals

- Replace local array state with real goal storage.
- Add API functions for list/create/update/delete.
- Keep the UI simple until the backend contract is stable.

### 2.5 Finance

- Add persistent transaction storage.
- Connect summary cards to backend totals.
- Preserve a minimal and reliable form flow first, charts later.

### 2.6 Memory UX

- Add a real memory timeline.
- Expose search, filtering, and better browsing.
- Keep profile display tied to the canonical source.

## Phase 3 — Make the Dashboard Proper

Goal: turn the UI into a real command center.

### 3.1 Layout and navigation

- Improve page hierarchy.
- Make the dashboard feel more intentional and less placeholder-like.
- Keep the current system readable on smaller screens.

### 3.2 Daily control surfaces

- Improve Today page signal-to-noise ratio.
- Surface the most important daily actions first.
- Add visual status for mode, schedule, and memory health.

### 3.3 Case and memory visibility

- Show relevant context without overwhelming the user.
- Make cases easy to inspect from chat and from dedicated views.

## Phase 4 — Optional Extensions

Goal: add heavier capabilities only after the core is stable.

### 4.1 Voice

- Prototype voice input/output.
- Keep voice integrated with the same memory and action system.

### 4.2 Local agent / MCP

- Research how local tools can be separated safely.
- Keep the Felicia data and memory loop as the canonical backend.

### 4.3 Split tools if needed

- If a feature becomes too large, move it out of the monolith.
- Keep integration back to Felicia through API or sync.

## Working Order

Use this order unless a blocker changes the priority:

1. Stabilize current chat flow.
2. Run smoke checks.
3. Connect Goals.
4. Connect Finance.
5. Improve Memory UX.
6. Refresh docs.
7. Start dashboard polish.
8. Only then consider voice/local extensions.

## Decision Filter

Before adding a new feature, ask:

- Is it core or optional?
- Can it stay lightweight inside this repo?
- Does it require persistent memory?
- Does it help daily use right now?
- Will it create extra maintenance that should be split out instead?

If the feature is heavy, plan it as an extension instead of forcing it into the core.
