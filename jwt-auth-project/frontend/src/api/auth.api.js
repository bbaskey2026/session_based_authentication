/**
 * Centralized API Client with Automatic Token Refresh & Concurrency Queue
 *
 * CRITICAL SECURITY & ARCHITECTURAL RULES:
 * 1. The JWT access token is stored ONLY in memory (`inMemoryAccessToken`).
 * 2. It is NEVER written to localStorage, sessionStorage, or IndexedDB.
 * 3. `credentials: 'include'` is configured on every request so the browser automatically
 *    attaches and receives the HttpOnly refresh-token cookie.
 * 4. When a 401 response is intercepted:
 *    - A shared refresh promise deduplicates concurrent requests, avoiding duplicate calls to `/refresh`.
 *    - Failed requests are paused and retried once with the new access token.
 *    - An explicit retry counter prevents infinite loops.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// In-memory access token storage (cleared upon tab reload or logout)
let inMemoryAccessToken = null;

// Synchronization lock and queued callbacks for concurrent 401 handling
let refreshPromise = null;
let authFailureCallback = null;

/**
 * Register a listener for terminal authentication failure (e.g. refresh token expired or revoked).
 * @param {Function} callback
 */
export const onAuthFailure = (callback) => {
  authFailureCallback = callback;
};

/**
 * Update the in-memory access token.
 * @param {string|null} token
 */
export const setAccessToken = (token) => {
  inMemoryAccessToken = token;
};

/**
 * Get the current in-memory access token.
 * @returns {string|null}
 */
export const getAccessToken = () => {
  return inMemoryAccessToken;
};

/**
 * Refresh session endpoint.
 * Deduplicates multiple concurrent calls using a shared promise.
 *
 * @returns {Promise<string>} The new access token
 */
export const refreshSessionApi = async () => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Automatically sends the HttpOnly refresh token cookie
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.message || 'Session refresh failed');
        error.status = response.status;
        throw error;
      }

      const data = await response.json();
      const newAccessToken = data.accessToken;
      setAccessToken(newAccessToken);
      return newAccessToken;
    } catch (error) {
      setAccessToken(null);
      if (authFailureCallback) {
        authFailureCallback(error);
      }
      throw error;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

/**
 * Core API Request Wrapper
 * Automatically manages Authorization headers, credentials, 401 interception, and retry logic.
 *
 * @param {string} endpoint - API path relative to API_BASE_URL (e.g. '/auth/profile')
 * @param {RequestInit} [options={}] - Fetch configuration options
 * @param {boolean} [isRetry=false] - Internal flag preventing infinite retry loops
 * @returns {Promise<any>} Parsed JSON response
 */
export const apiFetch = async (endpoint, options = {}, isRetry = false) => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  const headers = new Headers(options.headers || {});

  // Send access token through Authorization header if present in memory
  if (inMemoryAccessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryAccessToken}`);
  }

  // Ensure JSON content-type if body is provided and not FormData
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const fetchOptions = {
    ...options,
    headers,
    credentials: 'include', // Always send and accept HttpOnly cookies
  };

  const response = await fetch(url, fetchOptions);

  // If status is 401 Unauthorized and we haven't already retried this request
  if (response.status === 401 && !isRetry && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
    try {
      // 1. Wait for token refresh (deduplicated across concurrent calls)
      const newAccessToken = await refreshSessionApi();

      // 2. Retry the original request with the new access token
      headers.set('Authorization', `Bearer ${newAccessToken}`);
      return await apiFetch(endpoint, { ...options, headers }, true);
    } catch (refreshError) {
      // Refresh failed; propagate error to trigger logout/redirect
      throw refreshError;
    }
  }

  // Parse JSON response or handle non-2xx statuses
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.code = data.code;
    error.data = data;
    throw error;
  }

  return data;
};

/**
 * Authentication Endpoints
 */

export const registerUserApi = async (name, email, password) => {
  return await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
};

export const loginUserApi = async (email, password) => {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data.accessToken) {
    setAccessToken(data.accessToken);
  }
  return data;
};

export const getUserProfileApi = async () => {
  return await apiFetch('/auth/profile', {
    method: 'GET',
  });
};

export const logoutUserApi = async () => {
  try {
    await apiFetch('/auth/logout', {
      method: 'POST',
    });
  } finally {
    setAccessToken(null);
  }
};
