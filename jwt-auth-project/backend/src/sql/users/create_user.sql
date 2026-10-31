-- Insert a newly registered user with bcrypt password hash
INSERT INTO users (name, email, password_hash)
VALUES ($1, LOWER($2), $3)
RETURNING id, name, email, created_at, updated_at;
