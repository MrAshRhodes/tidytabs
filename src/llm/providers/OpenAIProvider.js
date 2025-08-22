/**
 * OpenAIProvider - Adapter for OpenAI tab categorization
 * Uses OpenAI Chat Completions for non-gpt-5 models, and Responses API for gpt-5 family.
 * Returns normalized assignments: [{ key, category, confidence }]
 */

import {
  promptForCategorization,
  CanonicalCategories,
} from "../PromptTemplates.js";
import { DEBUG, Logger } from "../../config/production.js";

const safeLog = (...args) => Logger.debug("[OpenAI]", ...args);
function tokenParamForModel(model) {
  try {
    const m = String(model || "").toLowerCase();
    if (m.startsWith("gpt-5")) return "max_output_tokens";
    return "max_tokens";
  } catch {
    return "max_tokens";
  }
}

/**
 * Compute a safe, model-aware upper bound for output tokens.
 * We use conservative per-family caps to avoid truncation while staying within typical limits.
 */
function maxTokensForModel(model) {
  try {
    const m = String(model || "").toLowerCase();
    // Responses API (gpt-5 family) tends to allow higher outputs
    if (m.startsWith("gpt-5")) return 8192;
    // 4o family: generous but safe cap
    if (m.startsWith("gpt-4o")) return 4096;
    // Other GPT-4 models
    if (m.startsWith("gpt-4")) return 4096;
    // GPT-3.5 and others
    if (m.includes("3.5")) return 2048;
    // Default conservative cap
    return 4096;
  } catch {
    return 2048;
  }
}

function isGpt5(model) {
  try {
    return String(model || "")
      .toLowerCase()
      .startsWith("gpt-5");
  } catch {
    return false;
  }
}

export default class OpenAIProvider {
  /**
   * @param {string|undefined} apiKey
   * @param {string} model
   * @param {string|undefined} baseUrl
   */
  constructor(apiKey, _model, baseUrl) {
    // Respect incoming model; default to gpt-5-mini (OpenAI Responses API model)
    this.model = String(_model || "gpt-5-mini");
    this.baseUrl = (baseUrl && String(baseUrl)) || "https://api.openai.com/v1";
    // Never log or expose API keys
    this._key = apiKey || null;
    this._hasKey = Boolean(apiKey);
    safeLog(`init model=${this.model} baseUrl=${this.baseUrl}`);
  }

  /**
   * Deterministic, offline categorization stub.
   * Accepts preformatted prompt/system but ignores them for now.
   * Returns:
   *  {
   *    categories: { [name]: number[] },
   *    confidence: number
   *  }
   * @param {Array<{id?: number, title?: string, url?: string, domain?: string}>} tabs
   * @param {{ prompt?: string, system?: string }} options
   */
  async categorizeTabBatch(tabs = [], _options = {}) {
    const base = this.baseUrl.replace(/\/+$/, "");
    const usingGpt5 = isGpt5(this.model);
    const url = usingGpt5 ? `${base}/responses` : `${base}/chat/completions`;
    const tokenParam = tokenParamForModel(this.model);

    // Prepare input items
    const items = Array.isArray(tabs) ? tabs : [];
    const withDomain = items.map((t, idx) => ({
      key: String(t?.key || t?.url || idx),
      title: String(t?.title || "Untitled"),
      url: String(t?.url || ""),
      domain: String(t?.domain || this._parseDomain(t?.url)),
    }));
    safeLog(
      "categorizeTabBatch request size:",
      withDomain.length,
      "model:",
      this.model,
      "endpoint:",
      usingGpt5 ? "/responses" : "/chat/completions",
    );

    console.log("Including custom categories in prompt");
    const { system, user } = await promptForCategorization(withDomain);

    const buildBody = () => {
      if (usingGpt5) {
        // Responses API payload for gpt-5 models with JSON Schema enforcement (response_format.json_schema)
        const keyEnum = withDomain.map((x) => x.key);
        const schema = {
          type: "object",
          additionalProperties: false,
          required: ["assignments"],
          properties: {
            assignments: {
              type: "array",
              minItems: withDomain.length,
              maxItems: withDomain.length,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["key", "category", "confidence"],
                properties: {
                  key: { type: "string", enum: keyEnum },
                  category: { type: "string", enum: CanonicalCategories },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                },
              },
            },
          },
        };

        const body = {
          model: this.model,
          // Responses API: use instructions + input; JSON format enforced by prompt
          instructions: system,
          input: user,
          [tokenParam]: maxTokensForModel(this.model),
        };

        // Use Responses API with instructions + input (JSON format enforced by prompt)
        safeLog(
          "Responses payload configured:",
          "instructions+input",
          "items=",
          withDomain.length,
        );
        return body;
      } else {
        // Chat Completions payload for legacy models
        const body = {
          model: this.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          [tokenParam]: maxTokensForModel(this.model),
        };
        if (!isGpt5(this.model)) body.temperature = 0;
        return body;
      }
    };

