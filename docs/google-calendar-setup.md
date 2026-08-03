# Google Calendar private-test setup

HeavyUser now supports one writable Google Calendar per signed-in user. The application owns the OAuth flow and stores Google tokens encrypted on the server. This page lists the small amount of account-owned setup that must exist before the integration can connect.

## What Codex can do for you

The repository contains the OAuth routes, Supabase tables, token encryption, event sync, webhook handler, calendar picker, event editor, conflict handling, and environment template.

Creating the Google Cloud project, choosing its owner, accepting Google Cloud terms, and approving the OAuth consent screen are account-level actions. They must be completed by an owner of the Google account or Workspace. For private testing, Google verification is normally not needed when the app is restricted to the project’s internal Workspace users or remains in testing mode, but the Google Cloud Console is the final authority for the project’s current status.

## Google Cloud Console

1. Create or select a Google Cloud project.
2. Enable **Google Calendar API**.
3. Configure the OAuth consent screen as an **Internal** app if every tester belongs to the same Google Workspace organization. Otherwise keep it in **Testing** and add the private testers explicitly.
4. Add the HeavyUser app name, logo, support email, and developer contact email.
5. Add these scopes:

   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`

6. Create a **Web application** OAuth client.
7. Add the redirect URI for each environment:

   - Local: `http://localhost:3000/api/google/calendar/callback`
   - Deployed: `https://YOUR-PRIVATE-DOMAIN/api/google/calendar/callback`

The webhook URL is not entered as an OAuth redirect URI. It is:

`https://YOUR-PRIVATE-DOMAIN/api/google/calendar/webhook`

## Environment variables

Copy `.env.example` into the deployment environment and fill in:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from the OAuth client.
- `HEAVYUSER_APP_ORIGIN` with the one canonical HTTPS origin, such as `https://web.heavyuser.app`.
- `GOOGLE_REDIRECT_URI` with the exact callback URL. It must use the canonical app origin when set.
- `GOOGLE_TOKEN_ENCRYPTION_KEY` with a long random secret. Do not rotate it without re-authorizing connected calendars.
- `SUPABASE_SERVICE_ROLE_KEY` for the server-only webhook worker. Never expose this value to the browser.

## Supabase

Apply the migrations in order against the linked project. The latest security migration (`20260804000000_security_hardening.sql`) scopes event identity by user, stores only a hash of each webhook token, and removes browser access to encrypted credentials and internal scheduler state.

## Private-test behavior

- One calendar is selected per HeavyUser user.
- HeavyUser displays today only.
- Personal events can be created, edited, and deleted.
- Events with guests are displayed but read-only.
- The app-load sync works even when running on localhost.
- Automatic Google webhook delivery requires a public HTTPS deployment and the canonical app origin setting. The webhook channel is renewed automatically only after Google’s channel token is stored as a hash; requests without the matching channel token are ignored.
