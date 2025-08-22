// Settings management for ATO Chrome extension
// Handles user preferences and configuration

export class SettingsManager {
  static DEFAULTS = {
    autoMode: true,
    autoOrganizeIntervalMin: 5,
    defaultAlgorithm: "category",
    provider: "openai",
    theme: "auto",

    // Auto Mode behavior for grouped tabs
    autoModeRecategorizeGrouped: "smart", // "smart" | "always" | "never"

    // Theming
    uiStyle: "glass", // "glass" | "solid"
    glassPreset: "default-frosted", // "default-frosted" | "aurora-blue" | "mint-glow" | "dark-frost"

    // Keep map storage internally, but provide stable key names via accessors
    apiKeys: {
      // openai: base64(apiKey)
      // anthropic: base64(apiKey)
    },
    limits: {
      autoOrganizeDebounceMs: 30000,
      maxTabsPerBatch: 50,
    },
    lastOrganization: null,
  };

  static VALID_ALGORITHMS = ["category", "lastAccess", "frequency"];
  static VALID_PROVIDERS = ["openai", "anthropic", "groq"];
  static VALID_UI_STYLES = ["glass", "solid"];
  static VALID_GLASS_PRESETS = [
    "default-frosted",
    "aurora-blue",
    "mint-glow",
    "dark-frost",
  ];

  /**
   * Initialize default settings if they don't exist
   */
  static async initializeDefaults() {
    try {
      const currentSettings = await this.getSettings();
      const mergedSettings = { ...this.DEFAULTS, ...currentSettings };
      await this.saveSettings(mergedSettings);
      console.log("[SettingsManager] Default settings initialized");
      return mergedSettings;
    } catch (error) {
      console.error("[SettingsManager] Failed to initialize defaults:", error);
      throw error;
    }
  }

  /**
   * Get all settings with defaults applied
   */
  static async getSettings() {
    try {
      const result = await chrome.storage.local.get("settings");
      const merged = { ...this.DEFAULTS, ...(result.settings || {}) };
      const validated = this.validateSettings(merged);
      return validated;
    } catch (error) {
      console.error("[SettingsManager] Failed to get settings:", error);
      return { ...this.DEFAULTS };
    }
  }

  /**
   * Save settings with validation
   */
  static async saveSettings(settings) {
    try {
      // Check if provider changed to trigger cache invalidation
      const oldSettings = await this.getSettings();
      const providerChanged = oldSettings.provider !== settings.provider;

      const validatedSettings = this.validateSettings(settings);
      await chrome.storage.local.set({ settings: validatedSettings });
      console.log("[SettingsManager] Settings saved successfully");

      // Clear AI categorization cache if provider changed
      if (providerChanged) {
        console.log(
          "[SettingsManager] Provider changed from",
          oldSettings.provider,
          "to",
          settings.provider,
          "- clearing AI cache",
        );
        await chrome.storage.local.remove([
          "aiCategoryCache",
          "aiLowConfidenceQueue",
        ]);
        console.log(
          "[SettingsManager] AI cache cleared due to provider change",
        );
      }

      return true;
    } catch (error) {
      console.error("[SettingsManager] Failed to save settings:", error);
      return false;
    }
  }

  /**
   * Get a specific setting
   */
  static async getSetting(key, defaultValue = null) {
    try {
      const settings = await this.getSettings();
      return settings[key] !== undefined ? settings[key] : defaultValue;
    } catch (error) {
      console.error("[SettingsManager] Failed to get setting:", key, error);
      return defaultValue;
    }
  }

  /**
   * Set a specific setting
   */
  static async setSetting(key, value) {
    try {
      const settings = await this.getSettings();
      settings[key] = value;
      return await this.saveSettings(settings);
    } catch (error) {
      console.error("[SettingsManager] Failed to set setting:", key, error);
      return false;
    }
  }

