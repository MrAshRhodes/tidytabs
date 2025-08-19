// Core tab organization logic
// Coordinates between different organization algorithms

import { CategoryAlgorithm } from "../algorithms/CategoryAlgorithm.js";
import { LastAccessAlgorithm } from "../algorithms/LastAccessAlgorithm.js";
import { FrequencyAlgorithm } from "../algorithms/FrequencyAlgorithm.js";
import { SettingsManager } from "./SettingsManager.js";
import { StorageUtils } from "../utils/StorageUtils.js";

/**
 * Promise wrappers for Chrome callback APIs used in grouping
 */
function tabsGroupAsync(opts) {
  return new Promise((res, rej) => {
    chrome.tabs.group(opts, (gid) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        rej(new Error(chrome.runtime.lastError.message));
      } else {
        res(gid);
      }
    });
  });
}

function tabGroupsUpdateAsync(groupId, opts) {
  return new Promise((res, rej) => {
    chrome.tabGroups.update(groupId, opts, (group) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        rej(new Error(chrome.runtime.lastError.message));
      } else {
        res(group);
      }
    });
  });
}

/**
 * Promise wrapper for chrome.tabs.get
 */
function tabsGetAsync(id) {
  return new Promise((res, rej) => {
    chrome.tabs.get(id, (tab) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        rej(new Error(chrome.runtime.lastError.message));
      } else {
        res(tab);
      }
    });
  });
}

/**
 * Promise wrapper for chrome.tabGroups.query
 */
function tabGroupsQueryAsync(queryInfo) {
  return new Promise((res, rej) => {
    chrome.tabGroups.query(queryInfo, (groups) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        rej(new Error(chrome.runtime.lastError.message));
      } else {
        res(groups);
      }
    });
  });
}

/**
 * Promise wrapper for chrome.tabGroups.get
 */
function tabGroupsGetAsync(groupId) {
  return new Promise((res, rej) => {
    chrome.tabGroups.get(groupId, (group) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        rej(new Error(chrome.runtime.lastError.message));
      } else {
        res(group);
      }
    });
  });
}

export class TabOrganizer {
  /**
   * Find existing tab group by name (case-insensitive)
   * @param {string} name - The group name to search for
   * @param {number} windowId - The window ID to search within
   * @returns {Object|null} The existing group or null if not found
   */
  static async findExistingGroup(name, windowId) {
    try {
      // Check if tabGroups API is available
      if (
        !chrome ||
        !chrome.tabGroups ||
        typeof chrome.tabGroups.query !== "function"
      ) {
        console.warn("[TabOrganizer] chrome.tabGroups.query unavailable");
        return null;
      }

      // Query all groups in the specified window
      const queryInfo = windowId ? { windowId } : {};
      const groups = await tabGroupsQueryAsync(queryInfo);

      // Normalize the target name for comparison
      const normalizedName = name.trim().toLowerCase();

      // Find matching group (case-insensitive)
      const matchingGroup = groups.find((group) => {
        const groupTitle = group.title || "";
        return groupTitle.trim().toLowerCase() === normalizedName;
      });

      if (matchingGroup) {
        console.log(
          `[TabOrganizer] Found existing group "${matchingGroup.title}" (id: ${matchingGroup.id}) for name "${name}"`,
        );
      }

      return matchingGroup || null;
    } catch (error) {
      console.error("[TabOrganizer] Error finding existing group:", error);
      return null;
    }
  }

