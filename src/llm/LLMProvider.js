/**
 * LLMProvider - Factory and thin wrapper for AI providers
 * Returns a normalized interface with:
 *  - categorizeTabBatch(tabsMetadata) => { categories: { [name]: number[] }, confidence?: number }
 *  - testConnection() => { ok: boolean, error?: string }
 *
 * Production-ready: Makes real API calls to OpenAI and Anthropic services.
 */

import OpenAIProvider from "./providers/OpenAIProvider.js";
import AnthropicProvider from "./providers/AnthropicProvider.js";
import GroqProvider from "./providers/GroqProvider.js";
import { Logger } from "../config/production.js";
// PromptTemplates no longer used by dispatcher; providers build prompts directly

const PROVIDERS = {
  openai: OpenAIProvider,
  anthropic: AnthropicProvider,
  groq: GroqProvider,
};

const DEFAULT_MODELS = {
  openai: "gpt-5-mini",
  anthropic: "claude-3-5-haiku-20241022",
  groq: "openai/gpt-oss-20b", // Fixed model for free tier
};

const safeLog = (...args) => Logger.debug("[LLM]", ...args);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Sanitize labels: remove slash hierarchy, keep 1–3 words, Title-Case
function sanitizeCategoryLabel(name) {
  try {
    const s = String(name || "").trim();
    if (!s) return "Unknown";
    const base = s.split("/")[0].trim();
    if (!base) return "Unknown";
    const words = base.split(/\s+/).slice(0, 3);
    const joined = words.join(" ").replace(/\s+/g, " ").trim();
    if (!joined) return "Unknown";
    return joined.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return "Unknown";
  }
}

/**
 * Normalize provider response and ensure it's valid
 * @param {Object} resp
 * @param {number} tabCount
 * @returns {{ categories: Record<string, number[]>, confidence?: number }}
 */
function normalizeResponse(resp, tabCount) {
  const fallback = {
    categories: {
      "Research/Reading": Array.from({ length: tabCount }, (_, i) => i),
    },
    confidence: 0.5,
  };

  if (!resp || typeof resp !== "object") return fallback;
  const { categories, confidence } = resp;

  if (!categories || typeof categories !== "object") return fallback;

  // Sanitize indices and drop invalid ones
  const normalized = {};
  for (const [name, arr] of Object.entries(categories)) {
    if (!Array.isArray(arr)) continue;
    const seen = new Set();
    const clean = [];
    for (const idx of arr) {
      if (typeof idx !== "number") continue;
      if (idx < 0 || idx >= tabCount) continue;
      if (seen.has(idx)) continue;
      seen.add(idx);
      clean.push(idx);
    }
    if (clean.length) {
      normalized[name] = clean;
    }
  }

  if (Object.keys(normalized).length === 0) return fallback;
  return {
    categories: normalized,
    confidence: typeof confidence === "number" ? confidence : 0.7,
  };
}