    const body = buildBody();
    // Defensive: ensure no temperature is sent for gpt-5 Responses payloads
    if (
      usingGpt5 &&
      body &&
      Object.prototype.hasOwnProperty.call(body, "temperature")
    ) {
      try {
        delete body.temperature;
        safeLog("Responses payload sanitized: removed temperature");
      } catch {}
    }
    // Diagnostics: log top-level request keys to verify payload shape
    try {
      safeLog("Responses request keys:", Object.keys(body || {}).slice(0, 12));
    } catch {}

    const tryParseJSON = (text) => {
      if (!text) return null;
      if (typeof text === "object") return text;
      if (typeof text !== "string") return null;

      // Fast path: direct JSON
      try {
        return JSON.parse(text);
      } catch {}

      // Try fenced code blocks ```json ... ```
      try {
        const fence = text.match(/```(?:json)?\\s*([\\s\\S]*?)```/i);
        if (fence && fence[1]) {
          try {
            return JSON.parse(fence[1].trim());
          } catch {}
        }
      } catch {}

      // Balanced-brace scan: extract the first well-formed JSON object
      // that appears to contain the expected keys for categorization.
      try {
        const s = String(text);
        const mustContain = ['"assignments"', '"categories"'];
        let start = -1,
          depth = 0;
        for (let i = 0; i < s.length; i++) {
          const ch = s[i];
          if (ch === "{") {
            if (depth === 0) start = i;
            depth++;
          } else if (ch === "}") {
            depth--;
            if (depth === 0 && start !== -1) {
              const candidate = s.slice(start, i + 1);
              if (mustContain.some((k) => candidate.includes(k))) {
                try {
                  return JSON.parse(candidate);
                } catch {}
              }
              start = -1;
            }
          }
        }
      } catch {}

      // Last-resort minimal match (non-greedy) – may fail for nested objects
      try {
        const m = text.match(/\{[\s\S]*?\}/);
        if (m) {
          return JSON.parse(m[0]);
        }
      } catch {}

      return null;
    };

    const normalizeFromParsed = (parsed) => {
      let assignments = [];

      // assignments array
      if (Array.isArray(parsed?.assignments)) {
        assignments = parsed.assignments
          .map((a) => {
            const key = String(a?.key || "");
            // LLM-ONLY: No fallback - category must come from AI
            if (!a?.category) return null;
            const category = String(a.category).trim();
            const confidence = Math.min(
              1,
              Math.max(0, Number(a?.confidence ?? 0.8)),
            );
            return key
              ? { key, category: titleCase(category), confidence }
              : null;
          })
          .filter(Boolean);
        if (assignments.length) return { assignments, shape: "assignments" };
      }

      // categories map
      if (
        parsed &&
        parsed.categories &&
        typeof parsed.categories === "object"
      ) {
        const catMap = parsed.categories;
        const keyByIndex = withDomain.map((x) => x.key);
        const tmp = [];
        for (const [catName, arr] of Object.entries(catMap)) {
          if (!Array.isArray(arr)) continue;
          for (const v of arr) {
            let key = "";
            if (typeof v === "number") {
              if (v >= 0 && v < keyByIndex.length) key = String(keyByIndex[v]);
            } else if (typeof v === "string") {
              key = String(v);
            }
            if (!key) continue;
            tmp.push({
              key,
              // LLM-ONLY: No fallback - category must come from AI
              category: titleCase(String(catName).trim()),
              confidence: 0.8,
            });
          }
        }
        const dedup = [];
        const seen = new Set();
        for (const a of tmp) {
          const sig = `${a.key}::${a.category}`;
          if (seen.has(sig)) continue;
          seen.add(sig);
          dedup.push(a);
        }
        if (dedup.length) return { assignments: dedup, shape: "categories" };
      }

      // LLM-ONLY: No fallback allowed - throw error if no valid assignments found
      throw new Error(
        `[OpenAIProvider] CRITICAL: LLM-only policy requires valid AI response. No valid assignments found in response.`,
      );
    };

