/**
 * Local Embedded Groq API Key (Base64)
 *
 * Purpose:
 * - Allow building a dist zip that includes an embedded Groq key without committing secrets to Git.
 * - This file is an example template and is safe to commit.
 * - The real key file GroqKey.js is git-ignored (see .gitignore).
 *
 * Usage:
 * 1) Copy this file to GroqKey.js in the same directory:
 *    cp src/llm/providers/GroqKey.example.js src/llm/providers/GroqKey.js
 * 2) Replace the placeholder below with your BASE64-ENCODED Groq API key.
 *    Example: if your key is "gsk_abc123...", run in a shell:
 *      echo -n "gsk_abc123..." | base64
 *    Paste the base64 result into EMBEDDED_KEY_B64.
 * 3) Build the extension:
 *      npm run build
 *    The zip in dist/ will include the embedded key for Groq free-tier behavior.
 *
 * Security Notes:
 * - Do NOT commit GroqKey.js to Git. It is git-ignored by default.
 * - Public repositories should never contain real API keys.
 */

export const EMBEDDED_KEY_B64 = "REPLACE_WITH_BASE64_GROQ_KEY";
