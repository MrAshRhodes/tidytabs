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
    "uncategorized", // AI should NEVER use this - always pick specific category
    "unknown",
    "tools", // Too generic - be more specific
    // "utilities" - REMOVED: Allow but discourage in favor of specific categories
    "resources", // Too generic
    "stuff", // Too generic
    "random", // Too generic
    "various", // Too generic
    "mixed", // Too generic
    "temp", // Too generic
    "temporary", // Too generic
  ]);

  // Categories that should be discouraged but not banned
  static DISCOURAGED_CATEGORIES = new Set([
    "utilities", // Prefer Work, Development, Finance, etc. when possible
  ]);

  // AI should never assign these - always pick specific category
  static AI_FORBIDDEN_CATEGORIES = new Set([
    "uncategorized", // AI must always pick specific category
    "unknown",
    "other",
    "misc"
  ]);

  // Categories that require strict validation (only allow if domain/title strongly indicates)
  static RESTRICTED_CATEGORIES = new Set([
    "research", // Only allow for academic/scholarly content
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
   * Check if a category is banned or requires strict validation
   * @param {string} name - Category name to check
   * @param {Object} context - Additional context for validation (url, title, domain)
   * @returns {Object} - Validation result with allowed flag and reason
   */
  static validateCategoryStrict(name, context = {}) {
    try {
      const n = String(name || "").trim().toLowerCase();
      if (!n) return { allowed: false, reason: "Empty category name" };

      // Check banned categories
      if (this.BANNED_CATEGORIES.has(n)) {
        return {
          allowed: false,
          reason: `Generic category '${name}' is banned - use specific categories`,
          suggestUncategorized: true
        };
      }

      // Check restricted categories that need validation
      if (this.RESTRICTED_CATEGORIES.has(n)) {
        return this.validateRestrictedCategory(name, context);
      }

      return { allowed: true, reason: "Category approved" };
    } catch {
      return { allowed: false, reason: "Category validation error" };
    }
  }

  /**
   * Validate restricted categories like Research
   * @param {string} name - Category name
   * @param {Object} context - Context including url, title, domain
   * @returns {Object} - Validation result
   */
  static validateRestrictedCategory(name, context = {}) {
    const lowerName = name.toLowerCase();
    const { url = "", title = "", domain = "" } = context;
    const titleLower = title.toLowerCase();
    const urlLower = url.toLowerCase();

    if (lowerName === "research") {
      // Only allow Research for genuine academic/scholarly content
      const academicDomains = [
        "arxiv.org", "scholar.google.com", "pubmed.ncbi.nlm.nih.gov",
        "jstor.org", "ieee.org", "acm.org", "springer.com", "elsevier.com",
        "nature.com", "science.org", "cell.com", "pnas.org"
      ];
      
      const academicPatterns = [
        /\b(peer.?review|journal|publication|citation|doi|academic|scholarly)\b/i,
        /\b(research paper|scientific study|meta.?analysis|systematic review)\b/i,
        /\b(university|college|institute|laboratory|lab)\b/i
      ];

      // Check domain
      const isAcademicDomain = academicDomains.some(d => domain.includes(d));
      
      // Check title/URL patterns
      const hasAcademicPatterns = academicPatterns.some(p =>
        p.test(titleLower) || p.test(urlLower)
      );

      if (isAcademicDomain || hasAcademicPatterns) {
        return {
          allowed: true,
          reason: "Research category validated for academic content",
          confidence: isAcademicDomain ? 0.95 : 0.85
        };
      } else {
        return {
          allowed: false,
          reason: "Research category rejected - not academic/scholarly content. Consider Development, Work, News, or Utilities instead",
          suggestAlternatives: ["Development", "Work", "News", "Utilities"],
          suggestUncategorized: true
        };
      }
    }

    return { allowed: true, reason: "Restricted category validation passed" };
  }

  /**
   * Legacy banned category check (deprecated - use validateCategoryStrict)
   */
  static isBannedCategory(name, context = {}) {
    const validation = this.validateCategoryStrict(name, context);
    return !validation.allowed;
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

        // Apply strict category validation to cached entries
        const validation = this.validateCategoryStrict(category, {
          url: '',  // Cache entries don't have full context
          title: '',
          domain: ''
        });
        
        if (!validation.allowed) {
          console.warn(
            `[CategoryAlgorithm] Cached category '${category}' rejected: ${validation.reason}`
          );
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

    // PRE-FILTER: Check if we can categorize known domains without AI
    if (toQuery.length > 0) {
      console.log("[ATO CategoryAlgorithm] 🔍 Pre-filtering known domains to avoid unnecessary AI calls");
      
      const preFilteredAssignments = [];
      const remainingToQuery = [];

      for (const item of toQuery) {
        const domainCategory = this.strictDomainOnly(item);
        if (domainCategory) {
          // Domain mapping found - categorize without AI
          console.log(`[ATO CategoryAlgorithm] ✅ Pre-filtered: ${item.title} → ${domainCategory} (${item.domain})`);
          
          const preFilteredConfidence = 0.90; // High confidence for domain matches
          cache[item.key] = {
            category: domainCategory,
            confidence: preFilteredConfidence,
            ts: now,
            source: "domain_pre_filter"
          };
          preFilteredAssignments.push({
            key: item.key,
            category: domainCategory,
            confidence: preFilteredConfidence,
          });
          uncategorizedKeys.delete(item.key);
        } else {
          // No domain mapping - needs AI
          remainingToQuery.push(item);
        }
      }

      // Update arrays with pre-filtered results
      freshAssignments.push(...preFilteredAssignments);
      toQuery.length = 0; // Clear original array
      toQuery.push(...remainingToQuery); // Add only items that need AI

      console.log(`[ATO CategoryAlgorithm] 📊 Pre-filtering results: ${preFilteredAssignments.length} categorized by domain, ${remainingToQuery.length} need AI`);
    }

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

            // Apply strict category validation with full context
            const validation = this.validateCategoryStrict(category, {
              url: meta.url,
              title: meta.title,
              domain: meta.domain
            });
            
            if (!validation.allowed) {
              console.warn(
                `[CategoryAlgorithm] Category '${category}' rejected: ${validation.reason}`,
                `Tab: ${meta.title}`
              );
              // Skip this assignment - will be handled as uncategorized
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

        // Inter-batch delay to avoid rate limits (Groq needs >= 6500ms for 10 req/min)
        const interBatchDelay = isGroq ? 6500 : 250;
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
          // Add delay before retry to avoid rate limiting (Groq needs >= 6500ms for 10 req/min)
          const secondDelay = isGroq ? 6500 : 500;
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

            // Apply strict category validation in second pass
            const validation = this.validateCategoryStrict(category, {
              url: meta.url,
              title: meta.title,
              domain: meta.domain
            });
            
            if (!validation.allowed) {
              console.warn(
                `[CategoryAlgorithm] Second pass category '${category}' rejected: ${validation.reason}`,
                `Tab: ${meta.title}`
              );
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
            // Delay per attempt; Groq requires >= 6500ms between calls (10 req/min)
            const attemptDelay = isGroq ? 6500 : 1000 * retryAttempt;
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

                // Apply strict category validation in third pass
                const validation = this.validateCategoryStrict(category, {
                  url: meta.url,
                  title: meta.title,
                  domain: meta.domain
                });
                
                if (!validation.allowed) {
                  console.warn(
                    `[CategoryAlgorithm] Third pass category '${category}' rejected: ${validation.reason}`,
                    `Tab: ${meta.title}`
                  );
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

    // ENHANCED DOMAIN-FIRST FALLBACK: Check domain mappings before "Uncategorized"
    if (uncategorizedKeys.size > 0) {
      console.warn(
        "[ATO CategoryAlgorithm] AI unavailable - attempting domain-first fallback for",
        uncategorizedKeys.size,
        "uncategorized tabs after all AI attempts",
      );

      let domainFallbackCount = 0;
      let remainingUncategorized = 0;

      for (const key of uncategorizedKeys) {
        const meta = keyToMeta.get(key);
        if (meta) {
          // INTELLIGENT TITLE-BASED CATEGORIZATION - NO UNCATEGORIZED ALLOWED
          console.log(`[ATO CategoryAlgorithm] 🔍 Analyzing tab for intelligent categorization: "${meta.title}" (${meta.domain})`);
          
          // Try domain first
          const domainCategory = this.strictDomainOnly(meta);
          
          if (domainCategory) {
            // Domain mapping found
            const domainFallbackConfidence = 0.85;
            
            console.log(
              `[ATO CategoryAlgorithm] ✅ Domain-based categorization: "${meta.title}" → "${domainCategory}" (domain: ${meta.domain})`,
            );

            cache[key] = {
              category: domainCategory,
              confidence: domainFallbackConfidence,
              ts: now,
              source: "domain_fallback_after_ai_failure"
            };
            freshAssignments.push({
              key,
              category: domainCategory,
              confidence: domainFallbackConfidence,
            });
            domainFallbackCount++;
          } else {
            // No domain mapping - analyze title for intelligent categorization
            const titleCategory = this.analyzeTitle(meta.title, meta.url);
            const titleFallbackConfidence = 0.70;

            console.log(
              `[ATO CategoryAlgorithm] 🧠 Title-based categorization: "${meta.title}" → "${titleCategory}" (analysis: title keywords)`,
            );

            cache[key] = {
              category: titleCategory,
              confidence: titleFallbackConfidence,
              ts: now,
              source: "title_analysis_fallback"
            };
            freshAssignments.push({
              key,
              category: titleCategory,
              confidence: titleFallbackConfidence,
            });
            domainFallbackCount++; // Count as successful categorization
          }
          
          uncategorizedKeys.delete(key);
        }
      }

      console.log(
        `[ATO CategoryAlgorithm] 📊 Intelligent categorization results: ${domainFallbackCount} successfully categorized (domain + title analysis), 0 uncategorized`
      );

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

  /**
   * Comprehensive title analysis to determine specific category - NEVER returns generic categories
   * Covers wide range of web content patterns and keywords
   * @param {string} title - Tab title
   * @param {string} url - Tab URL for additional context
   * @returns {string} Specific category based on intelligent title analysis
   */
  static analyzeTitle(title, url = "") {
    const titleLower = (title || "").toLowerCase();
    const urlLower = (url || "").toLowerCase();

    // === DEVELOPMENT & TECHNICAL ===
    const devPatterns = [
      /\b(github|gitlab|bitbucket|git|code|coding|programming|developer|development)\b/,
      /\b(api|sdk|library|framework|package|npm|pip|maven|gradle)\b/,
      /\b(stack\s*overflow|stackoverflow|repo|repository|commit|pull\s*request)\b/,
      /\b(docker|kubernetes|aws|azure|gcp|cloud|console|terminal|cli)\b/,
      /\b(server|database|backend|frontend|fullstack|devops|ci\/cd)\b/,
      /\b(javascript|python|java|react|node|typescript|html|css|sql)\b/,
      /\b(debug|error|exception|log|monitoring|deployment|build)\b/,
      /\b(helm|terraform|ansible|jenkins|circleci|travis)\b/
    ];
    if (devPatterns.some(pattern => pattern.test(titleLower))) {
      return "Development";
    }

    // === WORK & PRODUCTIVITY ===
    const workPatterns = [
      /\b(docs|document|sheet|slide|presentation|spreadsheet|excel|word)\b/,
      /\b(meeting|calendar|schedule|appointment|event|conference)\b/,
      /\b(project|task|todo|planning|management|workflow|process)\b/,
      /\b(dashboard|analytics|metrics|kpi|report|reporting|data)\b/,
      /\b(workspace|office|productivity|collaboration|team|shared)\b/,
      /\b(notion|confluence|jira|asana|trello|monday|clickup|airtable)\b/,
      /\b(hr|human\s*resources|payroll|benefits|onboarding|training)\b/,
      /\b(crm|sales|customer|lead|opportunity|pipeline|deal)\b/,
      /\b(invoice|billing|accounting|expense|budget|finance|profit)\b/,
      /\b(policy|procedure|compliance|audit|legal|contract)\b/,
      /\b(knowledge|wiki|faq|help\s*center|support|documentation)\b/,
      /\b(admin|administration|settings|configuration|setup)\b/,
      /\b(glean|search|discovery|information|resource|tool)\b/,
      /\b(operations|ops|monitoring|infrastructure|system)\b/
    ];
    if (workPatterns.some(pattern => pattern.test(titleLower))) {
      return "Work";
    }

    // === EMAIL & COMMUNICATION ===
    const emailPatterns = [
      /\b(mail|email|inbox|compose|draft|message|messaging)\b/,
      /\b(gmail|outlook|yahoo\s*mail|proton|fastmail|thunderbird)\b/,
      /\b(slack|teams|discord|telegram|whatsapp|signal|zoom)\b/,
      /\b(chat|conversation|thread|channel|dm|direct\s*message)\b/,
      /\b(call|video\s*call|meeting|webinar|conference|hangout)\b/,
      /\b(notification|alert|reminder|follow\s*up)\b/
    ];
    if (emailPatterns.some(pattern => pattern.test(titleLower))) {
      return "Email";
    }

    // === ENTERTAINMENT ===
    const entertainmentPatterns = [
      /\b(video|movie|film|cinema|theater|watch|streaming|stream)\b/,
      /\b(music|song|album|artist|playlist|radio|podcast|audio)\b/,
      /\b(game|gaming|play|player|gameplay|esports|twitch)\b/,
      /\b(netflix|hulu|disney|hbo|prime|spotify|youtube|tiktok)\b/,
      /\b(tv|television|series|episode|season|show|channel)\b/,
      /\b(entertainment|fun|funny|comedy|humor|meme|viral)\b/,
      /\b(trailer|preview|review|rating|imdb|rotten\s*tomatoes)\b/,
      /\b(book|reading|novel|story|literature|kindle|audiobook)\b/,
      /\b(sports|football|basketball|soccer|baseball|tennis|olympics)\b/,
      /\b(art|design|photography|creative|gallery|museum)\b/
    ];
    if (entertainmentPatterns.some(pattern => pattern.test(titleLower))) {
      return "Entertainment";
    }

    // === SHOPPING & E-COMMERCE ===
    const shoppingPatterns = [
      /\b(shop|shopping|store|market|marketplace|retail|buy|purchase)\b/,
      /\b(cart|checkout|order|payment|shipping|delivery|return)\b/,
      /\b(product|item|goods|merchandise|catalog|inventory)\b/,
      /\b(amazon|ebay|etsy|shopify|walmart|target|costco|aliexpress)\b/,
      /\b(price|cost|discount|sale|deal|coupon|offer|promotion)\b/,
      /\b(review|rating|recommendation|comparison|wishlist)\b/,
      /\b(fashion|clothing|apparel|shoes|accessories|jewelry)\b/,
      /\b(electronics|gadget|tech|computer|phone|tablet|laptop)\b/,
      /\b(home|furniture|appliance|kitchen|garden|decor)\b/,
      /\b(grocery|food|restaurant|delivery|uber\s*eats|doordash)\b/
    ];
    if (shoppingPatterns.some(pattern => pattern.test(titleLower))) {
      return "Shopping";
    }

    // === NEWS & MEDIA ===
    const newsPatterns = [
      /\b(news|article|story|report|journalism|press|media)\b/,
      /\b(breaking|headline|update|alert|bulletin|announcement)\b/,
      /\b(politics|political|government|election|vote|policy)\b/,
      /\b(economy|economic|business|market|stock|finance|wall\s*street)\b/,
      /\b(world|international|global|foreign|war|conflict)\b/,
      /\b(health|medical|pandemic|covid|disease|treatment)\b/,
      /\b(technology|tech|startup|innovation|research|science)\b/,
      /\b(weather|climate|environment|natural|disaster)\b/,
      /\b(sports|athlete|championship|tournament|league|team)\b/,
      /\b(celebrity|entertainment|hollywood|culture|lifestyle)\b/
    ];
    if (newsPatterns.some(pattern => pattern.test(titleLower))) {
      return "News";
    }

    // === SOCIAL MEDIA & NETWORKING ===
    const socialPatterns = [
      /\b(social|profile|post|posting|share|sharing|like|comment)\b/,
      /\b(follow|follower|following|friend|connection|network)\b/,
      /\b(facebook|instagram|twitter|linkedin|reddit|pinterest)\b/,
      /\b(tiktok|snapchat|discord|telegram|whatsapp|mastodon)\b/,
      /\b(community|group|forum|discussion|thread|conversation)\b/,
      /\b(feed|timeline|story|stories|status|update|activity)\b/,
      /\b(dating|relationship|match|swipe|profile|meet)\b/,
      /\b(event|meetup|gathering|party|celebration|social)\b/
    ];
    if (socialPatterns.some(pattern => pattern.test(titleLower))) {
      return "Social";
    }

    // === FINANCE & BANKING ===
    const financePatterns = [
      /\b(bank|banking|account|balance|transaction|transfer)\b/,
      /\b(credit|debit|card|loan|mortgage|insurance|investment)\b/,
      /\b(stock|trading|broker|portfolio|mutual\s*fund|etf|401k)\b/,
      /\b(crypto|bitcoin|ethereum|blockchain|wallet|exchange)\b/,
      /\b(tax|taxes|irs|filing|refund|deduction|accounting)\b/,
      /\b(budget|expense|income|salary|wage|payroll|payment)\b/,
      /\b(paypal|venmo|cash\s*app|zelle|wire|remittance)\b/,
      /\b(retirement|pension|savings|checking|financial|money)\b/
    ];
    if (financePatterns.some(pattern => pattern.test(titleLower))) {
      return "Finance";
    }

    // === TRAVEL & TRANSPORTATION ===
    const travelPatterns = [
      /\b(travel|trip|vacation|holiday|journey|flight|airline)\b/,
      /\b(hotel|accommodation|booking|reservation|check\s*in)\b/,
      /\b(map|maps|directions|navigation|gps|route|location)\b/,
      /\b(uber|lyft|taxi|ride|transport|car|rental|driving)\b/,
      /\b(train|bus|subway|metro|transit|public\s*transport)\b/,
      /\b(cruise|ship|boat|ferry|sailing|ocean|sea)\b/,
      /\b(passport|visa|immigration|customs|border|airport)\b/,
      /\b(destination|tourism|tourist|sightseeing|attraction)\b/,
      /\b(weather|forecast|temperature|climate|condition)\b/,
      /\b(restaurant|food|dining|cuisine|local|culture)\b/
    ];
    if (travelPatterns.some(pattern => pattern.test(titleLower))) {
      return "Travel";
    }

    // === AI & MACHINE LEARNING ===
    const aiPatterns = [
      /\b(ai|artificial\s*intelligence|machine\s*learning|ml|deep\s*learning)\b/,
      /\b(chatgpt|gpt|claude|anthropic|openai|google\s*ai|bard)\b/,
      /\b(prompt|prompting|llm|language\s*model|neural\s*network)\b/,
      /\b(automation|bot|chatbot|assistant|algorithm|model)\b/,
      /\b(training|dataset|data\s*science|analytics|prediction)\b/,
      /\b(nlp|computer\s*vision|speech|recognition|generation)\b/,
      /\b(tensorflow|pytorch|hugging\s*face|transformers|embedding)\b/
    ];
    if (aiPatterns.some(pattern => pattern.test(titleLower))) {
      return "AI";
    }

    // === UTILITIES & TOOLS ===
    const utilityPatterns = [
      /\b(security|auth|authentication|login|password|2fa|sso)\b/,
      /\b(backup|sync|storage|cloud|drive|file|folder|upload)\b/,
      /\b(converter|calculator|generator|validator|checker|tester)\b/,
      /\b(vpn|proxy|firewall|antivirus|malware|protection)\b/,
      /\b(settings|config|configuration|preferences|options)\b/,
      /\b(utility|tool|service|platform|system|software)\b/,
      /\b(monitor|monitoring|status|health|performance|uptime)\b/,
      /\b(log|logging|audit|trace|debug|diagnostic)\b/,
      /\b(admin|administration|management|control\s*panel)\b/
    ];
    if (utilityPatterns.some(pattern => pattern.test(titleLower))) {
      return "Utilities";
    }

    // === URL-BASED INTELLIGENT ANALYSIS ===
    if (urlLower.includes('/docs/') || urlLower.includes('/documentation/')) {
      if (titleLower.match(/\b(api|sdk|code|programming|developer)\b/)) {
        return "Development";
      }
      return "Work";
    }

    if (urlLower.includes('/admin/') || urlLower.includes('/dashboard/')) {
      return "Work";
    }

    if (urlLower.includes('/help/') || urlLower.includes('/support/')) {
      return "Work";
    }

    if (urlLower.includes('/console/') || urlLower.includes('/panel/')) {
      return titleLower.match(/\b(cloud|server|hosting|infrastructure)\b/) ? "Development" : "Work";
    }

    // === DOMAIN PATTERN ANALYSIS ===
    if (urlLower.includes('.edu') || urlLower.includes('.ac.')) {
      return "Work"; // Educational institutions
    }

    if (urlLower.includes('.gov')) {
      return "Work"; // Government sites
    }

    if (urlLower.includes('.org')) {
      return "Work"; // Organizations
    }

    // === INTELLIGENT CONTEXTUAL ANALYSIS ===
    
    // Business/Corporate patterns
    if (titleLower.match(/\b(company|corporation|business|enterprise|organization|firm|startup)\b/)) {
      return "Work";
    }

    // Learning/Educational patterns (but not Research)
    if (titleLower.match(/\b(learn|learning|course|tutorial|guide|how\s*to|training|education)\b/)) {
      return "Work";
    }

    // Health/Medical patterns
    if (titleLower.match(/\b(health|medical|doctor|hospital|clinic|pharmacy|medicine|treatment)\b/)) {
      return "Work";
    }

    // Legal patterns
    if (titleLower.match(/\b(legal|law|lawyer|attorney|court|judge|case|lawsuit)\b/)) {
      return "Work";
    }

    // Real Estate patterns
    if (titleLower.match(/\b(real\s*estate|property|house|home|apartment|rent|lease|mortgage)\b/)) {
      return "Work";
    }

    // Reference/Information patterns (avoid Research category)
    if (titleLower.match(/\b(wikipedia|reference|definition|dictionary|encyclopedia|information)\b/)) {
      return "Utilities";
    }

    // Blog/Personal content
    if (titleLower.match(/\b(blog|personal|portfolio|resume|cv|about|bio)\b/)) {
      return "Work";
    }

    // === FALLBACK ANALYSIS BY DOMAIN TYPE ===
    
    // Subdomain analysis
    if (urlLower.match(/^https?:\/\/[^.]+\.(.+)/)) {
      const rootDomain = urlLower.match(/^https?:\/\/[^.]+\.(.+)/)[1];
      
      if (rootDomain.includes('google.com')) {
        if (titleLower.includes('drive') || titleLower.includes('docs')) return "Work";
        if (titleLower.includes('cloud') || titleLower.includes('console')) return "Development";
        if (titleLower.includes('maps')) return "Travel";
        return "Work"; // Default for Google services
      }
      
      if (rootDomain.includes('microsoft.com')) {
        if (titleLower.includes('azure') || titleLower.includes('cloud')) return "Development";
        return "Work"; // Default for Microsoft services
      }
      
      if (rootDomain.includes('amazon.com')) {
        if (titleLower.includes('aws') || titleLower.includes('cloud')) return "Development";
        return "Shopping"; // Default for Amazon
      }
    }

    // === INTELLIGENT DEFAULT CATEGORIZATION ===
    
    // If title suggests business/professional use
    if (titleLower.match(/\b(enterprise|corporate|business|professional|commercial|industry)\b/)) {
      return "Work";
    }

    // If title suggests personal use
    if (titleLower.match(/\b(personal|private|individual|my|me|self)\b/)) {
      return "Work"; // Personal productivity
    }

    // If title suggests informational content
    if (titleLower.match(/\b(info|information|about|overview|intro|introduction)\b/)) {
      return "Work";
    }

    // Final intelligent categorization - analyze length and complexity
    if (title.length > 50) {
      // Long descriptive titles usually indicate work content
      return "Work";
    }

    if (titleLower.split(' ').length >= 4) {
      // Multi-word titles often indicate work/productivity content
      return "Work";
    }

    // Last resort - Work is safest default for unknown content
    console.log(`[ATO CategoryAlgorithm] 💡 Final intelligent categorization: "${title}" → Work (safest default for unknown content)`);
    return "Work";
  }

  static clamp01(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  /**
   * Strict domain-only categorization - NO GUESSING ALLOWED
   * @param {Object} meta - Tab metadata with domain, title, url
   * @returns {string|null} Category if explicit match found, null otherwise
   */
  static strictDomainOnly(meta) {
    const d = (meta?.domain || "").toLowerCase();
    if (!d) return null;

    // Use getDomainCategory which already has access to domain mappings
    const domainCategory = this.getDomainCategory(d);
    if (domainCategory) {
      console.log(`[CategoryAlgorithm] ✅ Domain mapping found: ${d} → ${domainCategory}`);
      return domainCategory;
    }

    // NO FALLBACK - return null if no explicit domain match
    console.log(`[CategoryAlgorithm] ❌ No explicit domain mapping found for: ${d}`);
    return null;
  }

  /**
   * Legacy domain heuristic (DEPRECATED - replaced with strictDomainOnly)
   * @deprecated Use strictDomainOnly instead to eliminate generic fallbacks
   */
  static simpleDomainHeuristic(meta) {
    console.warn("[CategoryAlgorithm] DEPRECATED: simpleDomainHeuristic called - use strictDomainOnly");
    
    // Use strict domain-only approach instead of generic fallbacks
    const strictResult = this.strictDomainOnly(meta);
    if (strictResult) {
      return strictResult;
    }

    // NO GENERIC FALLBACK - return null instead of guessing
    return null;
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

    // NO GENERIC PATTERN MATCHING - only explicit domain mappings allowed
    // Removed generic fallbacks that were causing improper categorization
    
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
   * Enhanced confidence scoring based on domain/title match strength
   * @param {String} category - Category name
   * @param {Object} tab - Tab metadata with url, title, domain
   * @param {String} source - Source of categorization (domain_exact, domain_pattern, ai, title_pattern)
   * @returns {Number} Confidence score between 0 and 1
   */
  static getCategoryConfidence(category, tab, source = "unknown") {
    const domain = this.parseDomain(tab.url || tab.domain);
    const title = (tab.title || "").toLowerCase();
    const url = (tab.url || "").toLowerCase();

    // Import DomainHints for exact domain checking
    const { DomainHints } = require("../constants/categories.js");

    // HIGHEST CONFIDENCE: Exact domain match in DomainHints
    if (DomainHints[domain] === category) {
      return 0.98; // Near-perfect confidence for exact domain matches
    }

    // HIGH CONFIDENCE: Subdomain or partial domain match
    for (const [knownDomain, domainCategory] of Object.entries(DomainHints)) {
      if (domainCategory === category &&
          (domain.includes(knownDomain) || domain.endsWith(`.${knownDomain}`))) {
        return 0.94; // Very high confidence for subdomain matches
      }
    }

    // MEDIUM-HIGH CONFIDENCE: Strong title patterns for known categories
    const strongTitlePatterns = {
      "Entertainment": [
        /\b(movie|film|trailer|series|episode|season|watch|streaming)\b/i,
        /\b(music|playlist|album|artist|song|track)\b/i,
        /\b(imdb|rotten.?tomatoes|metacritic)\b/i,
        /\b(netflix|hulu|disney|hbo|prime.?video)\b/i,
      ],
      "Development": [
        /\b(github|gitlab|bitbucket|repository|repo)\b/i,
        /\b(stack.?overflow|programming|code|coding)\b/i,
        /\b(api|sdk|documentation|docs|developer)\b/i,
        /\b(npm|pip|gem|package|library)\b/i,
      ],
      "Email": [
        /\b(inbox|mail|email|compose|draft)\b/i,
        /\b(gmail|outlook|yahoo.?mail|proton.?mail)\b/i,
      ],
      "Shopping": [
        /\b(cart|checkout|order|buy|purchase|shop)\b/i,
        /\b(product|item|price|deal|sale|discount)\b/i,
        /\b(amazon|ebay|etsy|shopping)\b/i,
      ],
      "News": [
        /\b(breaking|news|article|report|update)\b/i,
        /\b(politics|economy|business|world|national)\b/i,
        /\b(cnn|bbc|nytimes|guardian|reuters)\b/i,
      ],
      "Social": [
        /\b(profile|post|tweet|share|follow)\b/i,
        /\b(facebook|twitter|instagram|linkedin|reddit)\b/i,
      ],
    };

    if (strongTitlePatterns[category]) {
      const hasStrongPattern = strongTitlePatterns[category].some(pattern =>
        pattern.test(title) || pattern.test(url)
      );
      if (hasStrongPattern) {
        return 0.88; // High confidence for strong title patterns
      }
    }

    // MEDIUM CONFIDENCE: Weak title patterns or partial domain hints
    const expectedCategory = this.getDomainCategory(domain);
    if (expectedCategory === category) {
      return 0.82; // Good confidence when domain category matches
    }

    // MEDIUM-LOW CONFIDENCE: Source-based scoring
    switch (source) {
      case "domain_exact":
        return 0.95; // Very high confidence for exact domain matches
      case "domain_pattern":
        return 0.90; // High confidence for domain pattern matches
      case "ai_validated":
        return 0.85; // Good confidence for validated AI assignments
      case "title_pattern":
        return 0.75; // Medium confidence for title-based assignments
      case "ai_uncertain":
        return 0.65; // Lower confidence for uncertain AI assignments
      default:
        break;
    }

    // LOW CONFIDENCE: Conflicting signals or unknown domains
    if (expectedCategory && expectedCategory !== category) {
      return 0.45; // Low confidence when domain suggests different category
    }

    // VERY LOW CONFIDENCE: No domain knowledge, weak or no title patterns
    return 0.35; // Low confidence for unknown domains without strong signals
  }

  /**
   * Calculate confidence score for domain/title match combinations
   * @param {String} domain - Domain name
   * @param {String} title - Tab title
   * @param {String} category - Assigned category
   * @returns {Object} Confidence analysis with score and reasoning
   */
  static analyzeCategoryConfidence(domain, title, category) {
    const { DomainHints } = require("../constants/categories.js");
    const analysis = {
      score: 0.5,
      factors: [],
      source: "unknown"
    };

    // Check exact domain match
    if (DomainHints[domain] === category) {
      analysis.score = 0.98;
      analysis.factors.push("exact_domain_match");
      analysis.source = "domain_exact";
      return analysis;
    }

    // Check subdomain match
    for (const [knownDomain, domainCategory] of Object.entries(DomainHints)) {
      if (domainCategory === category && domain.includes(knownDomain)) {
        analysis.score = 0.94;
        analysis.factors.push("subdomain_match");
        analysis.source = "domain_pattern";
        return analysis;
      }
    }

    // Check strong title patterns
    const titleLower = (title || "").toLowerCase();
    const strongPatterns = {
      "Entertainment": /\b(movie|film|trailer|music|playlist|imdb|netflix)\b/i,
      "Development": /\b(github|code|programming|api|documentation)\b/i,
      "Email": /\b(inbox|mail|email|gmail|outlook)\b/i,
      "Shopping": /\b(cart|checkout|amazon|shop|buy|purchase)\b/i,
      "News": /\b(news|breaking|article|politics|reuters|bbc)\b/i,
      "Social": /\b(profile|tweet|facebook|instagram|linkedin)\b/i,
    };

    if (strongPatterns[category] && strongPatterns[category].test(titleLower)) {
      analysis.score = 0.85;
      analysis.factors.push("strong_title_pattern");
      analysis.source = "title_pattern";
      return analysis;
    }

    // Default confidence for unclear cases
    analysis.score = 0.35;
    analysis.factors.push("no_strong_signals");
    analysis.source = "uncertain";
    return analysis;
  }

  /**
   * Strict domain-only grouping - NO GENERIC FALLBACKS
   * @param {Array} tabs - Array of Chrome tab objects
   * @returns {Object} Groups object with { groups: Record<string, number[]>, usedAI: false }
   */
  static fallbackToDomainGrouping(tabs) {
    console.log("[ATO CategoryAlgorithm] Using STRICT domain-only grouping - no generic fallbacks");

    const groups = {};
    let uncategorizedTabs = 0;

    for (const tab of tabs) {
      const domain = this.parseDomain(tab.url);
      
      // Only use explicit domain mappings - no guessing
      const category = this.getDomainCategory(domain) || this.strictDomainOnly({
        domain,
        title: tab.title,
        url: tab.url,
      });

      if (category) {
        if (!groups[category]) {
          groups[category] = [];
        }
        groups[category].push(tab.id);
      } else {
        // NO GENERIC FALLBACK - tabs with unknown domains go to Uncategorized
        if (!groups["Uncategorized"]) {
          groups["Uncategorized"] = [];
        }
        groups["Uncategorized"].push(tab.id);
        uncategorizedTabs++;
        console.log(`[CategoryAlgorithm] No explicit domain mapping for ${domain} - assigned to Uncategorized`);
      }
    }

    console.log(
      "[ATO CategoryAlgorithm] Strict domain grouping created",
      Object.keys(groups).length,
      "groups,",
      uncategorizedTabs,
      "tabs explicitly uncategorized"
    );

    return {
      groups,
      usedAI: false,
    };
  }
}
