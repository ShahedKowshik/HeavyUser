# HeavyUser — Quiet habits redesign
## Visual direction
Redesign the existing app around Things 3's calm, predictable list hierarchy and TickTick's fast day-based habit interactions, without cloning either product or modifying the original brand assets.

**Non-negotiable constraints**
- Keep shadcn Lyra **Neutral** tokens (black, gray, white) and Inter font.
- Corners must be **0, 2 or 4px**. No pills, glass, gradients, glow, giant cards, gamified mascots or decorative illustrations.
- Compact but not tiny: important text 12–14px+, headings 20–25px, key phone actions 44px.
- Empty space is deliberate rhythm and alignment, not unused columns.
- Keep all four habit modes, counters, timers, tracking, archival, history, schedules, undo, and statistics. Never change data logic as part of this design revision.

## Before / after
1. **Sidebar**: a visual navigation boundary, practical top-level views, Archive separated under Manage, and existing account control at the bottom.
2. **Today**: name and date, simple honest `n / m completed` with a 4px indicator, date switcher, and a clean list of habits.
3. **Habit row**: 36–39px icon, 13–14px name, a single contextual status, and the existing direct +/−/check/start actions; selected row has quiet 3px inset edge.
4. **Habit details**: title and edit menu, prominent current-day input, contextual status, concise statistics; not six equally prominent dashboard cards.
5. **Trend + monthly calendar**: share one meaningful, responsive two-column progress region instead of chart/history first and the calendar many screens below.
6. **History and event log**: still fully available, but placed in labeled native accessible disclosure sections. Eliminates reporting clutter for a user who only wants to check in.
7. **Tablet and phone**: adaptive navigation; three primary destinations and a More menu for Archive and Account. Full-width content on phones, target sizes >=44px where possible, scrollable charts, minimal borders.
8. **Week**: same visual language as Today and detail screens, with accessible and keyboard-scrollable data grid.
9. **Accessibility**: 2px visible focus, meaningful status text paired with shades, #626262 readable secondary text, reduce-motion progress behavior, keyboard-accessible disclosure panels.
10. **No new color palette**: all tokens sourced from `src/app/design-system.css`, with a few existing neutrals reused.

## Technical implementation
- `src/app/page.tsx`: reorganize content and mobile navigation. Existing data operations are unchanged.
- `src/app/quiet-redesign.css`: one final cohesive visual pass loaded after the legacy sources. Existing CSS files remain for compatibility rather than risking a destructive refactor of functionality.
- `tests/quiet-redesign.test.mjs`: checks structural, semantic, data-preservation and responsive invariants.

## Acceptance / edge cases
- No habits (progress 0/0 displayed as 0%, never NaN).
- Check-off, quantity at-most and at-least, duration/timer, and sleep show the right action without a separate edit step.
- Old dates remain editable via history, when user expands it.
- Counter activity remains accessible to debug and undo.
- Archive reachable on desktop nav and mobile More.
- Reordering still enabled on All habits.
- Week view still available without changing schedules or entry calculations.
- Phone widths 320/360/390/430; tablet 768/1024; desktop 1366/1920 to be visually verified in a signed-in browser.
- Keyboard access, 200% zoom, Android Chrome, iOS Safari, and actual screen reader usability still need human/device testing. Static code tests and build do **not** prove visually perfect layouts or WCAG conformance.

**No database migration or data modification intended.**
