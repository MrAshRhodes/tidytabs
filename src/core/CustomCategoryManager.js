/**
 * CustomCategoryManager - Manages user-defined custom categories for tab organization
 * Provides CRUD operations, validation, and integration with canonical categories
 */

import {
  CanonicalCategories,
  CHROME_TAB_GROUP_COLORS,
  CANONICAL_COLOR_MAP,
} from "../constants/categories.js";

// Storage key for custom categories
const STORAGE_KEY = "customCategories";

// Maximum number of custom categories allowed
const MAX_CUSTOM_CATEGORIES = 24;

export default class CustomCategoryManager {
  /**
   * List all custom categories
   * @returns {Promise<{ok: boolean, data?: Array, error?: string}>}
   */
  static async listCategories() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const categories = result[STORAGE_KEY] || [];

      // Sort by priority (higher first) then by name
      const sorted = categories.sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return a.name.localeCompare(b.name);
      });

      return { ok: true, data: sorted };
    } catch (error) {
      this._logError("Failed to list categories", error);
      return { ok: false, error: "Failed to retrieve categories", data: [] };
    }
  }

  /**
   * Get a specific category by ID
   * @param {string} categoryId - The category ID to retrieve
   * @returns {Promise<{ok: boolean, data?: Object, error?: string}>}
   */
  static async getCategoryById(categoryId) {
    try {
      if (!categoryId) {
        return { ok: false, error: "Category ID is required" };
      }

      const result = await chrome.storage.local.get(STORAGE_KEY);
      const categories = result[STORAGE_KEY] || [];
      const category = categories.find((cat) => cat.id === categoryId);

      if (!category) {
        return { ok: false, error: "Category not found" };
      }

      return { ok: true, data: category };
    } catch (error) {
      this._logError("Failed to get category", error);
      return { ok: false, error: "Failed to retrieve category" };
    }
  }

  /**
   * Create a new custom category
   * @param {Object} categoryData - Category data
   * @param {string} categoryData.name - Category name (required)
   * @param {string} [categoryData.description] - Optional description
   * @param {string} [categoryData.icon] - Optional emoji icon
   * @param {string} [categoryData.chromeColor] - Chrome tab group color
   * @param {number} [categoryData.priority] - Priority for ordering (default 0)
   * @returns {Promise<{ok: boolean, data?: Object, error?: string}>}
   */
  static async createCategory(categoryData) {
    try {
      // Validate category data
      const validation = await this._validateCategoryData(categoryData, true);
      if (!validation.ok) {
        return validation;
      }

      // Check max categories limit
      const listResult = await this.listCategories();
      if (listResult.ok && listResult.data.length >= MAX_CUSTOM_CATEGORIES) {
        return {
          ok: false,
          error: `Maximum number of custom categories (${MAX_CUSTOM_CATEGORIES}) reached`,
        };
      }

      // Create new category object
      const now = Date.now();
      const newCategory = {
        id: `custom_${now}_${Math.random().toString(36).substr(2, 9)}`,
        name: this._normalizeName(categoryData.name),
        description: categoryData.description || "",
        icon: categoryData.icon || "",
        chromeColor:
          this._validateColor(categoryData.chromeColor) ||
          this._getColorForCategory(categoryData.name),
        created: now,
        updated: now,
        priority:
          typeof categoryData.priority === "number" ? categoryData.priority : 0,
      };

      // Save to storage
      const categories = listResult.data || [];
      categories.push(newCategory);
      await chrome.storage.local.set({ [STORAGE_KEY]: categories });

      return { ok: true, data: newCategory };
    } catch (error) {
      this._logError("Failed to create category", error);
      return { ok: false, error: "Failed to create category" };
    }
  }

  /**
   * Update an existing custom category
   * @param {string} categoryId - The category ID to update
   * @param {Object} updates - Fields to update
   * @returns {Promise<{ok: boolean, data?: Object, error?: string}>}
   */
  static async updateCategory(categoryId, updates) {
    try {
      if (!categoryId) {
        return { ok: false, error: "Category ID is required" };
      }

      const result = await chrome.storage.local.get(STORAGE_KEY);
      const categories = result[STORAGE_KEY] || [];
      const categoryIndex = categories.findIndex(
        (cat) => cat.id === categoryId,
      );

      if (categoryIndex === -1) {
        return { ok: false, error: "Category not found" };
      }

      const existingCategory = categories[categoryIndex];

      // Validate updates if name is being changed
      if (updates.name && updates.name !== existingCategory.name) {
        const validation = await this._validateCategoryData(
          { ...existingCategory, ...updates },
          false,
          categoryId,
        );
        if (!validation.ok) {
          return validation;
        }
      }

      // Apply updates
      const updatedCategory = {
        ...existingCategory,
        ...updates,
        id: existingCategory.id, // Preserve ID
        created: existingCategory.created, // Preserve creation time
        updated: Date.now(),
      };

      // Normalize and validate specific fields
      if (updates.name) {
        updatedCategory.name = this._normalizeName(updates.name);
      }
      if (updates.chromeColor) {
        updatedCategory.chromeColor =
          this._validateColor(updates.chromeColor) ||
          existingCategory.chromeColor;
      }

      categories[categoryIndex] = updatedCategory;
      await chrome.storage.local.set({ [STORAGE_KEY]: categories });

      return { ok: true, data: updatedCategory };
    } catch (error) {
      this._logError("Failed to update category", error);
      return { ok: false, error: "Failed to update category" };
    }
  }

  /**
   * Delete a custom category
   * @param {string} categoryId - The category ID to delete
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  static async deleteCategory(categoryId) {
    try {
      if (!categoryId) {
        return { ok: false, error: "Category ID is required" };
      }

      const result = await chrome.storage.local.get(STORAGE_KEY);
      const categories = result[STORAGE_KEY] || [];
      const filteredCategories = categories.filter(
        (cat) => cat.id !== categoryId,
      );

      if (categories.length === filteredCategories.length) {
        return { ok: false, error: "Category not found" };
      }

      await chrome.storage.local.set({ [STORAGE_KEY]: filteredCategories });

      return { ok: true };
    } catch (error) {
      this._logError("Failed to delete category", error);
      return { ok: false, error: "Failed to delete category" };
    }
  }

  /**
   * Get all available categories (canonical + custom)
   * @returns {Promise<{ok: boolean, data?: Array<string>, error?: string}>}
   */
  static async getAllAvailableCategories() {
    try {
      const customResult = await this.listCategories();
      const customCategories = customResult.ok ? customResult.data : [];

      // Merge canonical and custom categories
      const allCategories = new Set([...CanonicalCategories]);
      customCategories.forEach((cat) => allCategories.add(cat.name));

      return { ok: true, data: Array.from(allCategories) };
    } catch (error) {
      this._logError("Failed to get all categories", error);
      return { ok: false, error: "Failed to retrieve categories", data: [] };
    }
  }

  /**
   * Get Chrome color for a given category name
   * @param {string} categoryName - The category name
   * @returns {Promise<string>} Chrome tab group color
   */
  static async getColorForCategory(categoryName) {
    try {
      // Check custom categories first
      const customResult = await this.listCategories();
      if (customResult.ok) {
        const customCategory = customResult.data.find(
          (cat) => cat.name.toLowerCase() === categoryName.toLowerCase(),
        );
        if (customCategory && customCategory.chromeColor) {
          return customCategory.chromeColor;
        }
      }

      // Check canonical categories
      if (CANONICAL_COLOR_MAP[categoryName]) {
        return CANONICAL_COLOR_MAP[categoryName];
      }

      // Fall back to deterministic color
      return this._getColorForCategory(categoryName);
    } catch (error) {
      this._logError("Failed to get color for category", error);
      return this._getColorForCategory(categoryName);
    }
  }

  /**
   * Validate a proposed category name
   * @param {string} name - The proposed name
   * @param {string} [excludeId] - Category ID to exclude from collision check (for updates)
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  static async validateCategoryName(name, excludeId = null) {
    try {
      // Check if empty
      if (!name || !name.trim()) {
        return { ok: false, error: "Category name cannot be empty" };
      }

      // Normalize the name
      const normalized = this._normalizeName(name);

      // Check length
      if (normalized.length > 30) {
        return {
          ok: false,
          error: "Category name must be 30 characters or less",
        };
      }

      // Check for invalid characters (allow only letters, numbers, spaces, &, -, +)
      const validPattern = /^[a-zA-Z0-9\s&\-+]+$/;
      if (!validPattern.test(normalized)) {
        return {
          ok: false,
          error: "Category name contains invalid characters",
        };
      }

      // Check collision with canonical categories
      const canonicalLowerCase = CanonicalCategories.map((c) =>
        c.toLowerCase(),
      );
      if (canonicalLowerCase.includes(normalized.toLowerCase())) {
        return {
          ok: false,
          error: `"${normalized}" is already a built-in category`,
        };
      }

      // Check collision with existing custom categories
      const customResult = await this.listCategories();
      if (customResult.ok) {
        const existingCategory = customResult.data.find(
          (cat) =>
            cat.name.toLowerCase() === normalized.toLowerCase() &&
            cat.id !== excludeId,
        );
        if (existingCategory) {
          return {
            ok: false,
            error: `Category "${normalized}" already exists`,
          };
        }
      }

      return { ok: true };
    } catch (error) {
      this._logError("Failed to validate category name", error);
      return { ok: false, error: "Failed to validate category name" };
    }
  }

  /**
   * Get categories formatted for AI prompts (with priorities)
   * @returns {Promise<{ok: boolean, data?: Array, error?: string}>}
   */
  static async getCategoriesForPrompt() {
    try {
      const customResult = await this.listCategories();
      const customCategories = customResult.ok ? customResult.data : [];

      // Create combined list with canonical first, then custom by priority
      const allCategories = [...CanonicalCategories];

      // Add custom categories sorted by priority
      customCategories.forEach((cat) => {
        if (!allCategories.includes(cat.name)) {
          allCategories.push(cat.name);
        }
      });

      return { ok: true, data: allCategories };
    } catch (error) {
      this._logError("Failed to get categories for prompt", error);
      return {
        ok: false,
        error: "Failed to retrieve categories",
        data: CanonicalCategories,
      };
    }
  }

  // Private helper methods

  /**
   * Normalize a category name
   * @private
   */
  static _normalizeName(name) {
    // Remove slashes, trim, and normalize whitespace
    return name.replace(/\//g, "").trim().replace(/\s+/g, " ").substring(0, 30);
  }

  /**
   * Validate Chrome color
   * @private
   */
  static _validateColor(color) {
    if (!color) return null;
    const lowercaseColor = color.toLowerCase();
    return CHROME_TAB_GROUP_COLORS.includes(lowercaseColor)
      ? lowercaseColor
      : null;
  }

  /**
   * Get deterministic color for a category name
   * @private
   */
  static _getColorForCategory(name) {
    // Simple hash function for deterministic color selection
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash << 5) - hash + name.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    const index = Math.abs(hash) % CHROME_TAB_GROUP_COLORS.length;
    return CHROME_TAB_GROUP_COLORS[index];
  }

  /**
   * Validate category data
   * @private
   */
  static async _validateCategoryData(
    categoryData,
    isNew = true,
    excludeId = null,
  ) {
    if (!categoryData.name) {
      return { ok: false, error: "Category name is required" };
    }

    // Validate name
    const nameValidation = await this.validateCategoryName(
      categoryData.name,
      isNew ? null : excludeId,
    );
    if (!nameValidation.ok) {
      return nameValidation;
    }

    // Validate color if provided
    if (categoryData.chromeColor) {
      const validatedColor = this._validateColor(categoryData.chromeColor);
      if (!validatedColor) {
        return {
          ok: false,
          error: `Invalid Chrome color. Must be one of: ${CHROME_TAB_GROUP_COLORS.join(", ")}`,
        };
      }
    }

    // Validate icon if provided (should be a single emoji or empty)
    if (categoryData.icon && categoryData.icon.length > 4) {
      return { ok: false, error: "Icon should be a single emoji or empty" };
    }

    // Validate priority if provided
    if (
      categoryData.priority !== undefined &&
      typeof categoryData.priority !== "number"
    ) {
      return { ok: false, error: "Priority must be a number" };
    }

    return { ok: true };
  }

  /**
   * Log errors if Logger is available
   * @private
   */
  static _logError(message, error) {
    try {
      // Try to import Logger if available
      import("../utils/Logger.js")
        .then((module) => {
          const Logger = module.default;
          if (Logger && Logger.error) {
            Logger.error(`CustomCategoryManager: ${message}`, error);
          }
        })
        .catch(() => {
          // Logger not available, use console
          console.error(`CustomCategoryManager: ${message}`, error);
        });
    } catch {
      console.error(`CustomCategoryManager: ${message}`, error);
    }
  }
}
