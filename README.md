# SecureAuth - JWT Authentication with React, Node.js, Express and PostgreSQL

A production-grade, full-stack authentication system demonstrating **Zero-LocalStorage JWT security**. The short-lived Access Token is kept **strictly in React memory**, while the Refresh Token is stored as an **HttpOnly, SameSite cookie** and tracked in PostgreSQL using **deterministic SHA-256 hashing**, **atomic single-use rotation**, and **automatic token-reuse detection**.

---

## Table of Contents
- [Architecture and Threat Model](#architecture-and-threat-model)
- [Project Directory Structure](#project-directory-structure)
- [Database Design and SQL Schema](#database-design-and-sql-schema)
- [Authentication and Rotation Lifecycle](#authentication-and-rotation-lifecycle)
- [Installation and Quickstart Guide](#installation-and-quickstart-guide)
- [Verification of 15 Test Scenarios](#verification-of-15-test-scenarios)
- [API Reference and cURL Testing Guide](#api-reference-and-curl-testing-guide)

---

## Architecture and Threat Model

| Threat | Attack Vector | Mitigation in This Project |
| :--- | :--- | :--- |
| **XSS Token Theft** | Injected JavaScript reads `localStorage` / `sessionStorage` | **Zero-LocalStorage:** Access tokens reside exclusively in React state and closures. Web storage APIs contain 0 tokens. |
| **XSS Cookie Theft** | Injected JavaScript reads `document.cookie` | **HttpOnly Flag:** Browser enforces that the refresh cookie cannot be accessed or read by any client-side JavaScript. |
| **CSRF Exploitation** | Cross-site unauthorized request execution | **SameSite=Lax + Path Restriction:** Cookie is scoped to `/api/auth` with strict CORS origin verification. |
| **Database Dump Breach** | Compromised database dump exposes raw session tokens | **Deterministic SHA-256 Hashing:** Raw tokens are never persisted in PostgreSQL. An attacker cannot use database hashes to authenticate. |
| **Token Replay / Theft** | Intercepted refresh token is re-used by an attacker | **Atomic Single-Use Rotation & Reuse Detection:** Presenting a previously rotated token triggers immediate revocation of ALL active sessions for that user account. |
| **Concurrency Race Conditions** | Parallel requests fire simultaneous refresh calls | **Row-Level Locking (`SELECT ... FOR UPDATE`):** Handled within an isolated PostgreSQL transaction, backed by frontend promise deduplication. |

---

## Project Directory Structure

```text
.
|-- backend/
|   |-- database/
|   |   `-- schema.sql                  # PostgreSQL table definitions and indexes
|   |-- sql/                            # Modular SQL directory
|   |-- src/
|   |   |-- config/
|   |   |   `-- database.js             # pg Connection pool with parameterized queries
|   |   |-- controllers/
|   |   |   `-- auth.controller.js      # Register, Login, Refresh, Profile, Logout
|   |   |-- middleware/
|   |   |   `-- auth.middleware.js      # Bearer token verification and error codes
|   |   |-- models/
|   |   |   |-- user.model.js           # Parameterized SQL queries for 'users'
|   |   |   `-- refreshToken.model.js   # SQL queries with row locking for 'refresh_tokens'
|   |   |-- routes/
|   |   |   `-- auth.routes.js          # API routing definitions
|   |   |-- services/
|   |   |   `-- token.service.js        # JWT signing, SHA-256 hashing, atomic rotation
|   |   |-- sql/                        # SQL files loaded into runtime cache
|   |   |-- utils/
|   |   |   |-- cookie.js               # HttpOnly cookie helpers
|   |   |   `-- logger.js               # ANSI terminal color logger (No icons)
|   |   |-- app.js                      # Express configuration, CORS, and request logging
|   |   `-- server.js                   # Server bootstrap and graceful shutdown
|   |-- .env.example
|   |-- package.json
|   `-- package-lock.json
|
|-- frontend/
|   |-- src/
|   |   |-- api/
|   |   |   `-- auth.api.js             # Fetch wrapper, memory token storage, shared 401 retry
|   |   |-- components/
|   |   |   |-- ProtectedRoute.jsx      # Route guard with session restoration loading state
|   |   |   `-- Loading.jsx             # Minimalist circular loading spinner
|   |   |-- context/
|   |   |   |-- AuthContext.jsx         # Global auth state, refresh on mount, login/logout
|   |   |   `-- DialogContext.jsx       # Modal dialog system for confirmations and alerts
|   |   |-- pages/
|   |   |   |-- Login.jsx               # Login view with show/hide password toggle
|   |   |   |-- Register.jsx            # Registration view with validation dialogs
|   |   |   `-- Dashboard.jsx           # Security Architecture documentation portal and CLI
|   |   |-- App.jsx                     # Router and Navigation Header
|   |   |-- main.jsx                    # Application entrypoint
|   |   `-- index.css                   # Monochrome design system with Geist typography
|   |-- index.html                      # HTML5 template loading Geist and Geist Mono fonts
|   |-- vite.config.js                  # Vite build configuration (Port 3000)
|   |-- .env.example
|   |-- package.json
|   `-- package-lock.json
|
|-- postman_collection.json             # Pre-configured API test suite
|-- README.md                           # Project documentation
`-- .gitignore                          # Root ignore definitions for secrets and dependencies
```

---

## Database Design and SQL Schema

Connect to PostgreSQL and create the database `jwt_auth_db`:

```sql
CREATE DATABASE jwt_auth_db;
```

Execute `backend/database/schema.sql`:

```sql
-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));

-- 2. Refresh Tokens Table (SHA-256 Hashes Only)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
```

---

## Authentication and Rotation Lifecycle

### 1. User Login Flow
```text
Client (Browser)             Express Backend                 PostgreSQL
       |                            |                            |
       |-- POST /api/auth/login --->|                            |
       |   { email, password }      |-- Verify bcrypt hash ----->|
       |                            |<-- User Record Valid ------|
       |                            |                            |
       |                            |-- Insert SHA256(Token) --->|
       |<-- Set-Cookie: HttpOnly ---|                            |
       |<-- JSON: { accessToken } --|                            |
       |                            |                            |
[Save token in React RAM]
```

### 2. Page Refresh (F5 / Tab Restore)
```text
Client (Browser)             Express Backend                 PostgreSQL
       |                            |                            |
[React RAM wiped (empty)]           |                            |
       |                            |                            |
       |-- POST /api/auth/refresh ->|                            |
       |   (Cookie sent by browser) |-- BEGIN TRANSACTION ------>|
       |                            |-- SELECT ... FOR UPDATE -->|
       |                            |-- Check Revoked / Expired -|
       |                            |-- UPDATE revoked_at = NOW -|
       |                            |-- INSERT new token hash -->|
       |                            |-- COMMIT TRANSACTION ----->|
       |<-- Set-Cookie: newCookie --|                            |
       |<-- JSON: { accessToken } --|                            |
       |                            |                            |
[Save new token in React RAM]
       |-- GET /api/auth/profile -->|                            |
       |   Authorization: Bearer    |                            |
       |<-- 200 OK User Profile ----|                            |
[User remains logged in seamlessly]
```

### 3. Token Reuse Detection (Compromised Token Alert)
```text
Attacker                     Express Backend                 PostgreSQL
       |                            |                            |
       |-- POST /api/auth/refresh ->|                            |
       |   (Replayed Old Cookie)    |-- BEGIN TRANSACTION ------>|
       |                            |-- SELECT ... FOR UPDATE -->|
       |                            |-- revoked_at IS NOT NULL! -|
       |                            |   [SECURITY ALERT DETECTED]|
       |                            |-- Nuclear Invalidation: -->|
       |                            |   Revoke ALL user tokens!  |
       |                            |-- COMMIT TRANSACTION ----->|
       |<-- 403 Forbidden Response -|                            |
[Attacker blocked; legitimate user forced to re-authenticate]
```

---

## Installation and Quickstart Guide

### Prerequisites
- Node.js >= 18.0.0
- PostgreSQL >= 14 running on port 5432

### Step 1: Initialize Database
```bash
psql -U postgres -c "CREATE DATABASE jwt_auth_db;"
psql -U postgres -d jwt_auth_db -f backend/database/schema.sql
```

### Step 2: Configure and Start Backend
```bash
cd backend
npm install
```

Configure `backend/.env` (reference `backend/.env.example`):
```env
PORT=5000
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/jwt_auth_db
ACCESS_TOKEN_SECRET=8f4a7c29e1d84b55a02e77b63f1092e4dcba88102456e7920ab31e89cf1243ea
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

Start the backend server:
```bash
npm run dev
# Server listening on http://localhost:5000
```

### Step 3: Configure and Start Frontend
Open a separate terminal window:
```bash
cd frontend
npm install
```

Configure `frontend/.env` (reference `frontend/.env.example`):
```env
VITE_API_URL=http://localhost:5000/api
```

Start the Vite development server:
```bash
npm run dev
# Vite dev server running on http://localhost:3000
```

---

## Verification of 15 Test Scenarios

| Number | Security Scenario | Verification Method | Expected Outcome |
| :--- | :--- | :--- | :--- |
| **01** | Register a new user | Submit registration form on `/register`. | Status 201 Created. Account created modal displayed; redirect to `/login`. |
| **02** | Reject duplicate email | Submit registration with the same email. | Status 409 Conflict with code `EMAIL_ALREADY_EXISTS`. |
| **03** | Login with valid credentials | Authenticate via `/login`. | Status 200 OK. Memory access token saved, HttpOnly cookie set, redirected to `/dashboard`. |
| **04** | Reject invalid credentials | Submit incorrect password on `/login`. | Status 401 Unauthorized with code `INVALID_CREDENTIALS`. |
| **05** | Access protected route | Click "Test /profile" on Dashboard. | Status 200 OK. User profile retrieved using Bearer token header. |
| **06** | Reject unauthorized request | Execute `curl http://localhost:5000/api/auth/profile` without header. | Status 401 Unauthorized with code `NO_TOKEN_PROVIDED`. |
| **07** | Auto-retry on expired token | Wait for 15-minute token expiration (or set `15m` to test value). | 401 interceptor silently invokes `/refresh` and replays the original request with new token. |
| **08** | Browser refresh persistence | Press F5 on `/dashboard`. | React state resets, silent `/refresh` executes, and user stays authenticated. |
| **09** | Inspect browser storage | Open DevTools -> Application -> Local Storage. | 0 tokens stored in `localStorage` or `sessionStorage`. |
| **10** | Verify cookie security flag | Open DevTools -> Application -> Cookies. | `jwt_auth_refresh` has `HttpOnly` enabled and `Path=/api/auth`. |
| **11** | Verify JavaScript isolation | Type `document.cookie` in DevTools Console. | Refresh token cookie is absent and inaccessible to JavaScript. |
| **12** | Atomic single-use rotation | Click "Rotate /refresh" on Dashboard. | Database marks old token as revoked (`revoked_at`) and inserts new hash atomically. |
| **13** | Token reuse detection | Replay an already-revoked refresh token hash. | Status 403 Forbidden. Backend triggers nuclear revocation across all active sessions. |
| **14** | Concurrent request deduplication | Click "Test 5x Concurrent" on Dashboard. | Exactly 1 refresh network call is dispatched; all 5 requests resolve concurrently. |
| **15** | Logout and session revocation | Click "Sign Out" and confirm in dialog. | Status 200 OK. Token revoked in database, cookie cleared, redirected to `/login`. |

---

## API Reference and cURL Testing Guide

### 1. Register User
```bash
curl -i -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Developer", "email": "dev@example.com", "password": "SecurePassword@2026"}'
```

### 2. Login User
```bash
curl -i -c cookies.txt -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "dev@example.com", "password": "SecurePassword@2026"}'
```
*Saves the HttpOnly refresh token cookie into `cookies.txt` and returns the in-memory access token in JSON.*

### 3. Access Protected Profile
```bash
curl -i -X GET http://localhost:5000/api/auth/profile \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>"
```

### 4. Rotate Refresh Token
```bash
curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:5000/api/auth/refresh \
  -H "Content-Type: application/json"
```

### 5. Logout and Revoke Session
```bash
curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:5000/api/auth/logout
```
