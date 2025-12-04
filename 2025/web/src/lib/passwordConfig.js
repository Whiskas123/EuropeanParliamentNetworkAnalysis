// Password configuration for demo access
// Update passwords and expiration dates as needed
// Expiration dates should be in ISO format (YYYY-MM-DD) or null for no expiration

export const passwordConfig = {
  // Client passwords with expiration dates
  // Format: password: expirationDate (ISO string or null)
  passwords: {
    // Example: Password expires on December 31, 2025
    "demo2025": "2025-12-31",
    // Example: Password with no expiration (set to null)
    // "permanent": null,
    // Example: Another password expiring on a specific date
    // "client2": "2025-06-30",
  },
  
  // Default expiration message
  defaultExpirationMessage: "Your access has expired. Please contact the administrator for a new password.",
  
  // Session storage key
  sessionKey: "ep_network_auth",
};

/**
 * Check if a password is valid and not expired
 * @param {string} password - The password to check
 * @returns {object} - { valid: boolean, expired: boolean, expirationDate: string|null }
 */
export function validatePassword(password) {
  const config = passwordConfig.passwords[password];
  
  if (!config) {
    return { valid: false, expired: false, expirationDate: null };
  }
  
  // If expiration is null, password never expires
  if (config === null) {
    return { valid: true, expired: false, expirationDate: null };
  }
  
  // Check if expired
  const expirationDate = new Date(config);
  const now = new Date();
  const expired = now > expirationDate;
  
  return {
    valid: true,
    expired: expired,
    expirationDate: config,
  };
}

/**
 * Check if current session is valid (not expired)
 * @returns {object} - { authenticated: boolean, expired: boolean, expirationDate: string|null }
 */
export function checkSession() {
  if (typeof window === "undefined") {
    return { authenticated: false, expired: false, expirationDate: null };
  }
  
  const sessionData = localStorage.getItem(passwordConfig.sessionKey);
  
  if (!sessionData) {
    return { authenticated: false, expired: false, expirationDate: null };
  }
  
  try {
    const { password, timestamp } = JSON.parse(sessionData);
    const validation = validatePassword(password);
    
    if (!validation.valid) {
      // Password no longer exists in config
      localStorage.removeItem(passwordConfig.sessionKey);
      return { authenticated: false, expired: false, expirationDate: null };
    }
    
    if (validation.expired) {
      // Password has expired
      localStorage.removeItem(passwordConfig.sessionKey);
      return { authenticated: false, expired: true, expirationDate: validation.expirationDate };
    }
    
    return {
      authenticated: true,
      expired: false,
      expirationDate: validation.expirationDate,
    };
  } catch (error) {
    // Invalid session data
    localStorage.removeItem(passwordConfig.sessionKey);
    return { authenticated: false, expired: false, expirationDate: null };
  }
}

/**
 * Save authentication session
 * @param {string} password - The validated password
 */
export function saveSession(password) {
  if (typeof window === "undefined") return;
  
  const sessionData = {
    password,
    timestamp: new Date().toISOString(),
  };
  
  localStorage.setItem(passwordConfig.sessionKey, JSON.stringify(sessionData));
}

/**
 * Clear authentication session
 */
export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(passwordConfig.sessionKey);
}

