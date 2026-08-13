# HeavyUser root-fix implementation baseline

Date: 2026-08-14 (Asia/Dhaka)

## Starting point

- Authoritative checkout: `/Users/kowshik/Projects/HeavyUser`
- Branch: `main`
- Starting commit: `9804de09229eb2cbfd6877431b549c9663e48eb2`
- Remote branch: `origin/main`
- Existing changed files: 13 tracked files plus the existing process-audit report
- Existing generated drift: `tsconfig.json`, SHA-256 `829b4ab8d07a7db80a497d690ac2d2f0f4a67ff103270b7470081dd592d7a34d`

## Batch A classification

The existing application changes are preserved as one cohesive planner/
Calendar/scheduler batch. They add Night Owl work-window resolution, settings
explanations, active-block timing protection, browser mocks, and regression
coverage. The batch passed the baseline checks below and is not discarded or
mixed with unrelated product work.

The generated `tsconfig.json` change is parked as generated baseline state. It
is not treated as a product behavior change; the isolated E2E wrapper must
restore this exact content after each run.

## Baseline checks

| Check | Evidence |
|---|---|
| Vitest | 18 files, 139 tests passed |
| Playwright | 16 tests passed |
| ESLint | Passed |
| TypeScript | Passed |
| Production build | Passed |
| Linked provider proof | Not run as an authenticated QA journey in this baseline |
