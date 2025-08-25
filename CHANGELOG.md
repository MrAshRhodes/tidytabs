# Changelog

All notable changes to TidyTabs (ATO - Auto Tab Organizer) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.29] - 2025-08-22

### Added

- Popup: "Auto Mode Behavior" selector with three options:
  - Smart — only recategorize grouped tabs if existing groups appear generic (e.g., "Work")
  - Always — always recategorize already grouped tabs
  - Never — never recategorize already grouped tabs

### Changed

- Auto Mode: Background service worker now respects the selected behavior during debounced auto-organization. Smart mode uses a new heuristic that detects generic group names and very short single-word names.
- OpenAI provider: Responses API payload refined to use instructions + input (JSON output enforced by prompt), removing the previous text.format usage and aligning logs/parameters.

### Documentation

- Minor documentation polish (escaped underscores in Groq references), and version strings updated.

### Technical Details

- Settings validation updated to accept autoModeRecategorizeGrouped ∈ {smart, always, never}.
- Popup HTML/JS wired to SettingsManager to persist and load the new setting.
- Background adds hasGenericGroups() helper and integrates includeGrouped selection logic based on the chosen behavior.

## [1.0.28] - 2025-08-20

### Added

- Clean distribution build excluding development files
- Production-ready packaging for Chrome Web Store submission
- Optimized zip creation with minimal file footprint

### Changed

- Improved build process to exclude unnecessary development artifacts
- Enhanced distribution package with only essential files for production

### Fixed

- Removed development files from distribution package
- Cleaned up test files and documentation artifacts from production build

### Technical Details

- Distribution zip now excludes: test files, development configs, build artifacts, IDE files
- Package size optimized for Chrome Web Store submission
- Maintained all core functionality while reducing distribution footprint

## [1.0.27] - 2025-08-20

### Improved

- Enhanced auto-mode smart detection
- Refined tab organization performance
- Updated internal configurations for production readiness

## [1.0.26] - 2025-08-19

### Previous Features

- Anthropic Claude Sonnet-4 model integration (claude-sonnet-4-20250514)
- OpenAI GPT-5-mini model support with Responses API
- Enhanced AI categorization with custom categories
- Groq free tier integration with rate limiting
- Custom category management with full CRUD operations
- AI-first categorization policy enforcement
- Smart caching based on confidence levels
- Ungroup before recategorize option
- Modern UI with glassmorphism effects
- Theme support (light/dark/auto)
- Production logging configuration
- Privacy policy integration

---

## Version History Summary

- **1.0.21**: OpenAI GPT-5-mini model update with Responses API
- **1.0.20**: Anthropic model update to Claude Sonnet-4
- **1.0.7**: Groq model update to llama-3.1-8b-instant
- **1.0.5**: Manual override feature removal (AI-first policy)
- **1.0.4**: Custom categories and AI-first implementation
- **1.0.3**: AI categorization improvements and validation

## Technical Milestones

### AI Integration

- Multi-provider support: OpenAI, Anthropic, Groq
- Custom category system with priority-based ordering
- Intelligent caching with confidence-based TTL
- AI-first policy enforcement (no domain fallback)

### User Experience

- Modern popup interface with glassmorphism design
- Custom categories management UI
- Auto-mode with smart tab detection
- Theme switching with system preference sync

### Production Readiness

- Chrome Web Store submission ready
- Privacy policy implementation
- Production logging configuration
- Clean distribution packaging
