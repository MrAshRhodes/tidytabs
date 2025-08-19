/**
 * TabGroupManager - Centralized Chrome tab group operations for category-based organization
 * Handles creation, retrieval, and tab movement between category groups
 */

import CustomCategoryManager from "../core/CustomCategoryManager.js";

export default class TabGroupManager {
  // Chrome tab group colors available
  static ALLOWED_COLORS = [
    "grey",
    "blue",
    "red",
    "yellow",
    "green",
    "pink",
    "purple",
    "cyan",
    "orange",
  ];

  // Canonical category color defaults
  static CANONICAL_COLOR_MAP = {
    Email: "blue",
    Work: "purple",
    Research: "cyan",
    Development: "green",
    Shopping: "yellow",
    Entertainment: "red",
    Social: "pink",
    News: "orange",
    Finance: "grey",
    Travel: "cyan",
    Utilities: "grey",
    AI: "purple",
  };

  /**
   * Get the Chrome color for a category
   * @param {string} categoryName - The category name
   * @returns {Promise<string>} Chrome tab group color
   */
  static async getCategoryColor(categoryName) {
    try {
      // First check if CustomCategoryManager has a color for this category
      const customColor =
        await CustomCategoryManager.getColorForCategory(categoryName);
      if (customColor && this.ALLOWED_COLORS.includes(customColor)) {
        return customColor;
      }

      // Check canonical defaults
      if (this.CANONICAL_COLOR_MAP[categoryName]) {
        return this.CANONICAL_COLOR_MAP[categoryName];
      }

      // Fall back to deterministic hashing
      return this._getColorByHash(categoryName);
    } catch (error) {
      console.error("[TabGroupManager] Error getting category color:", error);
      // Return deterministic hash color on error
      return this._getColorByHash(categoryName);
    }
  }

  /**
   * Find a tab group ID by its title
   * @param {string} title - The group title to search for
   * @returns {Promise<number|null>} Group ID if found, null otherwise
   */
  static async findGroupIdByTitle(title) {
    try {
      if (!title) {
        return null;
      }

      // Query all tab groups
      const groups = await chrome.tabGroups.query({});

      // Find group with matching title (case-insensitive)
      const matchingGroup = groups.find(
        (group) =>
          group.title && group.title.toLowerCase() === title.toLowerCase(),
      );

      return matchingGroup ? matchingGroup.id : null;
    } catch (error) {
      console.error("[TabGroupManager] Error finding group by title:", error);
      return null;
    }
  }

  /**
   * Create or get an existing tab group for a category
   * @param {string} categoryName - The category name
   * @returns {Promise<number|null>} Group ID if successful, null otherwise
   */
  static async createOrGetGroupForCategory(categoryName) {
    try {
      if (!categoryName) {
        console.error("[TabGroupManager] Category name is required");
        return null;
      }

      // Check if group already exists
      const existingGroupId = await this.findGroupIdByTitle(categoryName);
      if (existingGroupId !== null) {
        return existingGroupId;
      }

      // Get color for the category
      const color = await this.getCategoryColor(categoryName);

      // Create a new group using a temporary tab
      // First, create a new tab (we'll ungroup it after creating the group)
      const tempTab = await chrome.tabs.create({
        url: "about:blank",
        active: false,
      });

      try {
        // Create a group with the temporary tab
        const groupId = await chrome.tabs.group({
          tabIds: [tempTab.id],
        });

        // Update the group properties
        await chrome.tabGroups.update(groupId, {
          title: categoryName,
          color: color,
          collapsed: false,
        });

        // Ungroup the temporary tab
        await chrome.tabs.ungroup([tempTab.id]);

        // Close the temporary tab
        await chrome.tabs.remove(tempTab.id);

        return groupId;
      } catch (groupError) {
        // Clean up the temporary tab on error
        try {
          await chrome.tabs.remove(tempTab.id);
        } catch (removeError) {
          console.error(
            "[TabGroupManager] Failed to remove temp tab:",
            removeError,
          );
        }
        throw groupError;
      }
    } catch (error) {
      console.error("[TabGroupManager] Error creating/getting group:", error);
      return null;
    }
  }

  /**
   * Get deterministic color for a category name using hash
   * @private
   * @param {string} name - The category name
   * @returns {string} Chrome tab group color
   */
  static _getColorByHash(name) {
    // Sum character codes for deterministic hashing
    let sum = 0;
    for (let i = 0; i < name.length; i++) {
      sum += name.charCodeAt(i);
    }

    // Modulo by palette length to get color index
    const index = sum % this.ALLOWED_COLORS.length;
    return this.ALLOWED_COLORS[index];
  }
}
