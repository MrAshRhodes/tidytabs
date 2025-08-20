# TidyTabs — Chrome Extension

AI-powered Chrome extension that intelligently organizes your tabs by:

- Category (LLM/AI semantic grouping)
- Last Access (time-based buckets)
- Frequency (usage patterns with recency weighting)

Modern UI with a design system, glassmorphism touches, and light/dark/auto themes. Built on Manifest V3 with a service worker.

## Highlights

- Organize tabs on-demand from the popup or automatically via Auto Mode
- Three organization methods
  - Category: AI-powered semantic grouping
  - Last Access: Groups like Just Now, Recent, Earlier Today, Yesterday, This Week, Older
  - Frequency: Most Used, Frequently Accessed, Occasionally Used, Rarely Used
- Groq provider supported. In this public repo, you must provide a Groq API key (via Settings) or add a local embedded key; see the GroqKey section below. OpenAI and Anthropic are bring-your-own-key.
- AI-first policy: Uses strict prompts to avoid invented categories. If AI cannot confidently match, tabs go to Uncategorized
- Duplicate group prevention and category consolidation
- Beautiful design system, smooth micro-interactions, dark/light/auto themes
- Privacy-focused: data stored locally in your browser; only AI API calls are made when you use Category mode

## Current Status

- Production-ready with real AI provider integrations:
  - Groq supported (default provider). In this repo, provide a key or add a local embedded key; see below.
  - OpenAI (bring your own key; default model: gpt-5-mini)
  - Anthropic (bring your own key; default model: claude-sonnet-4-20250514)
- Smart batching, rate limiting, error handling, and confidence-based caching
- Options page supports provider selection, API keys, theme, defaults
- Popup provides quick organize, algorithm switching, and Auto Mode toggle
- Icons ready for Chrome Web Store listing

For full details, see:

- Providers and prompts: [src/llm/LLMProvider.js](src/llm/LLMProvider.js:1), [src/llm/PromptTemplates.js](src/llm/PromptTemplates.js:1)
- Algorithms: [src/algorithms/CategoryAlgorithm.js](src/algorithms/CategoryAlgorithm.js:1), [src/algorithms/LastAccessAlgorithm.js](src/algorithms/LastAccessAlgorithm.js:1), [src/algorithms/FrequencyAlgorithm.js](src/algorithms/FrequencyAlgorithm.js:1)
- Settings and groups: [src/core/SettingsManager.js](src/core/SettingsManager.js:1), [src/core/TabGroupManager.js](src/core/TabGroupManager.js:1), [src/core/TabOrganizer.js](src/core/TabOrganizer.js:1)

## Installation

Load Unpacked (development):

1. Open Chrome and navigate to chrome://extensions
2. Enable Developer mode
3. Click Load unpacked
4. Select this project folder

Install from Chrome Web Store (coming soon)

## Usage

1. Click the TidyTabs toolbar icon to open the popup
2. Choose the organization algorithm:
   - Category (AI)
   - Last Access
   - Frequency
3. Click Organize Tabs Now

Auto Mode:

- Toggle on to automatically organize when new tabs are created or updated (with sensible debouncing)

Ungroup before recategorize (optional):

- In the popup, you can enable Ungroup all tabs first before recategorizing
- When enabled, all existing groups are cleared before AI recategorization for a completely fresh result
- The toggle state persists in Chrome storage

## Custom Categories

Not yet implemented:
- The codebase includes scaffolding, but the feature is not enabled in the UI.
- This section will be updated when the feature is released.

References (development scaffolding):
- [src/core/CustomCategoryManager.js](src/core/CustomCategoryManager.js:1)
- [src/llm/PromptTemplates.js](src/llm/PromptTemplates.js:1)
- [src/constants/categories.js](src/constants/categories.js:1)

## AI Providers

Default: Groq

- In this public repo, Groq requires either:
  - a personal API key saved in Settings, or
  - a local embedded key via the GroqKey setup in [README.md](README.md:147)
- Free-tier limits (typical): 10 requests/min, 100/hour, 500/day
- Model: llama-3.1-8b-instant

Bring your own key:

- OpenAI (default model: gpt-5-mini)
- Anthropic (default model: claude-sonnet-4-20250514)

Behavior:

- Strict prompts help avoid invented categories
- If uncertain, tabs fall back to Uncategorized
- Confidence-based caching reduces unnecessary re-calls
- No domain-based fallback (AI-first policy)

Technical references:

- [src/llm/providers/GroqProvider.js](src/llm/providers/GroqProvider.js:1)
- [src/llm/providers/OpenAIProvider.js](src/llm/providers/OpenAIProvider.js:1)
- [src/llm/providers/AnthropicProvider.js](src/llm/providers/AnthropicProvider.js:1)

## Settings

Access all settings through the popup interface (click the gear icon):

