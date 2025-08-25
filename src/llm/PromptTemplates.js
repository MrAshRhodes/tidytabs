/**
 * PromptTemplates - AI prompt templates for tab categorization
 * Provides structured prompts for different LLM providers and use cases
 */

import CustomCategoryManager from "../core/CustomCategoryManager.js";
import { CanonicalCategories, DomainHints } from "../constants/categories.js";

// Re-export for backward compatibility
export { CanonicalCategories, DomainHints };

/**
 * Domain-first validation for tab categorization
 * Checks if a domain has explicit categorization guidance before AI processing
 * @param {string} domain - Domain to validate
 * @param {string} title - Tab title for additional context
 * @returns {{ hasStrongDomainSignal: boolean, category?: string, confidence?: number }}
 */
export function validateDomainFirst(domain, title = "") {
  if (!domain) return { hasStrongDomainSignal: false };

  // Check for exact domain match in DomainHints
  const domainCategory = DomainHints[domain];
  if (domainCategory) {
    return {
      hasStrongDomainSignal: true,
      category: domainCategory,
      confidence: 0.95,
      source: "domain_exact_match"
    };
  }

  // Check for subdomain patterns
  for (const [knownDomain, category] of Object.entries(DomainHints)) {
    if (domain.endsWith(`.${knownDomain}`) || domain.includes(knownDomain)) {
      return {
        hasStrongDomainSignal: true,
        category,
        confidence: 0.9,
        source: "domain_pattern_match"
      };
    }
  }

  return { hasStrongDomainSignal: false };
}

/**
 * Build strict domain-first system + user messages for categorization with:
 * - Controlled taxonomy (CanonicalCategories)
 * - Domain hints (DomainHints) to bias results
 * - Few-shot examples for consistent categorization
 * - Strict JSON schema: {"assignments":[{"key":"K","category":"OneOfList","confidence":0..1}]}
 *
 * @param {Array<{key?:string, title?:string, url?:string, domain?:string}>} tabs
 * @returns {{ system: string, user: string }}
 */
