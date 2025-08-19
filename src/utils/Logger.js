export const Logger = {
  debug: (...args) => console.debug("[ATO]", ...args),
  info: (...args) => console.info("[ATO]", ...args),
  warn: (...args) => console.warn("[ATO]", ...args),
  error: (...args) => console.error("[ATO]", ...args),
};

// Default export for compatibility
export default Logger;
