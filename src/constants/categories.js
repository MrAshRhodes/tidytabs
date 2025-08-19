/**
 * Shared category constants used across the extension
 * This file exists to prevent circular dependencies between modules
 */

// Canonical taxonomy for categorization
export const CanonicalCategories = [
  "Email",
  "Work",
  "Development",
  "Shopping",
  "Entertainment",
  "Social",
  "News",
  "Finance",
  "Travel",
  "Utilities",
  "AI",
  "Research", // Moved to end to reduce priority bias
];

// Chrome tab group colors available
export const CHROME_TAB_GROUP_COLORS = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
];

// Default color mappings for canonical categories
export const CANONICAL_COLOR_MAP = {
  Email: "blue",
  Work: "yellow",
  Research: "green",
  Development: "purple",
  Shopping: "orange",
  Entertainment: "red",
  Social: "pink",
  News: "cyan",
  Finance: "green",
  Travel: "blue",
  Utilities: "grey",
  AI: "purple",
};

// Domain hints used for biasing classifications
export const DomainHints = {
  // Email (NEVER classify these as "Other")
  "gmail.com": "Email",
  "mail.google.com": "Email",
  "outlook.com": "Email",
  "office365.com": "Email",
  "yahoo.com": "Email",
  "mail.yahoo.com": "Email",
  "proton.me": "Email",
  "fastmail.com": "Email",
  "slack.com": "Email",
  "teams.microsoft.com": "Email",
  "discord.com": "Email",

  // Work
  "docs.google.com": "Work",
  "calendar.google.com": "Work",
  "notion.so": "Work",
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
  "bitbucket.org": "Development",
  "stackoverflow.com": "Development",

  // Entertainment (IMPORTANT: These should NEVER be categorized as News)
  "youtube.com": "Entertainment",
  "netflix.com": "Entertainment",
  "spotify.com": "Entertainment",
  "imdb.com": "Entertainment",
  "rottentomatoes.com": "Entertainment",
  "metacritic.com": "Entertainment",
  "twitch.tv": "Entertainment",
  "hulu.com": "Entertainment",
  "disney.com": "Entertainment",
  "disneyplus.com": "Entertainment",
  "hbomax.com": "Entertainment",
  "primevideo.com": "Entertainment",
  "paramount.com": "Entertainment",
  "peacocktv.com": "Entertainment",

  // Social
  "linkedin.com": "Social",
  "x.com": "Social",
  "twitter.com": "Social",
  "facebook.com": "Social",
  "instagram.com": "Social",
  "reddit.com": "Social",

  // News
  "nytimes.com": "News",
  "bbc.com": "News",
  "cnn.com": "News",
  "theguardian.com": "News",
  "bloomberg.com": "News",

  // Shopping
  "amazon.com": "Shopping",
  "ebay.com": "Shopping",
  "etsy.com": "Shopping",
  "aliexpress.com": "Shopping",

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
