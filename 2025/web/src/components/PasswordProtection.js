"use client";

import { useState, useEffect } from "react";
import { checkSession, validatePassword, saveSession, clearSession, passwordConfig } from "../lib/passwordConfig";

export default function PasswordProtection({ children }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [expirationDate, setExpirationDate] = useState(null);

  useEffect(() => {
    // Check session on mount
    const session = checkSession();
    setAuthenticated(session.authenticated);
    setExpired(session.expired);
    setExpirationDate(session.expirationDate);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Add/remove body padding when header bar is shown/hidden
    if (authenticated) {
      document.body.style.paddingTop = "40px";
    } else {
      document.body.style.paddingTop = "0";
    }
    
    return () => {
      document.body.style.paddingTop = "0";
    };
  }, [authenticated]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");

    if (!password.trim()) {
      setError("Please enter a password");
      return;
    }

    const validation = validatePassword(password.trim());

    if (!validation.valid) {
      setError("Invalid password");
      setPassword("");
      return;
    }

    if (validation.expired) {
      setError(passwordConfig.defaultExpirationMessage);
      setExpired(true);
      setExpirationDate(validation.expirationDate);
      setPassword("");
      return;
    }

    // Valid password - save session and authenticate
    saveSession(password.trim());
    setAuthenticated(true);
    setExpired(false);
    setPassword("");
  };

  const handleLogout = () => {
    clearSession();
    setAuthenticated(false);
    setPassword("");
    setError("");
    setExpired(false);
    setExpirationDate(null);
  };

  // Show loading state while checking session
  if (loading) {
    return (
      <div className="password-protection-loading">
        <div className="password-protection-spinner"></div>
      </div>
    );
  }

  // Show password form if not authenticated
  if (!authenticated) {
    return (
      <div className="password-protection-container">
        <div className="password-protection-modal">
          <div className="password-protection-header">
            <h1>European Parliament Network</h1>
            <p className="password-protection-subtitle">Demo Access Required</p>
          </div>
          
          {expired && expirationDate && (
            <div className="password-protection-expired">
              <p className="password-protection-expired-icon">⚠️</p>
              <p className="password-protection-expired-message">
                {passwordConfig.defaultExpirationMessage}
              </p>
              <p className="password-protection-expired-date">
                Access expired on: {new Date(expirationDate).toLocaleDateString()}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="password-protection-form">
            <div className="password-protection-input-group">
              <label htmlFor="password">Enter Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoFocus
                className={error ? "password-protection-input-error" : ""}
              />
            </div>
            
            {error && (
              <div className="password-protection-error">
                {error}
              </div>
            )}

            <button type="submit" className="password-protection-submit">
              Access Demo
            </button>
          </form>

          <div className="password-protection-footer">
            <p>This is a protected demo. Please contact the administrator for access.</p>
          </div>
        </div>
      </div>
    );
  }

  // Show authenticated content with logout option
  return (
    <>
      <div className="password-protection-header-bar">
        <div className="password-protection-header-bar-content">
          <span className="password-protection-header-bar-text">Demo Access</span>
          {expirationDate && (
            <span className="password-protection-header-bar-expiration">
              Expires: {new Date(expirationDate).toLocaleDateString()}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="password-protection-logout-button"
            title="Logout"
          >
            Logout
          </button>
        </div>
      </div>
      {children}
    </>
  );
}

