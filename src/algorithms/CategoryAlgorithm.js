/**
 * CategoryAlgorithm - AI-powered tab categorization with domain-based fallback
 * Groups tabs by semantic similarity using LLM providers or domain patterns
 */

import { LLMProvider } from "../llm/LLMProvider.js";
import { SettingsManager } from "../core/SettingsManager.js";
import { StorageUtils } from "../utils/StorageUtils.js";

export class CategoryAlgorithm {
  // Persistent cache TTL (24 hours) for per-tab categorization - DEPRECATED
  static CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  // Network batch size for LLM calls
  static AI_BATCH_SIZE = 25;

  // Confidence threshold for applying domain-aware overrides to AI outputs
  static LOW_CONFIDENCE = 0.6;

  /**
   * Get dynamic cache TTL based on confidence level
   * High confidence = longer cache, low confidence = shorter cache
   * @param {number} confidence - Confidence score between 0 and 1
   * @returns {number} TTL in milliseconds
   */
  static getCacheTTL(confidence) {
    if (confidence >= 0.9) return 24 * 60 * 60 * 1000; // 24 hours for very high confidence
    if (confidence >= 0.8) return 12 * 60 * 60 * 1000; // 12 hours for high confidence
    if (confidence >= 0.7) return 6 * 60 * 60 * 1000; // 6 hours for medium-high
    if (confidence >= 0.6) return 3 * 60 * 60 * 1000; // 3 hours for medium
    if (confidence >= 0.5) return 1 * 60 * 60 * 1000; // 1 hour for low
    return 30 * 60 * 1000; // 30 minutes for very low confidence
  }

  /**
   * Check if a cache entry is still valid based on its confidence-based TTL
   * @param {Object} entry - Cache entry with ts and confidence
   * @param {number} now - Current timestamp
   * @returns {boolean} True if cache entry is still valid
   */
  static isCacheValid(entry, now) {
    if (!entry || !entry.ts || !entry.category) return false;
    const ttl = this.getCacheTTL(entry.confidence || 0.5);
    return now - entry.ts <= ttl;
  }

  /**
   * Validate AI category against known patterns and reduce confidence if mismatch
   * @param {string} url - Tab URL
   * @param {string} title - Tab title
   * @param {string} aiCategory - Category suggested by AI
   * @param {number} confidence - AI confidence score
   * @returns {{category: string, confidence: number, needsReview: boolean}}
   */
  static validateCategory(url, title, aiCategory, confidence) {
    const domain = this.parseDomain(url);
    const expectedCategory = this.getDomainCategory(domain);

    // Strong domain knowledge that contradicts AI
    if (expectedCategory && expectedCategory !== aiCategory) {
      // Check if it's a critical mismatch (e.g., IMDb as News)
      const criticalMismatches = {
        "imdb.com": "Entertainment",
        "rottentomatoes.com": "Entertainment",
        "metacritic.com": "Entertainment",
        "github.com": "Development",
        "gitlab.com": "Development",
        "stackoverflow.com": "Development",
        "gmail.com": "Email",
        "mail.google.com": "Email",
        "outlook.com": "Email",
      };

      for (const [criticalDomain, correctCategory] of Object.entries(
        criticalMismatches,
      )) {
        if (domain.includes(criticalDomain) && aiCategory !== correctCategory) {
          console.warn(
            `[CategoryAlgorithm] Critical mismatch detected: ${domain} should be ${correctCategory}, not ${aiCategory}`,
          );
          // Override with correct category for critical sites
          return {
            category: correctCategory,
            confidence: 0.95, // High confidence in our override
            needsReview: false,
            corrected: true,
          };
        }
      }

      // For non-critical mismatches, reduce confidence
      console.warn(
        `[CategoryAlgorithm] Potential mismatch: ${domain} expected ${expectedCategory}, got ${aiCategory}`,
      );
      return {
        category: aiCategory,
        confidence: Math.min(confidence, 0.5),
        needsReview: true,
        corrected: false,
      };
    }

    // Validate against title patterns
    const titleLower = (title || "").toLowerCase();
    const urlLower = (url || "").toLowerCase();

    // Strong patterns that should always match certain categories
    const strongPatterns = [
      {
        pattern: /\b(movie|film|trailer|imdb|rotten|metacritic)\b/i,
        category: "Entertainment",
      },
      {
        pattern: /\b(github|gitlab|stackoverflow|npm|pypi)\b/i,
        category: "Development",
      },
      { pattern: /\b(gmail|outlook|mail|inbox)\b/i, category: "Email" },
      {
        pattern: /\b(shopping cart|checkout|buy now|add to cart)\b/i,
        category: "Shopping",
      },
    ];

    for (const { pattern, category } of strongPatterns) {
      if (pattern.test(titleLower) || pattern.test(urlLower)) {
        if (aiCategory !== category) {
          console.warn(
            `[CategoryAlgorithm] Pattern mismatch: "${pattern}" suggests ${category}, got ${aiCategory}`,
          );
          // Don't override, but flag for review
          return {
            category: aiCategory,
            confidence: Math.min(confidence, 0.6),
            needsReview: true,
            corrected: false,
          };
        }
      }
    }

    // No issues found, return as-is
    return {
      category: aiCategory,
      confidence,
      needsReview: false,
      corrected: false,
    };
  }

  // Known-domain overrides to canonical categories (applied when AI yields "Other", low confidence, or non-canonical)
  static DOMAIN_OVERRIDE = {
    // Email-only overrides (used only when confidence is low)
    "gmail.com": "Email",
    "mail.google.com": "Email",
    "outlook.com": "Email",
    "office365.com": "Email",
    "yahoo.com": "Email",
    "mail.yahoo.com": "Email",
    "proton.me": "Email",
    "fastmail.com": "Email",
  };

