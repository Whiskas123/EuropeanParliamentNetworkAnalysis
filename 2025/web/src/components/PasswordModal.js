"use client";

import { useState, useEffect } from "react";
import { validatePassword, saveSession, passwordConfig } from "../lib/passwordConfig";

export default function PasswordModal({ isOpen, onClose, onSuccess }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [expirationDate, setExpirationDate] = useState(null);

  const handleClose = () => {
    setPassword("");
    setError("");
    setExpired(false);
    setExpirationDate(null);
    onClose();
  };

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

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
    setPassword("");
    setError("");
    setExpired(false);
    setExpirationDate(null);
    onSuccess();
  };

  return (
    <div className="password-modal-overlay" onClick={handleClose}>
      <div className="password-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="password-modal-close" onClick={handleClose} aria-label="Close">
          ×
        </button>
        
        <div className="password-modal-header">
          <h2>Demo Access Required</h2>
          <p className="password-modal-subtitle">Enter password to access the visualization</p>
        </div>
        
        {expired && expirationDate && (
          <div className="password-modal-expired">
            <p className="password-modal-expired-icon">⚠️</p>
            <p className="password-modal-expired-message">
              {passwordConfig.defaultExpirationMessage}
            </p>
            <p className="password-modal-expired-date">
              Access expired on: {new Date(expirationDate).toLocaleDateString()}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="password-modal-form">
          <div className="password-modal-input-group">
            <label htmlFor="password-input">Password</label>
            <input
              id="password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              className={error ? "password-modal-input-error" : ""}
            />
          </div>
          
          {error && (
            <div className="password-modal-error">
              {error}
            </div>
          )}

          <button type="submit" className="password-modal-submit">
            Access Visualization
          </button>
        </form>
      </div>
    </div>
  );
}

