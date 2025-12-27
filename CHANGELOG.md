# Changelog

All notable changes to the HeavyUser project will be documented in this file.

## [2025-12-27]

### Habit Analytics & UX Overhaul [05:37 PM]
#### Added
- **Progressive Gradient Colors**: Habit progress now visually shifts from Red -> Orange -> Yellow -> Green based on daily percentage achieved.
- **Quick Log Panel**: A prominent "Log Today's Progress" panel at the top of the habit detail view for instant access.
- **Improved List View**: Added a quick `(+)` button to habit cards in the list view for one-click increments.
- **Target Met Indicators**: Added combined Checkmark + Count displays to clearly show completion status while retaining numeric context.

#### Changed
- **Standardized Analytics Cards**: Moved from disparate colored borders to a clean, unified slate border design consistent with the rest of the app.
- **Layout Restoration**: Restored the Analytics grid layout to prevent cards from stacking vertically.
- **Visual Hierarchy**: Reordered the detail view to prioritize daily logging actions above historical analytics.

### Visual Identity Refinement [02:54 PM]
#### Changed
- Updated favicon to a new minimal, square design with a white checkmark on a black background.
- Replaced the sidebar `CircleCheck` icon with the actual application favicon for consistent branding.
- Bumped favicon version to `v4` for immediate cache validation.

### UI Accent Color Standardization [11:55 AM]
#### Changed
- Standardized the global primary accent color to Blue (`#0078d4`) across all sections (Tasks, Journal, Notes, Settings) to match the Habits section.
- Updated sidebar navigation active states to use the consistent blue accent.
- Changed default new tag color to blue for immediate visual consistency.
- Updated all primary action buttons (Submit, Add, Save) to use the new standardized blue.

### Sidebar Reorganization [06:40 AM]
#### Changed
- Moved 'What's New' to a prominent Updates section.
- Restored prominence to 'Feature' and 'Bug' buttons, giving them full-width stripes and distinct identifying colors.
- Improved visual hierarchy in the sidebar to ensure support tools remain easily accessible.

### Changelog Integration [06:35 AM]
#### Added
- New 'What's New' section in the sidebar with a beautiful timeline UI.
- Timestamps for each changelog entry to track multiple updates per day.

### Favicon & UI Branding [06:25 AM]
#### Added
- New high-resolution favicon reflecting the "CircleCheck" brand identity.
- Versioning query to favicon link in `index.html` to ensure immediate browser updates.

#### Changed
- Increased sidebar branding icon size from `w-7` to `w-9` for better visual prominence.
- Standardized the `git-push` workflow to include detailed summaries.
