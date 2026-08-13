# HeavyUser design direction

## Product thesis

HeavyUser is a daily execution surface for people who carry a lot of active work. The first screen has one job: make the next important task obvious while keeping the day's time commitments visible in a planner. It is a workbench, not a dashboard.

## Current product and visual scope

This phase contains a restrained application shell and exactly two work regions:

1. A slim task-view rail with task buckets and completion controls.
2. A quiet top bar with notification and profile controls.
3. Task views, occupying 60% of the desktop work surface.
4. A single-day vertical planner, occupying 40% of the desktop work surface.

At widths below 900px, the work regions become one column with tasks first and calendar second. The sidebar becomes a compact horizontal rail. The workspace is protected by a dedicated passwordless account gate, while the main product surface remains a single focused screen with no dashboard card grid.

The planner shows live events from connected Google Calendar Spaces and a clear connect/reconnect state when Calendar access is unavailable. Tasks are the first reading priority: add, edit title, duration, start date, deadline, and priority, complete/uncomplete, delete, and reorder all work in the authenticated workspace and persist to Supabase. Supabase is the source of truth for tasks; a user-scoped browser cache is kept only as a recovery backup and is never imported into an empty cloud account automatically. New tasks default to Normal priority with no dates or estimate so capture stays low-friction. Four task views classify work from those dates: All shows every incomplete task, Backlog has no schedule, Today includes overdue work plus work due or available today, and Upcoming has a future start or deadline. By default, incomplete tasks sort by priority and then deadline; completing a task moves it to the bottom, while drag-and-drop enables a saved custom order. Dates use the fixed `DD Mmm YY` format everywhere, including task rows, editors, and planner labels. The task list should feel like a Things-style task queue: low-friction capture, a clear focus row, a focused edit dialog, and controls that stay quiet until the row is hovered or focused.

The connected Calendar surface also supports Calendar-backed Spaces/Sub-spaces, managed task schedule blocks, automatic scheduling, busy-time protection, provider conflict recovery, and durable timer state. These behaviors are governed by `ARCHITECTURE.md`; this file remains the visual and interaction authority. Do not hide provider, scheduler, timer, or persistence failures behind optimistic labels.

The profile menu includes account details, profile editing, sign-out, and a dedicated Settings page. The profile editor stores a display name in Supabase Auth metadata and a private avatar in Supabase Storage. Optional Night owl mode is stored in the user's `heavyuser_settings` Auth metadata and lets a person choose when their task day starts, defaulting to 4:00 AM. Existing browser-local settings migrate once when no cloud preference exists. Before that cutoff, date-based task views and date labels continue to use the previous day; at the cutoff, the next day becomes active. The preference does not change task data or cloud task synchronization.

## Visual principles

- **Compact:** information density should feel useful, with 10–30px spacing rather than large marketing-page whitespace.
- **Flat:** the shadcn Lyra preset keeps structure boxy and sharp: 1px borders, alignment, and a green focus rail do the work; avoid ornamental shadows and gradients.
- **Quiet until useful:** neutral surfaces carry the majority of the screen. Preset green appears for active focus, current time, today state, and completion.
- **One memorable gesture:** the green current-focus rail and matching current-time line connect the task that matters now to the time block protecting it.
- **Task-first:** the task list is the primary reading order. Keep metadata to estimated duration, deadline, and priority; avoid decorative copy, duplicated counts, and extra labels.
- **Surface continuity:** the sidebar, top bar, and work surface share the same white surface; hierarchy comes from the 1px rules.
- **Light theme first:** use the preset's light tokens in this phase. Keep the generated dark tokens available for shadcn compatibility, but do not add a theme switcher.

## Tokens

| Role | Value | Usage |
| --- | --- | --- |
| Background | `--canvas` | Page canvas derived from the preset neutral scale |
| Surface | `--card` | Sidebar, top bar, and work regions |
| Subtle surface | `--muted` | Neutral task hover and calendar events |
| Ink | `--foreground` | Main text |
| Muted | `--muted-foreground` | Supporting text |
| Line | `--border` | Borders and timeline rules |
| Strong line | `--input` | Unselected checkboxes and neutral event edges |
| Primary green | `--primary` | Active, current, focus, today, and completion |
| Green wash | `--primary-soft` | Active row and active event backgrounds |
| Green focus line | `--primary-line` | Focused task and event borders |
| Destructive | `--destructive` | Delete affordance on hover |

The shadcn preset is `lyra` with neutral base, green theme, Inter, and default radius. HeavyUser follows Lyra's boxy geometry with square controls and no pill-shaped UI rectangles. Small status dots may remain circular.

## Typography

Use Inter from the shadcn preset as the primary family, with the system sans stack as a resilient fallback. Region titles sit at 16px. Task titles sit at 13px with weight 650. Priority labels use 9px uppercase text with generous tracking. Time values use tabular numerals and a 12-hour display by default.

## Layout

Desktop composition:

```text
┌──────────────────────────── 60% ───────────────────────────┬──────────── 40% ────────────┐
│ Task views                                 Add task        │ Planner              Today │
│ ──────────────────────────────────────────────────────────── │ ─────────────────────────── │
│ □ Current task                                  45 min      │ 8:00 AM  Plan the day     │
│ □ Next task                                     25 min      │ 9:00 AM  Deep work        │
│ □ Next task                                     15 min      │          ─ current time  │
│ ✓ Completed task                                20 min      │ 11:30 AM Design review   │
│                                                            │ 1:00 PM  Lunch           │
└────────────────────────────────────────────────────────────┴─────────────────────────────┘
```

The outer workspace uses `grid-template-columns: 3fr 2fr` with no decorative gap so the two regions read as one continuous work surface. The left list is allowed to grow naturally; the calendar fills the available height and uses a nine-hour visible window: the previous hour plus the next eight hours.

## Component boundaries

- `Home` owns the two-region page composition, task interactions, and user-scoped recovery cache. Auth, cloud task sync, and live calendar data live in their dedicated boundaries.
- Task rows are semantic `article` elements with a status marker, title, estimated duration, deadline, priority, and compact drag/edit/delete controls. Duration, deadline, and priority occupy fixed columns so the list scans vertically. The edit control opens a modal dialog so start date and deadline remain easy to compare.
- Task rows select the focus row when clicked or activated with Enter/Space, reorder through native drag-and-drop, and support Up/Down keyboard reordering. The checkbox toggles completion, the pencil edits all task fields, and the trash icon deletes.
- Calendar events are semantic list items positioned against a single timeline.
- `globals.css` is the source of truth for the initial visual system. Do not scatter one-off colors through JSX.
- The generated shadcn utility and button files remain available for future slices, but do not add more components speculatively.

## Content rules

Use plain, active language. Task titles should describe the work, not the implementation. Task rows show only estimated duration, deadline, and priority as supporting metadata. Calendar entries should name the commitment and show its time range. Account copy should say what happens next, especially when a link is sent or local tasks are kept as a backup. Avoid feature marketing, empty claims, duplicated counts, and copy that suggests collaboration already works.

## Accessibility and responsive behavior

- Use one `h1` for task views and one `h2` for the planner region.
- Keep the two regions as semantic `section` elements with accessible labels.
- Preserve visible focus outlines for future controls.
- Respect reduced-motion preferences.
- Keep task titles on one line with ellipsis when space is tight; hide secondary state labels below 620px while keeping duration, deadline, and priority visible.
- Stack tasks above calendar at 899px and below.
