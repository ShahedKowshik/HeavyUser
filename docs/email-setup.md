# Supabase Auth email setup

HeavyUser uses Supabase Auth to create passwordless sign-in links. Supabase remains
responsible for creating and validating those links; Resend is the SMTP service that
delivers them.

## Production setup

The hosted Supabase project connected to `https://web.heavyuser.app` should use these
custom SMTP settings under **Authentication → Email → SMTP Settings**:

- Host: `smtp.resend.com`
- Port: `587` (STARTTLS)
- Username: `resend`
- Password: a dedicated Resend API key
- Sender email: `no-reply@mail.heavyuser.app`
- Sender name: `HeavyUser`

The Resend API key is a secret. Store it only in Supabase's SMTP password field. Do
not commit it, put it in `.env.example`, or expose it through a `NEXT_PUBLIC_*`
variable.

Before enabling SMTP, confirm that `mail.heavyuser.app` is verified in Resend and
that its SPF, DKIM, and DMARC records are published by DNS. A missing or incomplete
domain verification can cause delivery failures or spam placement.

Use the same sender for the Supabase Auth email types used by the project:

- Magic link
- Confirmation
- Password recovery
- Email change

The magic-link template must preserve the one-time token link used by HeavyUser:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Open HeavyUser</a>
```

The repository reference template is
`supabase/templates/magic_link.html`. Hosted template changes are made in the
Supabase Auth email-template settings.

## Local development

Keep the local Supabase email catcher enabled in `supabase/config.toml`. Local Auth
emails should be inspected in the local email UI and must not use the production
Resend API key.

If the application is pointed at the hosted Supabase project while running locally,
it will use that hosted project's SMTP settings instead. Use the local Supabase URL
when testing local email capture.

## Verification checklist

1. Request a magic link from `https://web.heavyuser.app` using an email address that
   is not a member of the Supabase organization.
2. Confirm the message arrives from `no-reply@mail.heavyuser.app`.
3. Open the link and confirm that HeavyUser signs the user in and redirects to the
   workspace.
4. Check the delivery event in the Resend dashboard.
5. Confirm expired and invalid links still return the existing HeavyUser error state.
6. Run `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

Resend SMTP details: https://resend.com/docs/send-with-smtp
Supabase custom SMTP details: https://supabase.com/docs/guides/auth/auth-smtp
