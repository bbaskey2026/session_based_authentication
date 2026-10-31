import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loading from './Loading';

/**
 * ProtectedRoute Component
 * Guards private pages (like Dashboard).
 * While AuthContext is validating the refresh cookie on initial mount, renders Loading.
 * If authentication fails or is absent, redirects user to /login with original location state.
 */
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <Loading message="Authenticating session with PostgreSQL..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;
