/**
 * AnthropicProvider - Adapter for Claude API tab categorization
 * Implements real API calls to Anthropic's Messages API
 * Uses the Messages API with JSON response parsing
 */

import { promptForCategorization } from "../PromptTemplates.js";
import { DEBUG, Logger } from "../../config/production.js";

const safeLog = (...args) => Logger.debug("[Anthropic]", ...args);

/**
 * Compute a safe, model-aware upper bound for output tokens.
 * Haiku supports large outputs; we use generous but safe caps.
 */
function maxTokensForModel(model) {
  try {
    const m = String(model || "").toLowerCase();
    // Claude 3.5 Haiku: allow large outputs
    if (m.includes("haiku")) return 8192;
    // Sonnet/Opus: still large but keep conservative cap
    if (m.includes("sonnet")) return 8192;
    if (m.includes("opus")) return 4096;
    // Default
    return 4096;
  } catch {
    return 2048;
  }
}

export default class AnthropicProvider {
  /**
   * @param {string|undefined} apiKey
   * @param {string} model
   * @param {string|undefined} baseUrl
   */
  constructor(apiKey, model, baseUrl) {
    // Fixed model per requirements
    this.model = "claude-sonnet-4-20250514";
    this.baseUrl = (baseUrl || "https://api.anthropic.com").replace(/\/+$/, "");
    // Store key privately (never log or expose)
    this._key = apiKey || null;
    this._hasKey = Boolean(apiKey); // never log keys
    safeLog(`init model=${this.model} baseUrl=${this.baseUrl}`);
  }