export class LLMProvider {
  /**
   * Create a provider wrapper for the given settings
   * @param {'openai'|'anthropic'|'groq'} providerName
   * @param {Object} settings
   * @param {string} [plainKey] - Plain API key (preferred). If omitted, falls back to decoding settings.apiKeys[provider].
   * @returns {{ categorizeTabBatch(tabsMetadata: Array<{id?: number, title: string, url: string, domain?: string}>): Promise<{categories: Record<string, number[]>, confidence?: number}>, testConnection(): Promise<{ok: boolean, error?: string}>, name: string, model: string }}
   */
  static for(providerName, settings = {}, plainKey = "") {
    const name = (providerName || "").toLowerCase();

    const ProviderClass = PROVIDERS[name] || OpenAIProvider;
    const model = DEFAULT_MODELS[name] || "gpt-5-mini";

    // Get API key for all providers (Groq can use optional user key or fallback to embedded)
    const apiKey =
      typeof plainKey === "string" && plainKey.length > 0
        ? plainKey
        : safeDecode(settings?.apiKeys?.[name] || null);

    const rateLimitMs = settings?.limits?.llmMinInterval || 1000;

    // Important: Do not log the API key
    safeLog(
      `Factory init: provider=${name}, model=${model}, rateLimitMs=${rateLimitMs}`,
    );

    // Optional base URL overrides (Groq has fixed base URL)
    const baseUrl = name === "groq" ? undefined : settings?.baseUrls?.[name];

    // Construct provider adapter (Groq now accepts optional user key)
    const adapter =
      name === "groq"
        ? new ProviderClass(apiKey)
        : new ProviderClass(apiKey, model, baseUrl);

    let lastCallAt = 0;

    async function ensureRateLimit() {
      const now = Date.now();
      const diff = now - lastCallAt;
      if (diff < rateLimitMs) {
        await delay(rateLimitMs - diff);
      }
      lastCallAt = Date.now();
    }

    return {
      name,
      model,

      /**
       * Dispatch to provider and normalize to assignment list
       * @param {Array<{ key?: string, title?: string, url?: string }>} tabs
       * @returns {Promise<{ assignments: Array<{key:string, category:string, confidence:number}>, raw?: any }>}
       */
      async categorizeTabBatch(tabs) {
        try {
          await ensureRateLimit();

          const items = Array.isArray(tabs) ? tabs : [];
          const normalized = items.map((t, i) => ({
            key: String(t?.key || t?.url || i),
            title: t?.title || "Untitled",
            url: t?.url || "",
            // Always provide domain to the provider
            domain: t?.domain || safeParseDomain(t?.url),
          }));

          const raw = await adapter.categorizeTabBatch(normalized, {
            provider: name,
            model,
          });

          let assignments = [];
          const fallbackCat = "Research";

          if (Array.isArray(raw?.assignments)) {
            const rawAssigns = raw.assignments
              .map((a) => ({
                key: String(a?.key || ""),
                category: String(a?.category || fallbackCat).trim(),
                confidence: clamp01Number(a?.confidence),
              }))
              .filter((a) => a.key.length > 0);

            // Diagnostics for slash categories before normalization
            const slashy = Array.from(
              new Set(
                rawAssigns
                  .map((a) => a.category)
                  .filter((c) => typeof c === "string" && c.includes("/")),
              ),
            );
            if (slashy.length) {
              safeLog(
                "Provider returned slash categories; normalizing",
                slashy.slice(0, 5),
              );
            }

            assignments = rawAssigns.map((a) => ({
              ...a,
              category: sanitizeCategoryLabel(a.category),
            }));
          } else if (raw?.categories && typeof raw.categories === "object") {
            // Back-compat: category -> [indices]
            const tmp = [];
            for (const [cat, arr] of Object.entries(raw.categories)) {
              if (!Array.isArray(arr)) continue;
              for (const idx of arr) {
                if (
                  typeof idx !== "number" ||
                  idx < 0 ||
                  idx >= normalized.length
                )
                  continue;
                tmp.push({
                  key: String(normalized[idx].key),
                  category: String(cat || fallbackCat).trim(),
                  confidence:
                    typeof raw.confidence === "number"
                      ? clamp01Number(raw.confidence)
                      : 0.7,
                });
              }
            }

            const slashy2 = Array.from(
              new Set(
                tmp
                  .map((a) => a.category)
                  .filter((c) => typeof c === "string" && c.includes("/")),
              ),
            );
            if (slashy2.length) {
              safeLog(
                "Back-compat categories contained slashes; normalizing",
                slashy2.slice(0, 5),
              );
            }

            assignments = tmp.map((a) => ({
              ...a,
              category: sanitizeCategoryLabel(a.category),
            }));
          }

          return { assignments, raw };
        } catch (err) {
          safeLog("categorizeTabBatch error (normalized):", toSafeError(err));
          return { assignments: [], raw: null };
        }
      },

      /**
       * Basic connection test (local validation only; no network)
       */
      async testConnection() {
        // For providers other than Groq, require API key
        if (name !== "groq" && !apiKey) {
          return { ok: false, error: "Missing API key" };
        }
        try {
          const res = await adapter.testConnection?.();
          if (res && typeof res.ok === "boolean") return res;
          return { ok: true };
        } catch (err) {
          return { ok: false, error: toSafeError(err) };
        }
      },
    };
  }
}

function safeParseDomain(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function clamp01Number(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function safeDecode(encoded) {
  if (!encoded) return null;
  try {
    return atob(encoded);
  } catch {
    return null;
  }
}

function toSafeError(err) {
  try {
    const msg = err?.message || String(err);
    // Ensure no secrets are included
    return msg.replace(
      /(api[_-]?key|authorization)["']?\s*:\s*["'][^"']+["']/gi,
      '$1:"***"',
    );
  } catch {
    return "Unknown error";
  }
}

export default LLMProvider;
