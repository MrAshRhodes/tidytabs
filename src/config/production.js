/**
 * Production Configuration
 * Controls debug logging and other production-specific settings
 */

// Set to false for production builds
export const DEBUG = false;

// Production-safe logger that respects DEBUG flag
export const Logger = {
  debug: (...args) => DEBUG && console.debug("[TidyTabs]", ...args),
  log: (...args) => DEBUG && console.log("[TidyTabs]", ...args),
  info: (...args) => DEBUG && console.info("[TidyTabs]", ...args),
  warn: (...args) => console.warn("[TidyTabs]", ...args), // Keep warnings in production
  error: (...args) => console.error("[TidyTabs]", ...args), // Keep errors in production
};

// Export for backward compatibility
export const safeLog = Logger.log;
