/**
 * Cookie Utilities for Secure Token Handling
 *
 * Security Policies:
 * - httpOnly: true -> Inaccessible to client-side JavaScript, mitigating XSS token theft.
 * - secure: true (in production) -> Cookie sent exclusively over HTTPS connections.
 * - sameSite: 'lax' (or 'strict') -> Mitigates CSRF attacks by limiting cross-site transmissions.
 * - path: '/api/auth' -> Restricts cookie transmission strictly to auth endpoints (refresh, logout).
 */

const COOKIE_NAME = 'refreshToken';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Returns standardized cookie options based on current environment.
 *
 * @returns {import('express').CookieOptions}
 */
const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/api/auth',
    maxAge: SEVEN_DAYS_MS,
  };
};

/**
 * Set the HttpOnly refresh token cookie on the Express response.
 *
 * @param {import('express').Response} res
 * @param {string} token - Raw unhashed refresh token
 */
const setRefreshTokenCookie = (res, token) => {
  const options = getCookieOptions();
  res.cookie(COOKIE_NAME, token, options);
};

/**
 * Clear the HttpOnly refresh token cookie from the client.
 *
 * @param {import('express').Response} res
 */
const clearRefreshTokenCookie = (res) => {
  const options = getCookieOptions();
  // Clear cookie requires identical path and domain settings
  res.clearCookie(COOKIE_NAME, {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
  });
};

module.exports = {
  COOKIE_NAME,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
};
