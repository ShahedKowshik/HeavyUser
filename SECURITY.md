# Security policy

HeavyUser stores personal habit records. Please do not post vulnerabilities, private records, tokens, passwords, or working exploit details in public GitHub Issues.

## Report privately

Use **GitHub private vulnerability reporting**, if the repository's **Security → Report a vulnerability** option is available. If it is not available, contact the maintainer using an existing private contact method listed on their [GitHub profile](https://github.com/ShahedKowshik). Do not disclose sensitive details publicly while seeking a private reporting channel.

A useful report includes the affected component, observed impact, reproduction conditions, and any relevant non-sensitive logs. Please avoid accessing another person's data or conducting disruptive production tests.

## Scope and response

This is an early-stage product. The project does **not** currently promise a vulnerability-response SLA, third-party security audit, or formal bug bounty.

Security-relevant areas include authentication, session handling, Supabase row-level access, account data export, private avatar storage, history editing, undo, and permanent deletion. Source-level tests alone do not establish that production database permissions are correct.

## Dependencies and credentials

- Only publishable Supabase configuration values belong in `NEXT_PUBLIC_*` environment variables.
- Never commit API secrets, service-role keys, user tokens, or production database dumps.
- Rotate and revoke any accidentally disclosed credential promptly.
