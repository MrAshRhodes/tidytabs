// Service worker for ATO Chrome extension
// Handles tab events and coordinates tab organization

import { TabOrganizer } from "../core/TabOrganizer.js";
import { SettingsManager } from "../core/SettingsManager.js";
import { LLMProvider } from "../llm/LLMProvider.js";
import { CategoryAlgorithm } from "../algorithms/CategoryAlgorithm.js";

// Production mode - disable logging
const DEBUG = true; // Enable for debugging

// Helper function for conditional logging
function debugLog(...args) {
  if (DEBUG) {
    console.log("[ATO Background]", ...args);
  }
}

// Check for required Chrome APIs
const hasTabGroupsAPI = typeof chrome !== "undefined" && chrome.tabGroups;

debugLog("[ATO Background] Service worker loaded");
debugLog("[ATO Background] Tab Groups API available:", !!hasTabGroupsAPI);

// Debouncing variables for auto-organization
let autoOrganizeTimeout = null;
let isAutoOrganizing = false;

// Guards to ensure listeners register once
let listenersRegistered = false;
let alarmListenerRegistered = false;

// Initialize extension on install
chrome.runtime.onInstalled.addListener(async (details) => {
  debugLog("[ATO Background] Extension installed:", details.reason);

  try {
    // Initialize default settings if they don't exist
    const currentSettings = await SettingsManager.getSettings();
    if (!currentSettings || Object.keys(currentSettings).length === 0) {
      debugLog("[ATO Background] Initializing default settings");
      await SettingsManager.initializeDefaults();
    }

    debugLog("[ATO Background] Settings initialized successfully");

    // Configure auto mode (listeners + alarms)
    await initAutoMode();
  } catch (error) {
    debugLog("[ATO Background] Failed to initialize settings:", error);
  }
});

// Handle startup to restore necessary state
chrome.runtime.onStartup.addListener(async () => {
  debugLog("[ATO Background] Extension startup");

  try {
    // Clear any pending auto-organization timers
    if (autoOrganizeTimeout) {
      clearTimeout(autoOrganizeTimeout);
      autoOrganizeTimeout = null;
    }

    isAutoOrganizing = false;
    debugLog("[ATO Background] State restored on startup");

    // Configure auto mode (listeners + alarms)
    await initAutoMode();
  } catch (error) {
    debugLog("[ATO Background] Failed to restore state:", error);
  }
});

