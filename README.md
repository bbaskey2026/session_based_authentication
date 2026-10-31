# Secure JWT Authentication with React, Node.js, Express & PostgreSQL

A production-grade, full-stack authentication system demonstrating **Zero-LocalStorage JWT security**. The short-lived Access Token is kept **strictly in React memory**, while the Refresh Token is stored as an **HttpOnly, SameSite cookie** and tracked in PostgreSQL using **deterministic SHA-256 hashing**, **atomic single-use rotation**, and **automatic token-reuse detection**.

---

## 📑 Table of Contents
- [Architecture & Security Overview](#architecture--security-overview)
- [Project Directory Structure](#project-directory-structure)
- [Database Design](#database-design)
- [Authentication Flow & Refresh Lifecycle](#authentication-flow--refresh-lifecycle)
- [Installation & Quickstart Guide](#installation--quickstart-guide)
- [Verification of 15 Test Scenarios](#verification-of-15-test-scenarios)
- [Postman & cURL API Testing Guide](#postman--curl-api-testing-guide)

---

## 🛡️ Architecture & Security Overview

| Threat | Attack Vector | How This Project Eliminates It |
| :--- | :--- | :--- |
| **XSS Token Theft** | Malicious scripts read `localStorage` / `sessionStorage` | **Access token stored ONLY in React memory.** It cannot be extracted by JavaScript from web storage. |
| **XSS Cookie Theft** | Injected JavaScript reads document cookies | **`HttpOnly` flag** makes the refresh cookie completely invisible to browser JavaScript. |
| **CSRF Exploitation** | Cross-site unauthorized requests | **`SameSite: 'lax'` / `'strict'`** + explicit CORS origin prevents cross-site submission of auth cookies. |
| **Database Compromise** | Stolen DB dump exposes valid session tokens | **SHA-256 Hashing:** PostgreSQL only stores `SHA-256(refreshToken)`. A leaked database cannot be used to forge session tokens. |
| **Token Replay / Hijacking** | An intercepted refresh token is reused | **Atomic Rotation & Reuse Detection:** Tokens are strictly single-use. If a revoked token is presented, **ALL** sessions for that user are immediately invalidated. |
| **Concurrent Race Conditions** | Parallel requests fire multiple refresh calls | **PostgreSQL Row-Locking (`SELECT ... FOR UPDATE`)** inside database transactions + frontend shared promise queue. |

---

## 📂 Project Directory Structure

```text
.
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js             # pg Connection pool with parameterized queries
│   │   ├── controllers/
│   │   │   └── auth.controller.js      # Register, Login, Refresh, Profile, Logout
│   │   ├── middleware/
│   │   │   └── auth.middleware.js      # Bearer token verification & error codes
│   │   ├── models/
│   │   │   ├── user.model.js           # Parameterized SQL queries for 'users'
│   │   │   └── refreshToken.model.js   # SQL queries with row locking for 'refresh_tokens'
│   │   ├── routes/
│   │   │   └── auth.routes.js          # API routing definitions
│   │   ├── services/
│   │   │   └── token.service.js        # JWT signing, SHA-256 hashing, atomic rotation
│   │   ├── utils/
│   │   │   └── cookie.js               # HttpOnly cookie helpers
│   │   ├── app.js                      # Express configuration & CORS
│   │   └── server.js                   # Server bootstrap & graceful shutdown
│   │
│   ├── database/
│   │   └── schema.sql                  # PostgreSQL table definitions & indexes
│   ├── .env.example
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── api/
    │   │   └── auth.api.js             # Fetch wrapper, memory token storage, shared 401 retry
    │   ├── context/
    │   │   └── AuthContext.jsx         # Global auth state, refresh on mount, login/logout
    │   ├── components/
    │   │   ├── ProtectedRoute.jsx      # Route guard with session restoration loading state
    │   │   └── Loading.jsx             # Sleek glassmorphism loading spinner
    │   ├── pages/
    │   │   ├── Login.jsx               # Login form with show/hide password toggle
    │   │   ├── Register.jsx            # Registration form with confirm password validation
    │   │   └── Dashboard.jsx           # Profile viewer & interactive API testing console
    │   ├── App.jsx                     # Router & Navigation Header
    │   ├── main.jsx                    # Application entrypoint
    │   └── index.css                   # Custom modern dark glassmorphism styling
    │
    ├── index.html                      # HTML5 template with Inter & Outfit fonts
    ├── vite.config.js                  # Vite build configuration
    ├── .env.example
    └── package.json
```

---

## 🗄️ Database Design

Connect to PostgreSQL and create the database `jwt_auth_db`:

```sql
CREATE DATABASE jwt_auth_db;
```

Run `backend/database/schema.sql`:

```sql
-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Refresh Tokens Table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
```

---

## 🔄 Authentication Flow & Refresh Lifecycle

### 1. Login
```
Browser                     Express Backend                 PostgreSQL
   │                               │                            │
   │── POST /api/auth/login ──────>│                            │
   │   { email, password }         │── Verify bcrypt hash ─────>│
   │                               │<── User Record Valid ──────│
   │                               │                            │
   │                               │── Insert SHA256(Token) ───>│
   │<── Set-Cookie: refreshToken ──│                            │
   │    (HttpOnly, Secure, Lax)    │                            │
   │<── JSON: { accessToken } ─────│                            │
   │                               │                            │
[Save token in React RAM]
```

### 2. Page Refresh (F5 / New Tab)
```
Browser                     Express Backend                 PostgreSQL
   │                               │                            │
[React state wiped (RAM empty)]    │                            │
   │                               │                            │
   │── POST /api/auth/refresh ────>│                            │
   │   (Cookie sent automatically) │── BEGIN TRANSACTION ──────>│
   │                               │── SELECT ... FOR UPDATE ──>│
   │                               │── Check Revocation/Expiry ─│
   │                               │── UPDATE revoked_at = NOW ─│
   │                               │── INSERT new token hash ──>│
   │                               │── COMMIT TRANSACTION ─────>│
   │<── Set-Cookie: newRefreshToken│                            │
   │<── JSON: { accessToken } ─────│                            │
   │                               │                            │
[Save new token in React RAM]
   │── GET /api/auth/profile ─────>│                            │
   │   Authorization: Bearer <JWT> │                            │
   │<── User Profile ──────────────│                            │
[User stays logged in!]
```

---

## 🚀 Installation & Quickstart Guide

### Step 1: Clone & Configure PostgreSQL
Ensure PostgreSQL is running locally on port 5432. Create database `jwt_auth_db` and execute `schema.sql`:
```bash
psql -U postgres -c "CREATE DATABASE jwt_auth_db;"
psql -U postgres -d jwt_auth_db -f backend/database/schema.sql
```

### Step 2: Configure & Launch Backend
```bash
cd backend
npm install
```

Create `backend/.env` (or copy from `.env.example`):
```env
PORT=5000
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/jwt_auth_db
ACCESS_TOKEN_SECRET=8f4a7c29e1d84b55a02e77b63f1092e4dcba88102456e7920ab31e89cf1243ea
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

Start the backend:
```bash
npm run dev
# Server running at http://localhost:5000
```

### Step 3: Configure & Launch Frontend
Open a second terminal:
```bash
cd frontend
npm install
```

Create `frontend/.env`:
```env
VITE_API_URL=http://localhost:5000/api
```

Start the frontend:
```bash
npm run dev
# Vite dev server running at http://localhost:5173
```

---

## 🧪 Verification of 15 Test Scenarios

| Scenario | How to Verify | Expected Outcome |
| :--- | :--- | :--- |
| **1. Register a new user** | Fill out the `/register` form with valid name, email, password. | 201 Created response. Success message displayed, auto-redirect to `/login`. |
| **2. Prevent duplicate email** | Register again with the identical email address. | 409 Conflict. Clear error alert: *"An account with this email address already exists."* |
| **3. Login with valid credentials** | Log in with the registered credentials on `/login`. | 200 OK. Access token stored in memory, HttpOnly cookie set, redirected to `/dashboard`. |
| **4. Reject incorrect credentials** | Attempt login with wrong password or non-existent email. | 401 Unauthorized. Error message: *"Invalid email or password."* |
| **5. Access profile with token** | From Dashboard, click *"Test Protected API (/profile)"*. | 200 OK. Profile data loaded with status 200. |
| **6. Reject requests without token** | Run `curl -X GET http://localhost:5000/api/auth/profile` in a terminal without `Authorization` header. | 401 Unauthorized with code `NO_TOKEN_PROVIDED`. |
| **7. Handle expired access tokens** | Wait 15 minutes (or set `ACCESS_TOKEN_EXPIRY = '5s'` for testing). | API call returns 401 `TOKEN_EXPIRED`, `apiFetch` catches it, calls `/refresh`, and auto-retries seamlessly. |
| **8. Refresh browser while logged in** | Press `F5` / reload the browser tab while on `/dashboard`. | React state is cleared, `AuthContext` calls `/refresh` with the cookie, and restores the session. |
| **9. Auto-generate new access token** | Observe network tab on browser refresh. | `/api/auth/refresh` responds with new `accessToken`. |
| **10. User remains logged in after refresh** | Check UI after pressing `F5`. | User stays on `/dashboard` without being redirected to `/login`. |
| **11. Reject expired refresh tokens** | Manually change `expires_at` in DB to a past date: `UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '1 day';` and refresh. | 401 Unauthorized. Cookie cleared, user redirected to `/login`. |
| **12. Reject revoked refresh tokens (Reuse Detection)** | Replay an already rotated token hash: `UPDATE refresh_tokens SET revoked_at = NOW();`. | 403 Forbidden. **Reuse detected:** all user tokens revoked. |
| **13. Test concurrent refresh requests** | Click *"Test 5x Concurrent Requests"* in Dashboard console. | All 5 requests succeed concurrently through the shared promise queue without multiple refresh calls. |
| **14. Logout and verify token revocation** | Click *"Sign Out"* on the Dashboard. | 200 OK. In PostgreSQL, `revoked_at` is set to `CURRENT_TIMESTAMP`, and the cookie is cleared. |
| **15. Refresh browser after logout** | Press `F5` after logging out. | User remains on `/login`. No session restoration occurs. |

---

## 📬 Postman & cURL API Testing Guide

### 1. Register User
```bash
curl -i -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice Smith", "email": "alice@example.com", "password": "Password123!"}'
```

### 2. Login User (Saves HttpOnly Cookie to cookie jar)
```bash
curl -i -c cookies.txt -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "Password123!"}'
```
*Note the returned JSON `accessToken` and the `Set-Cookie: refreshToken=...; HttpOnly` header.*

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

### 5. Logout & Revoke Session
```bash
curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:5000/api/auth/logout
```