- AI Provider: Groq (default), OpenAI, or Anthropic
- Default Algorithm: Category (AI), Last Access, Frequency
- Auto Mode: On/off with debouncing
- Theme: Auto, Light, or Dark (applied immediately)
- UI Style: Glass or Solid with preset options
- API Keys: Stored locally with base64 obfuscation

## Privacy Summary

- All data is stored locally in your browser using chrome.storage.local
- No developer servers are used; TidyTabs does not collect analytics or telemetry
- When you use the Category algorithm, TidyTabs sends tab titles and URLs to your selected AI provider (Groq, OpenAI, or Anthropic) over HTTPS to obtain categories
- API keys you provide are stored locally with base64 obfuscation and are used only to authenticate calls to the selected provider

Read the full policy: [PRIVACY_POLICY.md](PRIVACY_POLICY.md)

## Development

Install dev tools locally (optional):

- ESLint and Prettier are provided for formatting and linting

Scripts:

- npm run clean — remove dist/ and re-create the folder
- npm run format — Prettier format all files
- npm run lint — ESLint check (.js files)
- npm run zip — package the extension into dist/tidytabs-$VERSION.zip
- npm run build — clean → format → zip

Build artifacts are generated into dist/.

## Local embedded Groq key for builds (no secrets in Git)

Goal: keep the GitHub repo free of secrets, while local builds include an embedded Groq API key for the free-tier UX.

What’s already set up:

- The provider statically imports an optional local key module (MV3 service worker forbids dynamic import) at [src/llm/providers/GroqProvider.js import](src/llm/providers/GroqProvider.js:8) and uses it in [_ensureKey()](src/llm/providers/GroqProvider.js:145).
- A template lives at [src/llm/providers/GroqKey.example.js](src/llm/providers/GroqKey.example.js:1).
- Your real local key file is ignored by Git at [.gitignore](.gitignore:153).

How to enable the embedded key locally:

1. Create your local key file from the template:
   cp src/llm/providers/GroqKey.example.js src/llm/providers/GroqKey.js

2. Base64-encode your Groq API key (starts with gsk\_...):
   echo -n "gsk_your_actual_key_here" | base64

3. Open src/llm/providers/GroqKey.js and replace the placeholder value:
   export const EMBEDDED_KEY_B64 = "PASTE_YOUR_BASE64_VALUE_HERE";

4. Build the extension:
   npm run build
   - The produced zip in dist/ will include src/, and therefore your local GroqKey.js, enabling the built-in free-tier behavior.

Behavior and precedence:

- If you set a personal Groq key in the Options page (Settings), that user key is used first.
- If a user key is invalid (e.g., 401), the provider will fall back to the embedded key when available.
- If no user key is provided, the embedded key is used automatically (when present).
- Connection tests: testConnection intentionally does not fall back on 401 for user keys; it returns "Invalid user API key (401)". Fallback to the embedded key applies only during categorize operations.

Security notes:

- Do not commit src/llm/providers/GroqKey.js. It is ignored by Git via [.gitignore](.gitignore:153).
- Public repositories must never contain real API keys.
- Optional hardening: run a secret scanner in CI (e.g., Gitleaks) to prevent accidental key commits.

Troubleshooting:

- If Category (AI) mode reports missing key on Groq, ensure you created src/llm/providers/GroqKey.js from the example and pasted a valid base64-encoded value.
- Verify the static import is present and the file exists (see [src/llm/providers/GroqProvider.js import](src/llm/providers/GroqProvider.js:8) and [_ensureKey()](src/llm/providers/GroqProvider.js:145)).
- If Test Connection shows "Invalid user API key (401)" but categorization works, this is expected: testConnection avoids fallback to inform you the user key is invalid. Fix by updating or clearing the Groq key in Settings.

## Architecture Overview

- Manifest V3 with a service worker coordinating tab events and messaging
- Popup interface for both organization controls and all settings
- Core modules:
  - Settings Manager: persistence with defaults and validation
  - Tab Organizer: orchestrates algorithms and creates tab groups
  - Algorithms: Category (AI), Last Access (time buckets), Frequency (usage)
  - LLM Provider Layer: normalized interface for providers (Groq, OpenAI, Anthropic)
  - Utilities: Logger, ThemeManager, Storage wrappers, Tab utilities, UI helpers
- Design system CSS and components with modern tokens and animations

Key files:

- Service worker: [src/service-worker/background.js](src/service-worker/background.js:1)
- Organizer and groups: [src/core/TabOrganizer.js](src/core/TabOrganizer.js:1), [src/core/TabGroupManager.js](src/core/TabGroupManager.js:1)
- Popup UI: [popup/popup.html](popup/popup.html:1), [popup/popup.js](popup/popup.js:1), [popup/popup.css](popup/popup.css:1)

## Roadmap

- Continued prompt optimization and categorization accuracy
- Additional provider model options in UI
- More granular controls for batching and debouncing
- Store listing, screenshots, and release automation

## Support

- Open a GitHub issue for bugs or feature requests