    const doFetch = async () => {
      // Execute a single HTTP request with diagnostics
      const exec = async (payload, tag = "primary") => {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this._key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const status = res.status;
        const ctype = res.headers.get("content-type") || "";
        const isJson = ctype.includes("application/json");
        const data = isJson ? await res.json().catch(() => null) : null;

        // Diagnostics to understand Responses payload shape (safe, no secrets)
        if (usingGpt5) {
          try {
            const keys =
              data && typeof data === "object" ? Object.keys(data) : [];
            const out = Array.isArray(data?.output) ? data.output : [];
            const first = out[0] || null;
            const firstType =
              first && typeof first.type === "string" ? first.type : "";
            safeLog(
              "responses shape:",
              "keys=" + keys.slice(0, 8).join(","),
              "output.len=" + out.length,
              "first.type=" + firstType,
              "tag=" + tag,
            );
          } catch {}
        }

        if (!res.ok) {
          const msg = this._parseOpenAIError(status, data);

          safeLog(
            "HTTP error:",
            status,
            "ctype:",
            ctype,
            "msg:",
            msg,
            "tag=" + tag,
          );
          try {
            console.warn(
              "[OpenAIProvider]",
              "HTTP error:",
              status,
              "ctype:",
              ctype,
              "msg:",
              msg,
              "tag=" + tag,
            );
          } catch {}
          return { ok: false, status, ctype, data, msg };
        }

        return { ok: true, status, ctype, data };
      };

      // Primary attempt with current payload
      let result = await exec(body, "primary");

      // Targeted fallback for Responses API parameter validation errors
      if (!result.ok && usingGpt5) {
        const m = String(result.msg || "").toLowerCase();
        if (
          m.includes("unknown parameter") ||
          m.includes("unsupported parameter") ||
          m.includes("response_format") ||
          m.includes("json_schema") ||
          m.includes("text.")
        ) {
          const fallbackBody = {
            model: this.model,
            input: [
              { role: "developer", content: system },
              { role: "user", content: user },
            ],
            [tokenParam]: Math.max(
              256,
              Math.floor(maxTokensForModel(this.model) / 2),
            ),
          };
          safeLog(
            "Responses fallback engaged: retrying without text.format using developer+user input",
          );
          result = await exec(fallbackBody, "fallback");
        }
      }

      // Chat Completions: targeted fallback if max_tokens rejected or too large
      if (!result.ok && !usingGpt5) {
        const m = String(result.msg || "").toLowerCase();
        if (
          m.includes("max_tokens") ||
          m.includes("length") ||
          m.includes("content length")
        ) {
          try {
            const reducedBody = structuredClone(body);
            if (reducedBody && tokenParam in reducedBody) {
              reducedBody[tokenParam] = Math.max(
                256,
                Math.floor((reducedBody[tokenParam] || 1024) / 2),
              );
            }
            console.warn(
              "[OpenAIProvider] Chat fallback: reducing",
              tokenParam,
              "to",
              reducedBody[tokenParam],
              "and retrying",
            );
            result = await exec(reducedBody, "chat-fallback");
          } catch {}
        }
      }

      if (!result.ok) {
        throw new Error(result.msg || `HTTP ${result.status}`);
      }

      const data = result.data;

      // Extract JSON result depending on endpoint
      let parsed = null;
      let rawText = "";

      if (usingGpt5) {
        // 1) Try output_text
        if (
          data &&
          typeof data.output_text === "string" &&
          data.output_text.trim().length
        ) {
          rawText = data.output_text;
          try {
            safeLog("output_text length:", rawText.length);
          } catch {}
          parsed = tryParseJSON(rawText);
        }
        // 2) Try output array (preferred modern Responses shape)
        if (!parsed && Array.isArray(data?.output)) {
          try {
            let foundJson = null;
            const texts = [];
            for (const item of data.output) {
              if (
                !foundJson &&
                item &&
                typeof item.type === "string" &&
                item.type.toLowerCase() === "output_text" &&
                typeof item.text === "string" &&
                item.text.trim().length
              ) {
                texts.push(item.text);
                continue;
              }
              if (item?.type === "message" && Array.isArray(item?.content)) {
                for (const part of item.content) {
                  const t =
                    part && typeof part.type === "string"
                      ? part.type.toLowerCase()
                      : "";
                  if (
                    !foundJson &&
                    (t.includes("json") ||
                      t === "json_object" ||
                      t === "tool_result") &&
                    part.json &&
                    typeof part.json === "object"
                  ) {
                    foundJson = part.json;
                  }
                  if (
                    t === "output_text" &&
                    typeof part.text === "string" &&
                    part.text.trim().length
                  ) {
                    texts.push(part.text);
                  } else if (t === "text") {
                    if (
                      typeof part.text === "string" &&
                      part.text.trim().length
                    ) {
                      texts.push(part.text);
                    } else if (
                      part.text &&
                      typeof part.text.value === "string" &&
                      part.text.value.trim().length
                    ) {
                      texts.push(part.text.value);
                    }
                  }
                }
              }
            }
            if (!parsed && foundJson) {
              parsed = foundJson;
            }
            if (!parsed && texts.length) {
              rawText = texts.join("\n");
              parsed = tryParseJSON(rawText);
            }
          } catch {}
        }
        // 2b) Try output.choices[0].message.content[0].text (legacy/compat bridge)
        if (
          !parsed &&
          data?.output?.choices &&
          Array.isArray(data.output.choices) &&
          data.output.choices[0]?.message?.content
        ) {
          const chunks = data.output.choices[0].message.content;
          const textChunk = Array.isArray(chunks)
            ? chunks.find(
                (c) => c?.type === "output_text" || c?.type === "text",
              )
            : null;
          if (textChunk && typeof textChunk.text === "string") {
            rawText = textChunk.text;
            parsed = tryParseJSON(rawText);
          }
        }
        // 2c) Deep scan for any strings that contain JSON with assignments/categories
        if (!parsed && data && typeof data === "object") {
          try {
            const texts = [];
            const stack = [data];
            let steps = 0;
            while (stack.length && steps < 5000) {
              const node = stack.pop();
              steps++;
              if (node == null) continue;
              if (typeof node === "string") {
                const s = node.trim();
                if (s.includes('"assignments"') || s.includes('"categories"')) {
                  texts.push(s);
                }
                continue;
              }
              if (Array.isArray(node)) {
                for (const v of node) stack.push(v);
                continue;
              }
              if (typeof node === "object") {
                for (const v of Object.values(node)) stack.push(v);
              }
            }
            for (const s of texts) {
              const p = tryParseJSON(s);
              if (
                p &&
                (Array.isArray(p.assignments) ||
                  (p.categories && typeof p.categories === "object"))
              ) {
                parsed = p;
                break;
              }
            }
          } catch {}
        }
        // 2d) Try output_parsed (json_schema convenience)
        if (!parsed && data && typeof data.output_parsed === "object") {
          parsed = data.output_parsed;
        }
        // 3) Fallback: entire data as object (if already JSON)
        if (!parsed && data && typeof data === "object") {
          if (
            Array.isArray(data.assignments) ||
            (data.categories && typeof data.categories === "object")
          ) {
            parsed = data;
          }
        }
      } else {
        // Chat Completions
        rawText = data?.choices?.[0]?.message?.content ?? "";
        parsed = tryParseJSON(rawText);
      }

      const rawSample = (rawText || "")
        .slice(0, 200)
        .replace(/\s+/g, " ")
        .trim();
      safeLog(
        "response status:",
        result.status,
        "ctype:",
        result.ctype.includes("json") ? "json" : "other",
        "raw sample:",
        rawSample,
      );
      if (!parsed) {
        try {
          console.warn(
            "[OpenAIProvider] No JSON parsed from OpenAI response; will throw. raw sample:",
            rawSample,
          );
        } catch {}
      }

      const { assignments, shape } = normalizeFromParsed(parsed);
      safeLog(
        "categorizeTabBatch parse shape:",
        shape,
        "assignments:",
        assignments.length,
      );

      if (assignments.length) {
        try {
          const summary = {};
          for (const a of assignments) {
            summary[a.category] = (summary[a.category] || 0) + 1;
          }
          safeLog(
            "categorizeTabBatch category summary:",
            Object.entries(summary)
              .map(([k, v]) => `${k}:${v}`)
              .join(", "),
          );
        } catch {}
        return { assignments, raw: data };
      }
      // LLM-ONLY: No fallback allowed - throw error if no assignments
      throw new Error(
        `[OpenAIProvider] CRITICAL: LLM-only policy requires valid AI response. No assignments returned from AI.`,
      );
    };