  /**
   * Categorize tabs using Anthropic's Claude AI
   * Makes real API calls to Anthropic Messages API
   * @param {Array<{id?: number, title?: string, url?: string, domain?: string}>} tabs
   * @param {{ prompt?: string, system?: string }} _options
   * @returns {{ assignments: Array<{key: string, category: string, confidence: number}>, raw: any }}
   */
  async categorizeTabBatch(tabs = [], _options = {}) {
    // Real API call to Anthropic Messages with strict JSON output
    const url = `${this.baseUrl}/v1/messages`;
    const items = Array.isArray(tabs) ? tabs : [];
    const withDomain = items.map((t, idx) => ({
      key: String(t?.key || t?.url || idx),
      title: String(t?.title || "Untitled"),
      url: String(t?.url || ""),
      domain: String(t?.domain || this._parseDomain(t?.url)),
    }));

    safeLog(
      "Using Anthropic AI to categorize",
      withDomain.length,
      "tabs with model:",
      this.model,
    );

    console.log("Including custom categories in prompt");
    const { system, user } = await promptForCategorization(withDomain);

    const body = {
      model: this.model,
      max_tokens: maxTokensForModel(this.model),
      system: system, // System prompt as top-level parameter for Anthropic API
      messages: [{ role: "user", content: [{ type: "text", text: user }] }],
      // omit temperature
    };

    const doFetch = async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this._key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
      });

      const isJson = (res.headers.get("content-type") || "").includes(
        "application/json",
      );
      const data = isJson ? await res.json().catch(() => null) : null;

      if (!res.ok) {
        const msg = this._parseAnthropicError(res.status, data);
        throw new Error(msg);
      }

      // Extract text from content array
      const content = Array.isArray(data?.content) ? data.content : [];
      const textPart = content.find(
        (c) => c?.type === "text" && typeof c?.text === "string",
      );
      const rawText = textPart?.text || "";

      let parsed = null;
      if (rawText) {
        try {
          parsed = JSON.parse(rawText);
        } catch {
          const m = rawText.match(/\{[\s\S]*\}/);
          if (m) {
            try {
              parsed = JSON.parse(m[0]);
            } catch {
              parsed = null;
            }
          }
        }
      }

      if (!parsed || !Array.isArray(parsed.assignments)) {
        // LLM-ONLY: No fallback allowed - throw error if parsing fails
        throw new Error(
          `[AnthropicProvider] CRITICAL: LLM-only policy requires valid AI response. Failed to parse assignments from response.`,
        );
      }

      // Normalize assignments
      const norm = parsed.assignments
        .map((a) => {
          const key = String(a?.key || "");
          // LLM-ONLY: No fallback - category must come from AI
          if (!a?.category) return null;
          const category = String(a.category).trim();
          const confidence = Math.min(
            1,
            Math.max(0, Number(a?.confidence ?? 0.82)),
          );
          return key
            ? { key, category: titleCase(category), confidence }
            : null;
        })
        .filter(Boolean);

      safeLog(
        "AI categorization successful, assigned",
        norm.length,
        "tabs to categories",
      );
      return { assignments: norm, raw: data };
    };

    try {
      return await doFetch();
    } catch (err) {
      const msg = (err?.message || "").toLowerCase();

      // Targeted fallback: reduce max_tokens if Anthropic rejects due to token/length constraints
      if (
        msg.includes("max_tokens") ||
        msg.includes("length") ||
        msg.includes("too long") ||
        msg.includes("token")
      ) {
        try {
          const prev = Number(body?.max_tokens || 0);
          const reduced = Math.max(256, Math.floor((prev || 1024) / 2));
          body.max_tokens = reduced;
          console.warn(
            "[AnthropicProvider] Fallback: reducing max_tokens to",
            reduced,
            "and retrying",
          );
          return await doFetch();
        } catch (err2) {
          safeLog(
            "categorizeTabBatch token-fallback error:",
            this._toSafeError(err2),
          );
          // continue to other fallbacks
        }
      }

      if (
        msg.includes("rate") ||
        msg.includes("timeout") ||
        msg.includes("quota") ||
        msg.includes("429")
      ) {
        await new Promise((r) => setTimeout(r, 600));
        try {
          return await doFetch();
        } catch (err2) {
          safeLog("categorizeTabBatch final error:", this._toSafeError(err2));
          // LLM-ONLY: No fallback allowed - throw error to force retry at higher level
          throw new Error(
            `[AnthropicProvider] CRITICAL: LLM-only policy requires AI success. API call failed after retry: ${this._toSafeError(err2)}`,
          );
        }
      }
      safeLog("categorizeTabBatch error:", this._toSafeError(err));
      // LLM-ONLY: No fallback allowed - throw error to force retry at higher level
      throw new Error(
        `[AnthropicProvider] CRITICAL: LLM-only policy requires AI success. API call failed: ${this._toSafeError(err)}`,
      );
    }
  }

  /**
   * Test connection to Anthropic API
   * @returns {{ ok: boolean, error?: string }}
   */
  async testConnection() {
    safeLog("testConnection() called");

    if (!this._hasKey) {
      safeLog("testConnection: No API key");
      return { ok: false, error: "Missing API key" };
    }

    safeLog("testConnection: Has API key, length:", this._key?.length || 0);

    const base = String(this.baseUrl || "https://api.anthropic.com").replace(
      /\/+$/,
      "",
    );
    const url = `${base}/v1/messages`;
    safeLog("testConnection: URL:", url);

    const ctrl = new AbortController();
    const timeoutMs = 6000;
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      // Use the same content format as categorizeTabBatch for consistency
      const payload = {
        model: this.model || "claude-sonnet-4-20250514",
        max_tokens: Math.min(64, maxTokensForModel(this.model)),
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "ping" }],
          },
        ],
      };

      safeLog("testConnection: Payload:", JSON.stringify(payload, null, 2));
      safeLog("testConnection: Making API request...");

      const res = await fetch(url, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": this._key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(payload),
      });

      clearTimeout(timer);

      safeLog("testConnection: Response status:", res.status);
      safeLog(
        "testConnection: Response headers:",
        Object.fromEntries(res.headers.entries()),
      );

      const isJson = (res.headers.get("content-type") || "").includes(
        "application/json",
      );
      const data = isJson ? await res.json().catch(() => null) : null;

      safeLog("testConnection: Response data:", JSON.stringify(data, null, 2));

      if (!res.ok) {
        const msg = this._parseAnthropicError(res.status, data);
        safeLog("testConnection: API returned error:", res.status, msg);
        return { ok: false, error: msg };
      }

      // Check for valid Anthropic response structure
      // Anthropic returns: { id, type, role, content: [...], model, ... }
      safeLog("testConnection: Checking response structure...");
      safeLog("testConnection: data.id:", data?.id);
      safeLog("testConnection: data.type:", data?.type);
      safeLog("testConnection: data.role:", data?.role);
      safeLog(
        "testConnection: data.content is array:",
        Array.isArray(data?.content),
      );
      safeLog("testConnection: data.content:", data?.content);

      if (data && typeof data === "object") {
        // Check for key Anthropic response fields
        const hasValidStructure =
          data.id &&
          data.type &&
          (data.role || data.content || Array.isArray(data.content));

        safeLog("testConnection: hasValidStructure:", hasValidStructure);

        if (hasValidStructure) {
          safeLog(
            "testConnection: SUCCESS - valid Anthropic response structure",
          );
          return { ok: true };
        }

        // Also accept if we get a valid response with content array (even if structure differs)
        if (Array.isArray(data.content) && data.content.length > 0) {
          safeLog("testConnection: SUCCESS - has content array");
          return { ok: true };
        }
      }

      // If we got this far without error and have some data, consider it successful
      // since actual API calls are working
      if (data && res.ok) {
        safeLog(
          "testConnection: SUCCESS - permissive check (res.ok=true, has data)",
        );
        return { ok: true };
      }

      safeLog("testConnection: FAILED - unexpected response structure");
      return { ok: false, error: "Unexpected response from API" };
    } catch (err) {
      const aborted =
        err && (err.name === "AbortError" || err.message?.includes("aborted"));
      const errorMsg = aborted ? "Request timed out" : this._toSafeError(err);
      safeLog("testConnection: Exception caught:", err);
      safeLog("testConnection: Error message:", errorMsg);
      return { ok: false, error: errorMsg };
    } finally {
      clearTimeout(timer);
      safeLog("testConnection: Completed");
    }
  }

  /**
   * DEPRECATED: Legacy heuristic categorization replaced with strict domain-first approach
   * @deprecated This method has been removed to ensure consistent categorization across all providers
   * @private
   */
  _heuristicCategorize(tabs) {
    // Legacy method removed - all providers now use unified strict categorization
    throw new Error("[AnthropicProvider] _heuristicCategorize deprecated - use unified CategoryAlgorithm validation");
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

  _parseAnthropicError(status, json) {
    try {
      // Log the full error for debugging
      safeLog("Anthropic API error:", status, json);

      if (status === 401) {
        // Check for specific authentication errors
        const errorType = json?.error?.type || "";
        if (errorType === "authentication_error") {
          return "Invalid API key - please check your Anthropic API key";
        }
        return "Authentication failed (401) - Invalid API key";
      }
      if (status === 429) return "Rate limited or quota exceeded";
      if (status === 404) {
        // Check if it's a model error
        const errorMsg = json?.error?.message || "";
        if (errorMsg.includes("model")) {
          return `Model not found: ${this.model}`;
        }
        return "Endpoint not found (404)";
      }
      if (status === 400) {
        // Bad request - often means invalid parameters
        const errorMsg = json?.error?.message || "";
        return `Bad request: ${errorMsg}`.slice(0, 200);
      }

      const message =
        (json && (json.error?.message || json.error?.type || json.message)) ||
        `HTTP ${status}`;
      return String(message).slice(0, 200);
    } catch {
      return `HTTP ${status}`;
    }
  }

  _toSafeError(err) {
    try {
      const msg = err?.message || String(err);
      return msg.replace(
        /(api[_-]?key|authorization)["']?\s*:\s*["'][^"']+["']/gi,
        '$1:"***"',
      );
    } catch {
      return "Unknown error";
    }
  }
}

function titleCase(s) {
  try {
    return String(s)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    // LLM-ONLY: No fallback allowed
    throw new Error(
      "[AnthropicProvider] titleCase failed - LLM-only policy violation",
    );
  }
}