export async function promptForCategorization(tabs = []) {
  const items = (Array.isArray(tabs) ? tabs : []).map((t, idx) => {
    const key = String(t?.key ?? t?.url ?? idx);
    const title = String(t?.title ?? "Untitled");
    const url = String(t?.url ?? "");
    const domain = t?.domain ? String(t.domain) : extractDomain(url);
    return { key, title, url, domain };
  });

  // Fetch custom categories and merge with canonical
  const customResult = await CustomCategoryManager.listCategories();
  const customCategories = customResult.ok ? customResult.data : [];

  // Create combined taxonomy
  const allCategories = [...CanonicalCategories];
  const customCategoryDescriptions = [];

  // Add custom categories that aren't duplicates
  for (const custom of customCategories) {
    if (!allCategories.includes(custom.name)) {
      allCategories.push(custom.name);
      // Build description for user-created categories
      if (custom.description) {
        customCategoryDescriptions.push(
          `- ${custom.name}: ${custom.description}`,
        );
      } else {
        customCategoryDescriptions.push(`- ${custom.name}`);
      }
    }
  }

  const taxonomy = allCategories.join(", ");

  // Render compact hints
  const hintLines = Object.entries(DomainHints)
    .map(([d, c]) => `- ${d} -> ${c}`)
    .join("\n");

  // Minimal, targeted few-shot examples to bias correct labels (strict JSON only)
  const fewShot = `
Few-shot examples:
Input:
[
  {"key":"k1","title":"Gmail - Inbox","url":"https://mail.google.com","domain":"mail.google.com"},
  {"key":"k2","title":"Outlook - Inbox","url":"https://outlook.com/mail/inbox","domain":"outlook.com"},
  {"key":"k3","title":"Slack - Channel","url":"https://slack.com/app","domain":"slack.com"},
  {"key":"k4","title":"Microsoft Teams","url":"https://teams.microsoft.com","domain":"teams.microsoft.com"},
  {"key":"k5","title":"Discord - Server","url":"https://discord.com/channels/...","domain":"discord.com"},
  {"key":"k6","title":"Google Docs - Spec","url":"https://docs.google.com/document/...","domain":"docs.google.com"},
  {"key":"k7","title":"Google Calendar","url":"https://calendar.google.com","domain":"calendar.google.com"},
  {"key":"k8","title":"YouTube - Jazz Playlist","url":"https://www.youtube.com/watch?v=...","domain":"youtube.com"},
  {"key":"k9","title":"Netflix - Series","url":"https://www.netflix.com/title/...","domain":"netflix.com"},
  {"key":"k10","title":"Spotify - Playlist","url":"https://open.spotify.com/playlist/...","domain":"spotify.com"},
  {"key":"k11","title":"IMDb - Top 250 Movies","url":"https://www.imdb.com/chart/top","domain":"imdb.com"},
  {"key":"k12","title":"Rotten Tomatoes - Movie Reviews","url":"https://www.rottentomatoes.com/m/...","domain":"rottentomatoes.com"},
  {"key":"k13","title":"GitHub - my/repo","url":"https://github.com/my/repo","domain":"github.com"},
  {"key":"k14","title":"Stack Overflow - Question","url":"https://stackoverflow.com/questions/...","domain":"stackoverflow.com"},
  {"key":"k15","title":"Amazon - Product","url":"https://www.amazon.com/dp/...","domain":"amazon.com"},
  {"key":"k16","title":"NYTimes - Article","url":"https://www.nytimes.com/...","domain":"nytimes.com"},
  {"key":"k17","title":"BBC News - Breaking Story","url":"https://www.bbc.com/news/...","domain":"bbc.com"},
  {"key":"k18","title":"LinkedIn","url":"https://www.linkedin.com/in/...","domain":"linkedin.com"},
  {"key":"k19","title":"Google Drive","url":"https://drive.google.com/drive/u/0/home","domain":"drive.google.com"},
  {"key":"k20","title":"PayPal","url":"https://paypal.com/","domain":"paypal.com"},
  {"key":"k21","title":"Google Maps","url":"https://maps.google.com","domain":"maps.google.com"}
]
Output (schema only, no prose):
{"assignments":[
  {"key":"k1","category":"Email","confidence":0.98},
  {"key":"k2","category":"Email","confidence":0.97},
  {"key":"k3","category":"Email","confidence":0.9},
  {"key":"k4","category":"Email","confidence":0.9},
  {"key":"k5","category":"Email","confidence":0.9},
  {"key":"k6","category":"Work","confidence":0.92},
  {"key":"k7","category":"Work","confidence":0.9},
  {"key":"k8","category":"Entertainment","confidence":0.95},
  {"key":"k9","category":"Entertainment","confidence":0.94},
  {"key":"k10","category":"Entertainment","confidence":0.94},
  {"key":"k11","category":"Entertainment","confidence":0.98},
  {"key":"k12","category":"Entertainment","confidence":0.97},
  {"key":"k13","category":"Development","confidence":0.94},
  {"key":"k14","category":"Development","confidence":0.92},
  {"key":"k15","category":"Shopping","confidence":0.96},
  {"key":"k16","category":"News","confidence":0.92},
  {"key":"k17","category":"News","confidence":0.93},
  {"key":"k18","category":"Social","confidence":0.9},
  {"key":"k19","category":"Utilities","confidence":0.85},
  {"key":"k20","category":"Finance","confidence":0.9},
  {"key":"k21","category":"Travel","confidence":0.93}
]}
`.trim();

  const systemParts = [
    "You are a ZERO-TOLERANCE browser tab classifier with STRICT domain-first categorization rules.",
    `ALLOWED CATEGORIES (use ONLY these, exactly as written): ${taxonomy}`,
    "",
    "MANDATORY CATEGORIZATION PROTOCOL - NO EXCEPTIONS:",
    "1. ANALYZE domain for explicit category signals",
    "2. ANALYZE title for clear category indicators",
    "3. PICK the most specific category that fits the content",
    "4. YOU MUST ASSIGN A SPECIFIC CATEGORY - domain + title provides enough information",
    "5. NEVER assign Uncategorized - always choose the closest specific category",
    "",
  ];

  // Add user-created categories section if there are custom categories
  if (customCategoryDescriptions.length > 0) {
    systemParts.push("USER-CREATED CATEGORIES:");
    systemParts.push(...customCategoryDescriptions);
    systemParts.push("");
  }

  systemParts.push(
    "STRICT CATEGORIZATION RULES:",
    "- Produce exactly one assignment per input item",
    '- The "key" in each assignment MUST match exactly one input "key" value',
    '- The "category" MUST be one of the ALLOWED categories; do NOT invent new labels',
    "- Choose the most specific category based on domain knowledge",
    "- Do not include slashes (\"/\") or hierarchical names",
    "",
    "ABSOLUTELY FORBIDDEN CATEGORIES:",
    '- NEVER EVER use: "Research", "Misc", "Other", "General", "Uncategorized", "Unknown", "Tools", "Utilities"',
    "- ALWAYS choose from: Email, Work, Development, Shopping, Entertainment, Social, News, Finance, Travel, AI",
    "- For unclear cases: Work (general productivity), Development (technical), or Utilities (tools/services)",
    "",
    "DOMAIN-SPECIFIC CRITICAL RULES:",
    "- IMDb, Rotten Tomatoes, Metacritic are ALWAYS Entertainment, NEVER News",
    "- Movie/TV/music sites are Entertainment, not News, even if they have articles",
    "- GitHub, GitLab, StackOverflow are ALWAYS Development",
    "- Gmail, Outlook, Slack, Teams, Discord are ALWAYS Email",
    "- Documentation sites, tutorials, how-to guides are Development or Work - NOT Research",
    "- Wikipedia is Utilities - NOT Research",
    "- Only use academic journals, peer-reviewed papers for Research",
    "",
    "CONFIDENCE SCORING:",
    "- Domain exact match = 0.9-0.95 confidence",
    "- Domain + title match = 0.95+ confidence",
    "- Title-only inference = 0.7-0.8 confidence",
    "- Uncertain assignment = 0.3-0.5 confidence",
    "",
    "RESPONSE FORMAT:",
    "- Return STRICT JSON only, no prose, no markdown, no code fences",
    '- Schema (exact): {"assignments":[{"key":"K","category":"string","confidence":0..1}]}',
    "",
    "DOMAIN GUIDANCE (use these mappings as authoritative):",
    hintLines,
    "",
    "EXAMPLES (for reference only):",
    fewShot,
  );

  const system = systemParts.join("\n");

  const user = JSON.stringify(items);

  return { system, user };
}

