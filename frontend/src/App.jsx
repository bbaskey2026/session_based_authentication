import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useDialog } from './context/DialogContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';

const Navbar = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const { showDialog } = useDialog();

  const handleLogoutClick = () => {
    showDialog({
      type: 'confirm',
      title: 'Confirm Sign Out',
      message: 'Are you sure you want to end your active session? Your refresh token in PostgreSQL will be immediately revoked.',
      confirmText: 'Sign Out',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          await logout();
          showDialog({
            type: 'success',
            title: 'Signed Out',
            message: 'Your session has been securely closed and refresh token revoked.',
            confirmText: 'OK',
          });
        } catch (err) {
          showDialog({
            type: 'error',
            title: 'Sign Out Failed',
            message: err.message || 'An error occurred while revoking session.',
            confirmText: 'OK',
          });
        }
      },
    });
  };

  return (
    <header className="navbar">
      <div className="nav-left">
        <Link to="/" className="nav-brand" id="nav-brand-link" aria-label="SecureAuth Home">
          {/* Security Shield Mark */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span>SecureAuth</span>
        </Link>
        <span className="nav-separator">/</span>

      </div>

      <div className="nav-actions">
        {isAuthenticated ? (
          <>
            <div className="nav-user-pill" id="nav-user-status">
              <span className="user-status-dot" aria-hidden="true"></span>
              <span>{user?.name}</span>
            </div>
            <button
              onClick={handleLogoutClick}
              className="btn btn-secondary"
              style={{ height: '32px', padding: '0 0.75rem', fontSize: '0.8rem' }}
              id="nav-logout-btn"
            >
              Sign Out
            </button>
          </>
        ) : (
          <div className="nav-user-pill">
            <span
              className="user-status-dot"
              style={{ opacity: 0.4 }}
              aria-hidden="true"
            ></span>
            <span>Guest</span>
          </div>
        )}
      </div>
    </header>
  );
};

const App = () => {
  return (
    <BrowserRouter>
      <div className="app-container">
        <Navbar />

        <main className="main-content">
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected Routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            {/* Fallback Redirections */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
};

export default App;
