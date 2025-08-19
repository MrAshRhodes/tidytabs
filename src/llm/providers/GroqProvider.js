/**
 * GroqProvider - Free tier AI provider using Groq's OpenAI-compatible API
 * Uses embedded API key for zero-configuration experience
 * Includes rate limiting and usage tracking for free tier protection
 */

import { promptForCategorization } from "../PromptTemplates.js";

// Enable debug logging for Groq provider
const DEBUG = true;
const safeLog = (...args) => {
  if (DEBUG) console.log("[Groq]", ...args);
};

// Optional embedded key is provided via a local, git-ignored module GroqKey.js
// This avoids committing secrets to the repository. See GroqKey.example.js for usage.

// Rate limiting configuration
const RATE_LIMIT = {
  requestsPerMinute: 10,
  requestsPerHour: 100,
  requestsPerDay: 500,
  cooldownMs: 2000, // Minimum time between requests
};

// In-memory usage tracking (resets on extension reload)
class UsageTracker {
  constructor() {
    this.requests = [];
    this.lastRequest = 0;
  }

  canMakeRequest() {
    const now = Date.now();

    // Check cooldown
    if (now - this.lastRequest < RATE_LIMIT.cooldownMs) {
      return {
        allowed: false,
        reason: "Please wait a moment between requests",
      };
    }

    // Clean old requests
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;

    this.requests = this.requests.filter((t) => t > oneDayAgo);

    // Count requests in different time windows
    const lastMinute = this.requests.filter((t) => t > oneMinuteAgo).length;
    const lastHour = this.requests.filter((t) => t > oneHourAgo).length;
    const lastDay = this.requests.length;

    if (lastMinute >= RATE_LIMIT.requestsPerMinute) {
      return {
        allowed: false,
        reason: "Too many requests this minute. Please wait.",
      };
    }
    if (lastHour >= RATE_LIMIT.requestsPerHour) {
      return {
        allowed: false,
        reason: "Hourly limit reached. Try again later.",
      };
    }
    if (lastDay >= RATE_LIMIT.requestsPerDay) {
      return {
        allowed: false,
        reason: "Daily free tier limit reached. Try again tomorrow.",
      };
    }

    return { allowed: true };
  }

  recordRequest() {
    const now = Date.now();
    this.requests.push(now);
    this.lastRequest = now;
  }

  getUsageStats() {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;

    this.requests = this.requests.filter((t) => t > oneDayAgo);

    return {
      lastHour: this.requests.filter((t) => t > oneHourAgo).length,
      lastDay: this.requests.length,
      remainingToday: Math.max(
        0,
        RATE_LIMIT.requestsPerDay - this.requests.length,
      ),
    };
  }
}

// Global usage tracker instance
const usageTracker = new UsageTracker();

export default class GroqProvider {
  constructor(userKey = null) {
    // Groq uses fixed configuration
    this.model = "llama-3.1-8b-instant";
    this.baseUrl = "https://api.groq.com/openai/v1";

    // Initialize key state
    this._embeddedKey = null;
    this._usingUserKey = false;
    this._hasKey = false;
    this._key = null;

    // Prefer user key if provided
    if (userKey && userKey.length > 0) {
      this._key = userKey;
      this._usingUserKey = true;
      this._hasKey = true;
      safeLog(
        `init model=${this.model} baseUrl=${this.baseUrl} (User API Key)`,
      );
    } else {
      // Embedded key will be loaded on-demand from local GroqKey.js (if present)
      safeLog(
        `init model=${this.model} baseUrl=${this.baseUrl} (Free Tier - Embedded Key via local GroqKey.js)`,
      );
    }
  }

  /**
   * Get current usage statistics
   */
  static getUsageStats() {
    return usageTracker.getUsageStats();
  }

  /**
   * Lazily load embedded key from optional local module GroqKey.js
   * This file is git-ignored and should export EMBEDDED_KEY_B64
   */
  async _ensureKey() {
    if (this._hasKey) return;

    try {
      const mod = await import("./GroqKey.js");
      const b64 = mod?.EMBEDDED_KEY_B64;
      if (b64 && typeof b64 === "string" && b64.length > 0) {
        try {
          this._embeddedKey = atob(b64);
          if (!this._usingUserKey) {
            this._key = this._embeddedKey;
          }
          this._hasKey = !!this._embeddedKey;
          safeLog("Loaded embedded Groq key from local GroqKey.js");
        } catch (err) {
          safeLog("Failed to decode embedded base64 key:", err);
        }
      } else {
        safeLog("GroqKey.js present but EMBEDDED_KEY_B64 is empty");
      }
    } catch (e) {
      // Module not found or failed to load - no embedded key available
      safeLog("GroqKey.js not found - proceeding without embedded key");
    }
  }

