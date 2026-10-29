-- Copy NextAuth accounts into AccountKit's auth_* tables. Run only inside a
-- transaction, with NextAuth's credential writes stopped for the cutover.
-- The rehearsal CLI always rolls back; this is deliberately not a migration.
LOCK TABLE users, accounts, auth_users, auth_accounts, auth_sessions,
  auth_passkeys, auth_two_factors, auth_verifications IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE vita_accountkit_users ON COMMIT DROP AS
SELECT id::text AS id, coalesce(name, '') AS name, lower(trim(email)) AS email,
  email_verified IS NOT NULL AS verified, image, password
FROM users;

-- Google links keep the provider's subject. They answer only once a provider
-- with id "google" is configured; until then those people recover by email.
CREATE TEMP TABLE vita_accountkit_links ON COMMIT DROP AS
SELECT 'vita-' || provider || ':' || provider_account_id AS id,
  provider_account_id AS account_id, provider AS provider_id, user_id::text AS user_id
FROM accounts WHERE type = 'oidc' OR type = 'oauth';

DO $$ BEGIN
  IF EXISTS (SELECT email FROM vita_accountkit_users GROUP BY email HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM vita_accountkit_users WHERE email = '' OR email NOT LIKE '%@%')
  THEN RAISE EXCEPTION 'Account import requires address reconciliation'; END IF;

  -- Never a second writer beside a live shared runtime: nothing a person did
  -- there (a session, a passkey, a factor, a reset) may be overwritten.
  IF EXISTS (SELECT 1 FROM auth_sessions) OR EXISTS (SELECT 1 FROM auth_passkeys)
    OR EXISTS (SELECT 1 FROM auth_two_factors) OR EXISTS (SELECT 1 FROM auth_verifications)
  THEN RAISE EXCEPTION 'Account import refuses an active shared runtime'; END IF;
END $$;

INSERT INTO auth_users (id, name, email, email_verified, image)
SELECT id, name, email, verified, image FROM vita_accountkit_users
ON CONFLICT DO NOTHING;

INSERT INTO auth_accounts (id, account_id, provider_id, user_id, password)
SELECT 'vita-credential:' || id, id, 'credential', id, password
FROM vita_accountkit_users WHERE password IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO auth_accounts (id, account_id, provider_id, user_id)
SELECT id, account_id, provider_id, user_id FROM vita_accountkit_links
ON CONFLICT DO NOTHING;

DO $$ BEGIN
  -- A repeat is a no-op only for the same snapshot. Anything that drifted
  -- (an address, a password, a link) fails the whole transaction.
  IF EXISTS (
    SELECT 1 FROM vita_accountkit_users s
    LEFT JOIN auth_users u ON u.id = s.id
    LEFT JOIN auth_accounts c ON c.user_id = s.id AND c.provider_id = 'credential'
    WHERE u.id IS NULL OR u.email IS DISTINCT FROM s.email
      OR u.email_verified IS DISTINCT FROM s.verified
      OR c.password IS DISTINCT FROM s.password
      OR (s.password IS NULL AND c.id IS NOT NULL)
  ) OR EXISTS (
    SELECT 1 FROM auth_users u WHERE NOT EXISTS (SELECT 1 FROM vita_accountkit_users s WHERE s.id = u.id)
  ) OR EXISTS (
    SELECT 1 FROM vita_accountkit_links l
    LEFT JOIN auth_accounts a ON a.id = l.id
    WHERE a.id IS NULL OR a.user_id IS DISTINCT FROM l.user_id
  ) THEN RAISE EXCEPTION 'Account import snapshot differs; no changes committed'; END IF;
END $$;