/**
 * Get all allowed categories (canonical + custom)
 * @returns {Promise<Array<string>>} Array of all allowed category names
 */
export async function getAllAllowedCategories() {
  const customResult = await CustomCategoryManager.listCategories();
  const customCategories = customResult.ok ? customResult.data : [];

  const allCategories = [...CanonicalCategories];
  for (const custom of customCategories) {
    if (!allCategories.includes(custom.name)) {
      allCategories.push(custom.name);
    }
  }

  return allCategories;
}

/**
 * Strict domain-first categorization prompt - eliminates all generic categories
 */
export const StrictDomainFirstPrompt = `You are a ZERO-TOLERANCE browser tab classifier. Categorize tabs using DOMAIN-FIRST analysis with absolute precision.

DOMAIN-FIRST PROTOCOL:
1. Analyze domain for exact categorization signals
2. Use title only to confirm domain-based decision
3. Apply STRICT category mapping - NO GUESSING ALLOWED
4. If uncertain, assign 'Uncategorized' - DO NOT use generic categories

FORBIDDEN CATEGORIES:
- Research (unless academic journals/papers)
- Misc, Other, General, Unknown
- Tools, Utilities (be more specific)

MANDATORY DOMAIN MAPPINGS:
- github.com, gitlab.com, stackoverflow.com → Development
- gmail.com, outlook.com, slack.com → Email
- youtube.com, netflix.com, spotify.com → Entertainment
- amazon.com, ebay.com → Shopping
- nytimes.com, bbc.com → News
- linkedin.com, twitter.com → Social

RESPONSE FORMAT:
Return ONLY valid JSON:
{
  "categories": {
    "CategoryName1": [0, 2, 5],
    "CategoryName2": [1, 3, 4]
  },
  "confidence": 0.85,
  "reasoning": "Domain-based categorization logic"
}

TABS TO CATEGORIZE:
{tabs}`;

