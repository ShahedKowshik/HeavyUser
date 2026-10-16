# HeavyUser UX audit — desktop and mobile
Date: 2026-10-16
Scope: current shadcn-inspired habit tracker, account settings, weekly view and mobile web.
Method: inspected actual React components, styles, action handlers and test suite; cross-checked against Norman/Nielsen contextual menu and feedback guidance and Habitify's official help. Source-based audit, not yet a real-user usability study.

## Product standard
- **Record first.** The daily check-off, quantity +/− and timer stay visible and one action away.
- **Manage second.** Edit is clearly visible beside the selected habit name; lower-frequency Archive/Delete live next to it in a named, accessible More menu.
- **One predictable location.** No separate Archive control in a distant panel or buried at the end of an unrelated form.
- **Safe change.** Archive is immediate and reversible via Undo, while permanent Delete stays in Archive with exact-name confirmation. Never close a logging form on failed saving.
- **Mobile-first touch.** Important targets are at least 44px, with a bottom-sheet modal and safe-area spacing.
- **No lost work.** Every form has Cancel, Escape handling and a focus cycle; click outside never discards typed form data.

## Issue register — audit and implementation
| # | Severity | Observed UX friction | Resolution |
|---|---|---|---|
| 01 | High | Edit in header, Archive after charts/history | Place More adjacent to Edit in habit header; menu contains Archive |
| 02 | High | Duplicate Archive controls inside Edit form and Details | Remove both duplicates; one top contextual action |
| 03 | High | Archived Restore/Delete in a disconnected content panel | Restore in header; Delete in header's More menu |
| 04 | High | Native browser confirm adds a needless decision for reversible Archive | Archive immediately; show a clear Undo action |
| 05 | High | No immediate way to reverse archive | In-app feedback with a direct Undo/Restore action |
| 06 | Critical | Log/Sleep form closed even when network write failed | Save only closes after success, preserve typed inputs on errors |
| 07 | High | Modals close when backdrop accidentally touched | Disable backdrop dismissal for data-entry and destructive dialogs |
| 08 | High | Edit form had no explicit Cancel | Add Cancel alongside Save |
| 09 | High | Sleep and manual logging forms had no Cancel | Add Cancel and disable during pending saves |
| 10 | High | Keyboard modal interaction missing consistent Escape/tab bounds | Escape-to-close when not saving and keyboard focus trap |
| 11 | Medium | Dialog title/labels contained redundant branding/eyebrow copy | Clear, task-specific titles for Create/Edit/Log/Sleep/Archive/Delete |
| 12 | High | Quantity/manual logging helper implied addition despite replacement | Correct text to explain total versus timer sessions |
| 13 | Medium | Some habit-type and goal labels were jargon | Plain wording: Yes/no, Count, Track minutes, Record sleep, minimum/limit |
| 14 | Medium | Habit type frequency fields accepted invalid ranges before submit | Disable submit for invalid ranges and retain existing validation |
| 15 | High | Monthly arrow changed the selected recording date | Browse month independently of selected habit day |
| 16 | High | Tapping historical records often left editing controls offscreen | Select date and scroll to details header |
| 17 | Medium | No visible indication of selected day in history | aria-current + selected styling |
| 18 | Medium | Habit selection unclear to assistive tech | aria-current on selected habit, aria-pressed on check-off |
| 19 | High | Reordering still allowed accidental selection | Disable detail selection while rearranging |
| 20 | Medium | Archive screen showed a new-habit button unrelated to Archive | Hide it there, keep it in Today/All |
| 21 | Medium | Empty states had vague wording | Explain that no habit is scheduled or ask the user to add a habit |
| 22 | Medium | Mobile controls varied below comfortable targets | Normalize management/date/form targets to approximately 44px |
| 23 | Medium | Confirmation and success feedback inconsistent | Compact status message and Undo for reversible archiving |
| 24 | Medium | Account settings repeated Sign out and had an unrelated workspace eyebrow | One Sign out action, simpler account heading |
| 25 | High | Account settings backdrop could accidentally close | Remove backdrop click dismissal |
| 26 | Medium | Unclear completion summary on Today for under-limit habits | Label explicitly as completed versus scheduled |
| 27 | Low | Details heading redundant 'Quantity' and terse schedule text | Use Counter, Timer, Every day, times per week/month |
| 28 | Medium | Modal layout too cramped on small-screen browsers | Full-width bottom sheet, scrollable content, safe-area padding |

## UX evidence
- Nielsen Norman Group, *Designing Effective Contextual Menus: 10 Guidelines*: https://www.nngroup.com/articles/contextual-menus-guidelines/ — secondary actions near the relevant item, do not hide essential actions.
- Habitify Help Center, *Sort & manage habits on website & desktop*: https://intercom.help/habitify-app/en/articles/11203786-sort-manage-habits-on-website-desktop-app — edit/archive patterns and behavior.
- Habitify Help Center, *How to Pause or Cut Off Your Habits*: https://intercom.help/habitify-app/en/articles/11597864-how-to-pause-or-cut-off-your-habits — archive preserves historical data.
- Material Design snackbars: https://github.com/material-components/material-components-android/blob/master/docs/components/Snackbar.md — nonblocking feedback, one relevant action.
- WCAG 2.2 target size minimum: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html — target size and spacing principles.

## Validation and caveats
The UX audit is grounded in source code; it does **not** replace signed-in observation on the user's Mac and Android phone. Automated checks cover markup, keyboard flows, archive semantics and calendar navigation. Backend schemas, habit records, analytics calculations and data-access permissions are unchanged by this UX-only release. Existing feature functionality is intentionally preserved.
