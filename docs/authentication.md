# Supabase Auth and application access

Pilot-MT5 uses the self-hosted Supabase Auth service for credentials and sessions. The browser client uses only the public Supabase URL and anon/publishable key. Never place a database password, `SUPABASE_SECRET_KEY`, or legacy service-role key in a `VITE_` variable or frontend bundle.

## Sign-in and API verification

The Vercel frontend signs users in with Supabase Auth email/password and stores the managed session using the Supabase client. Every dashboard API request sends the current access token as `Authorization: Bearer <access_token>`. Express verifies it with Supabase Auth `getUser(token)`, requires a confirmed email, and synchronizes only the profile UUID/name/email into `public.users`. Express does not accept Manus cookies, locally signed sessions, or passwords verified against application tables.

The account UUID from Auth is the identity key and is referenced by application role/assignment rows. `pilot_user_access` and `pilot_user_account_access` are checked by the Express API for every dashboard operation. A matching email alone never grants member access. The owner is bootstrapped only when the confirmed Supabase email matches the server-only `PILOT_OWNER_EMAIL`, and only while no owner row exists.

## Invitations and credentials

The owner invites an email through Supabase Auth Admin. Auth sends the invitation email; the recipient sets their password with the Supabase link. Configure SMTP and the Supabase Auth site URL/redirect allowlist to include the exact Vercel frontend origin before using invitations. Passwords and password hashes are never stored in Pilot application tables. Password reset/change operations are handled by Supabase Auth, not the application database.

The API server keeps `SUPABASE_URL`, `SUPABASE_ANON_KEY` (or publishable key), and the Auth Admin `SUPABASE_SECRET_KEY`/service-role key server-side only. Use the Auth Admin key only for user invitations/revocation/password administration; never return it to the browser.

## PostgreSQL and RLS

The fresh schema migration references `auth.users(id)` and enables RLS on Pilot-owned tables. It defines a `pilot_api` NOLOGIN role; configure a dedicated database runtime login as its member and use that login in `DATABASE_URL`. Do not use the database superuser, migration owner, or Supabase Auth Admin key as the Express runtime connection. Keep PostgreSQL on a private network. This migration is prepared but has not been applied to any database.
