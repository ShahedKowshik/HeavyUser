# HeavyUser

HeavyUser is a focused personal productivity workspace. The first screen keeps an inbox of tasks beside a single-day calendar so work and the time protecting it can be read together.

## Current screen

- An inbox of tasks on the left at 60% of the desktop workspace.
- A single-day vertical calendar on the right at 40%.
- A minimal sidebar with Inbox and Settings, plus notification and profile controls in the top bar.
- Light theme first, compact spacing, flat borders, and square HeavyUser controls (`0px` product radius).
- The semantic green `--primary` token is used for active, current, focus, today, and completion states.
- Neutral surfaces carry the screen; `--destructive` is reserved for destructive actions.
- Tasks support add, edit, complete/uncomplete, delete, and reorder.
- Task changes persist in browser `localStorage`; the calendar is display-only.
- Inbox-only task scope; no date navigation, calendar editing, or drag-to-calendar behavior yet.

## Stack

- Next.js App Router
- React and TypeScript in `src/`
- Tailwind CSS v4
- ESLint
- shadcn `base-lyra` preset with neutral base, CSS variables, and Lucide icons
- `@/*` import alias

This environment did not expose a standalone npm executable, so the project uses the bundled pnpm runtime and keeps the package-manager path local to the development session. The source does not depend on global configuration.

## Local development

The configured project path is `/Users/kowshik/Projects/HeavyUser`.

```bash
cd /Users/kowshik/Projects/HeavyUser
pnpm dev
```

Open `http://localhost:3000` in a browser.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Project map

- `src/app/page.tsx` — functional screen, task interactions, local persistence, and typed mock data.
- `src/app/globals.css` — tokens, layout, calendar geometry, and responsive rules.
- `src/app/layout.tsx` — metadata and typography setup.
- `design.md` — visual and product constraints for this phase.
- `components.json` — exact shadcn preset configuration.
- `AGENTS.md` — concise instructions for future implementation sessions.
