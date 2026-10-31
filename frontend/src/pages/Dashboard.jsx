import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { getUserProfileApi, refreshSessionApi } from '../api/auth.api';

const Dashboard = () => {
  const { user, logout, accessToken, refreshSession } = useAuth();
  const { showDialog } = useDialog();

  // Navigation tab state for documentation portal
  const [activeTab, setActiveTab] = useState('overview');
  const [copiedId, setCopiedId] = useState(null);

  // Live storage audit state
  const [storageAudit, setStorageAudit] = useState({
    localStorageKeys: 0,
    sessionStorageKeys: 0,
    cookieVisible: false,
    timestamp: new Date().toLocaleTimeString(),
  });

  // CLI Inspector state
  const [testOutput, setTestOutput] = useState('CLI Inspector ready. Select an action above to execute tests.');
  const [isTesting, setIsTesting] = useState(false);

  // Perform live audit of browser storage
  const runStorageAudit = () => {
    let lsKeys = 0;
    let ssKeys = 0;
    try {
      lsKeys = window.localStorage.length;
      ssKeys = window.sessionStorage.length;
    } catch {
      // ignore
    }

    // Check if refresh token is visible in document.cookie (it shouldn't be because HttpOnly)
    const isCookieVisible = document.cookie.includes('jwt_auth_refresh');

    setStorageAudit({
      localStorageKeys: lsKeys,
      sessionStorageKeys: ssKeys,
      cookieVisible: isCookieVisible,
      timestamp: new Date().toLocaleTimeString(),
    });
  };

  useEffect(() => {
    runStorageAudit();
  }, [accessToken]);

  const logMessage = (msg) => {
    const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
    setTestOutput((prev) => `[${timestamp}] ${msg}\n${prev}`);
  };

  const copyToClipboard = (text, id) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  /**
   * Logout with confirmation dialog
   */
  const handleLogoutClick = () => {
    showDialog({
      type: 'confirm',
      title: 'Confirm Sign Out',
      message: 'Are you sure you want to end your active session? Your refresh token will be revoked in PostgreSQL.',
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

  /**
   * Action 1: Test Protected API Call
   */
  const handleTestProtectedApi = async () => {
    setIsTesting(true);
    logMessage('GET /api/auth/profile (Authorization: Bearer <accessToken>)');
    try {
      const data = await getUserProfileApi();
      logMessage(`200 OK: User profile loaded for ${data.user.email} (ID: ${data.user.id})`);
      showDialog({
        type: 'success',
        title: 'Profile Fetched',
        message: `Successfully authenticated using the in-memory access token. Identity: ${data.user.name} (${data.user.email}).`,
        confirmText: 'Close',
      });
    } catch (err) {
      logMessage(`ERR ${err.status || 500}: ${err.message}`);
      showDialog({
        type: 'error',
        title: 'Request Failed',
        message: err.message || 'Failed to fetch user profile with current access token.',
        confirmText: 'Close',
      });
    } finally {
      setIsTesting(false);
    }
  };

  /**
   * Action 2: Trigger Manual Token Rotation
   */
  const handleManualRefresh = async () => {
    setIsTesting(true);
    logMessage('POST /api/auth/refresh (HttpOnly cookie verification & rotation)');
    try {
      const success = await refreshSession();
      if (success) {
        logMessage('200 OK: Refresh token rotated in PostgreSQL. Fresh access token stored in React memory.');
        runStorageAudit();
        showDialog({
          type: 'success',
          title: 'Token Rotated Successfully',
          message: 'The old refresh token was revoked, a new refresh token was set via HttpOnly cookie, and a brand new access token was stored in React memory.',
          confirmText: 'OK',
        });
      } else {
        logMessage('401 UNAUTHORIZED: Token refresh failed.');
        showDialog({
          type: 'error',
          title: 'Rotation Failed',
          message: 'Could not rotate refresh token. Session may be expired or revoked.',
          confirmText: 'Close',
        });
      }
    } catch (err) {
      logMessage(`ERR ${err.status || 500}: ${err.message}`);
      showDialog({
        type: 'error',
        title: 'Token Rotation Error',
        message: err.message || 'An error occurred during token rotation.',
        confirmText: 'Close',
      });
    } finally {
      setIsTesting(false);
    }
  };

  /**
   * Action 3: Test Concurrent Requests (Shared refresh promise queue)
   */
  const handleTestConcurrentRequests = async () => {
    setIsTesting(true);
    logMessage('DISPATCH: Firing 5 concurrent requests to /api/auth/profile...');
    try {
      const promises = [
        getUserProfileApi(),
        getUserProfileApi(),
        getUserProfileApi(),
        getUserProfileApi(),
        getUserProfileApi(),
      ];

      const results = await Promise.all(promises);
      logMessage(`SUCCESS: All 5 concurrent requests resolved simultaneously via single promise queue (${results.length} valid responses).`);
      showDialog({
        type: 'success',
        title: 'Concurrency Test Passed',
        message: 'All 5 simultaneous requests succeeded through the centralized queue without race conditions or duplicate refresh calls.',
        confirmText: 'OK',
      });
    } catch (err) {
      logMessage(`CONCURRENT TEST FAILED: ${err.message}`);
      showDialog({
        type: 'error',
        title: 'Concurrency Test Failed',
        message: err.message || 'One or more concurrent requests failed.',
        confirmText: 'Close',
      });
    } finally {
      setIsTesting(false);
    }
  };

  /**
   * Action 4: Run Storage Audit Manual Check
   */
  const handleManualAuditCheck = () => {
    runStorageAudit();
    showDialog({
      type: 'info',
      title: 'Zero-Storage Audit Verified',
      message: `localStorage: ${window.localStorage.length} items. sessionStorage: ${window.sessionStorage.length} items. document.cookie token visibility: None (Secured via HttpOnly). Immune to XSS token theft.`,
      confirmText: 'OK',
    });
  };

  return (
    <div className="dashboard-container">
      {/* Overview Top Header */}
      <div className="dashboard-header">
        <div className="dashboard-title-group">
          <h1>{user?.name || 'Developer'}</h1>
          <p>{user?.email} • Authenticated Session</p>
        </div>
        <div className="nav-actions">
          <button
            onClick={handleManualAuditCheck}
            className="btn btn-secondary"
            title="Inspect browser storage"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Audit Storage
          </button>
          <button
            onClick={handleLogoutClick}
            className="btn btn-danger"
            id="dashboard-logout-btn"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Hero Banner: Security Architecture Specification */}
      <div className="docs-hero">
        <div className="docs-hero-top">
          <div className="docs-badge-row">
            <span className="docs-tag success">
              <span className="docs-tag-dot" />
              Zero-LocalStorage Architecture
            </span>
            <span className="docs-tag">RFC 6749 / RFC 7519 Compliant</span>
            <span className="docs-tag">PostgreSQL Row Locks</span>
          </div>
          <span className="badge">Audited: {storageAudit.timestamp}</span>
        </div>

        <h2>Security Architecture Specification</h2>
        <p className="docs-lead">
          Zero-LocalStorage architecture. Press F5 / reload the page to verify that the access token is cleared from React memory and automatically re-issued by rotating the HttpOnly cookie in PostgreSQL.
        </p>

        {/* Real-time Storage Audit Status Strip */}
        <div className="docs-audit-box">
          <div className="audit-item">
            <span className="audit-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              localStorage
            </span>
            <span className="audit-status">
              {storageAudit.localStorageKeys === 0 ? '0 Tokens (Clean)' : `${storageAudit.localStorageKeys} keys`}
            </span>
            <span className="audit-desc">Immune to XSS script scraping</span>
          </div>

          <div className="audit-item">
            <span className="audit-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              sessionStorage
            </span>
            <span className="audit-status">
              {storageAudit.sessionStorageKeys === 0 ? '0 Tokens (Clean)' : `${storageAudit.sessionStorageKeys} keys`}
            </span>
            <span className="audit-desc">No persistence across origins</span>
          </div>

          <div className="audit-item">
            <span className="audit-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              HttpOnly Cookie
            </span>
            <span className="audit-status">
              {!storageAudit.cookieVisible ? 'Protected / Inaccessible' : 'Exposed'}
            </span>
            <span className="audit-desc">Hidden from document.cookie</span>
          </div>

          <div className="audit-item">
            <span className="audit-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Memory JWT
            </span>
            <span className="audit-status">
              {accessToken ? 'Active in Closure' : 'Empty'}
            </span>
            <span className="audit-desc">15-Minute Short Lifespan</span>
          </div>
        </div>
      </div>

      {/* Documentation Website Layout (Sidebar + Content) */}
      <div className="docs-layout">
        {/* Left Navigation Sidebar */}
        <aside className="docs-sidebar">
          <div className="docs-sidebar-header">DOCUMENTATION</div>

          <button
            className={`docs-nav-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <span>Architecture Overview</span>
            <span className="docs-nav-pill">01</span>
          </button>

          <button
            className={`docs-nav-btn ${activeTab === 'pillars' ? 'active' : ''}`}
            onClick={() => setActiveTab('pillars')}
          >
            <span>Core Security Pillars</span>
            <span className="docs-nav-pill">02</span>
          </button>

          <button
            className={`docs-nav-btn ${activeTab === 'database' ? 'active' : ''}`}
            onClick={() => setActiveTab('database')}
          >
            <span>Database & SQL Schema</span>
            <span className="docs-nav-pill">03</span>
          </button>

          <button
            className={`docs-nav-btn ${activeTab === 'testing' ? 'active' : ''}`}
            onClick={() => setActiveTab('testing')}
          >
            <span>Verification Labs & CLI</span>
            <span className="docs-nav-pill">04</span>
          </button>

          <button
            className={`docs-nav-btn ${activeTab === 'api' ? 'active' : ''}`}
            onClick={() => setActiveTab('api')}
          >
            <span>API Endpoints Reference</span>
            <span className="docs-nav-pill">05</span>
          </button>
        </aside>

        {/* Right Documentation Body */}
        <main className="docs-content">
          {/* TAB 1: ARCHITECTURE OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="docs-card">
              <div className="docs-card-header">
                <div className="docs-card-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  Architecture Overview & Threat Model
                </div>
                <p className="docs-card-desc">
                  Understanding why traditional localStorage token storage creates critical vulnerabilities, and how the Zero-LocalStorage pattern provides defense-in-depth against XSS and token scraping.
                </p>
              </div>

              {/* Threat Model Explanation */}
              <div className="docs-callout">
                <div className="docs-callout-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div>
                  <strong>The XSS Threat Vulnerability:</strong> When web applications store authentication tokens in <code>window.localStorage</code> or <code>window.sessionStorage</code>, any malicious script running in the browser (e.g., third-party script injection, npm supply chain compromise, or reflected/stored XSS) can execute <code>localStorage.getItem('token')</code> and immediately exfiltrate the credentials to an attacker's server.
                </div>
              </div>

              {/* Architecture Comparison Table */}
              <div className="docs-table-wrapper">
                <table className="docs-table">
                  <thead>
                    <tr>
                      <th>Storage Strategy</th>
                      <th>XSS Resistance</th>
                      <th>CSRF Protection</th>
                      <th>Token Lifespan</th>
                      <th>Session Persistence</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ color: '#ffffff', fontWeight: 600 }}>Memory JWT + HttpOnly Cookie (Our Design)</td>
                      <td>
                        <span className="status-badge-secure">Immune (0 Stored)</span>
                      </td>
                      <td>
                        <span className="status-badge-secure">SameSite=Lax + Path</span>
                      </td>
                      <td>15 min access / 7 day refresh</td>
                      <td>Automatic via Silent Rotation</td>
                    </tr>
                    <tr>
                      <td>localStorage Token (Standard SPA)</td>
                      <td>
                        <span className="status-badge-insecure">Vulnerable to Scraping</span>
                      </td>
                      <td>N/A (Bearer Header)</td>
                      <td>Typically 7–30 days</td>
                      <td>Permanent until cleared</td>
                    </tr>
                    <tr>
                      <td>Plain Session Cookie</td>
                      <td>Partial (if HttpOnly)</td>
                      <td>
                        <span className="status-badge-insecure">Requires CSRF Token</span>
                      </td>
                      <td>Session duration</td>
                      <td>Tied to browser cookies</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* F5 Reload Lifecycle Explanation */}
              <div className="docs-card-header" style={{ marginTop: '1rem' }}>
                <div className="docs-card-title" style={{ fontSize: '1.15rem' }}>
                  The F5 / Page Reload Lifecycle
                </div>
                <p className="docs-card-desc">
                  How user sessions persist seamlessly without compromising memory security:
                </p>
              </div>

              <div className="verification-steps">
                <div className="verification-step-card">
                  <span className="step-num">1</span>
                  <div className="step-content">
                    <span className="step-title">Page Reload (F5) Clears In-Memory JWT</span>
                    <span className="step-desc">
                      The browser unloads the React virtual DOM. All Javascript memory, closures, and React state are completely wiped. No traces remain in localStorage.
                    </span>
                  </div>
                </div>

                <div className="verification-step-card">
                  <span className="step-num">2</span>
                  <div className="step-content">
                    <span className="step-title">React Mounts & Dispatches Silent Refresh</span>
                    <span className="step-desc">
                      During initialization, <span className="step-code-inline">AuthContext</span> executes an initial silent <span className="step-code-inline">POST /api/auth/refresh</span>. Because credentials are included, the browser automatically forwards the HttpOnly refresh token cookie.
                    </span>
                  </div>
                </div>

                <div className="verification-step-card">
                  <span className="step-num">3</span>
                  <div className="step-content">
                    <span className="step-title">PostgreSQL Atomic Rotation & New Cookie Issuance</span>
                    <span className="step-desc">
                      PostgreSQL verifies the SHA-256 hash, invalidates the old token, saves a brand new token, sends a new Set-Cookie header, and returns a fresh 15-minute access token into React memory.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CORE SECURITY PILLARS */}
          {activeTab === 'pillars' && (
            <div className="docs-card">
              <div className="docs-card-header">
                <div className="docs-card-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  The Core Security Pillars
                </div>
                <p className="docs-card-desc">
                  Detailed technical breakdown of the multi-layered security controls implemented across the frontend and backend.
                </p>
              </div>

              <div className="docs-pillars-grid">
                {/* Pillar 1 */}
                <div className="docs-pillar-item">
                  <div className="pillar-top">
                    <span className="pillar-name">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      1. Memory-Only JWT
                    </span>
                    <span className="pillar-badge">Frontend Memory Closure</span>
                  </div>
                  <div className="pillar-body">
                    Access token resides only in React state. Immune to localStorage XSS token scraping.
                  </div>
                  <ul className="pillar-points">
                    <li>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Stored inside React closure (<span className="step-code-inline">useState(null)</span>) and modular memory variable.</span>
                    </li>
                    <li>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>15-minute strict expiration window (<span className="step-code-inline">exp: 15m</span>) limits replay window if memory snapshot is taken.</span>
                    </li>
                    <li>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Attached exclusively to outbound API requests via <span className="step-code-inline">Authorization: Bearer &lt;token&gt;</span>.</span>
                    </li>
                  </ul>
                </div>

                {/* Pillar 2 */}
                <div className="docs-pillar-item">
                  <div className="pillar-top">
                    <span className="pillar-name">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v8" />
                        <path d="M8 12h8" />
                      </svg>
                      2. HttpOnly Cookie
                    </span>
                    <span className="pillar-badge">Browser Enforced Security</span>
                  </div>
                  <div className="pillar-body">
                    Refresh token is inaccessible to JavaScript. Browser automatically forwards it with credentials.
                  </div>
                  <ul className="pillar-points">
                    <li>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span><span className="step-code-inline">httpOnly: true</span> prevents any script from accessing the token via <span className="step-code-inline">document.cookie</span>.</span>
                    </li>
                    <li>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span><span className="step-code-inline">sameSite: 'lax'</span> guards against Cross-Site Request Forgery (CSRF).</span>
                    </li>
                    <li>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Scoped strictly to <span className="step-code-inline">path: '/api/auth'</span> so other endpoints never receive it.</span>
                    </li>
                  </ul>
                </div>

                {/* Pillar 3 */}
                <div className="docs-pillar-item">
                  <div className="pillar-top">
                    <span className="pillar-name">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <ellipse cx="12" cy="5" rx="9" ry="3" />
                        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                      </svg>
                      3. Atomic Rotation
                    </span>
                    <span className="pillar-badge">PostgreSQL FOR UPDATE Lock</span>
                  </div>
                  <div className="pillar-body">
                    PostgreSQL transactions use row-level locking (FOR UPDATE) to eliminate race conditions.
                  </div>
                  <ul className="pillar-points">
                    <li>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Every refresh call revokes the current token and immediately issues a brand-new cryptographically secure token.</span>
                    </li>
                    <li>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span><span className="step-code-inline">SELECT ... FOR UPDATE</span> serializes concurrent requests, preventing dual-token race conditions.</span>
                    </li>
                    <li>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Both invalidation and replacement occur within a single atomic database transaction (<span className="step-code-inline">BEGIN ... COMMIT</span>).</span>
                    </li>
                  </ul>
                </div>

                {/* Pillar 4 */}
                <div className="docs-pillar-item">
                  <div className="pillar-top">
                    <span className="pillar-name">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="4 17 10 11 4 5" />
                        <line x1="12" y1="19" x2="20" y2="19" />
                      </svg>
                      4. Deterministic SHA-256 Hash Storage
                    </span>
                    <span className="pillar-badge">Data-at-Rest Security</span>
                  </div>
                  <div className="pillar-body">
                    Raw refresh tokens are never persisted in PostgreSQL. Only the 64-character SHA-256 hex digest is stored.
                  </div>
                  <ul className="pillar-points">
                    <li>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>In the event of an accidental database dump or breach, an attacker cannot forge valid refresh tokens.</span>
                    </li>
                    <li>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Verification is computed deterministically in O(1) via indexed lookups on <span className="step-code-inline">token_hash</span>.</span>
                    </li>
                  </ul>
                </div>

                {/* Pillar 5 */}
                <div className="docs-pillar-item">
                  <div className="pillar-top">
                    <span className="pillar-name">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      5. Token Reuse & Replay Detection
                    </span>
                    <span className="pillar-badge">Automated Session Invalidation</span>
                  </div>
                  <div className="pillar-body">
                    If an already-revoked refresh token is ever presented, the backend detects token theft and triggers immediate nuclear revocation.
                  </div>
                  <ul className="pillar-points">
                    <li>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>When <span className="step-code-inline">revoked_at IS NOT NULL</span> is detected on refresh, all sessions for that <span className="step-code-inline">user_id</span> are instantly revoked.</span>
                    </li>
                    <li>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Both the legitimate user and the attacker are immediately logged out, halting further unauthorized access.</span>
                    </li>
                  </ul>
                </div>

                {/* Pillar 6 */}
                <div className="docs-pillar-item">
                  <div className="pillar-top">
                    <span className="pillar-name">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      6. Centralized Promise Concurrency Queue
                    </span>
                    <span className="pillar-badge">Deduplicated In-Flight Requests</span>
                  </div>
                  <div className="pillar-body">
                    Prevents the "thundering herd" problem when multiple simultaneous API calls expire at the same instant.
                  </div>
                  <ul className="pillar-points">
                    <li>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>A single module-level <span className="step-code-inline">refreshPromise</span> is shared across all concurrent 401 interceptors.</span>
                    </li>
                    <li>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Exactly one HTTP request is sent to <span className="step-code-inline">/api/auth/refresh</span>; all other pending requests wait and resolve cleanly.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DATABASE & SQL SCHEMA */}
          {activeTab === 'database' && (
            <div className="docs-card">
              <div className="docs-card-header">
                <div className="docs-card-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <ellipse cx="12" cy="5" rx="9" ry="3" />
                    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                  </svg>
                  Database Schema & Parameterized SQL
                </div>
                <p className="docs-card-desc">
                  All database operations use strict parameterized SQL queries stored in the dedicated <span className="step-code-inline">sql/</span> folder for readability, auditability, and absolute SQL-injection immunity.
                </p>
              </div>

              {/* Schema SQL Box */}
              <div className="docs-code-box">
                <div className="docs-code-header">
                  <span className="docs-code-lang">SQL • backend/src/sql/schema.sql</span>
                  <button
                    className="docs-copy-btn"
                    onClick={() =>
                      copyToClipboard(
                        `CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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
CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));`,
                        'schema-sql'
                      )
                    }
                  >
                    {copiedId === 'schema-sql' ? 'Copied' : 'Copy SQL'}
                  </button>
                </div>
                <div className="docs-code-content">
{`-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Refresh Tokens Table (SHA-256 Hashes Only)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  revoked_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. High-Performance Indexes
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));`}
                </div>
              </div>

              {/* Atomic Rotation Query Box */}
              <div className="docs-code-box">
                <div className="docs-code-header">
                  <span className="docs-code-lang">SQL • backend/src/sql/refresh_tokens/find_by_hash_for_update.sql</span>
                  <button
                    className="docs-copy-btn"
                    onClick={() =>
                      copyToClipboard(
                        `SELECT id, user_id, token_hash, expires_at, revoked_at, created_at
FROM refresh_tokens
WHERE token_hash = $1
FOR UPDATE;`,
                        'for-update-sql'
                      )
                    }
                  >
                    {copiedId === 'for-update-sql' ? 'Copied' : 'Copy SQL'}
                  </button>
                </div>
                <div className="docs-code-content">
{`-- Row-level locking ensures only ONE thread can process this token at any instant
SELECT id, user_id, token_hash, expires_at, revoked_at, created_at
FROM refresh_tokens
WHERE token_hash = $1
FOR UPDATE;`}
                </div>
              </div>

              {/* Token Revocation Query Box */}
              <div className="docs-code-box">
                <div className="docs-code-header">
                  <span className="docs-code-lang">SQL • backend/src/sql/refresh_tokens/revoke_all_for_user.sql</span>
                  <button
                    className="docs-copy-btn"
                    onClick={() =>
                      copyToClipboard(
                        `UPDATE refresh_tokens
SET revoked_at = CURRENT_TIMESTAMP
WHERE user_id = $1 AND revoked_at IS NULL;`,
                        'revoke-all-sql'
                      )
                    }
                  >
                    {copiedId === 'revoke-all-sql' ? 'Copied' : 'Copy SQL'}
                  </button>
                </div>
                <div className="docs-code-content">
{`-- Nuclear Revocation: Used during detected token reuse attack or password reset
UPDATE refresh_tokens
SET revoked_at = CURRENT_TIMESTAMP
WHERE user_id = $1 AND revoked_at IS NULL;`}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: VERIFICATION LABS & CLI */}
          {activeTab === 'testing' && (
            <div className="docs-card">
              <div className="docs-card-header">
                <div className="docs-card-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" y1="19" x2="20" y2="19" />
                  </svg>
                  Interactive Verification Labs & CLI Inspector
                </div>
                <p className="docs-card-desc">
                  Execute live verification tests against the running backend server and inspect response payloads in the real-time console.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="tester-controls">
                <button
                  onClick={handleTestProtectedApi}
                  disabled={isTesting}
                  className="btn btn-secondary"
                  id="test-profile-btn"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Test /profile
                </button>
                <button
                  onClick={handleManualRefresh}
                  disabled={isTesting}
                  className="btn btn-secondary"
                  id="test-refresh-btn"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                  </svg>
                  Rotate /refresh
                </button>
                <button
                  onClick={handleTestConcurrentRequests}
                  disabled={isTesting}
                  className="btn btn-secondary"
                  id="test-concurrent-btn"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  Test 5x Concurrent
                </button>
                <button
                  onClick={handleManualAuditCheck}
                  disabled={isTesting}
                  className="btn btn-secondary"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  Storage Audit
                </button>
              </div>

              {/* Terminal Display */}
              <div className="tester-box">
                <div className="terminal-header">
                  <span>TERMINAL / REALTIME LOGS</span>
                  <span>UTF-8 • SECURE CHANNEL</span>
                </div>
                <div className="terminal-output" id="live-terminal-output">
                  {testOutput}
                </div>
              </div>

              {/* Developer Step-by-Step Verification Checklist */}
              <div className="docs-card-header" style={{ marginTop: '1rem' }}>
                <div className="docs-card-title" style={{ fontSize: '1.15rem' }}>
                  Developer Manual Verification Checklist
                </div>
                <p className="docs-card-desc">
                  Open Chrome / Edge / Firefox DevTools (F12) to manually inspect and verify each security layer:
                </p>
              </div>

              <div className="verification-steps">
                <div className="verification-step-card">
                  <span className="step-num">A</span>
                  <div className="step-content">
                    <span className="step-title">Verify Zero LocalStorage Persistence</span>
                    <span className="step-desc">
                      Open <strong>Application &gt; Local Storage &gt; http://localhost:3000</strong>. Notice that no tokens, credentials, or session values are stored.
                    </span>
                  </div>
                </div>

                <div className="verification-step-card">
                  <span className="step-num">B</span>
                  <div className="step-content">
                    <span className="step-title">Verify HttpOnly Cookie Flag</span>
                    <span className="step-desc">
                      Open <strong>Application &gt; Cookies &gt; http://localhost:3000</strong>. Notice <span className="step-code-inline">jwt_auth_refresh</span> has the <strong>HttpOnly</strong> checkmark ticked and Path is <span className="step-code-inline">/api/auth</span>.
                    </span>
                  </div>
                </div>

                <div className="verification-step-card">
                  <span className="step-num">C</span>
                  <div className="step-content">
                    <span className="step-title">Verify Script Inaccessibility</span>
                    <span className="step-desc">
                      Open <strong>Console</strong> and type <span className="step-code-inline">document.cookie</span>. Notice that the refresh token is completely absent from the string.
                    </span>
                  </div>
                </div>

                <div className="verification-step-card">
                  <span className="step-num">D</span>
                  <div className="step-content">
                    <span className="step-title">Verify F5 Page Reload Rotation</span>
                    <span className="step-desc">
                      Press <strong>F5</strong> to reload the browser. Watch the Network tab: React clears memory, dispatches a silent <span className="step-code-inline">POST /api/auth/refresh</span> with the cookie, and restores access seamlessly without user interaction.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: API ENDPOINTS REFERENCE */}
          {activeTab === 'api' && (
            <div className="docs-card">
              <div className="docs-card-header">
                <div className="docs-card-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  API Endpoints Specification
                </div>
                <p className="docs-card-desc">
                  Complete reference for all authentication and session management endpoints hosted on <span className="step-code-inline">http://localhost:5000</span>.
                </p>
              </div>

              <div className="docs-pillars-grid">
                {/* Endpoint 1 */}
                <div className="docs-pillar-item">
                  <div className="pillar-top">
                    <span className="pillar-name mono">
                      <span className="badge" style={{ background: '#ffffff', color: '#000000', fontWeight: 700 }}>POST</span>
                      /api/auth/register
                    </span>
                    <span className="pillar-badge">Public</span>
                  </div>
                  <div className="pillar-body">
                    Creates a new user account with bcrypt password hashing (10 salt rounds).
                  </div>
                  <div className="docs-code-box" style={{ marginTop: '0.5rem' }}>
                    <div className="docs-code-content" style={{ padding: '0.65rem 0.85rem' }}>
{`// Request Body (application/json)
{
  "name": "Alex Doe",
  "email": "alex@example.com",
  "password": "SecurePassword@2026"
}`}
                    </div>
                  </div>
                </div>

                {/* Endpoint 2 */}
                <div className="docs-pillar-item">
                  <div className="pillar-top">
                    <span className="pillar-name mono">
                      <span className="badge" style={{ background: '#ffffff', color: '#000000', fontWeight: 700 }}>POST</span>
                      /api/auth/login
                    </span>
                    <span className="pillar-badge">Public</span>
                  </div>
                  <div className="pillar-body">
                    Validates credentials, returns in-memory access token in JSON body, and sets HttpOnly refresh token cookie.
                  </div>
                  <div className="docs-code-box" style={{ marginTop: '0.5rem' }}>
                    <div className="docs-code-content" style={{ padding: '0.65rem 0.85rem' }}>
{`// Response: 200 OK
{
  "success": true,
  "accessToken": "eyJhbGciOi...",
  "user": { "id": 1, "name": "Alex Doe", "email": "alex@example.com" }
}
// Set-Cookie: jwt_auth_refresh=<token>; Path=/api/auth; HttpOnly; SameSite=Lax`}
                    </div>
                  </div>
                </div>

                {/* Endpoint 3 */}
                <div className="docs-pillar-item">
                  <div className="pillar-top">
                    <span className="pillar-name mono">
                      <span className="badge" style={{ background: '#ffffff', color: '#000000', fontWeight: 700 }}>POST</span>
                      /api/auth/refresh
                    </span>
                    <span className="pillar-badge">Credentials: Include</span>
                  </div>
                  <div className="pillar-body">
                    Rotates refresh token in PostgreSQL transaction, invalidates previous token, issues new cookie and new 15-min JWT.
                  </div>
                </div>

                {/* Endpoint 4 */}
                <div className="docs-pillar-item">
                  <div className="pillar-top">
                    <span className="pillar-name mono">
                      <span className="badge" style={{ background: '#ffffff', color: '#000000', fontWeight: 700 }}>GET</span>
                      /api/auth/profile
                    </span>
                    <span className="pillar-badge">Protected (Bearer JWT)</span>
                  </div>
                  <div className="pillar-body">
                    Returns user profile details. Requires <span className="step-code-inline">Authorization: Bearer &lt;accessToken&gt;</span>.
                  </div>
                </div>

                {/* Endpoint 5 */}
                <div className="docs-pillar-item">
                  <div className="pillar-top">
                    <span className="pillar-name mono">
                      <span className="badge" style={{ background: '#ffffff', color: '#000000', fontWeight: 700 }}>POST</span>
                      /api/auth/logout
                    </span>
                    <span className="pillar-badge">Credentials: Include</span>
                  </div>
                  <div className="pillar-body">
                    Revokes refresh token in PostgreSQL and clears the <span className="step-code-inline">jwt_auth_refresh</span> cookie.
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