  /**
   * Validate settings object
   */
  static validateSettings(settings) {
    const validated = { ...settings };

    // Remove legacy/unsupported fields
    if (validated.models) delete validated.models;
    if (validated.model) delete validated.model;

    // Validate algorithm
    if (
      validated.defaultAlgorithm &&
      !this.isValidAlgorithm(validated.defaultAlgorithm)
    ) {
      console.warn(
        "[SettingsManager] Invalid algorithm, using default:",
        validated.defaultAlgorithm,
      );
      validated.defaultAlgorithm = this.DEFAULTS.defaultAlgorithm;
    }

    // Validate provider (migrate unknown/legacy providers to default)
    if (!this.isValidProvider(validated.provider)) {
      console.warn(
        "[SettingsManager] Invalid provider, using default:",
        validated.provider,
      );
      validated.provider = this.DEFAULTS.provider;
    }

    // Validate autoModeRecategorizeGrouped setting
    if (
      !["smart", "always", "never"].includes(
        validated.autoModeRecategorizeGrouped,
      )
    ) {
      console.warn(
        "[SettingsManager] Invalid autoModeRecategorizeGrouped setting, using default:",
        validated.autoModeRecategorizeGrouped,
      );
      validated.autoModeRecategorizeGrouped =
        this.DEFAULTS.autoModeRecategorizeGrouped;
    }

    // Validate UI style
    if (!this.isValidUiStyle?.(validated.uiStyle)) {
      if (!validated.uiStyle || typeof validated.uiStyle !== "string") {
        // ensure string then default
      }
      console.warn(
        "[SettingsManager] Invalid uiStyle, using default:",
        validated.uiStyle,
      );
      validated.uiStyle = this.DEFAULTS.uiStyle;
    }

    // Validate glass preset
    if (!this.isValidGlassPreset?.(validated.glassPreset)) {
      console.warn(
        "[SettingsManager] Invalid glassPreset, using default:",
        validated.glassPreset,
      );
      validated.glassPreset = this.DEFAULTS.glassPreset;
    }

    // Normalize primitives
    validated.autoMode = Boolean(validated.autoMode);

    // Ensure autoOrganizeIntervalMin is a number >= 1
    {
      const n = Number(validated.autoOrganizeIntervalMin);
      validated.autoOrganizeIntervalMin =
        Number.isFinite(n) && n >= 1
          ? n
          : this.DEFAULTS.autoOrganizeIntervalMin;
    }

    // Ensure required nested objects exist
    if (!validated.apiKeys || typeof validated.apiKeys !== "object") {
      validated.apiKeys = {};
    }

    if (!validated.limits || typeof validated.limits !== "object") {
      validated.limits = { ...this.DEFAULTS.limits };
    }

    // Enforce minimum debounce time
    if (validated.limits.autoOrganizeDebounceMs < 5000) {
      validated.limits.autoOrganizeDebounceMs = 5000; // Minimum 5 seconds
    }

    return validated;
  }

  /**
   * Check if algorithm is valid
   */
  static isValidAlgorithm(algorithm) {
    return this.VALID_ALGORITHMS.includes(algorithm);
  }

  /**
   * Check if provider is valid
   */
  static isValidProvider(provider) {
    return this.VALID_PROVIDERS.includes(provider);
  }

  /**
   * Check if UI style is valid
   */
  static isValidUiStyle(style) {
    return this.VALID_UI_STYLES.includes(style);
  }

  /**
   * Check if glass preset is valid
   */
  static isValidGlassPreset(preset) {
    return this.VALID_GLASS_PRESETS.includes(preset);
  }

  /**
   * Set API key for a provider (with basic encryption)
   * Stores under stable fields: openaiApiKey / anthropicApiKey (derived)
   */
  static async setApiKey(provider, key) {
    try {
      if (!this.isValidProvider(provider)) {
        throw new Error(`Invalid provider: ${provider}`);
      }

      const settings = await this.getSettings();
      settings.apiKeys = settings.apiKeys || {};

      // Basic encoding (not true encryption, just obfuscation)
      const encodedKey = key ? btoa(key) : null;
      settings.apiKeys[provider] = encodedKey;

      // Also expose stable alias fields for clarity in the schema (do not duplicate storage of raw)
      // These aliases are maintained to satisfy consumers expecting named fields.
      let aliasField;
      if (provider === "openai") aliasField = "openaiApiKey";
      else if (provider === "anthropic") aliasField = "anthropicApiKey";
      else if (provider === "groq") aliasField = "groqApiKey";

      // The alias fields hold masked values for UI display only (never plain). Keep them non-authoritative.
      if (aliasField) {
        settings[aliasField] = encodedKey ? "••••••••" : "";
      }

      const success = await this.saveSettings(settings);
      console.log(
        "[SettingsManager] API key set for provider:",
        provider,
        success ? "successfully" : "failed",
      );
      return success;
    } catch (error) {
      console.error(
        "[SettingsManager] Failed to set API key for provider:",
        provider,
        error,
      );
      return false;
    }
  }

  /**
   * Get API key for a provider (returns decrypted/plain)
   * Returns '' when missing or invalid (never null to simplify consumers).
   */
  static async getApiKey(provider) {
    try {
      if (!this.isValidProvider(provider)) {
        return "";
      }

      const settings = await this.getSettings();
      const encodedKey = settings?.apiKeys?.[provider];

      if (!encodedKey) {
        return "";
      }

      // Basic decoding
      try {
        const plain = atob(encodedKey);
        return typeof plain === "string" ? plain : "";
      } catch (_decodeError) {
        console.error(
          "[SettingsManager] Failed to decode API key for provider:",
          provider,
        );
        return "";
      }
    } catch (error) {
      console.error(
        "[SettingsManager] Failed to get API key for provider:",
        provider,
        error,
      );
      return "";
    }
  }

  /**
   * Check if provider has valid API key
   */
  static async hasValidApiKey(provider) {
    try {
      // Groq has embedded key as fallback, so always return true
      if (provider === "groq") {
        return true;
      }

      const apiKey = await this.getApiKey(provider);
      return apiKey && apiKey.length > 0;
    } catch (error) {
      console.error(
        "[SettingsManager] Failed to check API key validity for provider:",
        provider,
        error,
      );
      return false;
    }
  }

