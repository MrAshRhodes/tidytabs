/**
 * FrequencyAlgorithm - Usage pattern-based tab organization
 * Groups tabs by access frequency and predictive importance
 */

import { StorageUtils } from "../utils/StorageUtils.js";

export class FrequencyAlgorithm {
  // Storage keys
  static STORAGE_KEY = "ato_frequency_data";
  static LAST_CLEANUP_KEY = "ato_frequency_last_cleanup";

  // Decay and scoring constants
  static DECAY_FACTOR = 0.95; // Daily decay factor
  static DECAY_PERIOD_MS = 24 * 60 * 60 * 1000; // 1 day
  static MAX_AGE_DAYS = 30; // Maximum age for frequency data

  // Time period definitions for pattern recognition
  static TIME_PERIODS = {
    WORK_MORNING: { start: 6, end: 12 }, // 6 AM - 12 PM
    WORK_AFTERNOON: { start: 12, end: 18 }, // 12 PM - 6 PM
    PERSONAL_EVENING: { start: 18, end: 24 }, // 6 PM - 12 AM
    PERSONAL_NIGHT: { start: 0, end: 6 }, // 12 AM - 6 AM
  };

  /**
   * Group tabs by access frequency and patterns
   * @param {Array} tabs - Array of Chrome tab objects
   * @param {Object} settings - Optional settings
   * @returns {Object} Buckets object with structure { bucketName: [tabs], ... }
   */
  static async group(tabs, settings = {}) {
    const startTime = Date.now();
    console.log(
      "[ATO FrequencyAlgorithm] Grouping",
      tabs.length,
      "tabs by frequency",
    );

    try {
      // Load access data from storage
      const accessData = await this.loadAccessData();

      // Update access counts for current tabs
      await this.updateAccessCounts(tabs, accessData);

      // Calculate frequency scores for each tab
      const tabsWithScores = tabs.map((tab) => ({
        ...tab,
        score: this.calculateFrequencyScore(tab, accessData),
      }));

      // Sort tabs by score (highest first)
      tabsWithScores.sort((a, b) => b.score - a.score);

      // Distribute tabs into frequency buckets
      const buckets = this.distributeToBuckets(tabsWithScores);

      // Clean up old access data periodically
      await this.cleanupOldData(accessData);

      // Save updated access data
      await this.saveAccessData(accessData);

      const duration = Date.now() - startTime;
      console.log(
        "[ATO FrequencyAlgorithm] Grouping complete in",
        duration,
        "ms",
      );

      return buckets;
    } catch (error) {
      console.error("[ATO FrequencyAlgorithm] Error during grouping:", error);
      return this.getEmptyBuckets();
    }
  }

  /**
   * Load access pattern data from storage
   * @private
   */
  static async loadAccessData() {
    try {
      const data = await StorageUtils.get(this.STORAGE_KEY);
      return (
        data || {
          domains: {}, // Domain-based access counts
          urls: {}, // URL-based access counts
          patterns: {}, // Time-based access patterns
          lastUpdate: Date.now(),
        }
      );
    } catch (error) {
      console.error(
        "[ATO FrequencyAlgorithm] Error loading access data:",
        error,
      );
      return { domains: {}, urls: {}, patterns: {}, lastUpdate: Date.now() };
    }
  }

  /**
   * Save access pattern data to storage
   * @private
   */
  static async saveAccessData(data) {
    try {
      data.lastUpdate = Date.now();
      await StorageUtils.set({ [this.STORAGE_KEY]: data });
    } catch (error) {
      console.error(
        "[ATO FrequencyAlgorithm] Error saving access data:",
        error,
      );
    }
  }

  /**
   * Update access counts for current tabs
   * @private
   */
  static async updateAccessCounts(tabs, accessData) {
    const now = Date.now();
    const currentPeriod = this.getTimePeriod();

    for (const tab of tabs) {
      if (!tab.url) continue;

      // Extract domain
      const domain = this.extractDomain(tab.url);
      if (!domain) continue;

      // Update domain count
      if (!accessData.domains[domain]) {
        accessData.domains[domain] = {
          count: 0,
          lastAccess: now,
          periods: {},
        };
      }
      accessData.domains[domain].count++;
      accessData.domains[domain].lastAccess = now;

      // Update time period pattern
      if (!accessData.domains[domain].periods[currentPeriod]) {
        accessData.domains[domain].periods[currentPeriod] = 0;
      }
      accessData.domains[domain].periods[currentPeriod]++;

      // Update URL count for frequently visited pages
      const urlKey = this.normalizeUrl(tab.url);
      if (!accessData.urls[urlKey]) {
        accessData.urls[urlKey] = {
          count: 0,
          lastAccess: now,
          title: tab.title,
        };
      }
      accessData.urls[urlKey].count++;
      accessData.urls[urlKey].lastAccess = now;
    }
  }