// Handle messages from popup and other extension components
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  debugLog("[ATO Background] Received message:", message.type);

  // Handle async responses
  if (message.type === "organizeTabs") {
    handleOrganizeTabs(
      message.algorithm || "category",
      message.includeGrouped || false,
    )
      .then((result) => {
        debugLog("[ATO Background] Organization completed:", result);
        sendResponse({ success: true, result });
      })
      .catch((error) => {
        debugLog("[ATO Background] Organization failed:", error);
        sendResponse({ success: false, error: error.message });
      });

    // Return true to indicate async response
    return true;
  }

  // New normalized connection test endpoint to avoid CORS in UI context
  if (message.type === "LLM_TEST_CONNECTION") {
    (async () => {
      try {
        debugLog(
          "[ATO Background] LLM_TEST_CONNECTION request for provider:",
          message.provider,
        );

        const settings = await SettingsManager.getSettings();
        const reqProvider = String(message.provider || "").toLowerCase();
        debugLog("[ATO Background] Settings loaded, provider:", reqProvider);

        if (!SettingsManager.isValidProvider(reqProvider)) {
          debugLog("[ATO Background] Invalid provider:", reqProvider);
          sendResponse({ ok: false, error: "Invalid provider" });
          return;
        }

        // Obtain plain key safely and instantiate provider; never log secrets
        const plainKey = await SettingsManager.getApiKey(reqProvider);
        debugLog(
          "[ATO Background] API key retrieved, has key:",
          !!plainKey,
          "length:",
          plainKey?.length || 0,
        );

        const provider = LLMProvider.for(reqProvider, settings, plainKey);
        debugLog(
          "[ATO Background] Provider instantiated, calling testConnection()...",
        );

        const result = await provider.testConnection();
        debugLog("[ATO Background] testConnection result:", result);

        // Ensure normalized response shape; attach status code hints when present in message
        if (result && typeof result.ok === "boolean") {
          if (result.ok) {
            debugLog("[ATO Background] Test connection SUCCESS");
            sendResponse({ ok: true });
          } else {
            // Normalize common errors to include status notation if missing
            let msg = String(result.error || "Connection failed");
            debugLog("[ATO Background] Test connection FAILED:", msg);

            // Add code hints if recognizable and not already included
            if (/Invalid API key(?!\s*\()/.test(msg))
              msg = "Invalid API key (401)";
            if (
              /Rate limited|quota exceeded/i.test(msg) &&
              !/\(\s*429\s*\)/.test(msg)
            )
              msg = "Rate limited or quota exceeded (429)";
            sendResponse({ ok: false, error: msg });
          }
        } else {
          debugLog(
            "[ATO Background] Test connection returned non-standard result, treating as success:",
            result,
          );
          sendResponse({ ok: true });
        }
      } catch (err) {
        debugLog("[ATO Background] LLM_TEST_CONNECTION exception:", err);
        debugLog("[ATO Background] Error stack:", err?.stack);
        sendResponse({ ok: false, error: err?.message || "Test failed" });
      }
    })();

    // Indicate async response
    return true;
  }

  // Back-compat: legacy endpoint used by older options.js
  if (message.type === "testProviderConnection") {
    (async () => {
      try {
        const settings = await SettingsManager.getSettings();
        const reqProvider = (message.provider || "").toLowerCase();
        const providerName = SettingsManager.isValidProvider(reqProvider)
          ? reqProvider
          : settings.provider;

        debugLog("[ATO Background] Testing provider connection:", providerName);
        const provider = LLMProvider.for(providerName, settings);
        const result = await provider.testConnection();
        // Never log secrets; result should be safe by design
        sendResponse({ success: true, result });
      } catch (err) {
        debugLog(
          "[ATO Background] Test connection failed:",
          err?.message || String(err),
        );
        sendResponse({ success: false, error: err?.message || "Test failed" });
      }
    })();

    // Indicate async response
    return true;
  }

  // Settings-driven auto mode: toggle and interval updates
  if (message.type === "SET_AUTO_MODE") {
    (async () => {
      try {
        const value = Boolean(message.value);
        await SettingsManager.setSetting("autoMode", value);
        await initAutoMode();
        sendResponse({ success: true });
      } catch (err) {
        debugLog(
          "[ATO Background] SET_AUTO_MODE failed:",
          err?.message || String(err),
        );
        sendResponse({
          success: false,
          error: err?.message || "Update failed",
        });
      }
    })();
    return true;
  }

  if (message.type === "SET_AUTO_INTERVAL") {
    (async () => {
      try {
        let n = Number(message.value);
        if (!Number.isFinite(n) || n < 1) n = 1;
        await SettingsManager.setSetting("autoOrganizeIntervalMin", n);
        await initAutoMode();
        sendResponse({ success: true });
      } catch (err) {
        debugLog(
          "[ATO Background] SET_AUTO_INTERVAL failed:",
          err?.message || String(err),
        );
        sendResponse({
          success: false,
          error: err?.message || "Update failed",
        });
      }
    })();
    return true;
  }

  // Test handler for duplicate prevention testing
  if (
    message.type === "test-create-group" ||
    message.action === "test-create-group"
  ) {
    (async () => {
      try {
        debugLog("[ATO Background] Test create group:", message);
        const groupId = await TabOrganizer.createTabGroup(
          message.name,
          message.color,
          message.tabIds,
        );
        sendResponse({
          success: true,
          groupId,
          message: groupId
            ? "Group created or tabs added to existing group"
            : "Failed to create group",
        });
      } catch (error) {
        debugLog("[ATO Background] Test create group failed:", error);
        sendResponse({
          success: false,
          error: error.message,
        });
      }
    })();
    return true; // Will respond asynchronously
  }

  // Legacy organize handler (for test compatibility)
  if (message.action === "organize") {
    handleOrganizeTabs(message.algorithm || "category")
      .then((result) => {
        debugLog("[ATO Background] Organization completed:", result);
        sendResponse({ success: true, ...result });
      })
      .catch((error) => {
        debugLog("[ATO Background] Organization failed:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  // Handle toggle all groups request from popup
  if (message.type === "toggleAllGroups") {
    (async () => {
      try {
        debugLog("[ATO Background] Toggle all groups request received");
        const result = await TabOrganizer.toggleAllGroups();

        sendResponse({
          success: result.success,
          result: result,
        });
      } catch (error) {
        debugLog("[ATO Background] Toggle all groups failed:", error);
        sendResponse({
          success: false,
          error: error.message,
        });
      }
    })();
    return true; // Will respond asynchronously
  }

  // Handle ungroup all tabs request
  if (message.type === "ungroupAllTabs") {
    (async () => {
      try {
        debugLog("[ATO Background] Ungroup all tabs request received");
        const result = await TabOrganizer.ungroupAllTabs();

        sendResponse({
          success: result.success,
          result: result,
        });
      } catch (error) {
        debugLog("[ATO Background] Ungroup all tabs failed:", error);
        sendResponse({
          success: false,
          error: error.message,
        });
      }
    })();
    return true; // Will respond asynchronously
  }

  // Handle clear AI cache request (for Recategorize button)
  if (message.type === "clearAICache") {
    (async () => {
      try {
        debugLog("[ATO Background] Clear AI cache request received");

        // Clear AI category cache and low confidence queue
        await chrome.storage.local.remove([
          "aiCategoryCache",
          "aiLowConfidenceQueue",
        ]);

        // Also clear the in-memory cache in CategoryAlgorithm (using static import)
        await CategoryAlgorithm.clearCache();

        debugLog("[ATO Background] AI cache cleared successfully");

        sendResponse({
          success: true,
          message: "AI cache cleared successfully",
        });
      } catch (error) {
        debugLog("[ATO Background] Failed to clear AI cache:", error);
        sendResponse({
          success: false,
          error: error.message || "Failed to clear AI cache",
        });
      }
    })();
    return true; // Will respond asynchronously
  }

  // Handle reset grouping memory request
  if (message.type === "RESET_GROUPING_MEMORY") {
    (async () => {
      try {
        debugLog("[ATO Background] Reset grouping memory request received");

        // Clear AI category cache and low confidence queue
        await chrome.storage.local.remove([
          "aiCategoryCache",
          "aiLowConfidenceQueue",
        ]);

        // Also clear the in-memory cache in CategoryAlgorithm (using static import)
        await CategoryAlgorithm.clearCache();

        debugLog("[ATO Background] Grouping memory cleared successfully");

        sendResponse({
          success: true,
          message: "Grouping memory cleared successfully",
        });
      } catch (error) {
        debugLog("[ATO Background] Failed to reset grouping memory:", error);
        sendResponse({
          success: false,
          error: error.message || "Failed to reset grouping memory",
        });
      }
    })();
    return true; // Will respond asynchronously
  }

  // Handle other message types
  return false;
});

// Handle keyboard shortcuts via chrome.commands API
chrome.commands.onCommand.addListener(async (command) => {
  debugLog("[ATO Background] Keyboard command received:", command);

  try {
    if (command === "group-now") {
      // Get current settings to determine algorithm
      const settings = await SettingsManager.getSettings();
      const algorithm = settings.defaultAlgorithm || "category";

      debugLog(
        "[ATO Background] Executing Group Now with algorithm:",
        algorithm,
      );

      // Perform organization
      const result = await handleOrganizeTabs(algorithm);

      // Show badge feedback
      chrome.action.setBadgeText({ text: "✓" });
      chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });

      // Clear badge after 2 seconds
      setTimeout(() => {
        chrome.action.setBadgeText({ text: "" });
      }, 2000);

      // Also try to show notification (may not appear due to system settings)
      if (chrome.notifications) {
        // Use a transparent 1x1 pixel as icon to satisfy Chrome's requirement
        const transparentIcon =
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

        const notificationId = `ato-organized-${Date.now()}`;

        debugLog("[ATO Background] Creating notification:", notificationId);

        chrome.notifications.create(
          notificationId,
          {
            type: "basic",
            iconUrl: transparentIcon,
            title: "✨ Tabs Organized!",
            message: `Successfully organized ${result.tabsProcessed || 0} tabs into ${result.groupsCreated || 0} groups using ${algorithm} algorithm`,
            priority: 2,
            requireInteraction: false,
            silent: false,
          },
          (createdId) => {
            debugLog("[ATO Background] Notification created:", createdId);

            // Check if notification was actually created
            chrome.notifications.getAll((notifications) => {
              debugLog("[ATO Background] Active notifications:", notifications);
            });
          },
        );

        // Auto-clear notification after 4 seconds
        setTimeout(() => {
          chrome.notifications.clear(notificationId, (wasCleared) => {
            debugLog("[ATO Background] Notification cleared:", wasCleared);
          });
        }, 4000);
      } else {
        debugLog("[ATO Background] Chrome notifications API not available");
      }

      // Notify any open popup/options pages
      chrome.runtime
        .sendMessage({
          type: "organizationCompleted",
          algorithm: algorithm,
          result: result,
        })
        .catch(() => {
          // Ignore errors if no receivers
        });
    } else if (command === "switch-category") {
      // Cycle through algorithms
      const nextAlgorithm = await SettingsManager.cycleAlgorithm();

      if (nextAlgorithm) {
        debugLog("[ATO Background] Algorithm switched to:", nextAlgorithm);

        // Ungroup and reorganize tabs with the new algorithm to match UI behavior
        try {
          debugLog(
            "[ATO Background] Ungrouping all tabs before algorithm switch...",
          );

          // First ungroup all tabs
          const ungroupResult = await TabOrganizer.ungroupAllTabs();

          if (ungroupResult && ungroupResult.success) {
            debugLog(
              "[ATO Background] Tabs ungrouped, reorganizing with new algorithm:",
              nextAlgorithm,
            );

            // Then reorganize with the new algorithm (includeGrouped: true to ensure all tabs are organized)
            const organizeResult = await handleOrganizeTabs(
              nextAlgorithm,
              true,
            );

            debugLog(
              "[ATO Background] Reorganized with new algorithm:",
              organizeResult,
            );
          } else {
            debugLog("[ATO Background] Failed to ungroup tabs:", ungroupResult);
          }
        } catch (err) {
          debugLog(
            "[ATO Background] Failed to reorganize after algorithm switch:",
            err,
          );
        }

        // Show badge feedback for algorithm switch
        const algorithmBadges = {
          category: "AI",
          lastAccess: "LA",
          frequency: "FQ",
        };

        chrome.action.setBadgeText({
          text: algorithmBadges[nextAlgorithm] || "?",
        });
        chrome.action.setBadgeBackgroundColor({ color: "#3b82f6" });

        // Clear badge after 2 seconds
        setTimeout(() => {
          chrome.action.setBadgeText({ text: "" });
        }, 2000);

        // Also try to show notification (may not appear due to system settings)
        if (chrome.notifications) {
          const algorithmNames = {
            category: "🤖 AI Category",
            lastAccess: "🕐 Last Access",
            frequency: "📊 Frequency",
          };

          // Use a transparent 1x1 pixel as icon to satisfy Chrome's requirement
          const transparentIcon =
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

          const notificationId = `ato-switch-${Date.now()}`;

          debugLog(
            "[ATO Background] Creating switch notification for:",
            nextAlgorithm,
          );

          chrome.notifications.create(
            notificationId,
            {
              type: "basic",
              iconUrl: transparentIcon,
              title: "🔄 Algorithm Switched & Tabs Reorganized",
              message: `Now using: ${algorithmNames[nextAlgorithm] || nextAlgorithm}. Tabs have been reorganized.`,
              priority: 1,
              requireInteraction: false,
              silent: false,
            },
            (createdId) => {
              debugLog(
                "[ATO Background] Switch notification created:",
                createdId,
              );
            },
          );

          // Auto-clear notification after 3 seconds
          setTimeout(() => {
            chrome.notifications.clear(notificationId, (wasCleared) => {
              debugLog(
                "[ATO Background] Switch notification cleared:",
                wasCleared,
              );
            });
          }, 3000);
        }

        // Notify any open popup/options pages to update their UI
        chrome.runtime
          .sendMessage({
            type: "algorithmChanged",
            algorithm: nextAlgorithm,
          })
          .catch(() => {
            // Ignore errors if no receivers
          });
      }
    } else if (command === "toggle-all-groups") {
      // Toggle all groups between collapsed and expanded states
      debugLog("[ATO Background] Executing Toggle All Groups");

      const result = await TabOrganizer.toggleAllGroups();

      if (result.success) {
        // Show badge feedback with appropriate icon
        const badgeText =
          result.action === "collapse"
            ? "▼"
            : result.action === "expand"
              ? "▲"
              : "●";
        chrome.action.setBadgeText({ text: badgeText });
        chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });

        // Clear badge after 2 seconds
        setTimeout(() => {
          chrome.action.setBadgeText({ text: "" });
        }, 2000);

        // Show notification if available
        if (chrome.notifications) {
          const transparentIcon =
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

          const notificationId = `ato-toggle-${Date.now()}`;
          const actionText =
            result.action === "collapse"
              ? "▼ Collapsed"
              : result.action === "expand"
                ? "▲ Expanded"
                : "Toggled";

          debugLog(
            "[ATO Background] Creating toggle notification:",
            notificationId,
          );

          chrome.notifications.create(
            notificationId,
            {
              type: "basic",
              iconUrl: transparentIcon,
              title: `${actionText} All Groups`,
              message:
                result.message ||
                `Successfully ${result.action}d ${result.groupsAffected} groups`,
              priority: 1,
              requireInteraction: false,
              silent: false,
            },
            (createdId) => {
              debugLog(
                "[ATO Background] Toggle notification created:",
                createdId,
              );
            },
          );

          // Auto-clear notification after 3 seconds
          setTimeout(() => {
            chrome.notifications.clear(notificationId, (wasCleared) => {
              debugLog(
                "[ATO Background] Toggle notification cleared:",
                wasCleared,
              );
            });
          }, 3000);
        } else {
          debugLog("[ATO Background] Chrome notifications API not available");
        }

        // Notify any open popup/options pages
        chrome.runtime
          .sendMessage({
            type: "toggleCompleted",
            action: result.action,
            result: result,
          })
          .catch(() => {
            // Ignore errors if no receivers
          });
      } else {
        // Show error feedback
        chrome.action.setBadgeText({ text: "!" });
        chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });

        // Clear badge after 3 seconds
        setTimeout(() => {
          chrome.action.setBadgeText({ text: "" });
        }, 3000);

        // Show error notification
        if (chrome.notifications) {
          const transparentIcon =
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

          const notificationId = `ato-error-${Date.now()}`;
          chrome.notifications.create(notificationId, {
            type: "basic",
            iconUrl: transparentIcon,
            title: "❌ Toggle Failed",
            message:
              result.error || result.message || "Failed to toggle groups",
            priority: 2,
            requireInteraction: false,
          });

          // Auto-clear error notification after 5 seconds
          setTimeout(() => {
            chrome.notifications.clear(notificationId);
          }, 5000);
        }
      }
    }
  } catch (error) {
    debugLog("[ATO Background] Command execution failed:", command, error);

    // Show error badge
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });

    // Clear badge after 3 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({ text: "" });
    }, 3000);

    // Also try to show error notification (may not appear due to system settings)
    if (chrome.notifications) {
      // Use a transparent 1x1 pixel as icon to satisfy Chrome's requirement
      const transparentIcon =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

      const notificationId = `ato-error-${Date.now()}`;
      chrome.notifications.create(notificationId, {
        type: "basic",
        iconUrl: transparentIcon,
        title: "❌ Operation Failed",
        message: error.message || "An error occurred",
        priority: 2,
        requireInteraction: false,
      });

      // Auto-clear error notification after 5 seconds
      setTimeout(() => {
        chrome.notifications.clear(notificationId);
      }, 5000);
    }
  }
});

