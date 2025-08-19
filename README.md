# TidyTabs — Chrome Extension

AI-powered Chrome extension that intelligently organizes your tabs by:
- Category (LLM/AI using your custom categories)
- Last Access (time-based buckets)
- Frequency (usage patterns with recency weighting)

Modern UI with a design system, glassmorphism touches, and light/dark/auto themes. Built on Manifest V3 with a service worker.

## Highlights

- Organize tabs on-demand from the popup or automatically via Auto Mode
- Three organization methods
  - Category: AI-powered grouping with your custom categories
  - Last Access: Groups like Just Now, Recent, Earlier Today, Yesterday, This Week, Older
  - Frequency: Most Used, Frequently Accessed, Occasionally Used, Rarely Used
- Groq Free Tier by default (no API key required). Optional OpenAI or Anthropic for your own keys
- AI-first policy: Only uses your defined categories. If AI cannot confidently match, tabs go to Uncategorized
- Duplicate group prevention and category consolidation
- Beautiful design system, smooth micro-interactions, dark/light/auto themes
- Privacy-focused: data stored locally in your browser; only AI API calls are made when you use Category mode

## Current Status

- Production-ready with real AI provider integrations:
  - Groq Free Tier (default, no setup required)
  - OpenAI (bring your own key; default model: gpt-5-mini)
  - Anthropic (bring your own key; default model: claude-sonnet-4-20250514)
- Smart batching, rate limiting, error handling, and confidence-based caching
- Options page supports provider selection, API keys, custom categories, theme, defaults
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

Define your categories in Options:
- Add up to 24 categories with names, colors, and optional icons
- Drag and drop to reorder; AI prioritizes higher-ranked categories
- Validation: Names 2–30 characters, alphanumeric with spaces/hyphens
- Colors: 9 Chrome group colors (grey, blue, red, yellow, green, pink, purple, cyan, orange)
- When a category is deleted, TidyTabs will recategorize affected tabs

Implementation references:
- [src/core/CustomCategoryManager.js](src/core/CustomCategoryManager.js:1)
- [src/constants/categories.js](src/constants/categories.js:1)

## AI Providers

Default: Groq (Free Tier)
- Works out of the box without an API key
- Rate limits (typical): 10 requests/min, 100/hour, 500/day

Bring your own key:
- OpenAI (default model: gpt-5-mini)
- Anthropic (default model: claude-sonnet-4-20250514)

Behavior:
- AI strictly uses your custom categories; no invented categories
- If uncertain, tabs fall back to Uncategorized
- Confidence-based caching reduces unnecessary re-calls
- No domain-based fallback (AI-first policy)

Technical references:
- [src/llm/providers/GroqProvider.js](src/llm/providers/GroqProvider.js:1)
- [src/llm/providers/OpenAIProvider.js](src/llm/providers/OpenAIProvider.js:1)
- [src/llm/providers/AnthropicProvider.js](src/llm/providers/AnthropicProvider.js:1)

## Settings

Open the Options page (from the popup, or chrome://extensions → Details → Extension options):
- AI Provider: Groq (default), OpenAI, or Anthropic
- Default Algorithm: Category (AI), Last Access, Frequency
- Auto Mode: On/off with debouncing
- Theme: Auto, Light, or Dark (applied immediately)
- Custom Categories: Add/edit/delete/reorder
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

## Architecture Overview

- Manifest V3 with a service worker coordinating tab events and messaging
- Popup (action) for manual organization controls
- Options page for providers, algorithms, auto-mode, theme, API keys
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
- Options UI: [options/options.html](options/options.html:1), [options/options.js](options/options.js:1), [options/options.css](options/options.css:1)
- Popup UI: [popup/popup.html](popup/popup.html:1), [popup/popup.js](popup/popup.js:1), [popup/popup.css](popup/popup.css:1)

## Roadmap

- Continued prompt optimization and categorization accuracy
- Additional provider model options in UI
- More granular controls for batching and debouncing
- Store listing, screenshots, and release automation

## Support

- Open a GitHub issue for bugs or feature requests
