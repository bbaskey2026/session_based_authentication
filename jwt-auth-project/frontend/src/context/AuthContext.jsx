import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  setAccessToken,
  loginUserApi,
  registerUserApi,
  logoutUserApi,
  refreshSessionApi,
  getUserProfileApi,
  onAuthFailure,
} from '../api/auth.api';

// Create the Context
const AuthContext = createContext(null);

/**
 * Custom Hook for accessing AuthContext
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/**
 * AuthProvider Component
 * Manages global authentication state, token refresh lifecycle, and session restoration.
 */
export const AuthProvider = ({ children }) => {
  // State: Access token is stored ONLY in React memory
  const [accessTokenState, setAccessTokenState] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Derived state
  const isAuthenticated = Boolean(accessTokenState && user);

  /**
   * Helper to set access token both in component state and API module
   */
  const updateAccessToken = useCallback((token) => {
    setAccessTokenState(token);
    setAccessToken(token);
  }, []);

  /**
   * Automatic session restoration / refresh
   * Calls /api/auth/refresh with HttpOnly cookie.
   * If cookie is valid, gets new access token and loads user profile.
   */
  const refreshSession = useCallback(async () => {
    try {
      // 1. Send request to backend with credentials: 'include'
      const newAccessToken = await refreshSessionApi();
      updateAccessToken(newAccessToken);

      // 2. Fetch authenticated user profile using the new access token
      const profileData = await getUserProfileApi();
      setUser(profileData.user);
      return true;
    } catch (error) {
      // Refresh token either absent, expired, or revoked
      updateAccessToken(null);
      setUser(null);
      return false;
    }
  }, [updateAccessToken]);

  /**
   * User Login Action
   */
  const login = async (email, password) => {
    const data = await loginUserApi(email, password);
    updateAccessToken(data.accessToken);
    setUser(data.user);
    return data;
  };

  /**
   * User Registration Action
   */
  const register = async (name, email, password) => {
    return await registerUserApi(name, email, password);
  };

  /**
   * User Logout Action
   */
  const logout = async () => {
    try {
      await logoutUserApi();
    } catch (err) {
      console.warn('Logout API error:', err.message);
    } finally {
      updateAccessToken(null);
      setUser(null);
    }
  };

  /**
   * On initial component mount (or browser refresh):
   * Automatically attempt session restoration via HttpOnly refresh cookie.
   */
  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      try {
        await refreshSession();
      } catch (err) {
        // Silently catch initial restore failure (expected if not logged in)
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    // Register callback for when background refresh fails permanently
    onAuthFailure(() => {
      if (isMounted) {
        updateAccessToken(null);
        setUser(null);
      }
    });

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, [refreshSession, updateAccessToken]);

  const value = {
    accessToken: accessTokenState,
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    refreshSession,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