// Tab event listeners are registered within initAutoMode(), guarded to avoid duplicates.

/**
 * Handle organization request from popup or auto-trigger
 */
async function handleOrganizeTabs(
  algorithm = "category",
  includeGrouped = false,
) {
  debugLog(
    "[ATO Background] Starting organization with algorithm:",
    algorithm,
    "includeGrouped:",
    includeGrouped,
  );

  try {
    // Clear any pending auto-organization
    if (autoOrganizeTimeout) {
      clearTimeout(autoOrganizeTimeout);
      autoOrganizeTimeout = null;
    }

    // Validate algorithm
    if (!SettingsManager.isValidAlgorithm(algorithm)) {
      throw new Error(`Invalid algorithm: ${algorithm}`);
    }

    // Check for API key if using category algorithm (except for Groq which has embedded key)
    if (algorithm === "category") {
      const settings = await SettingsManager.getSettings();
      const provider = settings.provider || "groq";

      // Groq doesn't need API key check (embedded key)
      if (provider !== "groq") {
        const apiKey = await SettingsManager.getApiKey(provider);

        if (!apiKey || apiKey.length === 0) {
          const providerName = provider === "openai" ? "OpenAI" : "Anthropic";
          debugLog("[ATO Background] No API key for provider:", provider);

          // Return specific error for missing API key
          return {
            success: false,
            error: "NO_API_KEY",
            provider: provider,
            message: `${providerName} API key required for AI categorization`,
          };
        }
      } else {
        debugLog(
          "[ATO Background] Using Groq provider (free tier with embedded key)",
        );
      }
    }

    // Perform organization (pass includeGrouped flag if needed)
    const result = await TabOrganizer.organize(algorithm, includeGrouped);

    // Update last organization time
    await SettingsManager.updateLastOrganizationTime();

    return result;
  } catch (error) {
    debugLog("[ATO Background] Organization failed:", error);
    throw error;
  }
}

