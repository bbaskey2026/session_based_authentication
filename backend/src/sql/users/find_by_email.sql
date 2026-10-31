-- Find user by email (case-insensitive)
SELECT id, name, email, password_hash, created_at, updated_at
FROM users
WHERE LOWER(email) = LOWER($1)
LIMIT 1;