  /**
   * Calculate frequency score for a tab
   * @private
   */
  static calculateFrequencyScore(tab, accessData) {
    if (!tab.url) return 0;

    const domain = this.extractDomain(tab.url);
    const urlKey = this.normalizeUrl(tab.url);
    const now = Date.now();
    const currentPeriod = this.getTimePeriod();

    let score = 0;

    // Domain-based scoring
    if (domain && accessData.domains[domain]) {
      const domainData = accessData.domains[domain];
      const daysSinceAccess =
        (now - domainData.lastAccess) / this.DECAY_PERIOD_MS;
      const decayedCount =
        domainData.count * Math.pow(this.DECAY_FACTOR, daysSinceAccess);

      // Base frequency score
      score += decayedCount * 10;

      // Time period bonus
      if (domainData.periods[currentPeriod]) {
        const periodBonus = domainData.periods[currentPeriod] * 5;
        score += periodBonus;
      }
    }

    // URL-based scoring (more specific, higher weight)
    if (accessData.urls[urlKey]) {
      const urlData = accessData.urls[urlKey];
      const daysSinceAccess = (now - urlData.lastAccess) / this.DECAY_PERIOD_MS;
      const decayedCount =
        urlData.count * Math.pow(this.DECAY_FACTOR, daysSinceAccess);
      score += decayedCount * 15;
    }

    // Recency bonus
    if (tab.lastAccessed) {
      const hoursSinceAccess = (now - tab.lastAccessed) / (60 * 60 * 1000);
      if (hoursSinceAccess < 1) score += 20;
      else if (hoursSinceAccess < 24) score += 10;
      else if (hoursSinceAccess < 168) score += 5; // Within a week
    }

    return Math.max(0, score);
  }

  /**
   * Distribute scored tabs into frequency buckets
   * @private
   */
  static distributeToBuckets(scoredTabs) {
    const total = scoredTabs.length;

    // Calculate bucket sizes
    const bucketSizes = {
      "Most Used": Math.floor(total * 0.2), // Top 20%
      "Frequently Accessed": Math.floor(total * 0.3), // Next 30%
      "Occasionally Used": Math.floor(total * 0.3), // Next 30%
      "Rarely Used": total, // Remaining
    };

    const buckets = {
      "Most Used": [],
      "Frequently Accessed": [],
      "Occasionally Used": [],
      "Rarely Used": [],
    };

    let index = 0;

    // Fill Most Used bucket
    while (index < bucketSizes["Most Used"] && index < total) {
      buckets["Most Used"].push(scoredTabs[index]);
      index++;
    }

    // Fill Frequently Accessed bucket
    const freqLimit = index + bucketSizes["Frequently Accessed"];
    while (index < freqLimit && index < total) {
      buckets["Frequently Accessed"].push(scoredTabs[index]);
      index++;
    }

    // Fill Occasionally Used bucket
    const occasionalLimit = index + bucketSizes["Occasionally Used"];
    while (index < occasionalLimit && index < total) {
      buckets["Occasionally Used"].push(scoredTabs[index]);
      index++;
    }

    // Fill Rarely Used bucket with remaining tabs
    while (index < total) {
      buckets["Rarely Used"].push(scoredTabs[index]);
      index++;
    }

    return buckets;
  }

  /**
   * Apply decay factor to access count based on age
   * @private
   */
  static applyDecayFactor(accessCount, lastAccess) {
    const now = Date.now();
    const daysSinceAccess = (now - lastAccess) / this.DECAY_PERIOD_MS;
    return accessCount * Math.pow(this.DECAY_FACTOR, daysSinceAccess);
  }

  /**
   * Determine current time period for pattern recognition
   * @private
   */
  static getTimePeriod() {
    const hour = new Date().getHours();
    const isWeekend = [0, 6].includes(new Date().getDay());

    if (isWeekend) {
      return "weekend";
    }

    for (const [period, range] of Object.entries(this.TIME_PERIODS)) {
      if (hour >= range.start && hour < range.end) {
        return period;
      }
    }

    return "other";
  }

  /**
   * Clean up old access data to prevent unlimited growth
   * @private
   */
  static async cleanupOldData(accessData) {
    const now = Date.now();
    const maxAge = this.MAX_AGE_DAYS * this.DECAY_PERIOD_MS;

    // Check if cleanup is needed (once per day)
    const lastCleanup = (await StorageUtils.get(this.LAST_CLEANUP_KEY)) || 0;
    if (now - lastCleanup < this.DECAY_PERIOD_MS) {
      return;
    }

    // Remove old domain entries
    for (const domain in accessData.domains) {
      if (now - accessData.domains[domain].lastAccess > maxAge) {
        delete accessData.domains[domain];
      }
    }

    // Remove old URL entries
    for (const url in accessData.urls) {
      if (now - accessData.urls[url].lastAccess > maxAge) {
        delete accessData.urls[url];
      }
    }

    // Update last cleanup timestamp
    await StorageUtils.set({ [this.LAST_CLEANUP_KEY]: now });
  }

  /**
   * Extract domain from URL
   * @private
   */
  static extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }

  /**
   * Normalize URL for consistent storage
   * @private
   */
  static normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      // Remove hash and query params for general pages
      return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
    } catch {
      return url;
    }
  }

  /**
   * Return empty buckets structure
   * @private
   */
  static getEmptyBuckets() {
    return {
      "Most Used": [],
      "Frequently Accessed": [],
      "Occasionally Used": [],
      "Rarely Used": [],
    };
  }

  /**
   * Reset all frequency data
   */
  static async resetData() {
    await StorageUtils.set({
      [this.STORAGE_KEY]: null,
      [this.LAST_CLEANUP_KEY]: null,
    });
    console.log("[ATO FrequencyAlgorithm] Frequency data reset");
  }

  /**
   * Get color scheme for frequency-based categories
   * @param {String} bucket - Bucket name
   * @returns {String} Chrome tab group color
   */
  static getBucketColor(bucket) {
    const colors = {
      "Most Used": "red", // High priority/frequency
      "Frequently Accessed": "pink", // Medium-high frequency
      "Occasionally Used": "yellow", // Medium frequency
      "Rarely Used": "grey", // Low frequency
    };

    return colors[bucket] || "grey";
  }
}
