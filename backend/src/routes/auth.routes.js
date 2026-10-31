const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/auth.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

/**
 * Public Authentication Endpoints
 */

// POST /api/auth/register - Register a new account
router.post('/register', AuthController.register);

// POST /api/auth/login - Log in with email/password; returns access token & sets HttpOnly refresh cookie
router.post('/login', AuthController.login);

// POST /api/auth/refresh - Rotate refresh token via HttpOnly cookie & return new access token
router.post('/refresh', AuthController.refresh);

// POST /api/auth/logout - Revoke refresh token and clear HttpOnly cookie
router.post('/logout', AuthController.logout);

/**
 * Protected Endpoints (Requires valid Authorization: Bearer <accessToken>)
 */

// GET /api/auth/profile - Fetch current authenticated user's profile
router.get('/profile', authenticateToken, AuthController.profile);

module.exports = router;