  /**
   * Check if enough time has passed for auto-organization (debouncing)
   */
  static async shouldAllowAutoOrganization() {
    try {
      const settings = await this.getSettings();
      const lastOrganization = settings.lastOrganization;
      const debounceMs = settings.limits.autoOrganizeDebounceMs;

      if (!lastOrganization) {
        return true; // First time
      }

      const timeSinceLastOrganization = Date.now() - lastOrganization;
      const shouldAllow = timeSinceLastOrganization >= debounceMs;

      console.log("[SettingsManager] Auto-organization check:", {
        timeSinceLastOrganization,
        debounceMs,
        shouldAllow,
      });

      return shouldAllow;
    } catch (error) {
      console.error(
        "[SettingsManager] Failed to check auto-organization timing:",
        error,
      );
      return false;
    }
  }

  /**
   * Update last organization timestamp
   */
  static async updateLastOrganizationTime() {
    try {
      const settings = await this.getSettings();
      settings.lastOrganization = Date.now();
      const success = await this.saveSettings(settings);
      console.log("[SettingsManager] Last organization time updated:", success);
      return success;
    } catch (error) {
      console.error(
        "[SettingsManager] Failed to update last organization time:",
        error,
      );
      return false;
    }
  }

  /**
   * Get model name for current provider
   */
  static async getCurrentModel() {
    try {
      const settings = await this.getSettings();
      const provider = (settings.provider || "openai").toLowerCase();
      if (provider === "anthropic") return "claude-sonnet-4-20250514";
      if (provider === "groq") return "llama-3.1-8b-instant";
      // Default to OpenAI fixed model
      return "gpt-5-mini";
    } catch (error) {
      console.error("[SettingsManager] Failed to get current model:", error);
      return "gpt-5-mini";
    }
  }

  /**
   * Cycle through available algorithms (for keyboard shortcut)
   * Returns the new algorithm that was set
   */
  static async cycleAlgorithm() {
    try {
      const settings = await this.getSettings();
      const currentAlgorithm = settings.defaultAlgorithm || "category";
      const currentIndex = this.VALID_ALGORITHMS.indexOf(currentAlgorithm);
      const nextIndex = (currentIndex + 1) % this.VALID_ALGORITHMS.length;
      const nextAlgorithm = this.VALID_ALGORITHMS[nextIndex];

      settings.defaultAlgorithm = nextAlgorithm;
      const success = await this.saveSettings(settings);

      if (success) {
        console.log(
          "[SettingsManager] Algorithm cycled from",
          currentAlgorithm,
          "to",
          nextAlgorithm,
        );
        return nextAlgorithm;
      } else {
        throw new Error("Failed to save settings");
      }
    } catch (error) {
      console.error("[SettingsManager] Failed to cycle algorithm:", error);
      return null;
    }
  }

  /**
   * Set model for a provider
   */
  static async setModel(_provider, _model) {
    console.warn(
      "[SettingsManager] setModel is deprecated; models are fixed per provider and not persisted.",
    );
    return false;
  }

  /**
   * Reset settings to defaults
   */
  static async resetToDefaults() {
    try {
      await chrome.storage.local.remove("settings");
      await this.initializeDefaults();
      console.log("[SettingsManager] Settings reset to defaults");
      return true;
    } catch (error) {
      console.error("[SettingsManager] Failed to reset settings:", error);
      return false;
    }
  }

  // Settings change subscription for background to reconfigure alarms, etc.
  static changeListeners = new Set();
  static _storageListenerRegistered = false;

  /**
   * Subscribe to settings changes.
   * Callback receives (newSettings, changedKeys[]).
   * Returns an unsubscribe function.
   */
  static onSettingsChanged(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }
    this.changeListeners.add(callback);

    if (!this._storageListenerRegistered && chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        try {
          if (areaName !== "local" || !changes.settings) return;

          const newRaw = changes.settings.newValue || {};
          const oldRaw = changes.settings.oldValue || {};
          const newSettings = this.validateSettings({
            ...this.DEFAULTS,
            ...newRaw,
          });
          const oldSettings = this.validateSettings({
            ...this.DEFAULTS,
            ...oldRaw,
          });

          const keysToCheck = Object.keys(newSettings);
          const changedKeys = keysToCheck.filter(
            (k) =>
              JSON.stringify(newSettings[k]) !== JSON.stringify(oldSettings[k]),
          );

          // Notify listeners
          this.changeListeners.forEach((fn) => {
            try {
              fn(newSettings, changedKeys);
            } catch (err) {
              console.error(
                "[SettingsManager] onSettingsChanged listener error:",
                err,
              );
            }
          });
        } catch (err) {
          console.error(
            "[SettingsManager] storage.onChanged handler error:",
            err,
          );
        }
      });
      this._storageListenerRegistered = true;
    }

    // Return unsubscribe
    return () => {
      this.changeListeners.delete(callback);
    };
  }
}