  /**
   * Toggle all tab groups between collapsed and expanded states
   * @returns {Object} Result with action taken and groups affected
   */
  static async toggleAllGroups() {
    console.log("[TabOrganizer] toggleAllGroups called");

    try {
      // Check if tabGroups API is available
      if (
        !chrome ||
        !chrome.tabGroups ||
        typeof chrome.tabGroups.query !== "function"
      ) {
        console.warn("[TabOrganizer] chrome.tabGroups.query unavailable");
        return {
          success: false,
          error: "Tab groups API not available",
          groupsAffected: 0,
        };
      }

      // Query all tab groups across all windows
      const groups = await tabGroupsQueryAsync({});

      if (!groups || groups.length === 0) {
        console.log("[TabOrganizer] No tab groups found");
        return {
          success: true,
          action: "none",
          message: "No tab groups to toggle",
          groupsAffected: 0,
        };
      }

      console.log(`[TabOrganizer] Found ${groups.length} groups to toggle`);

      // Determine the action: if any group is expanded, collapse all; otherwise expand all
      const hasExpandedGroup = groups.some((group) => !group.collapsed);
      const newCollapsedState = hasExpandedGroup; // If any expanded, collapse all
      const action = newCollapsedState ? "collapse" : "expand";

      console.log(`[TabOrganizer] Action determined: ${action} all groups`);

      // Track results
      let successCount = 0;
      let failedCount = 0;
      const errors = [];

      // Update each group
      for (const group of groups) {
        try {
          // Skip if already in the desired state
          if (group.collapsed === newCollapsedState) {
            console.log(
              `[TabOrganizer] Group ${group.id} already ${newCollapsedState ? "collapsed" : "expanded"}, skipping`,
            );
            successCount++;
            continue;
          }

          console.log(
            `[TabOrganizer] Updating group ${group.id} (${group.title || "Untitled"}) to collapsed=${newCollapsedState}`,
          );

          await tabGroupsUpdateAsync(group.id, {
            collapsed: newCollapsedState,
          });

          successCount++;
        } catch (error) {
          console.error(
            `[TabOrganizer] Failed to update group ${group.id}:`,
            error,
          );
          failedCount++;
          errors.push({
            groupId: group.id,
            title: group.title,
            error: error.message,
          });
        }
      }

      // Prepare result message
      let message;
      if (failedCount === 0) {
        message = `Successfully ${action}d ${successCount} group${successCount !== 1 ? "s" : ""}`;
      } else if (successCount === 0) {
        message = `Failed to ${action} all groups`;
      } else {
        message = `${action}d ${successCount} group${successCount !== 1 ? "s" : ""}, ${failedCount} failed`;
      }

      const result = {
        success: failedCount === 0,
        action: action,
        message: message,
        groupsAffected: successCount,
        groupsFailed: failedCount,
        totalGroups: groups.length,
      };

      if (errors.length > 0) {
        result.errors = errors;
      }

      console.log("[TabOrganizer] toggleAllGroups result:", result);
      return result;
    } catch (error) {
      console.error("[TabOrganizer] toggleAllGroups failed:", error);
      return {
        success: false,
        error: error.message,
        groupsAffected: 0,
      };
    }
  }

