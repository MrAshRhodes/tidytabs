/**
 * LastAccessAlgorithm - Time-based tab organization
 * Groups tabs by when they were last accessed
 */

export class LastAccessAlgorithm {
  // Time thresholds for buckets (in milliseconds)
  static TIME_THRESHOLDS = {
    JUST_NOW: 5 * 60 * 1000, // 5 minutes
    RECENT: 60 * 60 * 1000, // 1 hour
    EARLIER_TODAY: 24 * 60 * 60 * 1000, // 24 hours
    YESTERDAY: 48 * 60 * 60 * 1000, // 48 hours
    THIS_WEEK: 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  /**
   * Group tabs by last access time
   * @param {Array} tabs - Array of Chrome tab objects
   * @param {Object} settings - Optional settings for custom thresholds
   * @returns {Object} Buckets object with structure { bucketName: [tabs], ... }
   */
  static group(tabs, settings = {}) {
    const startTime = Date.now();
    console.log(
      "[ATO LastAccessAlgorithm] Grouping",
      tabs.length,
      "tabs by last access",
    );

    try {
      // Initialize buckets
      const buckets = {
        "Just Now": [],
        Recent: [],
        "Earlier Today": [],
        Yesterday: [],
        "This Week": [],
        Older: [],
      };

      // Get custom thresholds if provided
      const thresholds = {
        ...this.TIME_THRESHOLDS,
        ...settings.timeThresholds,
      };

      const now = Date.now();
      const todayStart = this.getStartOfDay(now);
      const yesterdayStart = this.getStartOfDay(now - thresholds.EARLIER_TODAY);

      // Process each tab
      for (const tab of tabs) {
        // Skip pinned tabs if configured
        if (tab.pinned && settings.excludePinned !== false) {
          continue;
        }

        // Handle tabs without lastAccessed
        const lastAccessed = tab.lastAccessed || now;
        const timeDiff = now - lastAccessed;

        // Determine which bucket this tab belongs to
        const bucket = this.getTimeBucket(
          timeDiff,
          lastAccessed,
          now,
          todayStart,
          yesterdayStart,
          thresholds,
        );
        buckets[bucket].push(tab);
      }

      // Sort tabs within each bucket by most recent first
      for (const bucket in buckets) {
        buckets[bucket] = this.sortTabsByAccess(buckets[bucket]);
      }

      // Add metadata to buckets
      const enrichedBuckets = this.enrichBuckets(buckets);

      const duration = Date.now() - startTime;
      console.log(
        "[ATO LastAccessAlgorithm] Grouping complete in",
        duration,
        "ms",
      );

      return enrichedBuckets;
    } catch (error) {
      console.error("[ATO LastAccessAlgorithm] Error during grouping:", error);
      return this.getEmptyBuckets();
    }
  }

  /**
   * Determine which time bucket a tab belongs to
   * @private
   */
  static getTimeBucket(
    timeDiff,
    lastAccessed,
    now,
    todayStart,
    yesterdayStart,
    thresholds,
  ) {
    // Just Now - last 5 minutes
    if (timeDiff <= thresholds.JUST_NOW) {
      return "Just Now";
    }

    // Recent - last hour
    if (timeDiff <= thresholds.RECENT) {
      return "Recent";
    }

    // Earlier Today - today but older than 1 hour
    if (lastAccessed >= todayStart) {
      return "Earlier Today";
    }

    // Yesterday
    if (lastAccessed >= yesterdayStart) {
      return "Yesterday";
    }

    // This Week - past 7 days
    if (timeDiff <= thresholds.THIS_WEEK) {
      return "This Week";
    }

    // Older - everything else
    return "Older";
  }

  /**
   * Sort tabs by last accessed time (most recent first)
   * @private
   */
  static sortTabsByAccess(tabs) {
    return tabs.sort((a, b) => {
      const aTime = a.lastAccessed || 0;
      const bTime = b.lastAccessed || 0;
      return bTime - aTime; // Descending order (most recent first)
    });
  }

  /**
   * Get start of day timestamp
   * @private
   */
  static getStartOfDay(timestamp) {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  /**
   * Format bucket name with additional context
   * @private
   */
  static formatBucketName(bucket, count) {
    if (count === 0) return bucket;

    const suffix = count === 1 ? "tab" : "tabs";
    return `${bucket} (${count} ${suffix})`;
  }

  /**
   * Add metadata to buckets for better UI display
   * @private
   */
  static enrichBuckets(buckets) {
    const enriched = {};

    for (const [name, tabs] of Object.entries(buckets)) {
      enriched[name] = {
        tabs: tabs,
        count: tabs.length,
        displayName: this.formatBucketName(name, tabs.length),
        isEmpty: tabs.length === 0,
        timeRange: this.getTimeRangeDescription(name),
      };
    }

    return enriched;
  }

  /**
   * Get human-readable time range description
   * @private
   */
  static getTimeRangeDescription(bucketName) {
    const descriptions = {
      "Just Now": "Within the last 5 minutes",
      Recent: "Within the last hour",
      "Earlier Today": "Earlier today",
      Yesterday: "Yesterday",
      "This Week": "Within the past week",
      Older: "More than a week ago",
    };

    return descriptions[bucketName] || bucketName;
  }

  /**
   * Return empty buckets structure
   * @private
   */
  static getEmptyBuckets() {
    return {
      "Just Now": { tabs: [], count: 0, isEmpty: true },
      Recent: { tabs: [], count: 0, isEmpty: true },
      "Earlier Today": { tabs: [], count: 0, isEmpty: true },
      Yesterday: { tabs: [], count: 0, isEmpty: true },
      "This Week": { tabs: [], count: 0, isEmpty: true },
      Older: { tabs: [], count: 0, isEmpty: true },
    };
  }

  /**
   * Get color scheme for time-based categories
   * @param {String} bucket - Bucket name
   * @returns {String} Chrome tab group color
   */
  static getBucketColor(bucket) {
    const colors = {
      "Just Now": "blue", // Active/current
      Recent: "cyan", // Recently active
      "Earlier Today": "green", // Today's work
      Yesterday: "yellow", // Yesterday's context
      "This Week": "orange", // Recent history
      Older: "grey", // Archived/old
    };

    return colors[bucket] || "grey";
  }

  /**
   * Get relative time string for display
   * @param {Number} timestamp - Unix timestamp
   * @returns {String} Relative time string
   */
  static getRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;

    const minutes = Math.floor(diff / (60 * 1000));
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));

    if (minutes < 1) return "just now";
    if (minutes === 1) return "1 minute ago";
    if (minutes < 60) return `${minutes} minutes ago`;
    if (hours === 1) return "1 hour ago";
    if (hours < 24) return `${hours} hours ago`;
    if (days === 1) return "yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;

    return "more than a month ago";
  }

  /**
   * Validate tab has required timestamp data
   * @private
   */
  static validateTab(tab) {
    // Chrome sometimes doesn't provide lastAccessed for certain tabs
    if (!tab.lastAccessed && tab.id) {
      console.warn(
        "[ATO LastAccessAlgorithm] Tab",
        tab.id,
        "missing lastAccessed timestamp",
      );
      return false;
    }
    return true;
  }
}