/**
 * Main tab categorization prompt - now uses strict domain-first approach
 */
export const TabCategorizationPrompt = StrictDomainFirstPrompt;

/**
 * Work-focused categorization prompt for professional environments
 */
export const WorkFocusedPrompt = `You are organizing browser tabs for a professional work environment. Prioritize work-related categorization.

WORK-SPECIFIC CATEGORIES:
- Project Management: Jira, Asana, Trello, project docs
- Communication: Slack, Teams, email, video conferencing
- Documentation: Confluence, wikis, technical docs, APIs
- Development: Code repos, IDEs, debugging tools
- Analytics: Dashboards, reports, metrics
- Research: Competitive analysis, industry news, whitepapers
- HR & Admin: Timesheets, benefits, company policies
- Learning: Work-related courses, certifications

Focus on productivity and professional organization. Non-work tabs can be grouped as "Personal" or "Break Time".

RESPONSE FORMAT:
{
  "categories": {
    "CategoryName": [tab_indices]
  },
  "confidence": 0.0-1.0,
  "context": "work"
}

TABS TO CATEGORIZE:
{tabs}`;

/**
 * Personal browsing categorization prompt
 */
export const PersonalBrowsingPrompt = `You are organizing browser tabs for personal browsing. Focus on leisure, entertainment, and personal interests.

PERSONAL CATEGORIES:
- Entertainment: Videos, music, games, memes
- Social Media: Facebook, Twitter, Instagram, Reddit
- Shopping: Amazon, fashion, wish lists, deals
- Hobbies: Personal interests, DIY, crafts, sports
- Travel: Booking sites, destinations, reviews
- Health & Fitness: Workouts, recipes, medical info
- News & Reading: News sites, blogs, articles
- Finance: Personal banking, investments, budgeting
- Learning: Personal development, online courses

Group work-related tabs separately if present.

RESPONSE FORMAT:
{
  "categories": {
    "CategoryName": [tab_indices]
  },
  "confidence": 0.0-1.0,
  "context": "personal"
}

TABS TO CATEGORIZE:
{tabs}`;

/**
 * Research-focused categorization prompt
 */
export const ResearchPrompt = `You are organizing browser tabs for academic research purposes. Focus on scholarly information gathering and knowledge organization.

RESEARCH CATEGORIES:
- Academic Papers: Peer-reviewed journals, publications, citations
- Primary Sources: Original documents, datasets, studies
- Secondary Sources: Academic analysis, reviews, meta-studies
- Reference Material: Academic dictionaries, scholarly guides
- Research Tools: Academic databases, citation managers
- Notes & Documentation: Research notes, drafts, methodology
- Related Literature: Supporting academic content
- Resources: Academic datasets, libraries, archives

Emphasize scholarly content and academic workflow. Avoid categorizing general informational sites as research.

RESPONSE FORMAT:
{
  "categories": {
    "CategoryName": [tab_indices]
  },
  "confidence": 0.0-1.0,
  "context": "research"
}

TABS TO CATEGORIZE:
{tabs}`;

/**
 * Few-shot examples for better AI performance
 */
