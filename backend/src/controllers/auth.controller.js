const bcrypt = require('bcryptjs');
const UserModel = require('../models/user.model');
const TokenService = require('../services/token.service');
const { setRefreshTokenCookie, clearRefreshTokenCookie, COOKIE_NAME } = require('../utils/cookie');

const BCRYPT_SALT_ROUNDS = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class AuthController {
  /**
   * POST /api/auth/register
   * Registers a new user account.
   */
  static async register(req, res, next) {
    try {
      const { name, email, password } = req.body;

      // 1. Input Validation
      if (!name || typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Full name is required and must be at least 2 characters.',
        });
      }

      if (!email || !EMAIL_REGEX.test(email.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address.',
        });
      }

      if (!password || typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password is required and must be at least 6 characters long.',
        });
      }

      // 2. Check duplicate email
      const existingUser = await UserModel.findByEmail(email);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'An account with this email address already exists.',
        });
      }

      // 3. Hash password using bcrypt
      const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

      // 4. Create user in PostgreSQL
      const newUser = await UserModel.create({
        name: name.trim(),
        email: email.trim(),
        passwordHash,
      });

      return res.status(201).json({
        success: true,
        message: 'Account created successfully. You may now log in.',
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/login
   * Authenticates user, issues access token in JSON and refresh token in HttpOnly cookie.
   */
  static async login(req, res, next) {
    try {
      const { email, password } = req.body;

      // 1. Validation
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are both required.',
        });
      }

      // 2. Fetch user from PostgreSQL
      const user = await UserModel.findByEmail(email);
      if (!user) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        });
      }

      // 3. Verify password hash
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        });
      }

      // 4. Generate short-lived JWT Access Token (15 min)
      const accessToken = TokenService.generateAccessToken({
        id: user.id,
        email: user.email,
        name: user.name,
      });

      // 5. Generate cryptographically secure refresh token & store SHA-256 hash in PostgreSQL
      const { rawToken } = await TokenService.createAndStoreRefreshToken(user.id);

      // 6. Set HttpOnly Cookie with raw refresh token
      setRefreshTokenCookie(res, rawToken);

      // 7. Send access token in JSON response (stored ONLY in React memory)
      return res.status(200).json({
        success: true,
        message: 'Login successful.',
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/refresh
   * Reads refresh token from HttpOnly cookie, performs atomic rotation in PostgreSQL,
   * sets new refresh token cookie, and returns fresh access token.
   */
  static async refresh(req, res, next) {
    try {
      const rawRefreshToken = req.cookies[COOKIE_NAME];

      if (!rawRefreshToken) {
        return res.status(401).json({
          success: false,
          code: 'NO_REFRESH_TOKEN',
          message: 'Refresh token missing. Please log in.',
        });
      }

      // Atomically rotate refresh token in PostgreSQL (handles locking & reuse detection)
      const { newRawToken, userId } = await TokenService.rotateRefreshToken(rawRefreshToken);

      // Fetch user details for the new access token
      const user = await UserModel.findById(userId);
      if (!user) {
        clearRefreshTokenCookie(res);
        return res.status(401).json({
          success: false,
          message: 'User no longer exists.',
        });
      }

      // Issue brand new JWT Access Token
      const accessToken = TokenService.generateAccessToken({
        id: user.id,
        email: user.email,
        name: user.name,
      });

      // Set new rotated refresh token in HttpOnly cookie
      setRefreshTokenCookie(res, newRawToken);

      return res.status(200).json({
        success: true,
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      });
    } catch (error) {
      // If refresh fails due to expiration or reuse, clear cookie on client
      clearRefreshTokenCookie(res);
      next(error);
    }
  }

  /**
   * GET /api/auth/profile
   * Protected endpoint: Returns current user's profile information.
   */
  static async profile(req, res, next) {
    try {
      const userId = req.user.id;
      const user = await UserModel.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User profile not found.',
        });
      }

      return res.status(200).json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/logout
   * Revokes refresh token in PostgreSQL and clears the client's HttpOnly cookie.
   */
  static async logout(req, res, next) {
    try {
      const rawRefreshToken = req.cookies[COOKIE_NAME];

      if (rawRefreshToken) {
        await TokenService.revokeRefreshToken(rawRefreshToken);
      }

      clearRefreshTokenCookie(res);

      return res.status(200).json({
        success: true,
        message: 'Logged out successfully.',
      });
    } catch (error) {
      clearRefreshTokenCookie(res);
      next(error);
    }
  }
}

module.exports = AuthController;
