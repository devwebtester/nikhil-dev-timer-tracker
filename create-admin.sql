
INSERT INTO admins (
  id,
  name,
  email,
  password_hash,
  password_salt,
  iterations,
  active,
  created_at,
  last_login_at
)
VALUES (
  'admin-1792996342746-c9ec816d',
  'krupali',
  'admin23@local.com',
  '3649e542a7d6e5b405115743c0c2e315934049baa85a2a3c8fce627dc4b064b3',
  '7bb49c86e5cf01ea7d6c8147b4737f55',
  100000,
  1,
  '2026-10-26T06:32:22.797Z',
  NULL
)
ON CONFLICT(email)
DO UPDATE SET
  name = excluded.name,
  password_hash = excluded.password_hash,
  password_salt = excluded.password_salt,
  iterations = excluded.iterations,
  active = 1;