  /**
   * Categorize tabs using Groq's free tier API
   */
  async categorizeTabBatch(tabs = [], _options = {}) {
    // Ensure we have a key (user or embedded)
    await this._ensureKey();
    if (!this._hasKey) {
      throw new Error("API key configuration error");
    }

    // Check rate limiting
    const { allowed, reason } = usageTracker.canMakeRequest();
    if (!allowed) {
      safeLog("Rate limit exceeded:", reason);
      throw new Error(`Free tier limit: ${reason}`);
    }

    const url = `${this.baseUrl}/chat/completions`;

    // Prepare input items
    const items = Array.isArray(tabs) ? tabs : [];
    const withDomain = items.map((t, idx) => ({
      key: String(t?.key || t?.url || idx),
      title: String(t?.title || "Untitled"),
      url: String(t?.url || ""),
      domain: String(t?.domain || this._parseDomain(t?.url)),
    }));

    console.log(
      "🤖 [GROQ AI] Starting AI-powered tab categorization for",
      withDomain.length,
      "tabs using free tier",
    );
    safeLog(
      "categorizeTabBatch request size:",
      withDomain.length,
      "(Free Tier)",
    );

    // Use unified strict prompt across providers
    const { system, user } = await promptForCategorization(withDomain);
    safeLog("Using unified strict prompt from PromptTemplates");

    // Build request body (OpenAI-compatible format)
    const body = {
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      // Increased to reduce partial coverage for medium batches
      max_tokens: 1024,
      temperature: 0,
    };

    // Helper function to make the API call
    const makeApiCall = async (apiKey) => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = this._parseError(res.status, data);
        safeLog("HTTP error:", res.status, "msg:", msg);
        return { ok: false, status: res.status, error: msg, data };
      }