export const FewShotExamples = `
EXAMPLE 1:
Input tabs:
0. GitHub - microsoft/vscode
1. Stack Overflow - How to debug JavaScript
2. YouTube - Lofi Hip Hop Radio
3. Gmail - Inbox
4. Amazon - Shopping Cart
5. MDN Web Docs - Array methods

Output:
{
  "categories": {
    "Development": [0, 1, 5],
    "Entertainment": [2],
    "Communication": [3],
    "Shopping": [4]
  },
  "confidence": 0.9,
  "reasoning": "Grouped by primary purpose - coding resources together, entertainment separate, and utility sites in their own categories"
}

EXAMPLE 2:
Input tabs:
0. LinkedIn - Job Search
1. Indeed - Software Engineer positions
2. Glassdoor - Company Reviews
3. LeetCode - Practice Problems
4. Pramp - Interview Practice

Output:
{
  "categories": {
    "Job Search": [0, 1, 2],
    "Interview Prep": [3, 4]
  },
  "confidence": 0.95,
  "reasoning": "Clear separation between job search platforms and interview preparation resources"
}`;

/**
 * Format tabs data for inclusion in prompts
 * @param {Array} tabs - Array of tab objects with metadata
 * @returns {String} Formatted string representation of tabs
 */
export function formatTabsForPrompt(tabs) {
  return tabs
    .map((tab, index) => {
      const domain = extractDomain(tab.url);
      const title = tab.title || "Untitled";

      // Truncate long titles
      const shortTitle =
        title.length > 60 ? title.substring(0, 60) + "..." : title;

      return `${index}. ${domain} - ${shortTitle}`;
    })
    .join("\n");
}

/**
 * Extract domain from URL for cleaner prompt formatting
 * @private
 */
