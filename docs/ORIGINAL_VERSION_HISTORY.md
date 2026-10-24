# HeavyUser — Original Version: History and Preservation Record

> **Historical documentation.** This document describes the original HeavyUser application built in **December 2025–January 2026**. It was added after that development period to explain the preserved code. This is not documentation for the current HeavyUser habit tracker.
>
> **Source of truth:** The frozen historical code is [\`legacy-original-v1\`](https://github.com/ShahedKowshik/HeavyUser/tree/legacy-original-v1). The true first recorded commit is [\`legacy-first-commit\`](https://github.com/ShahedKowshik/HeavyUser/tree/legacy-first-commit). The active product lives on the separate [\`main\` branch](https://github.com/ShahedKowshik/HeavyUser/tree/main).

## At a glance

| Item | Verified record |
| --- | --- |
| Product | HeavyUser — original all-in-one personal productivity application |
| First recorded commit | [December 23, 2025](https://github.com/ShahedKowshik/HeavyUser/commit/066260d584814ac61409571ab7e7aadfd1857430) |
| Last commit in the original archive | [January 20, 2026](https://github.com/ShahedKowshik/HeavyUser/commit/338928ab8ab915eafd72cfb680f8881fb391de4a) |
| Original development history | **228 Git commits** (up to and including the last archived commit) |
| Original repository | \`ShahedKowshik/heavyuser.archive\`, subsequently copied into this repository |
| Archived source branch | [\`legacy/original-heavyuser\`](https://github.com/ShahedKowshik/HeavyUser/tree/legacy/original-heavyuser) |
| Immutable reference points | \`legacy-first-commit\` and \`legacy-original-v1\` tags |
| Subsequent direction | Current HeavyUser was rebuilt as a focused habit tracker on \`main\` |
| Preservation import | October 17, 2026 (Bangladesh time) |
| Maintenance status | Historical reference only; not the active or supported application |

**How to interpret the dates:** The December–January dates come from the Git commit history, not verified public launch dates. A commit establishes that code was recorded; it does **not** prove a feature was released to users on that date. Original source history and later preservation notes are deliberately distinguished.

## What was the original HeavyUser?

The original HeavyUser was an attempt to combine **tasks, habits, a journal, and notes** into one personal productivity workspace. Over the recorded development period, it grew to include recurring work, time tracking, organizational tools, calendar views, authentication and Google Calendar connections. The product had a wider scope than today's habit-focused HeavyUser.

The preserved January 20 source contains the following major areas:

| Area | What the source shows | Where to inspect |
| --- | --- | --- |
| Tasks | Priorities, dates, recurring tasks, folders, tags, subtasks, task/reminder distinctions, timers and recorded sessions | [TaskSection.tsx](../components/TaskSection.tsx) |
| Habits | Check-ins and counters, targets, streaks and analytics, folders, tags and customizable logical day start | [HabitSection.tsx](../components/HabitSection.tsx) |
| Journal | Journal and gratitude-style entries, search, tags and editing | [JournalSection.tsx](../components/JournalSection.tsx) |
| Notes | Folder-based notes and TipTap rich-text editing | [NotesSection.tsx](../components/NotesSection.tsx) |
| Workspace | Dashboard, navigation, selected calendar events, settings and data fetching | [Dashboard.tsx](../components/Dashboard.tsx) |
| Accounts | Supabase authentication, including Google sign-in code | [AuthPage.tsx](../components/AuthPage.tsx), [App.tsx](../App.tsx) |
| Google Calendar | Retrieving events from connected calendar accounts | [googleCalendar.ts](../services/googleCalendar.ts) |
| Installable-web-app experiments | Web manifest and service-worker code | [manifest.json](../manifest.json), [sw.js](../sw.js) |

These are **features or implementations present in historical source**, not a claim that every path worked reliably, shipped publicly or works today.

## Development chronology

The entries below link to specific original commits. They record the **introduction or change visible in the commit**, not a formal version release. All dates use the Git author's recorded UTC calendar date.

| Date | What happened in the code | Evidence |
| --- | --- | --- |
| **Dec 23, 2025** | Initial repository commit; HeavyUser project structure and early task/user-profile work followed the same day. | [Initial commit](https://github.com/ShahedKowshik/HeavyUser/commit/066260d584814ac61409571ab7e7aadfd1857430) |
| **Dec 24** | Supabase-backed persistence was introduced. Journal encryption was also experimented with; the final January source does not continue encrypting new writes this way. | [Supabase](https://github.com/ShahedKowshik/HeavyUser/commit/4ab820d265cb99f2c9c2a31eee67e797d8efce54) · [Journal encryption](https://github.com/ShahedKowshik/HeavyUser/commit/44d49f5d70940143590b78302d27952f36ceccfb) |
| **Dec 25** | Recurring tasks, notes and a configurable start-of-day hour expanded the product beyond simple checklists. | [Recurrence](https://github.com/ShahedKowshik/HeavyUser/commit/179d814ee17dfd6a1135ec8f804361c496e0e2f2) · [Notes](https://github.com/ShahedKowshik/HeavyUser/commit/1eaa07a7f56cd9796af2ed9b9996f27aa9ea4d69) · [Day start](https://github.com/ShahedKowshik/HeavyUser/commit/58367f3a11d6054ac6828461e901deb7fe85a384) |
| **Dec 26** | Task drag-and-drop reordering, tags, UI components and an experimental pet companion were developed. The pet component is deprecated in the final snapshot. | [Task drag and drop](https://github.com/ShahedKowshik/HeavyUser/commit/b0087e6df3a4e287474e495435754553497b012c) |
| **Dec 27** | Habit analytics, visual refinements, feedback surfaces and a changelog received attention. | [Habit analytics](https://github.com/ShahedKowshik/HeavyUser/commit/ec5a4232cfcfc3e0bcd4c6deeb4142d978dd5569) |
| **Dec 30** | Habits were extended with goal types and counter-oriented tracking behavior. | [Habit goal types](https://github.com/ShahedKowshik/HeavyUser/commit/371559c6c8) |
| **Dec 31** | Task-time tracking, recorded sessions and initial PWA support were committed; PWA work continued and changed during January. | [Time tracking](https://github.com/ShahedKowshik/HeavyUser/commit/be18fa14e7f577a3221a21d24c782dc55d9d208a) · [PWA](https://github.com/ShahedKowshik/HeavyUser/commit/3b5ecf2d7093652fc7620d2ca1745dfc01beaec8) |
| **Jan 2, 2026** | Work continued on task-timer precision, start/stop logic and related date handling. | [Timer precision](https://github.com/ShahedKowshik/HeavyUser/commit/61e91bfc92) |
| **Jan 6** | Rich-text notes evolved, with TipTap editor integration and additional editing capabilities. | [Rich-text editing](https://github.com/ShahedKowshik/HeavyUser/commit/1d5d92893b61cf2a46b1de013de50f75477a8a6a) |
| **Jan 9** | PWA/offline caching work and UserJot-powered in-app feedback were introduced or extended. | [Offline/PWA](https://github.com/ShahedKowshik/HeavyUser/commit/b7b37d225e5e3824057c4de2006b548f9223ef9e) · [UserJot](https://github.com/ShahedKowshik/HeavyUser/commit/ed7704c4908c7f9e5c36759d4aa4fa8c18c1c965) |
| **Jan 13** | Habit folders and organization were expanded; a start-of-week setting was also added. | [Habit folders](https://github.com/ShahedKowshik/HeavyUser/commit/3f784e3a745935874821a90d73910fc0b22b8bf3) |
| **Jan 14** | Task folders and calendar-based task scheduling were introduced or enhanced. | [Task folders](https://github.com/ShahedKowshik/HeavyUser/commit/b1ce2b124bdf881175c1bf7f100e36f2990b2dcb) · [Calendar view](https://github.com/ShahedKowshik/HeavyUser/commit/43edf80e5dcf2443186b96c9b775c7d714c71b54) |
| **Jan 15** | Google Calendar API integration and OAuth-related account flows were developed. | [Calendar API](https://github.com/ShahedKowshik/HeavyUser/commit/a74a4ad082c2f5ec662327a907788f9107f4a14b) |
| **Jan 16** | Support for multiple connected calendars and additional Google Calendar interactions was developed. An earlier experimental integration was removed. | [Multiple calendars](https://github.com/ShahedKowshik/HeavyUser/commit/f45c24c73fa347a7938bde0607721f4c58ed6bc1) · [Integration removal](https://github.com/ShahedKowshik/HeavyUser/commit/4fd35ae961837ddc87787a2dfaab8bc5fa2eba5a) |
| **Jan 17** | Tasks and reminders were distinguished explicitly, alongside improvements in task display and calendar requests. | [Task vs reminder](https://github.com/ShahedKowshik/HeavyUser/commit/e1db42cf987655506166348d2bdb088b474ebdc4) |
| **Jan 20** | The final recorded changes improved Google Calendar event filtering and corrected local session state after calendar-account synchronization. | [Final original commit](https://github.com/ShahedKowshik/HeavyUser/commit/338928ab8ab915eafd72cfb680f8881fb391de4a) |

The original history also contains numerous smaller corrections, refactors, styling decisions and reversals. For the unabridged sequence, use the [original history at its exact final tag](https://github.com/ShahedKowshik/HeavyUser/commits/legacy-original-v1).

## The original technical approach

- **Frontend:** React 18, TypeScript and Vite 5.
- **UI/editor:** Lucide icons, utility/component helpers and TipTap for rich text.
- **Persistence and identity:** Supabase client library, with code for account authentication and application records.
- **Calendar:** Google OAuth and Google Calendar API integration; historical code handles multiple connected calendar accounts.
- **Device experience:** Manifest and service-worker code for PWA experiments.
- **Product metrics tooling:** Vercel Analytics and Speed Insights were included in the historical source.

References: [package.json](../package.json), [App.tsx](../App.tsx), [lib/supabase.ts](../lib/supabase.ts), [services/googleCalendar.ts](../services/googleCalendar.ts).

**Historical security context:** Earlier commits experimented with browser-side encryption; the January source writes new text without that legacy encryption and includes a backward-compatibility decryption path. The repository contains old browser-facing configuration. Do **not** assume those historical choices are suitable for a modern production system. Do not reuse historical credentials, backend services or security assumptions without a separate review.

## How this history relates to today's product

| Original HeavyUser | Current HeavyUser |
| --- | --- |
| Broad productivity workspace covering tasks, habits, journal and notes | Focused habit-tracking application |
| React/Vite application in the old history | Next.js-based application on \`main\` |
| Experimental calendar, scheduling and productivity features | Different product architecture and behavior, developed separately |
| Frozen January 2026 source and its 228 original commits | Ongoing product development on \`main\` |

This is a **historical preservation**, not a code merge. Original code was **not** merged into the present application, and this archive should not be treated as an alternate production branch. The existence of an original feature does not mean it was retained in or is available in the current product.

## Exactly what is preserved

**Preserved:** Git-tracked original source files, full commit ancestry, original authorship/timestamps/messages, the final historical source tree, and links to the first and last original commits. The imported branch retains that ancestry; later documentation commits are additional and do not change the tagged originals.

**Not proven or included by this Git import:** Historical Supabase table contents, private user records, database backups, deployment environment variables, OAuth tokens, operational uptime, every previously deployed build, externally hosted images, or working third-party accounts. Those require separate backups or records.

The historical README has been updated to focus on product history and source navigation rather than outdated setup instructions. The preserved original snapshot remains available through the historical tag linked above.

### How to inspect the past

1. **See the very first recorded state:** [\`legacy-first-commit\`](https://github.com/ShahedKowshik/HeavyUser/tree/legacy-first-commit).
2. **See the last untouched January 2026 application:** [\`legacy-original-v1\`](https://github.com/ShahedKowshik/HeavyUser/tree/legacy-original-v1).
3. **Study its evolution:** [all original commits](https://github.com/ShahedKowshik/HeavyUser/commits/legacy-original-v1), including reversible experiments and fixes.
4. **Read these retrospective notes:** [historical documentation branch](https://github.com/ShahedKowshik/HeavyUser/tree/legacy/original-heavyuser).

## Preservation and visitor-visibility policy

- The current application code and its default branch must stay independent of these historical notes.
- The source snapshots identified by the two Git tags should remain immutable.
- Retrospective material belongs on the legacy branch, not in the current application's source directories.
- This is a **public GitHub repository**: deliberately opening a branch or link is a discovery step, **not an access-control measure**. Anyone can access public branch contents. No private customer data or sensitive credentials should be added to these notes.
- If private historical records must be limited to named people, they should be held outside the public repository in an access-controlled location.

---

*Prepared retrospectively from the imported Git history in October 2026. The authoritative evidence for historical events is the linked original commits and the exact tagged source snapshots.*