      return { ok: true, data };
    };

    try {
      // Record the request for rate limiting
      usageTracker.recordRequest();

      console.log("🌐 [GROQ AI] Making API call to Groq AI service...");

      // First attempt with current key
      let result = await makeApiCall(this._key);

      // If 401 and using user key, fallback to embedded key
      if (
        !result.ok &&
        result.status === 401 &&
        this._usingUserKey &&
        this._embeddedKey
      ) {
        console.warn(
          "⚠️ [GROQ AI] User API key authentication failed, falling back to embedded key...",
        );
        safeLog(
          "User key failed with 401, attempting fallback to embedded key",
        );

        // Retry with embedded key
        result = await makeApiCall(this._embeddedKey);

        if (!result.ok) {
          // Both keys failed
          throw new Error(result.error);
        }

        // Embedded key worked, warn user
        console.log("✅ [GROQ AI] Successfully fell back to embedded key");
      } else if (!result.ok) {
        // Either not a 401, or no fallback available
        throw new Error(result.error);
      }

      const data = result.data;

      // Parse response (OpenAI format)
      const rawText = data?.choices?.[0]?.message?.content ?? "";
      const parsed = this._tryParseJSON(rawText);

      const assignments = this._normalizeAssignments(parsed, withDomain);
      // Coverage diagnostics
      safeLog("coverage:", {
        requested: withDomain.length,
        assigned: assignments.length,
        max_tokens: body.max_tokens,
        using: this._usingUserKey ? "user" : "embedded",
      });
      if (assignments.length < withDomain.length) {
        console.warn(
          "[GROQ AI] Partial coverage:",
          assignments.length,
          "of",
          withDomain.length,
          "- consider smaller batches or higher token limits",
        );
      }

      console.log(
        "✅ [GROQ AI] Successfully categorized",
        assignments.length,
        "tabs using AI",
      );
      safeLog("categorizeTabBatch success, assignments:", assignments.length);

      // Log usage stats
      const stats = usageTracker.getUsageStats();
      console.log(
        `📊 [GROQ AI] Usage stats: ${stats.lastHour}/100 hourly, ${stats.lastDay}/500 daily, ${stats.remainingToday} remaining today`,
      );
      safeLog(
        "Usage stats:",
        `${stats.remainingToday} requests remaining today`,
      );

      return { assignments, raw: data };
    } catch (err) {
      console.error(
        "❌ [GROQ AI] CRITICAL: API call failed - LLM-only policy requires AI success",
      );
      safeLog("categorizeTabBatch error:", this._toSafeError(err));

      // LLM-ONLY: No fallback allowed - throw error to force retry at higher level
      throw new Error(
        `[GroqProvider] CRITICAL: LLM-only policy requires AI success. API call failed: ${this._toSafeError(err)}`,
      );
    }
  }

  /**
   * Test connection to Groq API
   */
  async testConnection() {
    await this._ensureKey();
    if (!this._hasKey) {
      return { ok: false, error: "API key configuration error" };
    }

    // Check rate limiting
    const { allowed, reason } = usageTracker.canMakeRequest();
    if (!allowed) {
      return { ok: false, error: `Rate limit: ${reason}` };
    }

    const url = `${this.baseUrl}/chat/completions`;
    const ctrl = new AbortController();
    const timeoutMs = 5000;
    const id = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      usageTracker.recordRequest();

      const res = await fetch(url, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${this._key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 8,
          temperature: 0,
        }),
      });

      clearTimeout(id);

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg = this._parseError(res.status, data);

        // For test connection, don't auto-fallback on 401 with user key
        // This allows the UI to inform the user their key is invalid
        if (res.status === 401 && this._usingUserKey) {
          return { ok: false, error: "Invalid user API key (401)" };
        }

        return { ok: false, error: msg };
      }

      const data = await res.json().catch(() => null);
      if (data && Array.isArray(data.choices)) {
        return { ok: true };
      }

      return { ok: false, error: "Unexpected response format" };
    } catch (err) {
      const aborted = err?.name === "AbortError";
      return {
        ok: false,
        error: aborted ? "Request timed out" : this._toSafeError(err),
      };
    } finally {
      clearTimeout(id);
    }
  }

  /**
   * Parse JSON response with various fallback strategies
   * @private
   */
  _tryParseJSON(text) {
    if (!text) return null;
    if (typeof text === "object") return text;
    if (typeof text !== "string") return null;

    // Direct JSON
    try {
      return JSON.parse(text);
    } catch {}

    // Code blocks
    try {
      const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence && fence[1]) {
        return JSON.parse(fence[1].trim());
      }
    } catch {}

    // Find JSON object in text
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
    } catch {}

    return null;
  }

  /**
   * Normalize parsed response to assignments array
   * @private
   */
  _normalizeAssignments(parsed, withDomain) {
    if (!parsed) return [];

    // Handle assignments array format
    if (Array.isArray(parsed?.assignments)) {
      return parsed.assignments
        .map((a) => ({
          key: String(a?.key || ""),
          category: this._titleCase(String(a?.category || "Utilities")),
          confidence: Math.min(1, Math.max(0, Number(a?.confidence ?? 0.8))),
        }))
        .filter((a) => a.key);
    }

    // Handle categories map format
    if (parsed?.categories && typeof parsed.categories === "object") {
      const assignments = [];
      const keyByIndex = withDomain.map((x) => x.key);

      for (const [catName, indices] of Object.entries(parsed.categories)) {
        if (!Array.isArray(indices)) continue;

        for (const idx of indices) {
          if (typeof idx === "number" && idx >= 0 && idx < keyByIndex.length) {
            assignments.push({
              key: keyByIndex[idx],
              category: this._titleCase(String(catName || "Utilities")),
              confidence: 0.8,
            });
          }
        }
      }

      return assignments;
    }

    return [];
  }

  /**
   * Extract domain from URL
   * @private
   */
  _parseDomain(url) {
    if (!url) return "";
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  /**
   * Parse API error messages
   * @private
   */
  _parseError(status, json) {
    try {
      if (status === 401) return "API authentication failed";
      if (status === 429) return "Rate limited - please wait";
      if (status === 404) return "Model not available";
      if (json?.error?.message) {
        return String(json.error.message).slice(0, 200);
      }
      return `HTTP ${status}`;
    } catch {
      return `HTTP ${status}`;
    }
  }

  /**
   * Convert error to safe string (no sensitive data)
   * @private
   */
  _toSafeError(err) {
    try {
      const msg = err?.message || String(err);
      // Remove any API keys that might appear in errors
      return msg.replace(
        /(api[_-]?key|authorization|Bearer)["']?\s*:\s*["'][^"']+["']/gi,
        '$1:"***"',
      );
    } catch {
      return "Unknown error";
    }
  }

  /**
   * Title case helper
   * @private
   */
  _titleCase(s) {
    try {
      return String(s)
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    } catch {
      return "Utilities";
    }
  }
}