/**
 * Check if existing tab groups have generic names that indicate poor categorization
 */
async function hasGenericGroups() {
  try {
    const tabGroups = await chrome.tabGroups.query({});
    const genericNames = [
      'work', 'general', 'other', 'miscellaneous', 'misc', 'uncategorized',
      'tabs', 'new', 'temp', 'temporary', 'random', 'stuff', 'various',
      'mixed', 'documents', 'files', 'links', 'websites'
    ];
    
    for (const group of tabGroups) {
      const groupName = group.title?.toLowerCase().trim();
      if (groupName && genericNames.includes(groupName)) {
        debugLog("[ATO Background] Found generic group:", group.title);
        return true;
      }
      
      // Also check for very short single-word names that might be generic
      if (groupName && groupName.length <= 4 && /^[a-z]+$/.test(groupName)) {
        debugLog("[ATO Background] Found potentially generic short group:", group.title);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    debugLog("[ATO Background] Error checking for generic groups:", error);
    return false; // Default to not including grouped tabs if we can't determine
  }
}

/**
 * Schedule auto-organization with a short debounce (300ms) to coalesce bursts of tab creation.
 * Checks autoMode before triggering and applies smart detection for grouped tab handling.
 */
function scheduleAutoOrganizeDebounced() {
  try {
    if (autoOrganizeTimeout) {
      clearTimeout(autoOrganizeTimeout);
    }
    autoOrganizeTimeout = setTimeout(async () => {
      try {
        const settings = await SettingsManager.getSettings();
        if (!settings.autoMode) {
          return;
        }
        if (isAutoOrganizing) {
          debugLog("[ATO Background] Auto-organization already in progress");
          return;
        }
        isAutoOrganizing = true;
        const algorithm = settings.defaultAlgorithm || "category";
        
        // Determine whether to include grouped tabs based on setting
        let includeGrouped = false;
        const autoModeRecategorizeGrouped = settings.autoModeRecategorizeGrouped || "smart";
        
        switch (autoModeRecategorizeGrouped) {
          case 'always':
            includeGrouped = true;
            debugLog("[ATO Background] Auto Mode: Always recategorizing grouped tabs");
            break;
          case 'never':
            includeGrouped = false;
            debugLog("[ATO Background] Auto Mode: Never recategorizing grouped tabs");
            break;
          case 'smart':
          default:
            includeGrouped = await hasGenericGroups();
            debugLog("[ATO Background] Auto Mode: Smart detection -", includeGrouped ? "including" : "excluding", "grouped tabs");
            break;
        }
        
        await handleOrganizeTabs(algorithm, includeGrouped);
      } catch (err) {
        debugLog("[ATO Background] Debounced auto-organization failed:", err);
      } finally {
        isAutoOrganizing = false;
        autoOrganizeTimeout = null;
      }
    }, 300); // 300 ms
  } catch (error) {
    debugLog(
      "[ATO Background] scheduleAutoOrganizeDebounced setup failed:",
      error,
    );
  }
}

/**
 * Initialize auto-mode behavior:
 * - Register tab event listeners once (created/updated -> debounced organize)
 * - Configure chrome.alarms based on settings.autoMode and autoOrganizeIntervalMin
 * - Register onAlarm listener once
 */
async function initAutoMode(currentSettings) {
  try {
    const settings = currentSettings || (await SettingsManager.getSettings());
    debugLog("[ATO Background] initAutoMode", {
      autoMode: settings.autoMode,
      intervalMin: settings.autoOrganizeIntervalMin,
    });

    // Register tab listeners once (event-driven on tab creation)
    if (!listenersRegistered) {
      chrome.tabs.onCreated.addListener(() => {
        scheduleAutoOrganizeDebounced();
      });
      listenersRegistered = true;
    }

    // Disable periodic alarms; use event-driven organization on tab creation only
    chrome.alarms.clear("ato-auto-organize");
    debugLog(
      "[ATO Background] Periodic alarms disabled; event-driven on tab creation",
    );
  } catch (error) {
    debugLog("[ATO Background] initAutoMode failed:", error);
  }
}

// Initialize auto-mode on service worker load and watch for settings changes
(async () => {
  try {
    await initAutoMode();
  } catch (e) {
    debugLog("[ATO Background] Initial auto mode setup failed:", e);
  }
})();

// Reconfigure on settings changes (autoMode / autoOrganizeIntervalMin)
SettingsManager.onSettingsChanged((newSettings, changedKeys) => {
  try {
    if (
      changedKeys.includes("autoMode") ||
      changedKeys.includes("autoOrganizeIntervalMin")
    ) {
      initAutoMode(newSettings);
    }
  } catch (e) {
    debugLog("[ATO Background] onSettingsChanged -> initAutoMode failed:", e);
  }
});

debugLog("[ATO Background] Event listeners ready");
