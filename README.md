# HeavyUser

**Track habits clearly. Understand your progress. Keep showing up.**

HeavyUser is a focused habit tracker for people who want a practical daily workspace, flexible goals, and a clearer picture of their consistency — without turning every unrecorded day into a failure.

[**Open HeavyUser**](https://web.heavyuser.app) · [Report an issue](https://github.com/ShahedKowshik/HeavyUser/issues/new/choose) · [Read the product guide](docs/PRODUCT_GUIDE.md)

[![Quality checks](https://github.com/ShahedKowshik/HeavyUser/actions/workflows/ci.yml/badge.svg)](https://github.com/ShahedKowshik/HeavyUser/actions/workflows/ci.yml)

> **Project status:** Early-stage product (v0.1). The application is evolving; features and behavior may change. This repository is public for transparency, but it does not currently include an open-source license.

## What you can do

| Capability | How it helps |
| --- | --- |
| **Daily check-ins** | Mark simple habits done and review what is due today. |
| **Flexible schedules** | Set specific days, intervals, or weekly/monthly targets instead of forcing everything into a daily streak. |
| **Different ways to track** | Use check-offs, quantities, duration sessions, or detailed sleep records. |
| **Calendar history** | Review your habit activity across days and open individual records. |
| **Progress and insights** | Explore streaks, recorded-day coverage, trends, and habit-specific statistics. |
| **Correct mistakes** | Edit historical records and undo supported changes, with safeguards against conflicting updates. |
| **Keep your history** | Archive habits without erasing their records; permanent deletion requires confirmation. |
| **Account and data controls** | Manage account details and download an export of core habit data. |

**The core principle:** *Not recorded* is different from *missed*. HeavyUser distinguishes completed, partial, skipped, explicitly missed, and unrecorded days so that the dashboard and statistics communicate what was actually logged.

For examples and behavior definitions, see the [product guide](docs/PRODUCT_GUIDE.md).

## Try it

Visit **[web.heavyuser.app](https://web.heavyuser.app)** on desktop or mobile. Sign in or create an account to start recording habits.

This is an actively developed product. If something behaves unexpectedly, please [report a reproducible bug](https://github.com/ShahedKowshik/HeavyUser/issues/new/choose). Do not include private habit data, authentication tokens, or other sensitive account information in public issues.

## For developers

HeavyUser currently uses:

- **Application:** Next.js 16, React 19, TypeScript
- **Backend:** Supabase Authentication, PostgreSQL/PostgREST, and Storage
- **Hosting:** Vercel
- **Design:** Custom React controls and semantic CSS tokens, aligned with a shadcn/ui Lyra visual preset; the shadcn component library itself is **not** installed
- **Quality checks:** TypeScript type checking, Node's built-in test runner, and a production build in GitHub Actions

### Repository map

```text
.github/               CI workflow and collaboration templates
docs/                  Product, engineering, and QA documentation
src/app/               Next.js interface, page logic, and styling
src/lib/               Shared utilities
tests/                 Automated tests
DESIGN_SYSTEM.md       UI tokens and visual standards
WORKSPACE.md           Workspace layout and data-deletion behavior
```

### Run the frontend locally

Requires **Node.js 24** and npm.

```bash
npm ci
cp .env.example .env.local
# Fill in the two public Supabase configuration values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Important setup limitation:** A new Supabase project will **not** work just by providing credentials. The database schema, policies, and database functions used in production are not yet distributed as reproducible migrations in this repository. See [development setup](docs/DEVELOPMENT.md) before attempting a self-hosted installation. Never place Supabase secret/service-role keys in `NEXT_PUBLIC_*` variables.

### Quality checks

```bash
npm run typecheck
npm test
npm run build
```

The development workflow checks pushes and pull requests for `main` and `development`. GitHub CI does **not** establish full browser, accessibility, database-policy, deployment, or end-to-end test coverage.

### Documentation

| Start here | Purpose |
| --- | --- |
| [Product guide](docs/PRODUCT_GUIDE.md) | Tracking types, statuses, schedules, and recorded-data behavior |
| [Architecture](docs/ARCHITECTURE.md) | System boundaries, storage, authentication, and known technical constraints |
| [Development](docs/DEVELOPMENT.md) | Local commands, configuration, tests, and setup limitations |
| [Design system](DESIGN_SYSTEM.md) | Existing UI styling rules and tokens |
| [Habit design decisions](docs/HABIT_MRP.md) | Research and decisions behind the extended tracker |
| [Data consistency QA](docs/DATA_CONSISTENCY_QA.md) | Documented invariants and previously investigated undo issues |
| [Public launch checklist](docs/LAUNCH_CHECKLIST.md) | Remaining public-facing release preparations |
| [Release workflow](docs/RELEASE_WORKFLOW.md) | Development/staging branches, production safety and release checklist |


<details>
<summary>Explore the original HeavyUser (historical archive)</summary>

The original multi-purpose HeavyUser application was built between December 2025 and January 2026. Its **228 original commits** are preserved separately from the current habit-tracker application.

- [Read the original version's history, timeline and design decisions](https://github.com/ShahedKowshik/HeavyUser/blob/legacy/original-heavyuser/docs/ORIGINAL_VERSION_HISTORY.md).
- [Browse the historical archive branch](https://github.com/ShahedKowshik/HeavyUser/tree/legacy/original-heavyuser).
- [First commit (December 23, 2025)](https://github.com/ShahedKowshik/HeavyUser/tree/legacy-first-commit) · [Untouched original end state (January 20, 2026)](https://github.com/ShahedKowshik/HeavyUser/tree/legacy-original-v1).

This is historical source and public Git history, not a maintained application or backup of past account data.

</details>


<details>
<summary>Explore the original HeavyUser (historical archive)</summary>

The original multi-purpose HeavyUser application was built between December 2025 and January 2026. Its **228 original commits** are preserved separately from the current habit-tracker application.

- [Read the original version's history, timeline and design decisions](https://github.com/ShahedKowshik/HeavyUser/blob/legacy/original-heavyuser/docs/ORIGINAL_VERSION_HISTORY.md).
- [Browse the historical archive branch](https://github.com/ShahedKowshik/HeavyUser/tree/legacy/original-heavyuser).
- [First commit (December 23, 2025)](https://github.com/ShahedKowshik/HeavyUser/tree/legacy-first-commit) · [Untouched original end state (January 20, 2026)](https://github.com/ShahedKowshik/HeavyUser/tree/legacy-original-v1).

This is historical source and public Git history, not a maintained application or backup of past account data.

</details>

## Feedback, security, and contributions

Feature requests and non-sensitive bug reports are welcome through [GitHub Issues](https://github.com/ShahedKowshik/HeavyUser/issues). Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing code changes. For security issues, follow [SECURITY.md](SECURITY.md) **instead of opening a public issue**.

**Source availability is not an open-source license.** No permission to redistribute or reuse this project's code is implied by the repository being public. Licensing and broader contribution policy have not yet been finalized.

Maintained by [Shahed Kowshik](https://github.com/ShahedKowshik).
