-- ==============================================================================
-- SQL Queries: User Operations
-- ==============================================================================

-- 1. Find User by Email
-- Used during login and duplicate registration check
SELECT id, name, email, password_hash, created_at, updated_at
FROM users
WHERE LOWER(email) = LOWER($1)
LIMIT 1;

-- 2. Find User by ID
-- Used to retrieve profile data for authenticated tokens
SELECT id, name, email, created_at, updated_at
FROM users
WHERE id = $1
LIMIT 1;

-- 3. Create User
-- Used during registration
INSERT INTO users (name, email, password_hash)
VALUES ($1, LOWER($2), $3)
RETURNING id, name, email, created_at, updated_at;