  // Enhanced pattern validation for more accurate categorization
  static KNOWN_PATTERNS = {
    Entertainment: {
      domains: [
        "imdb.com",
        "rottentomatoes.com",
        "metacritic.com",
        "netflix.com",
        "hulu.com",
        "disney.com",
        "disneyplus.com",
        "hbomax.com",
        "primevideo.com",
        "paramount.com",
        "peacocktv.com",
        "youtube.com",
        "twitch.tv",
        "spotify.com",
        "soundcloud.com",
        "vimeo.com",
        "pandora.com",
        "crunchyroll.com",
      ],
      titlePatterns: [
        /\b(movie|film|trailer|series|episode|season|watch|streaming)\b/i,
        /\b(music|playlist|album|artist|song|track)\b/i,
        /\b(imdb|rotten\s*tomatoes|metacritic)\b/i,
        /\b(netflix|hulu|disney|hbo|prime\s*video)\b/i,
      ],
      urlPatterns: [
        /\/watch\?v=/i,
        /\/title\//i,
        /\/movie\//i,
        /\/series\//i,
        /\/playlist/i,
      ],
    },
    Development: {
      domains: [
        "github.com",
        "gitlab.com",
        "bitbucket.org",
        "stackoverflow.com",
        "stackexchange.com",
        "npmjs.com",
        "pypi.org",
        "rubygems.org",
        "docker.com",
        "kubernetes.io",
      ],
      titlePatterns: [
        /\b(github|gitlab|bitbucket|repository|repo)\b/i,
        /\b(stack\s*overflow|programming|code|coding)\b/i,
        /\b(api|sdk|documentation|docs|developer)\b/i,
        /\b(npm|pip|gem|package|library)\b/i,
      ],
      urlPatterns: [
        /\/repos?\//i,
        /\/pull\//i,
        /\/issues?\//i,
        /\/commit\//i,
        /\/blob\//i,
      ],
    },
    Email: {
      domains: [
        "gmail.com",
        "mail.google.com",
        "outlook.com",
        "outlook.live.com",
        "yahoo.com",
        "mail.yahoo.com",
        "proton.me",
        "protonmail.com",
        "fastmail.com",
        "icloud.com",
        "mail.com",
      ],
      titlePatterns: [
        /\b(inbox|mail|email|compose|draft)\b/i,
        /\b(gmail|outlook|yahoo\s*mail|proton\s*mail)\b/i,
      ],
      urlPatterns: [/\/mail\//i, /\/inbox/i, /\#inbox/i, /\/compose/i],
    },
    Shopping: {
      domains: [
        "amazon.com",
        "ebay.com",
        "etsy.com",
        "alibaba.com",
        "aliexpress.com",
        "shopify.com",
        "walmart.com",
        "target.com",
        "bestbuy.com",
        "homedepot.com",
        "lowes.com",
        "costco.com",
      ],
      titlePatterns: [
        /\b(cart|checkout|order|buy|purchase|shop)\b/i,
        /\b(product|item|price|deal|sale|discount)\b/i,
        /\b(amazon|ebay|etsy|shopping)\b/i,
      ],
      urlPatterns: [
        /\/cart/i,
        /\/checkout/i,
        /\/product\//i,
        /\/dp\//i,
        /\/item\//i,
      ],
    },
    News: {
      domains: [
        "cnn.com",
        "bbc.com",
        "bbc.co.uk",
        "nytimes.com",
        "theguardian.com",
        "reuters.com",
        "bloomberg.com",
        "wsj.com",
        "washingtonpost.com",
        "ft.com",
      ],
      titlePatterns: [
        /\b(breaking|news|article|report|update)\b/i,
        /\b(politics|economy|business|world|national)\b/i,
        /\b(cnn|bbc|nytimes|guardian|reuters)\b/i,
      ],
      urlPatterns: [
        /\/news\//i,
        /\/article\//i,
        /\/story\//i,
        /\/politics\//i,
        /\/business\//i,
      ],
    },
    Social: {
      domains: [
        "facebook.com",
        "twitter.com",
        "x.com",
        "instagram.com",
        "linkedin.com",
        "reddit.com",
        "pinterest.com",
        "tumblr.com",
        "tiktok.com",
        "snapchat.com",
      ],
      titlePatterns: [
        /\b(profile|post|tweet|share|follow)\b/i,
        /\b(facebook|twitter|instagram|linkedin|reddit)\b/i,
      ],
      urlPatterns: [
        /\/profile\//i,
        /\/user\//i,
        /\/u\//i,
        /\/r\//i,
        /\/status\//i,
      ],
    },
  };

  /**
   * Enhanced pattern validation for known sites
   * @param {string} url - Tab URL
   * @param {string} title - Tab title
   * @param {string} domain - Parsed domain
   * @returns {string|null} Category if pattern matches, null otherwise
   */
  static validateKnownPatterns(url, title, domain) {
    const urlLower = (url || "").toLowerCase();
    const titleLower = (title || "").toLowerCase();
    const domainLower = (domain || "").toLowerCase();

    // Check each category's patterns
    for (const [category, patterns] of Object.entries(this.KNOWN_PATTERNS)) {
      // Check domain match (highest confidence)
      if (patterns.domains.some((d) => domainLower.includes(d))) {
        return category;
      }

      // Check URL patterns
      if (patterns.urlPatterns.some((pattern) => pattern.test(urlLower))) {
        return category;
      }

      // Check title patterns (lower confidence)
      if (patterns.titlePatterns.some((pattern) => pattern.test(titleLower))) {
        // Additional validation for title matches to avoid false positives
        // Don't categorize as News just because title contains "news" if domain is entertainment
        if (category === "News") {
          const entertainmentDomains =
            this.KNOWN_PATTERNS.Entertainment.domains;
          if (entertainmentDomains.some((d) => domainLower.includes(d))) {
            continue; // Skip News categorization for entertainment domains
          }
        }
        return category;
      }
    }

    return null;
  }

  // Synonym map to normalize AI category variants to canonical taxonomy
  static SYNONYM_MAP = {
    // Email
    email: "Email",
    mail: "Email",
    inbox: "Email",
    communication: "Email",
    messaging: "Email",
    chat: "Email",

    // Work
    work: "Work",
    productivity: "Work",
    office: "Work",
    calendar: "Work",
    meeting: "Work",
    tasks: "Work",
    "project management": "Work",
    docs: "Work",
    sheets: "Work",
    slides: "Work",

    // Research
    research: "Research",
    reading: "Research",
    read: "Research",
    learn: "Research",
    learning: "Research",
    article: "Research",
    articles: "Research",
    papers: "Research",
    paper: "Research",
    documentation: "Research",
    wiki: "Research",
    wikipedia: "Research",
    medium: "Research",

    // Development
    development: "Development",
    developer: "Development",
    dev: "Development",
    programming: "Development",
    code: "Development",
    coding: "Development",
    engineering: "Development",
    repo: "Development",
    git: "Development",
    sdk: "Development",
    api: "Development",

    // Shopping
    shopping: "Shopping",
    ecommerce: "Shopping",
    store: "Shopping",
    retail: "Shopping",
    cart: "Shopping",
    checkout: "Shopping",
    review: "Shopping",
    deal: "Shopping",

    // Entertainment
    entertainment: "Entertainment",
    video: "Entertainment",
    videos: "Entertainment",
    music: "Entertainment",
    streaming: "Entertainment",
    movie: "Entertainment",
    movies: "Entertainment",
    playlist: "Entertainment",
    vod: "Entertainment",
    trailer: "Entertainment",

    // Social
    social: "Social",
    networking: "Social",
    community: "Social",
    forum: "Social",
    forums: "Social",

    // News
    news: "News",
    media: "News",
    press: "News",
    journalism: "News",

    // Finance
    finance: "Finance",
    banking: "Finance",
    bank: "Finance",
    payments: "Finance",
    payment: "Finance",
    wallet: "Finance",
    money: "Finance",
    investing: "Finance",
    investment: "Finance",

    // Travel
    travel: "Travel",
    maps: "Travel",
    map: "Travel",
    directions: "Travel",
    navigation: "Travel",

    // Utilities
    utilities: "Utilities",
    utility: "Utilities",
    storage: "Utilities",
    cloud: "Utilities",
    drive: "Utilities",
    files: "Utilities",
    backup: "Utilities",

    // AI
    ai: "AI",
    llm: "AI",
    prompt: "AI",
    chatgpt: "AI",
    claude: "AI",
    tools: "AI",
    assistant: "AI",
    automation: "AI",
  };

  // Canonical and banned categories for strict enforcement
  static CANONICAL_CATEGORIES = [
    "Email",
    "Work",
    "Research",
    "Development",
    "Shopping",
    "Entertainment",
    "Social",
    "News",
    "Finance",
    "Travel",
    "Utilities",
    "AI",
  ];

  static BANNED_CATEGORIES = new Set([
    "other",
    "misc",
    "miscellaneous",
    "general",
    "uncategorized",
    "unknown",
  ]);

  /**
   * Check if a category is part of the canonical taxonomy (case-insensitive)
   */
  static isCanonical(name) {
    try {
      const n = String(name || "")
        .trim()
        .toLowerCase();
      if (!n) return false;
      return this.CANONICAL_CATEGORIES.some((c) => c.toLowerCase() === n);
    } catch {
      return false;
    }
  }

  /**
   * Gmail/mail detection (unconditional Email/Communication override)
   */
  static isGmailDomain(domain) {
    try {
      const d = String(domain || "").toLowerCase();
      return (
        d === "gmail.com" ||
        d === "mail.google.com" ||
        d.endsWith(".mail.google.com")
      );
    } catch {
      return false;
    }
  }

  /**
   * Banned generic categories
   */
  static isBannedCategory(name) {
    try {
      const n = String(name || "")
        .trim()
        .toLowerCase();
      if (!n) return true;
      return this.BANNED_CATEGORIES.has(n);
    } catch {
      return true;
    }
  }

  /**
   * Retry AI assignment with exponential backoff
   * @param {Object} provider - LLM provider instance
   * @param {Array} items - Array of items to categorize
   * @param {number} attempts - Maximum retry attempts (default: 3)
   * @param {number} baseDelayMs - Base delay in milliseconds (default: 500)
   * @returns {Promise<{assignments: Array}>}
   */
  static async aiAssignWithRetry(
    provider,
    items,
    attempts = 3,
    baseDelayMs = 500,
  ) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const resp = await provider.categorizeTabBatch(items);
        if (resp?.assignments && Array.isArray(resp.assignments)) {
          return { assignments: resp.assignments };
        }
      } catch (err) {
        console.warn(
          `[CategoryAlgorithm] AI retry attempt ${attempt}/${attempts} failed:`,
          err?.message || err,
        );

        if (attempt < attempts) {
          // Exponential backoff: 500ms, 1000ms, 2000ms, etc.
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    // All attempts failed - return Uncategorized assignments
    console.warn(
      `[CategoryAlgorithm] All ${attempts} AI retry attempts failed, returning Uncategorized`,
    );
    return {
      assignments: items.map((item) => ({
        key: item.key,
        category: "Uncategorized",
        confidence: 0.1,
      })),
    };
  }

  /**
   * Fallback category if AI output is banned or non-canonical
   */
  static fallbackCategory(meta) {
    // LLM-ONLY: No fallback categorization allowed - this should never be called
    throw new Error(
      "[CategoryAlgorithm] CRITICAL: fallbackCategory called - LLM-only policy violation",
    );
  }
  // Cache for recently categorized sets (in-memory short term; kept for backward-compat)
  static categoryCache = new Map();
  static CACHE_DURATION = 5 * 60 * 1000; // 5 minutes (legacy set-level cache)

  /**
   * Real AI-powered organization with caching and fallback.
   * Returns groups mapping and whether AI was used for at least one new tab.
   * @param {Array} tabs Chrome tab objects
   * @param {Object} settings Settings from SettingsManager
   * @param {Object|null} provider Optional provider instance from LLMProvider.for(...)
   * @returns {Promise<{groups: Record<string, number[]>, usedAI: boolean}>}
   */
  static async organizeByCategory(tabs, settings = {}, provider = null) {
    const now = Date.now();

    // Prepare metadata and keys
    const metas = tabs
      .map((t, idx) => ({
        id: t.id,
        index: idx,
        title: t.title || "Untitled",
        url: t.url || "",
        domain: this.parseDomain(t.url),
      }))
      .map((m) => ({ ...m, key: this.makeTabKey(m) }));

    // Load persistent cache
    const cache = (await StorageUtils.get("aiCategoryCache")) || {};
    const freshAssignments = [];
    const toQuery = [];
    const keyToMeta = new Map();

    // Track tabs that need fallback categorization
    const uncategorizedKeys = new Set();

    for (const m of metas) {
      keyToMeta.set(m.key, m);
      uncategorizedKeys.add(m.key); // Initially all tabs are uncategorized

      const entry = cache[m.key];
      // Use dynamic TTL based on confidence instead of fixed 24-hour TTL
      if (entry && this.isCacheValid(entry, now)) {
        const rawCat = entry.category;
        if (!rawCat) {
          continue;
        }
        let category = this.normalizeCategory(rawCat);
        let confidence = this.clamp01(entry.confidence ?? 0.7);

        // Reject banned labels; do not override based on confidence or domain
        if (this.isBannedCategory(category)) {
          continue;
        }

        freshAssignments.push({ key: m.key, category, confidence });
        uncategorizedKeys.delete(m.key); // Mark as categorized
      } else {
        toQuery.push({
          key: m.key,
          title: m.title,
          url: m.url,
          domain: m.domain,
        });
      }
    }

    console.log("[ATO CategoryAlgorithm] cache check complete:", {
      metas: metas.length,
      toQuery: toQuery.length,
      preAssignments: freshAssignments.length,
    });
    let usedAI = false;
    let aiFailedKeys = new Set(); // Track tabs where AI failed

    // Ensure provider if possible - AI-first approach
    if (!provider) {
      const providerName = (settings?.provider || "").toLowerCase();

      // Special handling for Groq which has embedded API key
      if (providerName === "groq") {
        console.log(
          "🤖 [AI CATEGORIZATION] Using Groq AI provider with embedded API key",
        );
        console.log(
          "[ATO CategoryAlgorithm] Initializing Groq provider for AI-powered tab categorization",
        );
        provider = LLMProvider.for("groq", settings, null); // Groq doesn't need external key
      } else {
        // For other providers, check for API key
        const plainKey = await SettingsManager.getApiKey(providerName);

        if (!plainKey || plainKey.length === 0) {
          console.warn(
            "[ATO CategoryAlgorithm] No API key available for provider:",
            providerName,
          );
          console.log(
            "🤖 [AI CATEGORIZATION] Switching to Groq free tier due to missing key",
          );
          // Fall back to Groq provider (free tier with embedded key)
          provider = LLMProvider.for("groq", settings, null);
        } else if (
          providerName &&
          (await SettingsManager.hasValidApiKey(providerName))
        ) {
          provider = LLMProvider.for(providerName, settings, plainKey);
        }
      }
    }

    // Query LLM in batches for uncached items
    const providerType = settings?.provider || "unknown";
    const isGroq = (providerType || "").toLowerCase() === "groq";
    console.log(
      "[ATO CategoryAlgorithm] provider available:",
      !!provider,
      "toQuery:",
      toQuery.length,
    );
    if (provider && toQuery.length > 0) {
      console.log(
        `🤖 [AI CATEGORIZATION] Starting AI-powered categorization using ${providerType.toUpperCase()} provider`,
      );
      console.log(
        `[ATO CategoryAlgorithm] Processing ${toQuery.length} tabs with AI (${providerType})`,
      );
      const chunks = [];
      const batchSize = isGroq ? 5 : this.AI_BATCH_SIZE;
      for (let i = 0; i < toQuery.length; i += batchSize) {
        chunks.push(toQuery.slice(i, i + batchSize));
      }
      console.log("[ATO CategoryAlgorithm] First pass batching:", {
        providerType,
        batchSize,
        batches: chunks.length,
      });

      const lowConfidenceQueue = [];
      for (const chunk of chunks) {
        const chunkKeys = chunk.map((item) => item.key);
        let batchSuccess = false;

        try {
          console.log(
            `🤖 [AI CATEGORIZATION] Calling ${providerType.toUpperCase()} AI API for batch of ${chunk.length} tabs`,
          );
          const resp = await provider.categorizeTabBatch(chunk);
          const assigns = Array.isArray(resp?.assignments)
            ? resp.assignments
            : [];
          if (assigns.length > 0) {
            console.log(
              `✅ [AI CATEGORIZATION] ${providerType.toUpperCase()} AI successfully categorized ${assigns.length} tabs`,
            );
            usedAI = true;
            batchSuccess = true;
          }

          // Track which keys in this chunk got assignments
          const assignedKeys = new Set();

          for (const a of assigns) {
            const key = String(a.key || "");
            const meta = keyToMeta.get(key);
            if (!meta) continue;

            if (!a.category) {
              continue;
            }
            let category = this.normalizeCategory(a.category);
            const confidence = this.clamp01(
              typeof a.confidence === "number" ? a.confidence : 0.8,
            );

            // Accept LLM label as-is. Do not override on confidence or domain.
            if (this.isBannedCategory(category)) {
              // Skip this assignment
              continue;
            }

            // persist cache with normalized (and possibly overridden) category
            cache[key] = { category, confidence, ts: now };
            freshAssignments.push({ key, category, confidence });
            uncategorizedKeys.delete(key); // Mark as categorized
            assignedKeys.add(key);

            // queue for future re-prompting if confidence is low
            if (confidence < this.LOW_CONFIDENCE) {
              lowConfidenceQueue.push({
                key,
                ts: now,
                meta: { title: meta.title, url: meta.url, domain: meta.domain },
              });
            }
          }

          // Mark unassigned keys from this batch for fallback
          for (const key of chunkKeys) {
            if (!assignedKeys.has(key)) {
              aiFailedKeys.add(key);
            }
          }
        } catch (err) {
          // Batch failure - mark all keys in chunk for retry
          console.warn(
            "[ATO CategoryAlgorithm] Provider batch failed; marking for retry:",
            err?.message || String(err),
          );
          batchSuccess = false;

          // Mark all keys in failed batch for retry (no domain fallback)
          for (const item of chunk) {
            aiFailedKeys.add(item.key);
          }
        }

        // Inter-batch delay to avoid rate limits (Groq needs >= 2000ms)
        const interBatchDelay = isGroq ? 2100 : 250;
        await new Promise((r) => setTimeout(r, interBatchDelay));
      }

      // Save updated cache and low-confidence queue
      try {
        const existingQueue =
          (await StorageUtils.get("aiLowConfidenceQueue")) || [];
        const merged = existingQueue.concat(lowConfidenceQueue).slice(-500);
        await StorageUtils.set({
          aiCategoryCache: cache,
          aiLowConfidenceQueue: merged,
        });
      } catch (e) {
        console.warn(
          "[ATO CategoryAlgorithm] Failed to persist low-confidence queue:",
          e?.message || e,
        );
      }
      console.log(
        "[ATO CategoryAlgorithm] post-AI assignments:",
        freshAssignments.length,
        "usedAI:",
        usedAI,
      );
    }

    // CRITICAL FIX: Second AI pass for remaining uncategorized tabs
    if (provider && uncategorizedKeys.size > 0) {
      console.log(
        "[ATO CategoryAlgorithm] Making second AI pass for",
        uncategorizedKeys.size,
        "uncategorized tabs",
      );

      // Prepare uncategorized tabs for second AI attempt
      const secondPassItems = [];
      for (const key of uncategorizedKeys) {
        const meta = keyToMeta.get(key);
        if (meta) {
          secondPassItems.push({
            key: meta.key,
            title: meta.title,
            url: meta.url,
            domain: meta.domain,
          });
        }
      }

      // Process in batches
      const secondPassChunks = [];
      const secondBatchSize = isGroq ? 5 : this.AI_BATCH_SIZE;
      for (let i = 0; i < secondPassItems.length; i += secondBatchSize) {
        secondPassChunks.push(secondPassItems.slice(i, i + secondBatchSize));
      }
      console.log("[ATO CategoryAlgorithm] Second pass batching:", {
        providerType,
        secondBatchSize,
        batches: secondPassChunks.length,
      });

      console.log(
        "[ATO CategoryAlgorithm] Second pass: processing",
        secondPassChunks.length,
        "batches",
      );

      for (const chunk of secondPassChunks) {
        try {
          // Add delay before retry to avoid rate limiting (Groq needs >= 2000ms)
          const secondDelay = isGroq ? 2100 : 500;
          await new Promise((r) => setTimeout(r, secondDelay));

          const resp = await provider.categorizeTabBatch(chunk);
          const assigns = Array.isArray(resp?.assignments)
            ? resp.assignments
            : [];

          if (assigns.length > 0) {
            console.log(
              "[ATO CategoryAlgorithm] Second pass batch succeeded with",
              assigns.length,
              "assignments",
            );
            usedAI = true;
          }

          for (const a of assigns) {
            const key = String(a.key || "");
            const meta = keyToMeta.get(key);
            if (!meta) continue;

            if (!a.category) continue;
            let category = this.normalizeCategory(a.category);
            let confidence = this.clamp01(
              typeof a.confidence === "number" ? a.confidence : 0.7,
            );

            if (this.isBannedCategory(category)) {
              continue;
            }

            // Check known patterns
            const knownCategory = this.validateKnownPatterns(
              meta.url,
              meta.title,
              meta.domain,
            );
            if (knownCategory && knownCategory !== category) {
              console.log(
                `[CategoryAlgorithm] Pattern override: ${meta.title} - AI said ${category}, patterns say ${knownCategory}`,
              );
              category = knownCategory;
              confidence = 0.9; // High confidence in pattern match
            } else {
              // Validate the category against known patterns
              const validation = this.validateCategory(
                meta.url,
                meta.title,
                category,
                confidence,
              );
              category = validation.category;
              confidence = validation.confidence;
            }

            // Cache and assign the category with validated confidence
            cache[key] = {
              category,
              confidence,
              ts: now,
              needsReview: validation?.needsReview || false,
              corrected: validation?.corrected || false,
            };
            freshAssignments.push({ key, category, confidence });
            uncategorizedKeys.delete(key); // Mark as categorized

            if (validation?.corrected) {
              console.log(
                `[CategoryAlgorithm] Corrected category for ${meta.title}: ${category}`,
              );
            }
          }
        } catch (err) {
          console.warn(
            "[ATO CategoryAlgorithm] Second pass batch failed:",
            err?.message || String(err),
          );
          // Continue with other batches
        }
      }

      // Persist cache after second pass
      try {
        await StorageUtils.set({ aiCategoryCache: cache });
      } catch (e) {
        console.warn(
          "[ATO CategoryAlgorithm] Failed to persist second pass cache:",
          e?.message || e,
        );
      }

      console.log(
        "[ATO CategoryAlgorithm] After second pass:",
        uncategorizedKeys.size,
        "tabs still uncategorized",
      );
    }

    // Third AI pass with more aggressive retry for any STILL uncategorized tabs
    if (provider && uncategorizedKeys.size > 0) {
      console.log(
        "[ATO CategoryAlgorithm] Making THIRD AI pass for",
        uncategorizedKeys.size,
        "still uncategorized tabs",
      );

      // Prepare remaining tabs for third attempt
      const thirdPassItems = [];
      for (const key of uncategorizedKeys) {
        const meta = keyToMeta.get(key);
        if (meta) {
          thirdPassItems.push({
            key: meta.key,
            title: meta.title,
            url: meta.url,
            domain: meta.domain,
          });
        }
      }

      // Try up to 3 more times with increasing delays
      for (
        let retryAttempt = 1;
        retryAttempt <= 3 && thirdPassItems.length > 0;
        retryAttempt++
      ) {
        console.log(
          `[ATO CategoryAlgorithm] Third pass retry attempt ${retryAttempt}`,
        );

        // Process in smaller batches with longer delays
        const smallBatchSize = isGroq ? 3 : Math.min(10, this.AI_BATCH_SIZE);
        const thirdPassChunks = [];
        for (let i = 0; i < thirdPassItems.length; i += smallBatchSize) {
          thirdPassChunks.push(thirdPassItems.slice(i, i + smallBatchSize));
        }
        console.log("[ATO CategoryAlgorithm] Third pass batching:", {
          providerType,
          smallBatchSize,
          batches: thirdPassChunks.length,
          retryAttempt,
        });

        for (const chunk of thirdPassChunks) {
          try {
            // Delay per attempt; Groq requires >= 2000ms between calls
            const attemptDelay = isGroq ? 2100 : 1000 * retryAttempt;
            await new Promise((r) => setTimeout(r, attemptDelay));

            const resp = await provider.categorizeTabBatch(chunk);
            const assigns = Array.isArray(resp?.assignments)
              ? resp.assignments
              : [];

            if (assigns.length > 0) {
              console.log(
                `[ATO CategoryAlgorithm] Third pass attempt ${retryAttempt} succeeded with`,
                assigns.length,
                "assignments",
              );
              usedAI = true;

              for (const a of assigns) {
                const key = String(a.key || "");
                const meta = keyToMeta.get(key);
                if (!meta) continue;

                if (!a.category) continue;
                let category = this.normalizeCategory(a.category);
                const confidence = this.clamp01(
                  typeof a.confidence === "number" ? a.confidence : 0.6,
                );

                if (this.isBannedCategory(category)) {
                  continue;
                }

                // Cache and assign the category
                cache[key] = { category, confidence, ts: now };
                freshAssignments.push({ key, category, confidence });
                uncategorizedKeys.delete(key); // Mark as categorized

                // Remove from thirdPassItems for next retry
                const idx = thirdPassItems.findIndex(
                  (item) => item.key === key,
                );
                if (idx >= 0) thirdPassItems.splice(idx, 1);
              }
            }
          } catch (err) {
            console.warn(
              `[ATO CategoryAlgorithm] Third pass attempt ${retryAttempt} batch failed:`,
              err?.message || String(err),
            );
            // Continue with other batches and retry attempts
          }
        }

        if (uncategorizedKeys.size === 0) {
          console.log(
            "[ATO CategoryAlgorithm] All tabs categorized after third pass",
          );
          break;
        }
      }

      // Persist cache after third pass attempts
      try {
        await StorageUtils.set({ aiCategoryCache: cache });
      } catch (e) {
        console.warn(
          "[ATO CategoryAlgorithm] Failed to persist third pass cache:",
          e?.message || e,
        );
      }
    }

    // AI-unavailable final fallback - assign to "Uncategorized"
    if (uncategorizedKeys.size > 0) {
      console.warn(
        "[ATO CategoryAlgorithm] AI unavailable final fallback for",
        uncategorizedKeys.size,
        "uncategorized tabs after all AI attempts",
      );

      for (const key of uncategorizedKeys) {
        const meta = keyToMeta.get(key);
        if (meta) {
          // Single explicit assignment to "Uncategorized"
          const fallbackCategory = "Uncategorized";
          const fallbackConfidence = 0.1;

          console.warn(
            `[ATO CategoryAlgorithm] AI-unavailable final fallback: assigning "${meta.title}" to "${fallbackCategory}"`,
          );

          // Apply the fallback category
          cache[key] = {
            category: fallbackCategory,
            confidence: fallbackConfidence,
            ts: now,
          };
          freshAssignments.push({
            key,
            category: fallbackCategory,
            confidence: fallbackConfidence,
          });
          uncategorizedKeys.delete(key);
        }
      }

      // Persist the updated cache with fallback categories
      try {
        await StorageUtils.set({ aiCategoryCache: cache });
      } catch (e) {
        console.warn(
          "[ATO CategoryAlgorithm] Failed to persist fallback cache:",
          e?.message || e,
        );
      }
    }

    // Merge assignments -> groups
    const keyToCategory = new Map();
    for (const a of freshAssignments) {
      keyToCategory.set(String(a.key), a.category);
    }

    const groups = {};
    let totalAssigned = 0;
    let totalUnassigned = 0;
    const orphanedTabs = [];

    for (const m of metas) {
      const category = keyToCategory.get(m.key);
      if (category) {
        if (!groups[category]) groups[category] = [];
        groups[category].push(m.id);
        totalAssigned++;
      } else {
        // VALIDATION: This should never happen after our fixes
        console.error(
          "[ATO CategoryAlgorithm] CRITICAL: Tab still uncategorized after all fallbacks:",
          m,
        );
        orphanedTabs.push(m);
        totalUnassigned++;
      }
    }

    // FINAL SAFETY NET: Ensure 100% coverage
    if (orphanedTabs.length > 0) {
      console.warn(
        "[ATO CategoryAlgorithm] Applying final safety net for",
        orphanedTabs.length,
        "orphaned tabs",
      );
      const fallbackCategory = "Uncategorized";

      if (!groups[fallbackCategory]) {
        groups[fallbackCategory] = [];
      }

      for (const orphan of orphanedTabs) {
        groups[fallbackCategory].push(orphan.id);
        console.warn(
          `[ATO CategoryAlgorithm] Added orphaned tab to "${fallbackCategory}": ${orphan.title}`,
        );
      }

      // Update counters
      totalAssigned += orphanedTabs.length;
      totalUnassigned = 0;
    }

    // Enhanced diagnostics with multi-pass AI tracking
    const diagnostics = {
      totalTabs: metas.length,
      cached: freshAssignments.filter(
        (a) => !toQuery.some((q) => q.key === a.key),
      ).length,
      aiFirstPass: freshAssignments.filter((a) => a.confidence >= 0.8).length,
      aiSecondPass: freshAssignments.filter(
        (a) => a.confidence >= 0.7 && a.confidence < 0.8,
      ).length,
      aiThirdPass: freshAssignments.filter(
        (a) => a.confidence >= 0.6 && a.confidence < 0.7,
      ).length,
      totalAssigned,
      totalUnassigned,
      groupsCreated: Object.keys(groups).length,
      averageConfidence:
        freshAssignments.length > 0
          ? (
              freshAssignments.reduce((sum, a) => sum + a.confidence, 0) /
              freshAssignments.length
            ).toFixed(2)
          : 0,
      aiRetryAttempts:
        uncategorizedKeys.size > 0 ? "Failed after max retries" : "Success",
    };

    const _diag = Object.entries(groups).map(
      ([k, ids]) => `${k}:${Array.isArray(ids) ? ids.length : 0}`,
    );
    console.log("[ATO CategoryAlgorithm] Final diagnostics:", diagnostics);
    console.log("[ATO CategoryAlgorithm] Groups summary:", _diag);

    return { groups, usedAI };
  }

  // Helpers

  static makeTabKey(meta) {
    const u = (meta?.url || "").trim();
    if (u) return u.toLowerCase();
    // fallback to composed key
    const t = (meta?.title || "").trim().toLowerCase();
    return `id:${meta?.id || "na"}|t:${t.slice(0, 64)}`;
  }

  static async loadCacheMap() {
    const m = await StorageUtils.get("aiCategoryCache");
    return m && typeof m === "object" ? m : {};
  }

  static async saveCacheMap(map) {
    return StorageUtils.set({ aiCategoryCache: map || {} });
  }

  static normalizeCategoryName(name) {
    try {
      const s = String(name || "").trim();
      if (!s) return "Utilities";
      return s
        .replace(/\s+/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
    } catch {
      return "Utilities";
    }
  }

  /**
   * Sanitize a raw category label into a single, slash-free, concise title-cased label.
   * Maps synonyms to canonical categories to ensure consistency.
   */
  static normalizeCategory(raw) {
    try {
      const s = String(raw || "").trim();
      if (!s) return "Unknown";

      // Keep only the first segment before any slash
      const base = s.split("/")[0].trim();
      if (!base) return "Unknown";

      // First check if it's already a canonical category (case-insensitive)
      const lowerBase = base.toLowerCase();
      for (const canonical of this.CANONICAL_CATEGORIES) {
        if (canonical.toLowerCase() === lowerBase) {
          return canonical;
        }
      }

      // Check synonym map for variations
      const firstWord = lowerBase.split(/\s+/)[0];
      if (this.SYNONYM_MAP[firstWord]) {
        return this.SYNONYM_MAP[firstWord];
      }
      if (this.SYNONYM_MAP[lowerBase]) {
        return this.SYNONYM_MAP[lowerBase];
      }

      // Check for partial matches in synonym map
      for (const [key, canonical] of Object.entries(this.SYNONYM_MAP)) {
        if (lowerBase.includes(key) || key.includes(lowerBase)) {
          return canonical;
        }
      }

      // Limit to first 3 words to stay concise
      const words = base.split(/\s+/).slice(0, 3);
      const joined = words.join(" ").replace(/\s+/g, " ").trim();
      if (!joined) return "Unknown";

      // Title Case
      return joined.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    } catch {
      return "Unknown";
    }
  }

  /**
   * Known-domain override to canonical category (exact match or subdomain contains)
   */
  static domainOverride(domain) {
    try {
      const d = String(domain || "").toLowerCase();
      if (!d) return null;

      // Exact match
      if (this.DOMAIN_OVERRIDE[d]) return this.DOMAIN_OVERRIDE[d];

      // Contains match for subdomains
      for (const [known, cat] of Object.entries(this.DOMAIN_OVERRIDE)) {
        if (d === known) return cat;
        if (d.endsWith(`.${known}`)) return cat;
        if (known.endsWith(`.${d}`)) return cat;
        if (d.includes(known)) return cat;
      }
      return null;
    } catch {
      return null;
    }
  }

  static clamp01(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  /**
   * Fallback domain heuristic constrained to single-token canonical categories.
   */
  static simpleDomainHeuristic(meta) {
    const d = (meta?.domain || "").toLowerCase();
    const title = (meta?.title || "").toLowerCase();
    const url = (meta?.url || "").toLowerCase();

    // Prefer domain override if known
    const direct = this.domainOverride(d);
    if (direct) return direct;

    // Heuristic mapping to canonical categories

    // Email first (Slack/Teams/Discord explicitly)
    if (
      d.includes("slack.com") ||
      d.includes("slack") ||
      d.includes("teams.microsoft") ||
      d.includes("discord")
    ) {
      return "Communication";
    }

    // Work
    if (
      d.includes("notion") ||
      d.includes("zoom") ||
      d.includes("docs.google") ||
      d.includes("jira") ||
      d.includes("gitlab") ||
      d.includes("asana") ||
      d.includes("trello") ||
      d.includes("airtable")
    ) {
      return "Work";
    }

    // Development
    if (
      d.includes("github") ||
      d.includes("gitlab") ||
      d.includes("bitbucket") ||
      title.includes("api reference") ||
      title.includes("sdk") ||
      title.includes("docs")
    ) {
      return "Development";
    }

    // Research
    if (
      d.includes("wikipedia") ||
      d.includes("scholar.google") ||
      d.includes("arxiv") ||
      title.includes("tutorial") ||
      title.includes("guide") ||
      title.includes("how to") ||
      d.includes("medium")
    ) {
      return "Research";
    }

    // Entertainment
    if (
      d.includes("youtube") ||
      d.includes("twitch") ||
      d.includes("spotify") ||
      d.includes("netflix") ||
      d.includes("imdb") ||
      d.includes("rottentomatoes") ||
      d.includes("metacritic") ||
      d.includes("disney") ||
      d.includes("hbo") ||
      d.includes("primevideo") ||
      d.includes("hulu") ||
      d.includes("crunchyroll") ||
      d.includes("soundcloud") ||
      d.includes("vimeo") ||
      d.includes("pandora") ||
      d.includes("paramount") ||
      d.includes("peacock") ||
      title.includes("trailer") ||
      title.includes("playlist") ||
      title.includes("movie") ||
      title.includes("film") ||
      title.includes("show") ||
      title.includes("series") ||
      title.includes("imdb")
    ) {
      return "Entertainment";
    }

    // Shopping
    if (
      d.includes("amazon") ||
      d.includes("ebay") ||
      d.includes("etsy") ||
      d.includes("aliexpress") ||
      d.includes("shopify") ||
      url.includes("/cart") ||
      url.includes("/checkout")
    ) {
      return "Shopping";
    }

    // News
    if (
      d.includes("bbc") ||
      d.includes("cnn") ||
      d.includes("nytimes") ||
      d.includes("reuters") ||
      d.includes("guardian") ||
      d.includes("bloomberg") ||
      title.includes("news")
    ) {
      return "News";
    }

    // Social
    if (
      d.includes("twitter") ||
      d === "x.com" ||
      d.includes("facebook") ||
      d.includes("instagram") ||
      d.includes("reddit") ||
      d.includes("linkedin")
    ) {
      return "Social";
    }

    // Finance
    if (
      d.includes("paypal") ||
      d.includes("revolut") ||
      d.includes("wise") ||
      d.includes("hsbc") ||
      d.includes("barclays") ||
      d.includes("chase") ||
      d.includes("bankofamerica")
    ) {
      return "Finance";
    }

    // Travel
    if (
      d.includes("maps.google") ||
      d.includes("booking") ||
      d.includes("airbnb")
    ) {
      return "Travel";
    }

    // Utilities
    if (
      d.includes("drive.google") ||
      d.includes("dropbox") ||
      d.includes("onedrive")
    ) {
      return "Utilities";
    }

    return "Utilities";
  }

  // Domain-to-category mappings for fallback categorization
  static DOMAIN_CATEGORIES = {
    // Email
    "gmail.com": "Email",
    "mail.google.com": "Email",
    "outlook.com": "Email",
    "office365.com": "Email",
    "yahoo.com": "Email",
    "mail.yahoo.com": "Email",
    "proton.me": "Email",
    "fastmail.com": "Email",
    "slack.com": "Communication",
    "teams.microsoft.com": "Communication",
    "discord.com": "Communication",

    // Work
    "docs.google.com": "Work",
    "sheets.google.com": "Work",
    "calendar.google.com": "Work",
    "notion.so": "Work",
    "zoom.us": "Work",
    "asana.com": "Work",
    "trello.com": "Work",
    "airtable.com": "Work",

    // Utilities
    "drive.google.com": "Utilities",
    "dropbox.com": "Utilities",
    "onedrive.live.com": "Utilities",

    // Development
    "github.com": "Development",
    "gitlab.com": "Development",
    "stackoverflow.com": "Development",
    "bitbucket.org": "Development",

    // Social
    "twitter.com": "Social",
    "x.com": "Social",
    "facebook.com": "Social",
    "instagram.com": "Social",
    "linkedin.com": "Social",
    "reddit.com": "Social",

    // Entertainment
    "youtube.com": "Entertainment",
    "netflix.com": "Entertainment",
    "spotify.com": "Entertainment",
    "twitch.tv": "Entertainment",
    "hulu.com": "Entertainment",
    "imdb.com": "Entertainment",
    "rottentomatoes.com": "Entertainment",
    "metacritic.com": "Entertainment",
    "disney.com": "Entertainment",
    "disneyplus.com": "Entertainment",
    "hbomax.com": "Entertainment",
    "primevideo.com": "Entertainment",
    "crunchyroll.com": "Entertainment",
    "soundcloud.com": "Entertainment",
    "vimeo.com": "Entertainment",
    "pandora.com": "Entertainment",
    "paramount.com": "Entertainment",
    "peacocktv.com": "Entertainment",

    // Shopping
    "amazon.com": "Shopping",
    "ebay.com": "Shopping",
    "etsy.com": "Shopping",
    "alibaba.com": "Shopping",
    "aliexpress.com": "Shopping",
    "shopify.com": "Shopping",

    // News
    "cnn.com": "News",
    "bbc.com": "News",
    "nytimes.com": "News",
    "reuters.com": "News",
    "medium.com": "Research",
    "theguardian.com": "News",
    "bloomberg.com": "News",

    // Research
    "coursera.org": "Research",
    "udemy.com": "Research",
    "khanacademy.org": "Research",
    "wikipedia.org": "Research",
    "scholar.google.com": "Research",

    // Finance
    "paypal.com": "Finance",
    "revolut.com": "Finance",
    "wise.com": "Finance",
    "hsbc.com": "Finance",
    "barclays.co.uk": "Finance",
    "chase.com": "Finance",
    "bankofamerica.com": "Finance",

    // Travel
    "maps.google.com": "Travel",
    "booking.com": "Travel",
    "airbnb.com": "Travel",
  };

  /**
   * Main categorization method - AI-first approach
   * @param {Array} tabs - Array of Chrome tab objects
   * @param {Object} settings - User settings including AI provider configuration
   * @returns {Object} Categories object with structure { categoryName: [tabIds], ... }
   */
  static async categorizeTabs(tabs, settings = {}) {
    const startTime = Date.now();
    console.log(
      "[ATO CategoryAlgorithm] Starting AI-first categorization for",
      tabs.length,
      "tabs",
    );
    console.log("[ATO CategoryAlgorithm] AI-first mode active");

    try {
      // Check cache for recent categorizations
      const cacheKey = this.getCacheKey(tabs);
      if (this.categoryCache.has(cacheKey)) {
        const cached = this.categoryCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.CACHE_DURATION) {
          console.log("[ATO CategoryAlgorithm] Using cached categories");
          return cached.categories;
        }
      }

      // Extract metadata from tabs
      const tabsWithMetadata = tabs.map((tab) => this.extractTabMetadata(tab));

      let categories = {};

      // AI-first categorization - always attempt AI
      const providerName = (settings.provider || "").toLowerCase();
      let plainKey = null;

      // Provider selection with Groq fallback
      if (providerName === "groq") {
        console.log(
          "🤖 [AI CATEGORIZATION] Using Groq AI for tab categorization (free tier with embedded key)",
        );
        plainKey = null; // Groq uses embedded key
      } else if (providerName) {
        plainKey = await SettingsManager.getApiKey(providerName);
        if (!plainKey) {
          console.log(
            "[ATO CategoryAlgorithm] No API key for provider:",
            providerName,
          );
          console.log(
            "🤖 [AI CATEGORIZATION] Switching to Groq free tier due to missing key",
          );
          // Override settings to use Groq
          settings = { ...settings, provider: "groq" };
          plainKey = null;
        } else {
          console.log(
            `🤖 [AI CATEGORIZATION] Using ${providerName.toUpperCase()} AI for tab categorization`,
          );
        }
      } else {
        // No provider specified - use Groq as default
        console.log("[ATO CategoryAlgorithm] No AI provider configured");
        console.log("🤖 [AI CATEGORIZATION] Using Groq free tier as default");
        settings = { ...settings, provider: "groq" };
        plainKey = null;
      }

      // Always attempt AI categorization
      try {
        categories = await this.categorizeWithAI(
          tabsWithMetadata,
          settings,
          plainKey,
        );
        console.log(
          `✅ [AI CATEGORIZATION] AI categorization completed successfully`,
        );
      } catch (aiError) {
        console.warn(
          "[ATO CategoryAlgorithm] AI categorization failed after attempts:",
          aiError?.message || aiError,
        );

        // AI failed - assign all tabs to "Uncategorized"
        categories = {};
        categories["Uncategorized"] = tabsWithMetadata.map((tab) => tab.id);

        console.warn(
          "[ATO CategoryAlgorithm] All tabs assigned to 'Uncategorized' due to AI failure",
        );
      }

      // Cache the results
      this.categoryCache.set(cacheKey, {
        categories,
        timestamp: Date.now(),
      });

      const duration = Date.now() - startTime;
      console.log(
        "[ATO CategoryAlgorithm] Categorization complete in",
        duration,
        "ms",
      );

      return categories;
    } catch (error) {
      console.error(
        "[ATO CategoryAlgorithm] Error during categorization:",
        error,
      );
      // Return all tabs as Uncategorized on error
      const uncategorized = {};
      uncategorized["Uncategorized"] = tabs.map((tab) => tab.id);
      return uncategorized;
    }
  }

  /**
   * Categorize tabs using AI/LLM provider
   * @private
   */
  static async categorizeWithAI(tabs, settings, plainKey) {
    const provider = LLMProvider.for(settings.provider, settings, plainKey);

    // Batch tabs for efficient processing
    const batches = this.batchTabs(
      tabs,
      settings.limits?.maxTabsPerBatch || 50,
    );
    const allCategories = {};

    for (const batch of batches) {
      const response = await provider.categorizeTabBatch(batch);

      // Merge batch results
      for (const [category, tabIndices] of Object.entries(
        response.categories || {},
      )) {
        if (!allCategories[category]) {
          allCategories[category] = [];
        }
        // Map indices to actual tab IDs
        const tabIds = tabIndices
          .map((index) => batch[index]?.id)
          .filter(Boolean);
        allCategories[category].push(...tabIds);
      }
    }

    return allCategories;
  }

  /**
   * Fallback categorization based on domain patterns
   * @private
   */
  static categorizeByDomain(tabs) {
    const categories = {};

    for (const tab of tabs) {
      const domain = this.parseDomain(tab.url);
      const category = this.getDomainCategory(domain) || "Utilities";

      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(tab.id);
    }

    // Add confidence scores
    for (const category in categories) {
      // Domain-based categorization has lower confidence
      categories[category] = {
        tabIds: categories[category],
        confidence: 0.7,
      };
    }

    // Return simplified format for compatibility
    const simplifiedCategories = {};
    for (const [cat, data] of Object.entries(categories)) {
      simplifiedCategories[cat] = data.tabIds || data;
    }

    return simplifiedCategories;
  }

  /**
   * Extract relevant metadata from a tab
   * @private
   */
  static extractTabMetadata(tab) {
    return {
      id: tab.id,
      title: tab.title || "Untitled",
      url: tab.url || "",
      domain: this.parseDomain(tab.url),
      favicon: tab.favIconUrl,
      pinned: tab.pinned || false,
      lastAccessed: tab.lastAccessed,
    };
  }

  /**
   * Split tabs into batches for processing
   * @private
   */
  static batchTabs(tabs, batchSize = 50) {
    const batches = [];
    for (let i = 0; i < tabs.length; i += batchSize) {
      batches.push(tabs.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Extract clean domain from URL
   * @private
   */
  static parseDomain(url) {
    if (!url) return "";
    try {
      const urlObj = new URL(url);
      // Remove 'www.' prefix if present
      return urlObj.hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  /**
   * Map domain to predefined category
   * @private
   */
  static getDomainCategory(domain) {
    if (!domain) return null;

    // Check exact match first
    if (this.DOMAIN_CATEGORIES[domain]) {
      return this.DOMAIN_CATEGORIES[domain];
    }

    // Check for partial matches (e.g., subdomains)
    for (const [knownDomain, category] of Object.entries(
      this.DOMAIN_CATEGORIES,
    )) {
      if (domain.includes(knownDomain) || knownDomain.includes(domain)) {
        return category;
      }
    }

    // Try to infer from common patterns (single-token fallbacks)
    if (domain.includes("news") || domain.includes("times")) return "News";
    if (domain.includes("shop") || domain.includes("store")) return "Shopping";
    if (domain.includes("learn") || domain.includes("edu")) return "Research";
    if (domain.includes("dev") || domain.includes("code")) return "Development";

    return null;
  }

  /**
   * Generate cache key for tab set
   * @private
   */
  static getCacheKey(tabs) {
    const urls = tabs
      .map((t) => t.url)
      .sort()
      .join("|");
    return `cat_${urls.substring(0, 100)}`; // Limit key length
  }

  /**
   * Return empty categories structure
   * @private
   */
  static getEmptyCategories() {
    return {};
  }

  /**
   * Clear the category cache (both in-memory and persistent)
   */
  static async clearCache() {
    this.categoryCache.clear();
    await StorageUtils.set({ aiCategoryCache: {} });
    console.log(
      "[ATO CategoryAlgorithm] Cache cleared (in-memory and persistent)",
    );
  }

  /**
   * Clear cache entries for specific provider or all low-confidence entries
   * @param {Object} options - Options for selective cache clearing
   * @param {string} options.provider - Clear only entries from this provider
   * @param {boolean} options.lowConfidenceOnly - Clear only low confidence entries
   */
  static async clearCacheSelective(options = {}) {
    const cache = await this.loadCacheMap();
    const now = Date.now();
    let cleared = 0;

    for (const [key, entry] of Object.entries(cache)) {
      let shouldClear = false;

      // Clear low confidence entries
      if (options.lowConfidenceOnly && (entry.confidence || 0) < 0.6) {
        shouldClear = true;
      }

      // Clear expired entries based on dynamic TTL
      if (!this.isCacheValid(entry, now)) {
        shouldClear = true;
      }

      if (shouldClear) {
        delete cache[key];
        cleared++;
      }
    }

    await this.saveCacheMap(cache);
    console.log(
      `[ATO CategoryAlgorithm] Selectively cleared ${cleared} cache entries`,
    );
  }

  /**
   * Smart recategorization that only processes tabs that need it
   * @param {Array} tabs - Chrome tab objects
   * @param {Object} settings - Settings from SettingsManager
   * @param {Object|null} provider - Optional provider instance
   * @returns {Promise<{groups: Record<string, number[]>, usedAI: boolean, recategorized: number}>}
   */
  static async smartRecategorize(tabs, settings = {}, provider = null) {
    const now = Date.now();

    // Load cache to check what needs recategorization
    const cache = (await StorageUtils.get("aiCategoryCache")) || {};
    const tabsToRecategorize = [];
    const alreadyCategorized = [];

    // Prepare metadata
    const metas = tabs
      .map((t, idx) => ({
        id: t.id,
        index: idx,
        title: t.title || "Untitled",
        url: t.url || "",
        domain: this.parseDomain(t.url),
      }))
      .map((m) => ({ ...m, key: this.makeTabKey(m) }));

    // Check each tab's cache status
    for (const meta of metas) {
      const entry = cache[meta.key];

      if (!entry || !this.isCacheValid(entry, now)) {
        // No cache or expired - needs recategorization
        tabsToRecategorize.push(meta);
        console.log(
          `[CategoryAlgorithm] Smart recategorize: ${meta.title} - cache expired or missing`,
        );
      } else if ((entry.confidence || 0) < 0.7) {
        // Low confidence - needs recategorization
        tabsToRecategorize.push(meta);
        console.log(
          `[CategoryAlgorithm] Smart recategorize: ${meta.title} - low confidence (${entry.confidence})`,
        );
      } else if (entry.needsReview) {
        // Flagged for review - needs recategorization
        tabsToRecategorize.push(meta);
        console.log(
          `[CategoryAlgorithm] Smart recategorize: ${meta.title} - needs review`,
        );
      } else {
        // Keep existing categorization
        alreadyCategorized.push({
          key: meta.key,
          category: entry.category,
          confidence: entry.confidence,
          id: meta.id,
        });
      }
    }

    console.log(
      `[CategoryAlgorithm] Smart recategorization: ${tabsToRecategorize.length} tabs need recategorization, ${alreadyCategorized.length} tabs kept`,
    );

    // If nothing needs recategorization, return existing groups
    if (tabsToRecategorize.length === 0) {
      const groups = {};
      for (const item of alreadyCategorized) {
        if (!groups[item.category]) groups[item.category] = [];
        groups[item.category].push(item.id);
      }
      return {
        groups,
        usedAI: false,
        recategorized: 0,
      };
    }

    // Recategorize only the tabs that need it
    const tabsToProcess = tabs.filter((tab) =>
      tabsToRecategorize.some((meta) => meta.id === tab.id),
    );

    const result = await this.organizeByCategory(
      tabsToProcess,
      settings,
      provider,
    );

    // Merge with existing categorizations
    const finalGroups = {};

    // Add already categorized tabs
    for (const item of alreadyCategorized) {
      if (!finalGroups[item.category]) finalGroups[item.category] = [];
      finalGroups[item.category].push(item.id);
    }

    // Add newly categorized tabs
    for (const [category, tabIds] of Object.entries(result.groups)) {
      if (!finalGroups[category]) finalGroups[category] = [];
      finalGroups[category].push(...tabIds);
    }

    return {
      groups: finalGroups,
      usedAI: result.usedAI,
      recategorized: tabsToRecategorize.length,
    };
  }

  /**
   * Check if a tab should be recategorized
   * @param {string} url - Tab URL
   * @param {string} title - Tab title
   * @returns {Promise<boolean>}
   */
  static async shouldRecategorize(url, title) {
    const key = this.makeTabKey({ url, title });
    const cache = await this.loadCacheMap();
    const entry = cache[key];
    const now = Date.now();

    if (!entry || !this.isCacheValid(entry, now)) {
      return true; // No cache or expired
    }

    if ((entry.confidence || 0) < 0.7) {
      return true; // Low confidence
    }

    if (entry.needsReview) {
      return true; // Flagged for review
    }

    return false;
  }

  /**
   * Get confidence score for a category assignment
   * @param {String} category - Category name
   * @param {Object} tab - Tab metadata
   * @returns {Number} Confidence score between 0 and 1
   */
  static getCategoryConfidence(category, tab) {
    // AI-based categorization would have higher confidence
    // Domain-based has moderate confidence
    // Default/fallback has low confidence

    const domain = this.parseDomain(tab.url);
    const expectedCategory = this.getDomainCategory(domain);

    if (expectedCategory === category) {
      return 0.9; // High confidence when domain matches expected category
    } else if (expectedCategory) {
      return 0.5; // Medium confidence when domain suggests different category
    }

    return 0.3; // Low confidence for unknown domains
  }

  /**
   * Fallback to domain-based grouping when AI is unavailable
   * @param {Array} tabs - Array of Chrome tab objects
   * @returns {Object} Groups object with { groups: Record<string, number[]>, usedAI: false }
   */
  static fallbackToDomainGrouping(tabs) {
    console.log("[ATO CategoryAlgorithm] Using domain-based fallback grouping");

    const groups = {};

    for (const tab of tabs) {
      const domain = this.parseDomain(tab.url);
      const category =
        this.getDomainCategory(domain) ||
        this.simpleDomainHeuristic({
          domain,
          title: tab.title,
          url: tab.url,
        });

      if (category) {
        if (!groups[category]) {
          groups[category] = [];
        }
        groups[category].push(tab.id);
      }
    }

    console.log(
      "[ATO CategoryAlgorithm] Domain fallback created",
      Object.keys(groups).length,
      "groups",
    );

    return {
      groups,
      usedAI: false,
    };
  }
}
