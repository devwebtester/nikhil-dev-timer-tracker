
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
  'admin-1792486013947-bb22cae3',
  'admin',
  'admin@codesdot.com',
  'b207baed85822b0ec08f0f94f6e9f343517e173aba66e17e372cf9f5506baa2c',
  '44f2533f1918ffee5d9a499def818f04',
  100000,
  1,
  '2026-10-20T08:46:54.005Z',
  NULL
)
ON CONFLICT(email)
DO UPDATE SET
  name = excluded.name,
  password_hash = excluded.password_hash,
  password_salt = excluded.password_salt,
  iterations = excluded.iterations,
  active = 1;