function extractDomain(url) {
  if (!url) return "unknown";
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

/**
 * Select appropriate prompt based on context
 * @param {String} context - Context type (work, personal, research, auto)
 * @returns {String} Selected prompt template
 */
export function selectPromptByContext(context = "auto") {
  switch (context) {
    case "work":
      return WorkFocusedPrompt;
    case "personal":
      return PersonalBrowsingPrompt;
    case "research":
      return ResearchPrompt;
    default:
      return TabCategorizationPrompt;
  }
}

/**
 * Build complete prompt with examples and tabs
 * @param {Array} tabs - Tabs to categorize
 * @param {Object} options - Options including context, includeExamples
 * @returns {String} Complete prompt ready for LLM
 */
export function buildCategorizationPrompt(tabs, options = {}) {
  const { context = "auto", includeExamples = false } = options;

  let prompt = selectPromptByContext(context);

  // Add few-shot examples if requested
  if (includeExamples) {
    prompt = FewShotExamples + "\n\nYOUR TASK:\n" + prompt;
  }

  // Format and insert tabs
  const formattedTabs = formatTabsForPrompt(tabs);
  prompt = prompt.replace("{tabs}", formattedTabs);

  return prompt;
}

/**
 * Validate AI response format
 * @param {Object} response - AI response object
 * @returns {Boolean} True if response format is valid
 */
export function validateCategorizationResponse(response) {
  if (!response || typeof response !== "object") {
    return false;
  }

  if (!response.categories || typeof response.categories !== "object") {
    return false;
  }

  // Check that categories contain arrays of numbers
  for (const category of Object.values(response.categories)) {
    if (!Array.isArray(category)) {
      return false;
    }

    for (const index of category) {
      if (typeof index !== "number" || index < 0) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Multiple strict prompt variations to prevent AI repetition
 */
export const STRICT_PROMPT_VARIATIONS = {
  domain_first: `You are a STRICT tab classifier. Use DOMAIN KNOWLEDGE FIRST for categorization.

PROTOCOL: Domain → Title → Category (NO GUESSING)

CRITICAL MAPPINGS:
- github.com/gitlab.com → Development
- gmail.com/outlook.com → Email
- youtube.com/netflix.com → Entertainment
- amazon.com/ebay.com → Shopping

FORBIDDEN: Research, Misc, Other, Tools, Unknown

Format: {"categories": {"CategoryName": [indices]}, "confidence": 0.85}
TABS: {tabs}`,

  precision_mode: `PRECISION CATEGORIZATION: Zero tolerance for generic labels.

RULES:
1. Domain signals override title ambiguity
2. Specific categories ONLY - no broad generalizations
3. Uncertain? Use 'Uncategorized' not generic labels

BANNED CATEGORIES: Research, Misc, Other, General, Tools

Domain Authorities:
- Code sites → Development
- Email services → Email
- Streaming → Entertainment
- Stores → Shopping

JSON Only: {"categories": {"Name": [0,1,2]}, "confidence": 0.9}
TABS: {tabs}`,

  explicit_mapping: `EXPLICIT DOMAIN MAPPING for tab categorization.

METHOD: Check domain first, title second, assign specific category.

DOMAIN RULES:
- Entertainment: youtube.com, netflix.com, spotify.com, imdb.com
- Development: github.com, stackoverflow.com, gitlab.com
- Email: gmail.com, outlook.com, slack.com, discord.com
- Shopping: amazon.com, ebay.com, etsy.com
- News: nytimes.com, bbc.com, cnn.com
- Social: linkedin.com, twitter.com, facebook.com

NO GENERIC FALLBACKS - Be specific or use 'Uncategorized'

Response: {"categories": {"Category": [indices]}, "confidence": 0.8}
TABS: {tabs}`
};

/**
 * Select a prompt variation to prevent AI repetition
 * @param {string|number} seed - Seed for consistent variation selection
 * @returns {string} Selected prompt template
 */
export function selectPromptVariation(seed = Date.now()) {
  const variations = Object.values(STRICT_PROMPT_VARIATIONS);
  const index = Math.abs(seed) % variations.length;
  return variations[index];
}

/**
 * Enhanced prompt versioning with strict variations
 */
export const PROMPT_VERSIONS = {
  v1: StrictDomainFirstPrompt,
  v2_domain_first: STRICT_PROMPT_VARIATIONS.domain_first,
  v3_precision: STRICT_PROMPT_VARIATIONS.precision_mode,
  v4_explicit: STRICT_PROMPT_VARIATIONS.explicit_mapping,
  // Legacy version (deprecated)
  legacy_permissive: `You are a browser tab organization assistant. Your task is to analyze the provided browser tabs and categorize them into logical groups based on their content, purpose, and domain.

GUIDELINES:
1. Create 3-7 categories based on content similarity and user intent
2. Use clear, descriptive category names that users will understand
3. Consider both the domain and page title when categorizing
4. Group related tabs even if from different domains (e.g., all documentation sites)
5. Each tab should belong to exactly one category

SUGGESTED CATEGORIES (use when appropriate):
- Work: Professional tasks, work tools, company resources
- Development: Coding, GitHub, StackOverflow, documentation
- Research: Academic papers, scientific studies, scholarly journals (not general Wikipedia or documentation)
- Entertainment: YouTube, streaming, games, fun content
- Social: Social media, messaging, community forums
- Shopping: E-commerce, product reviews, wishlists
- News: News sites, current events, blogs
- Learning: Online courses, tutorials, educational content
- Finance: Banking, investments, budgeting tools
- Tools: Utilities, productivity apps, converters

RESPONSE FORMAT:
Return ONLY valid JSON in this exact format:
{
  "categories": {
    "CategoryName1": [0, 2, 5],
    "CategoryName2": [1, 3, 4],
    "CategoryName3": [6, 7]
  },
  "confidence": 0.85,
  "reasoning": "Brief explanation of categorization logic"
}

The numbers in arrays are the indices of tabs in the provided list (0-based).

TABS TO CATEGORIZE:
{tabs}`,
};

/**
 * System prompts for different LLM providers
 */
export const SystemPrompts = {
  openai:
    "You are a helpful assistant that organizes browser tabs into logical categories. Always respond with valid JSON.",
  anthropic:
    "You are Claude, an AI assistant specialized in organizing and categorizing browser tabs. You always provide structured JSON responses.",
  default:
    "You are an AI assistant that helps organize browser tabs. Respond only with valid JSON in the specified format.",
};

export default {
  TabCategorizationPrompt,
  WorkFocusedPrompt,
  PersonalBrowsingPrompt,
  ResearchPrompt,
  FewShotExamples,
  formatTabsForPrompt,
  selectPromptByContext,
  buildCategorizationPrompt,
  validateCategorizationResponse,
  PROMPT_VERSIONS,
  SystemPrompts,
};
