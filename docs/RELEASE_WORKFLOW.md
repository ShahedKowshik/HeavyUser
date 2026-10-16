# HeavyUser — browser-only development, staging, and production

**Three distinct places, one GitHub repository and one Vercel project.**

| Branch | Purpose | Deploy automatically? | Domain |
| --- | --- | --- | --- |
| `development` | Collect incremental changes. GitHub tests are allowed; code is not yet previewed. | **No** | None |
| `staging` | A reviewed development batch; the latest working interactive website. | **Yes, only when staging is updated deliberately** | `staging.heavyuser.app` (DNS must be configured) |
| `main` | Approved, public release | **Yes, only when a reviewed change is merged** | `web.heavyuser.app` |

The `staging` and `development` branches exist. As of this documentation the staging domain is registered with the Vercel project, but Cloudflare DNS is external and the dedicated staging database has **not** been configured. **Do not enable staging auto-deploy until staging database connection values have been set**. Staging still points to the main database by default in Vercel Preview environment variables.

## Everyday process — no Mac or local server

1. Work from ChatGPT using GitHub connected tools. Commit small changes to `development` or another feature branch, never directly to `staging` or `main`.
2. GitHub Actions runs type-checks, tests and build. These do not require a Vercel deployment and do not count toward Vercel's deployment quota.
3. **End of session** (recommended), or once every 1–2 hours if an active session requires it: promote the tested `development` commit to `staging`. This is one branch update and therefore one Vercel preview deployment.
4. Wait for successful Vercel deployment. Open the same permanent `staging.heavyuser.app` URL in the browser on desktop or phone. The branch hostname provided by Vercel works without Cloudflare DNS, subject to Vercel deployment protection.
5. If staging passes visual/functional inspection and owner approval, merge the reviewed changes into `main`; verify GitHub Actions and Vercel production READY at `web.heavyuser.app`. **Never automatically promote staging to production based only on a timer.**
6. If tests fail, keep existing staging and production versions unchanged. Stop an unready release rather than skipping tests.

**Deploy limits**: One deployment per approved staging batch plus production releases, rather than one deployment for every incremental commit. Hobby limits still apply to staging and production combined. Use end-of-session batch publishing as the default.

## Data isolation — required before first interactive staging deploy

The existing Vercel Preview variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are currently shared with Production. Do **not** assume staging is safe for live data. Preferred setup:
- A separate Supabase project for staging (obtain permission and verify project cost before creating it).
- Apply versioned schema migrations to staging only, with no production habit records copied into staging.
- Configure Vercel Preview **branch-specific** env overrides for the `staging` branch, pointing to that test backend.
- Create a test login on staging and verify it cannot access production habit data. Do not connect the staging branch to production database write credentials.
- Review environment variables and custom domain routing before releasing the first staging build.

If staging must share a backend temporarily, only use explicitly isolated test accounts with an accepted risk, and never run destructive migrations against the production database for testing.

## Vercel routing setup

The staging branch domain `staging.heavyuser.app` is registered and associated with the `staging` branch. Its authoritative DNS is externally hosted on Cloudflare and currently lacks the correct record. Add `staging` CNAME to the exact target that Vercel currently recommends in its domain inspector, then verify Vercel domain health. Do not alter `web.heavyuser.app` DNS.

Vercel’s automatic Git build gate is `vercel.json` with `git.deploymentEnabled`: allow `main`, allow `staging`, disable every other branch.

Note: The `staging` branch intentionally still has the old *all-preview-disabled* configuration until the isolated database is ready. Moving the new configuration onto staging will enable the first deployment.

## References

- https://vercel.com/docs/git#multiple-preview-phases
- https://vercel.com/docs/domains/working-with-domains/assign-domain-to-a-git-branch
- https://vercel.com/docs/project-configuration/git-configuration
- https://vercel.com/docs/deployments/environments
