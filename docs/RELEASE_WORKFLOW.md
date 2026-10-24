# HeavyUser — browser-only staging and controlled production releases

## Purpose

- `development`: active work in GitHub, automatically tested by GitHub Actions and previewed on Netlify after Netlify branch deploys are enabled.
- `main`: production source, published on Vercel at https://web.heavyuser.app only after an approved merge.
- `staging`: a legacy branch from the previous Vercel-only staging plan. Do not update or deploy it in this workflow.

Never merge development into main without reviewing its accumulated changes; these branches have diverged. No automatic promotion of development to production.

## Netlify first-time setup

1. In Netlify, import `ShahedKowshik/HeavyUser`, keeping **main** as the Netlify production branch. Do not select `development` as the production branch or each incremental update becomes a Netlify production deployment.
2. The initial Netlify import from main may generate a production build and consume credits, because main currently does not contain `netlify.toml`. After the site is created, before further main pushes, configure a Netlify build-ignore rule for production in the dashboard, or include the same `netlify.toml` rules in the next separately approved production release.
3. In Netlify, select Project configuration > Developer settings > Continuous deployment > Branches and deploy contexts > Configure. Choose individual branch deploys, enter `development`, and disable other automatic branch deploys and pull-request previews.
4. Set build to `npm run build`, publish to `.next`, and Node to 24. `netlify.toml` on development duplicates these settings and filters builds to development branch deploys only.
5. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` using the public configuration of the existing Supabase project. Never use service-role or secret keys. Store settings in the Netlify dashboard, not GitHub.
6. Protect the Netlify staging URL before using it with real accounts, and verify that only the intended users can access it. Give the preview a separate test account in the existing Supabase project, never your regular habit account. Staging is not a separate database.
7. Test a development branch deploy: app loads, login and habit actions work using the test account, GitHub checks pass, and no new Vercel preview deployment is created. Confirm the Netlify production branch is ignored before later main updates.

The intended staging URL is the Netlify **development branch-deploy URL**, not the project's primary Netlify production URL. Find the actual URL in the Netlify deploy details.

## Everyday use

1. Ask ChatGPT to make changes on GitHub's `development` branch.
2. Check GitHub Actions; open the Netlify development preview on desktop or mobile.
3. When the changes are approved and reviewed, merge the selected changes into `main` and verify the Vercel production deployment is READY. Do not automatically release on a timer.
4. Never perform destructive migrations or backend experiments on the shared Supabase production database.

## Deployment controls

- Vercel `vercel.json` on development blocks automatic deployments from non-main branches. The rule must also be present on future merged main commits to reliably govern all branch behavior.
- Netlify `netlify.toml` on development explicitly allows its branch-deploy build and skips Netlify production and pull-request builds. Netlify's production branch reads its **own** checked-out files; until this file reaches main, set the matching ignore policy in the Netlify UI.
- A skipped build and a branch build are different from a production deployment; verify quota behavior using the provider's billing dashboard. Manual Netlify build hooks may bypass ignore commands.
- GitHub Actions only performs type checks, Node tests, and an application build. It does not substitute for actual browser and database testing.

References:
- https://docs.netlify.com/build/configure-builds/ignore-builds/
- https://docs.netlify.com/deploy/deploy-types/branch-deploys/
- https://vercel.com/docs/project-configuration/git-configuration