  /**
   * Ungroup all tabs in all windows
   * @returns {Object} Result with tabs ungrouped count
   */
  static async ungroupAllTabs() {
    console.log("[TabOrganizer] ungroupAllTabs called");

    try {
      // Check if tabs API is available
      if (
        !chrome ||
        !chrome.tabs ||
        typeof chrome.tabs.ungroup !== "function"
      ) {
        console.warn("[TabOrganizer] chrome.tabs.ungroup unavailable");
        return {
          success: false,
          error: "Tab ungroup API not available",
          tabsUngrouped: 0,
        };
      }

      // Query all grouped tabs
      const groupedTabs = await chrome.tabs.query({
        groupId: chrome.tabGroups.TAB_GROUP_ID_NONE
          ? undefined
          : { not: chrome.tabGroups.TAB_GROUP_ID_NONE },
      });

      // Filter tabs that are actually in groups
      const tabsToUngroup = groupedTabs.filter(
        (tab) => tab.groupId && tab.groupId !== -1,
      );

      if (tabsToUngroup.length === 0) {
        console.log("[TabOrganizer] No grouped tabs found");
        return {
          success: true,
          message: "No grouped tabs to ungroup",
          tabsUngrouped: 0,
        };
      }

      console.log(
        `[TabOrganizer] Found ${tabsToUngroup.length} tabs to ungroup`,
      );

      // Extract tab IDs
      const tabIds = tabsToUngroup.map((tab) => tab.id);

      // Ungroup all tabs at once
      try {
        await new Promise((resolve, reject) => {
          chrome.tabs.ungroup(tabIds, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });

        console.log("[TabOrganizer] Successfully ungrouped all tabs");

        return {
          success: true,
          message: `Successfully ungrouped ${tabsToUngroup.length} tabs`,
          tabsUngrouped: tabsToUngroup.length,
        };
      } catch (error) {
        console.error("[TabOrganizer] Failed to ungroup tabs:", error);
        return {
          success: false,
          error: error.message,
          tabsUngrouped: 0,
        };
      }
    } catch (error) {
      console.error("[TabOrganizer] ungroupAllTabs failed:", error);
      return {
        success: false,
        error: error.message,
        tabsUngrouped: 0,
      };
    }
  }

  /**
   * Main organization method that routes to appropriate algorithm
   * @param {string} algorithm - The organization algorithm to use
   * @param {boolean} includeGrouped - Whether to include already grouped tabs
   */
  static async organize(algorithm = "category", includeGrouped = false) {
    const startTime = Date.now();
    console.log(
      "[TabOrganizer] Starting organization with algorithm:",
      algorithm,
      "includeGrouped:",
      includeGrouped,
    );

    try {
      // Validate algorithm
      if (!SettingsManager.isValidAlgorithm(algorithm)) {
        throw new Error(`Invalid algorithm: ${algorithm}`);
      }

      // Get filterable tabs (pass includeGrouped flag)
      const tabs = await this.getFilteredTabs(includeGrouped);
      if (tabs.length === 0) {
        return {
          success: true,
          algorithm,
          message: "No tabs to organize",
          tabsProcessed: 0,
          groupsCreated: 0,
          duration: Date.now() - startTime,
        };
      }

      console.log("[TabOrganizer] Found", tabs.length, "tabs to organize");

      // Load settings for telemetry/context
      const settings = await SettingsManager.getSettings();

      // Route to appropriate algorithm
      let result;
      switch (algorithm) {
        case "category":
          result = await this.organizeByCategory(tabs);
          break;
        case "lastAccess":
          result = await this.organizeByLastAccess(tabs);
          break;
        case "frequency":
          result = await this.organizeByFrequency(tabs);
          break;
        default:
          throw new Error(`Unsupported algorithm: ${algorithm}`);
      }

      const duration = Date.now() - startTime;
      console.log("[TabOrganizer] Organization completed in", duration, "ms");

      // Persist last-run telemetry
      try {
        const usedAIForTelemetry =
          algorithm === "category" && result && result.usedAI === true
            ? true
            : false;
        const provider =
          (await SettingsManager.getSettings()).provider || "openai";
        const model = await SettingsManager.getCurrentModel();
        const telemetry = {
          usedAI: usedAIForTelemetry,
          provider,
          model,
          algorithm,
          groupsCount: result?.groups?.length || 0,
          tabsProcessed: tabs.length,
          durationMs: duration,
          timestamp: Date.now(),
          // Monitor the fraction of tabs that ended as "Other" after normalization/overrides
          otherRate:
            typeof result?.otherRate === "number"
              ? result.otherRate
              : undefined,
        };
        await StorageUtils.set({ lastRunTelemetry: telemetry });
      } catch (telemetryErr) {
        console.warn(
          "[TabOrganizer] Failed to persist lastRunTelemetry:",
          telemetryErr?.message || telemetryErr,
        );
      }

      return {
        success: true,
        algorithm,
        tabsProcessed: tabs.length,
        groupsCreated: result.groupsCreated || 0,
        groups: result.groups || [],
        duration,
      };
    } catch (error) {
      console.error("[TabOrganizer] Organization failed:", error);
      return {
        success: false,
        algorithm,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Organize tabs by AI-powered categorization
   */
  static async organizeByCategory(tabs) {
    console.log("[TabOrganizer] Organizing by category");

    try {
      const settings = await SettingsManager.getSettings();

      // Group tabs by window first to avoid cross-window grouping issues
      const tabsByWindow = {};
      tabs.forEach((tab) => {
        if (!tabsByWindow[tab.windowId]) {
          tabsByWindow[tab.windowId] = [];
        }
        tabsByWindow[tab.windowId].push(tab);
      });

      console.log(
        "[TabOrganizer] Tabs distributed across",
        Object.keys(tabsByWindow).length,
        "window(s)",
      );

      const allGroups = [];
      let anyWindowUsedAI = false; // Track if AI was used for any window

      // Process each window separately
      for (const [windowId, windowTabs] of Object.entries(tabsByWindow)) {
        console.log(
          "[TabOrganizer] Processing window",
          windowId,
          "with",
          windowTabs.length,
          "tabs",
        );

        // Check if we should process this window
        // With duplicate prevention, even single tabs can be added to existing groups
        if (windowTabs.length === 0) {
          console.log("[TabOrganizer] Skipping window", windowId, "- no tabs");
          continue;
        }

        // Check if existing groups exist that single tabs could join
        const existingGroups = await tabGroupsQueryAsync({
          windowId: parseInt(windowId),
        });
        const hasExistingGroups = existingGroups && existingGroups.length > 0;

        // Skip single tabs only if there are no existing groups to add them to
        if (windowTabs.length === 1 && !hasExistingGroups) {
          console.log(
            "[TabOrganizer] Skipping window",
            windowId,
            "- single tab with no existing groups",
          );
          continue;
        }

        // Delegate to CategoryAlgorithm (AI-only categorization)
        const { groups: groupsMap, usedAI } =
          await CategoryAlgorithm.organizeByCategory(windowTabs, settings);

        // Track if AI was used for this window
        if (usedAI) {
          anyWindowUsedAI = true;
        }

        // Consolidate similar categories to prevent duplicates
        const consolidatedGroups = this.consolidateCategories(groupsMap);

        // Diagnostics: summarize categories and counts after consolidation
        try {
          const summary = Object.entries(consolidatedGroups || {}).map(
            ([k, v]) => `${k}:${Array.isArray(v) ? v.length : 0}`,
          );
          console.debug(
            "[TabOrganizer] Consolidated category map for window",
            windowId,
            ":",
            summary.join(", "),
          );
        } catch (_e) {
          console.debug("[TabOrganizer] Category map summary failed");
        }

        // Create tab groups from consolidated mapping
        const colors = [
          "blue",
          "red",
          "yellow",
          "green",
          "pink",
          "purple",
          "cyan",
          "orange",
        ];
        let colorIndex = allGroups.length % colors.length; // Continue color rotation across windows

        for (const [categoryName, tabIds] of Object.entries(
          consolidatedGroups || {},
        )) {
          const ids = Array.isArray(tabIds) ? tabIds : [];
          if (ids.length > 0) {
            const color = colors[colorIndex % colors.length];
            const groupId = await this.createTabGroup(categoryName, color, ids);

            if (groupId !== null) {
              allGroups.push({
                id: groupId,
                name: categoryName,
                color,
                tabCount: ids.length,
                windowId: parseInt(windowId),
              });
              colorIndex++;
            }
          }
        }
      }

      const groups = allGroups;

      // Explicit diagnostic when LLM produced no assignments -> no groups
      if (groups.length === 0) {
        console.log(
          "[TabOrganizer] No groups created from LLM categories (assignments length = 0)",
        );
      }

      // Compute otherRate for telemetry (no generic categories)
      const otherRate = 0;

      return {
        groupsCreated: groups.length,
        groups,
        usedAI: anyWindowUsedAI,
        otherRate,
      };
    } catch (error) {
      console.error("[TabOrganizer] Category organization failed:", error);
      return { groupsCreated: 0, groups: [], usedAI: false, otherRate: 0 };
    }
  }

  /**
   * Organize tabs by last access time
   */
  static async organizeByLastAccess(tabs) {
    console.log("[TabOrganizer] Organizing by last access");

    try {
      const timeGroups = await LastAccessAlgorithm.group(tabs);

      // Color scheme for time categories (cool to warm = recent to old)
      const timeColors = {
        "Just Now": "cyan",
        Recent: "blue",
        "Earlier Today": "green",
        Yesterday: "yellow",
        "This Week": "orange",
        Older: "red",
      };

      const groups = [];

      for (const [timePeriod, data] of Object.entries(timeGroups)) {
        // Handle enriched bucket structure from LastAccessAlgorithm
        const tabsArray = Array.isArray(data) ? data : data?.tabs || [];
        if (tabsArray.length > 0) {
          const color =
            typeof LastAccessAlgorithm.getBucketColor === "function"
              ? LastAccessAlgorithm.getBucketColor(timePeriod)
              : timeColors[timePeriod] || "grey";

          const groupId = await this.createTabGroup(
            timePeriod,
            color,
            tabsArray.map((tab) => tab.id),
          );

          if (groupId !== null) {
            groups.push({
              id: groupId,
              name: timePeriod,
              color,
              tabCount: tabsArray.length,
            });
          }
        }
      }

      return {
        groupsCreated: groups.length,
        groups,
      };
    } catch (error) {
      console.error("[TabOrganizer] Last access organization failed:", error);
      throw error;
    }
  }

  /**
   * Organize tabs by usage frequency
   */
  static async organizeByFrequency(tabs) {
    console.log("[TabOrganizer] Organizing by frequency");

    try {
      const frequencyGroups = await FrequencyAlgorithm.group(tabs);

      // Color scheme for frequency levels (warm = high usage, cool = low usage)
      const frequencyColors = {
        "Most Used": "red",
        "Frequently Accessed": "orange",
        "Occasionally Used": "yellow",
        "Rarely Used": "blue",
      };

      const groups = [];

      for (const [frequencyLevel, levelTabs] of Object.entries(
        frequencyGroups,
      )) {
        // Handle simple array structure from FrequencyAlgorithm
        const tabsArray = Array.isArray(levelTabs) ? levelTabs : [];
        if (tabsArray.length > 0) {
          const color = frequencyColors[frequencyLevel] || "grey";
          const groupId = await this.createTabGroup(
            frequencyLevel,
            color,
            tabsArray.map((tab) => tab.id),
          );

          if (groupId !== null) {
            groups.push({
              id: groupId,
              name: frequencyLevel,
              color,
              tabCount: tabsArray.length,
            });
          }
        }
      }

      return {
        groupsCreated: groups.length,
        groups,
      };
    } catch (error) {
      console.error("[TabOrganizer] Frequency organization failed:", error);
      throw error;
    }
  }

  /**
   * Consolidate similar categories to prevent duplicates
   * Maps variations of category names to canonical forms
   */
  static consolidateCategories(groupsMap) {
    if (!groupsMap || typeof groupsMap !== "object") {
      return {};
    }

    const consolidated = {};
    const canonicalMap = {
      // Development variations
      programming: "Development",
      coding: "Development",
      code: "Development",
      dev: "Development",
      developer: "Development",
      engineering: "Development",
      software: "Development",

      // Research variations
      research: "Research",
      reading: "Research",
      learning: "Research",
      education: "Research",
      study: "Research",
      documentation: "Research",
      docs: "Research",

      // Work variations
      work: "Work",
      productivity: "Work",
      office: "Work",
      business: "Work",
      project: "Work",

      // Communication variations
      email: "Email",
      mail: "Email",
      inbox: "Email",
      communication: "Communication",
      messaging: "Communication",
      chat: "Communication",

      // Entertainment variations
      entertainment: "Entertainment",
      video: "Entertainment",
      videos: "Entertainment",
      streaming: "Entertainment",
      media: "Entertainment",
      youtube: "Entertainment",

      // Shopping variations
      shopping: "Shopping",
      ecommerce: "Shopping",
      store: "Shopping",
      retail: "Shopping",
      shop: "Shopping",

      // Social variations
      social: "Social",
      "social media": "Social",
      networking: "Social",
      community: "Social",

      // News variations
      news: "News",
      journalism: "News",
      articles: "News",
      media: "News",

      // Finance variations
      finance: "Finance",
      banking: "Finance",
      financial: "Finance",
      bank: "Finance",
      money: "Finance",

      // AI variations (add to prevent "AI" from being mapped incorrectly)
      ai: "AI",
      "artificial intelligence": "AI",
      "machine learning": "AI",
      llm: "AI",
      chatgpt: "AI",
      claude: "AI",
      openai: "AI",
      anthropic: "AI",
    };

    // Process each category
    for (const [category, tabIds] of Object.entries(groupsMap)) {
      // Normalize the category name
      const lowerCategory = category.toLowerCase().trim();

      // Check if this maps to a canonical category
      let canonicalCategory = category;

      // First check exact matches
      if (canonicalMap[lowerCategory]) {
        canonicalCategory = canonicalMap[lowerCategory];
      } else {
        // Check for partial matches
        for (const [variation, canonical] of Object.entries(canonicalMap)) {
          if (
            lowerCategory.includes(variation) ||
            variation.includes(lowerCategory)
          ) {
            canonicalCategory = canonical;
            break;
          }
        }
      }

      // Add tabs to the canonical category
      if (!consolidated[canonicalCategory]) {
        consolidated[canonicalCategory] = [];
      }

      const ids = Array.isArray(tabIds) ? tabIds : [];
      consolidated[canonicalCategory].push(...ids);
    }

    // Log consolidation results
    const before = Object.keys(groupsMap).length;
    const after = Object.keys(consolidated).length;
    if (before !== after) {
      console.log(
        `[TabOrganizer] Consolidated ${before} categories into ${after} groups`,
      );
    }

    return consolidated;
  }

  /**
   * Fallback to simple domain-based grouping when AI fails
   */
  static async fallbackToDomainGrouping(tabs) {
    console.log("[TabOrganizer] Using domain-based fallback grouping");

    try {
      const domainGroups = {};

      tabs.forEach((tab) => {
        try {
          const domain = new URL(tab.url).hostname.replace("www.", "");
          if (!domainGroups[domain]) {
            domainGroups[domain] = [];
          }
          domainGroups[domain].push(tab);
        } catch (e) {
          // Skip tabs with invalid URLs
        }
      });

      const groups = [];
      const colors = [
        "blue",
        "green",
        "yellow",
        "orange",
        "pink",
        "purple",
        "cyan",
        "red",
      ];
      let colorIndex = 0;

      for (const [domain, domainTabs] of Object.entries(domainGroups)) {
        if (domainTabs.length > 1) {
          // Only group if more than 1 tab
          const color = colors[colorIndex % colors.length];
          const groupName = domain.charAt(0).toUpperCase() + domain.slice(1);
          const groupId = await this.createTabGroup(
            groupName,
            color,
            domainTabs.map((tab) => tab.id),
          );

          if (groupId !== null) {
            groups.push({
              id: groupId,
              name: groupName,
              color,
              tabCount: domainTabs.length,
            });

            colorIndex++;
          }
        }
      }

      return {
        groupsCreated: groups.length,
        groups,
      };
    } catch (error) {
      console.error("[TabOrganizer] Domain-based fallback failed:", error);
      throw error;
    }
  }

  /**
   * Validate tab IDs just-in-time before grouping.
   * Returns { validIds, primaryWindowId } where primaryWindowId is from the first valid tab.
   */
  static async validateTabIds(tabIds = []) {
    console.log(
      "[TabOrganizer] validateTabIds called with",
      tabIds.length,
      "tab IDs",
    );

    try {
      if (!Array.isArray(tabIds) || tabIds.length === 0) {
        console.log("[TabOrganizer] validateTabIds: Empty or invalid input");
        return { validIds: [], primaryWindowId: undefined };
      }
      // If tabs.get is not available, skip validation (best-effort).
      if (!chrome || !chrome.tabs || typeof chrome.tabs.get !== "function") {
        console.warn(
          "[TabOrganizer] validateTabIds: chrome.tabs.get unavailable, skipping validation",
        );
        return { validIds: [...tabIds], primaryWindowId: undefined };
      }

      const results = await Promise.all(
        tabIds.map(async (id) => {
          try {
            const tab = await tabsGetAsync(id);
            if (tab && typeof tab.id === "number") {
              console.log(
                "[TabOrganizer] Tab",
                id,
                "is valid, windowId:",
                tab.windowId,
              );
              return tab;
            }
            console.log(
              "[TabOrganizer] Tab",
              id,
              "validation returned invalid tab",
            );
            return null;
          } catch (err) {
            console.log(
              "[TabOrganizer] Tab",
              id,
              "validation failed:",
              err.message,
            );
            // tab was likely closed or invalid; skip
            return null;
          }
        }),
      );

      const validTabs = results.filter(Boolean);
      const validIds = validTabs.map((t) => t.id);
      const primaryWindowId =
        validTabs.length > 0 ? validTabs[0].windowId : undefined;

      const filteredCount = tabIds.length - validIds.length;
      if (filteredCount > 0) {
        console.warn(
          "[TabOrganizer] Filtered",
          filteredCount,
          "invalid tab ids before grouping",
        );
      }

      console.log("[TabOrganizer] validateTabIds result:", {
        inputCount: tabIds.length,
        validCount: validIds.length,
        primaryWindowId,
        windowIds: [...new Set(validTabs.map((t) => t.windowId))],
      });

      return { validIds, primaryWindowId };
    } catch (err) {
      console.error("[TabOrganizer] validateTabIds unexpected error:", err);
      // On unexpected errors, proceed conservatively
      return { validIds: [...tabIds], primaryWindowId: undefined };
    }
  }

  /**
   * Create a tab group using Chrome's tabGroups API
   * Now checks for existing groups and adds tabs to them if found
   */
  static async createTabGroup(name, color, tabIds) {
    console.log("[TabOrganizer] createTabGroup called with:", {
      name,
      color,
      tabIds: tabIds?.length || 0,
      tabIdsSample: tabIds?.slice(0, 3),
    });

    try {
      if (!Array.isArray(tabIds) || tabIds.length === 0) {
        console.warn("[TabOrganizer] No tab IDs provided for group creation");
        return null;
      }

      // Capability guards with detailed logging
      console.log("[TabOrganizer] Chrome API check:", {
        chrome: typeof chrome,
        chromeTabs: chrome?.tabs ? "exists" : "missing",
        chromeTabsGroup: typeof chrome?.tabs?.group,
        chromeTabGroups: chrome?.tabGroups ? "exists" : "missing",
        chromeTabGroupsUpdate: typeof chrome?.tabGroups?.update,
      });

      if (!chrome || !chrome.tabs || typeof chrome.tabs.group !== "function") {
        console.error(
          "[TabOrganizer] CRITICAL: chrome.tabs.group is unavailable; cannot create tab groups",
        );
        console.error("[TabOrganizer] Chrome APIs status:", {
          chrome: !!chrome,
          tabs: !!chrome?.tabs,
          group: typeof chrome?.tabs?.group,
          tabGroups: !!chrome?.tabGroups,
        });
        return null;
      }

      // Validate IDs and determine a target windowId
      console.log("[TabOrganizer] Validating tab IDs...");
      const { validIds, primaryWindowId } = await this.validateTabIds(tabIds);
      console.log("[TabOrganizer] Validation result:", {
        inputCount: tabIds.length,
        validCount: validIds.length,
        primaryWindowId,
        validIdsSample: validIds.slice(0, 3),
      });

      if (validIds.length === 0) {
        console.warn(
          "[TabOrganizer] No valid tab IDs remain for group creation after validation",
        );
        return null;
      }

      // Check for existing group with the same name in the same window
      const existingGroup = await this.findExistingGroup(name, primaryWindowId);

      if (existingGroup) {
        console.log(
          `[TabOrganizer] Adding ${validIds.length} tabs to existing group "${existingGroup.title}" (id: ${existingGroup.id})`,
        );

        // Add tabs to the existing group
        try {
          const groupOptions = { tabIds: validIds, groupId: existingGroup.id };
          console.log(
            "[TabOrganizer] Calling chrome.tabs.group to add tabs to existing group:",
            groupOptions,
          );
          await tabsGroupAsync(groupOptions);
          console.log("[TabOrganizer] SUCCESS: Tabs added to existing group");

          // Return the existing group ID
          return existingGroup.id;
        } catch (err) {
          console.error(
            "[TabOrganizer] Failed to add tabs to existing group:",
            err?.message || err,
          );
          // Fall through to create a new group if adding to existing fails
        }
      }

      console.log(
        "[TabOrganizer] Creating new group:",
        name,
        "with",
        validIds.length,
        "tabs, windowId:",
        primaryWindowId,
      );

      const baseOptions = primaryWindowId
        ? { tabIds: validIds, createProperties: { windowId: primaryWindowId } }
        : { tabIds: validIds };

      let groupId = null;

      // Attempt grouping with one-shot retry if a tab went stale mid-operation
      try {
        console.log(
          "[TabOrganizer] Calling chrome.tabs.group with options:",
          baseOptions,
        );
        groupId = await tabsGroupAsync(baseOptions);
        console.log(
          "[TabOrganizer] SUCCESS: New group created with ID:",
          groupId,
        );
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        console.error("[TabOrganizer] FAILED to create tab group:", msg);
        console.error("[TabOrganizer] Full error object:", err);

        const m = /No tab with id:\s*(\d+)/.exec(msg);
        if (m) {
          const missingId = Number(m[1]);
          const remaining = validIds.filter((id) => id !== missingId);
          if (remaining.length === 0) {
            console.warn(
              "[TabOrganizer] No valid tab IDs remain after excluding missing tab id",
              missingId,
            );
            return null;
          }
          console.warn(
            "[TabOrganizer] Retrying group without missing tab id",
            missingId,
          );
          const retryOptions = primaryWindowId
            ? {
                tabIds: remaining,
                createProperties: { windowId: primaryWindowId },
              }
            : { tabIds: remaining };
          try {
            console.log(
              "[TabOrganizer] Retry: Calling chrome.tabs.group with options:",
              retryOptions,
            );
            groupId = await tabsGroupAsync(retryOptions);
            console.log(
              "[TabOrganizer] Retry SUCCESS: Group created with ID:",
              groupId,
            );
          } catch (retryErr) {
            console.error(
              "[TabOrganizer] Retry FAILED:",
              retryErr && retryErr.message ? retryErr.message : retryErr,
            );
            return null;
          }
        } else {
          console.error(
            "[TabOrganizer] Failed to create tab group (no retry):",
            msg,
          );
          return null;
        }
      }

      // Update group metadata if supported (non-fatal on failure)
      if (
        chrome &&
        chrome.tabGroups &&
        typeof chrome.tabGroups.update === "function"
      ) {
        try {
          console.log("[TabOrganizer] Updating group metadata:", {
            groupId,
            title: name,
            color,
            collapsed: false,
          });
          await tabGroupsUpdateAsync(groupId, {
            title: name,
            color: color,
            collapsed: false,
          });
          console.log("[TabOrganizer] Group metadata updated successfully");
        } catch (updateErr) {
          console.warn(
            "[TabOrganizer] Group created but metadata update failed:",
            updateErr && updateErr.message ? updateErr.message : updateErr,
          );
        }
      } else {
        console.warn(
          "[TabOrganizer] chrome.tabGroups.update is unavailable; skipping title/color update",
        );
      }

      console.log(
        "[TabOrganizer] createTabGroup completed successfully, returning groupId:",
        groupId,
      );
      return groupId;
    } catch (error) {
      console.error("[TabOrganizer] Failed to create tab group:", error);
      // Don't throw - return null to allow graceful degradation
      return null;
    }
  }

  /**
   * Get tabs that can be organized (exclude pinned and special tabs)
   * @param {boolean} includeGrouped - Whether to include already grouped tabs
   */
  static async getFilteredTabs(includeGrouped = false) {
    console.log(
      "[TabOrganizer] getFilteredTabs called, includeGrouped:",
      includeGrouped,
    );

    try {
      const allTabs = await chrome.tabs.query({});
      console.log("[TabOrganizer] Total tabs found:", allTabs.length);

      // Filter out tabs that can't be organized
      const filteredTabs = allTabs.filter((tab) => {
        // Skip already grouped tabs unless explicitly including them
        if (!includeGrouped && tab.groupId && tab.groupId !== -1) {
          console.log(
            "[TabOrganizer] Skipping tab",
            tab.id,
            "- already in group",
            tab.groupId,
          );
          return false;
        }
        return this.validateTabsForOrganization(tab);
      });

      console.log("[TabOrganizer] Tabs after filtering:", filteredTabs.length);

      // Log sample of filtered tabs for debugging
      if (filteredTabs.length > 0) {
        console.log(
          "[TabOrganizer] Sample filtered tabs:",
          filteredTabs.slice(0, 3).map((t) => ({
            id: t.id,
            title: t.title?.substring(0, 30),
            url: t.url?.substring(0, 50),
            windowId: t.windowId,
            groupId: t.groupId,
          })),
        );
      }

      return filteredTabs;
    } catch (error) {
      console.error("[TabOrganizer] Failed to get filtered tabs:", error);
      throw error;
    }
  }

  /**
   * Validate if a tab can be organized
   */
  static validateTabsForOrganization(tab) {
    // Skip pinned tabs
    if (tab.pinned) {
      return false;
    }

    // Skip special Chrome URLs
    if (
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("edge://") ||
      tab.url.startsWith("about:")
    ) {
      return false;
    }

    // Skip new tab pages
    if (tab.url === "chrome://newtab/" || tab.url === "about:blank") {
      return false;
    }

    return true;
  }
}