    // Retry once on transient conditions
    try {
      return await doFetch();
    } catch (err) {
      const msg = (err?.message || "").toLowerCase();
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
            `[OpenAIProvider] CRITICAL: LLM-only policy requires AI success. API call failed after retry: ${this._toSafeError(err2)}`,
          );
        }
      }
      safeLog("categorizeTabBatch error:", this._toSafeError(err));
      // LLM-ONLY: No fallback allowed - throw error to force retry at higher level
      throw new Error(
        `[OpenAIProvider] CRITICAL: LLM-only policy requires AI success. API call failed: ${this._toSafeError(err)}`,
      );
    }
  }

  /**
   * Basic offline connection test (no network)
   * @returns {{ ok: boolean, error?: string }}
   */
  async testConnection() {
    if (!this._hasKey) {
      return { ok: false, error: "Missing API key" };
    }
    const usingGpt5 = isGpt5(this.model);
    const endpoint = usingGpt5 ? "/responses" : "/chat/completions";
    const url = `${this.baseUrl.replace(/\/+$/, "")}${endpoint}`;
    const ctrl = new AbortController();
    const timeoutMs = 6000;
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const tokenParam = tokenParamForModel(this.model);
      const payload = usingGpt5
        ? {
            model: this.model,
            input: [
              { role: "developer", content: "Ping." },
              { role: "user", content: "ping" },
            ],
            [tokenParam]: Math.min(64, maxTokensForModel(this.model)),
          }
        : {
            model: this.model,
            messages: [{ role: "user", content: "ping" }],
            [tokenParam]: Math.min(32, maxTokensForModel(this.model)),
            response_format: { type: "json_object" },
          };
      if (!isGpt5(this.model) && payload) {
        payload.temperature = 0;
      }

      // Defensive: ensure no temperature is sent for gpt-5 Responses payloads
      if (
        usingGpt5 &&
        payload &&
        Object.prototype.hasOwnProperty.call(payload, "temperature")
      ) {
        try {
          delete payload.temperature;
          safeLog(
            "Responses payload sanitized (testConnection): removed temperature",
          );
        } catch {}
      }
      // Diagnostics: log top-level request keys
      try {
        safeLog(
          "Responses request keys (testConnection):",
          Object.keys(payload || {}).slice(0, 12),
        );
      } catch {}

      const res = await fetch(url, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${this._key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      clearTimeout(id);

      const isJson = (res.headers.get("content-type") || "").includes(
        "application/json",
      );
      const data = isJson ? await res.json().catch(() => null) : null;

      if (!res.ok) {
        const msg = this._parseOpenAIError(res.status, data);
        return { ok: false, error: msg };
      }

      // Basic shape validation per endpoint
      if (usingGpt5) {
        if (
          data &&
          (typeof data.output_text === "string" ||
            Array.isArray(data.output) ||
            (data.output && Array.isArray(data.output.choices)))
        ) {
          return { ok: true };
        }
      } else {
        if (data && Array.isArray(data.choices)) {
          return { ok: true };
        }
      }
      return { ok: false, error: "Unexpected response from API" };
    } catch (err) {
      const aborted =
        err && (err.name === "AbortError" || err.message?.includes("aborted"));
      return {
        ok: false,
        error: aborted ? "Request timed out" : this._toSafeError(err),
      };
    } finally {
      clearTimeout(id);
    }
  }

  /**
   * Simple heuristic-based categorization into indices.
   * @private
   * @param {Array<{title?: string, url?: string, domain?: string}>} tabs
   * @returns {Record<string, number[]>}
   */
  _heuristicCategorize(tabs) {
    const buckets = Object.create(null);

    function put(name, idx) {
      if (!buckets[name]) buckets[name] = [];
      buckets[name].push(idx);
    }

    tabs.forEach((t, idx) => {
      const title = (t.title || "").toLowerCase();
      const url = (t.url || "").toLowerCase();
      const domain = (t.domain || this._parseDomain(t.url)).toLowerCase();

      // Development / Docs
      if (
        domain.includes("github") ||
        domain.includes("gitlab") ||
        domain.includes("stack") || // stackoverflow
        title.includes("mdn") ||
        domain.includes("mdn") ||
        title.includes("docs") ||
        domain.includes("docs")
      ) {
        put("Development", idx);
        return;
      }

      // Entertainment
      if (
        domain.includes("youtube") ||
        domain.includes("twitch") ||
        domain.includes("spotify") ||
        title.includes("music") ||
        title.includes("video")
      ) {
        put("Entertainment", idx);
        return;
      }

      // Social
      if (
        domain.includes("twitter") ||
        domain === "x.com" ||
        domain.includes("facebook") ||
        domain.includes("instagram") ||
        domain.includes("reddit") ||
        domain.includes("linkedin") ||
        domain.includes("discord")
      ) {
        put("Social", idx);
        return;
      }

      // Shopping
      if (
        domain.includes("amazon") ||
        domain.includes("ebay") ||
        domain.includes("etsy") ||
        domain.includes("shopify") ||
        url.includes("/cart") ||
        url.includes("/checkout")
      ) {
        put("Shopping", idx);
        return;
      }

      // News / Reading
      if (
        domain.includes("bbc") ||
        domain.includes("cnn") ||
        domain.includes("nytimes") ||
        domain.includes("reuters") ||
        domain.includes("medium") ||
        title.includes("news")
      ) {
        put("News", idx);
        return;
      }

      // Learning / Research
      if (
        domain.includes("wikipedia") ||
        domain.includes("udemy") ||
        domain.includes("coursera") ||
        domain.includes("khanacademy") ||
        title.includes("tutorial") ||
        title.includes("guide") ||
        title.includes("how to")
      ) {
        put("Learning", idx);
        return;
      }

      // Tools / Work hints
      if (
        domain.includes("notion") ||
        domain.includes("slack") ||
        domain.includes("teams.microsoft") ||
        domain.includes("zoom") ||
        title.includes("dashboard")
      ) {
        put("Work", idx);
        return;
      }

      // Default
      put("Research/Reading", idx);
    });

    return buckets;
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

  _parseOpenAIError(status, json) {
    try {
      if (status === 401) return "Invalid API key";
      if (status === 429) return "Rate limited or quota exceeded";
      if (status === 404) return "Model not found";
      if (json && json.error && json.error.message) {
        const raw = String(json.error.message || "").trim();
        if (/api key/i.test(raw)) return "Invalid API key";
        return raw.slice(0, 200);
      }
      return `HTTP ${status}`;
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
      "[OpenAIProvider] titleCase failed - LLM-only policy violation",
    );
  }
}
