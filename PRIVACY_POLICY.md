# Privacy Policy for TidyTabs

**Effective Date: January 14, 2025**

## Overview

TidyTabs (the Extension) is a Chrome browser extension that helps users organize their browser tabs using AI-powered categorization. We are committed to protecting your privacy and being transparent about our data practices.

## Information We Collect

### Tab Information

- What we access: Tab URLs and titles from your browser
- How we use it: To categorize and organize your tabs into groups
- Storage: Processed temporarily for organization. Any associated settings or cached categorization metadata are stored locally in your browser
- Location: All data is stored locally in your browser (chrome.storage.local)

### API Keys

- What we access: Your OpenAI and/or Anthropic API keys if you choose to provide them
- Groq Free Tier: Does not require you to provide an API key to use Category mode by default
- How we use keys: To authenticate requests to the selected AI service solely for tab categorization
- Storage: If provided, keys are stored locally in your browser using Chrome’s storage API with base64 obfuscation (note: not encryption)

### Usage Data for Local Features

- What we store: Tab access frequency and patterns (for the Frequency algorithm)
- How we use it: Improves local, offline organization (e.g., Most Used, Frequently Accessed)
- Storage: Stored locally in your browser

## How We Use Information

1. Tab Organization: We analyze tab URLs and titles to assign them to meaningful groups
2. AI Processing: When you use the Category (AI) algorithm, tab titles and URLs are sent to your selected AI provider (Groq, OpenAI, or Anthropic) to obtain a category result
3. Local Processing: Last Access and Frequency algorithms process data entirely on your device without transmitting tab data to external services

## Third-Party Services

When you use the AI-powered Category algorithm, tab titles and URLs are sent to your selected provider:

- Groq (if selected; Groq Free Tier is the default)
- OpenAI (if selected and you provide an API key)
- Anthropic (if selected and you provide an API key)

These services process the data according to their own privacy policies and terms. Please review the selected provider’s policies before use.

## Data Storage

- All settings, cached categorizations, and usage data are stored locally on your device using Chrome’s storage API
- No data is sent to any developer-controlled servers (we do not operate any servers for this Extension)
- API keys (if provided) are stored locally with base64 obfuscation (not encryption)

## Data Sharing

We DO NOT:

- Sell your data to third parties
- Share your data with advertisers
- Track you across websites
- Store your browsing history on external servers
- Collect analytics or telemetry about your usage of the Extension

Data is only transmitted to the AI provider you explicitly choose when you run the Category (AI) algorithm.

## Your Choices and Controls

You can:

- Delete all data: Clear Chrome extension storage from Chrome settings
- Disable the extension: Turn off or uninstall TidyTabs at any time
- Use without AI: Select Last Access or Frequency algorithms that work entirely offline
- Control AI usage: Choose which AI provider to use (Groq, OpenAI, Anthropic) or none at all

## Security

- All AI API communications use HTTPS
- No data is transmitted except to your selected AI provider to obtain a category result
- API keys saved in the Extension are obfuscated in local storage (not encryption). Do not share your device or browser profile with untrusted parties

## Children’s Privacy

This Extension is not intended for use by children under 13 years of age.

## Changes to This Policy

We may update this privacy policy from time to time. Check the Effective Date at the top for the latest version.

## Contact

For questions about this privacy policy or the Extension:

- Create an issue on our GitHub repository

## Consent

By using TidyTabs, you consent to this privacy policy and agree to its terms.

---

Important:

- Tab titles and URLs are only sent to an AI provider when you explicitly use the Category (AI) algorithm
- Groq Free Tier does not require you to provide an API key, but requests will still be sent to Groq when you trigger Category mode
- Last Access and Frequency algorithms run entirely on your device and do not send tab data to any external service
