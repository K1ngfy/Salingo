UPDATE admins
SET
  password_hash = 'e79d5cf2dfa3b70960de9a1c4d3987c46916d3761ef18bb4635845c7d51fecfe',
  password_iterations = 100000,
  updated_at = '2026-07-25T00:00:00.000Z'
WHERE
  username = 'salingo-admin'
  AND password_hash = '1469d32a5d1ccdee53d98d95a9455fca40f5e83c0705fff602242ff324bc5c63'
  AND must_change_password = 1;
