const jwt = require('jsonwebtoken');

/**
 * Authentication Middleware
 * Validates the short-lived JWT Access Token passed in the Authorization header.
 * Expected format: `Authorization: Bearer <accessToken>`
 *
 * If valid, extracts payload claims and attaches them to `req.user`.
 * If invalid or expired, immediately responds with 401 Unauthorized and standard error codes.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      code: 'NO_TOKEN_PROVIDED',
      message: 'Access denied. No authorization header provided.',
    });
  }

  // Parse Bearer scheme
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      success: false,
      code: 'MALFORMED_TOKEN',
      message: "Authorization format must be 'Bearer <token>'.",
    });
  }

  const token = parts[1];

  jwt.verify(
    token,
    process.env.ACCESS_TOKEN_SECRET,
    {
      issuer: 'jwt-auth-project',
      audience: 'jwt-auth-client',
    },
    (err, decoded) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({
            success: false,
            code: 'TOKEN_EXPIRED',
            message: 'Access token has expired. Please refresh your session.',
          });
        }

        return res.status(401).json({
          success: false,
          code: 'INVALID_TOKEN',
          message: 'Access token is invalid or signature verification failed.',
        });
      }

      // Token is valid; attach claims to request
      req.user = decoded;
      next();
    }
  );
};

module.exports = {
  authenticateToken,
};
