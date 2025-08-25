# Manual Testing Checklist for Enhanced AI Categorization

## Overview
This checklist covers edge cases and boundary conditions that require manual verification to ensure the improved categorization system works correctly in real-world scenarios.

## Pre-Testing Setup

### Prerequisites
- [ ] Chrome extension loaded with latest changes
- [ ] At least one AI provider configured (Groq, OpenAI, or Anthropic)
- [ ] Clear browser cache and extension storage
- [ ] Enable developer tools console for monitoring logs

### Test Environment Setup
- [ ] Open 15-20 tabs representing different categories
- [ ] Include known problematic tabs from test dataset
- [ ] Mix of grouped and ungrouped tabs
- [ ] Include tabs with edge case domains/titles

---

## Core Functionality Tests

### 1. Domain-First Categorization

#### Test A: Exact Domain Matches
- [ ] Open `github.com/user/repo` → Should categorize as **Development** with high confidence
- [ ] Open `gmail.com/mail/inbox` → Should categorize as **Email** with high confidence  
- [ ] Open `netflix.com/title/123` → Should categorize as **Entertainment** with high confidence
- [ ] Open `amazon.com/dp/product` → Should categorize as **Shopping** with high confidence

**Expected:** All should show confidence ≥ 0.95 in console logs

#### Test B: Subdomain Pattern Matching
- [ ] Open `docs.github.com/api` → Should categorize as **Development**
- [ ] Open `mail.google.com/mail` → Should categorize as **Email**
- [ ] Open `music.youtube.com/playlist` → Should categorize as **Entertainment**

**Expected:** Confidence ≥ 0.90, proper subdomain pattern recognition in logs

#### Test C: Unknown Domain Handling
- [ ] Open `random-unknown-site.com/page` → Should categorize as **Uncategorized**
- [ ] Open `mystery-domain.org/content` → Should categorize as **Uncategorized**
- [ ] Open `local-business.net/info` → Should categorize as **Uncategorized**

**Expected:** No generic categories (Tools, Misc, Other), explicit "Uncategorized" assignment

---

### 2. Generic Category Elimination

#### Test D: Research Category Restriction
- [ ] Open `wikipedia.org/wiki/JavaScript` → Should **NOT** be categorized as Research
- [ ] Open `medium.com/tutorial` → Should **NOT** be categorized as Research
- [ ] Open `stackoverflow.com/questions/123` → Should **NOT** be categorized as Research
- [ ] Open `arxiv.org/abs/2023.12345` → **SHOULD** be categorized as Research (genuine academic)

**Expected:** Only genuine academic content gets Research category

#### Test E: Generic Category Rejection
- [ ] Verify no tabs are assigned to: "Misc", "Other", "Tools", "General", "Unknown"
- [ ] Check console logs for rejection messages when AI attempts generic categories
- [ ] Confirm rejected tabs are reassigned to "Uncategorized" or appropriate specific categories

**Expected:** Zero generic category assignments, clear rejection logging

---

### 3. AI Provider Consistency

#### Test F: Cross-Provider Validation
For each configured provider (OpenAI, Anthropic, Groq):

- [ ] Test with same 10-tab set
- [ ] Verify consistent categorization across providers
- [ ] Check confidence scores are reasonable (0.8+ for known domains)
- [ ] Confirm no generic categories from any provider

**Expected:** <5% variance between providers, consistent domain-first behavior

#### Test G: Provider Error Handling
- [ ] Test with invalid API key → Should fall back to Groq or show appropriate error
- [ ] Test with network disconnection → Should assign "Uncategorized" gracefully
- [ ] Test with malformed API responses → Should not crash, assign "Uncategorized"

**Expected:** Graceful error handling, no crashes, appropriate fallback behavior

---

### 4. Auto Mode Functionality

#### Test H: Auto Mode Behavior Settings

**Smart Mode:**
- [ ] Create tabs with generic group names (e.g., "Work", "Stuff") → Should recategorize
- [ ] Create tabs with specific group names (e.g., "Email", "Development") → Should NOT recategorize
- [ ] Add new ungrouped tabs → Should categorize automatically

**Always Mode:**
- [ ] Add tabs to existing specific groups → Should recategorize all tabs
- [ ] Verify all existing groups are dissolved and recreated

**Never Mode:**
- [ ] Add tabs to existing groups → Should NOT recategorize existing grouped tabs
- [ ] Add new ungrouped tabs → Should only categorize new tabs

**Expected:** Each mode behaves according to its documented purpose

#### Test I: Auto Mode Triggers
- [ ] Open new tab → Should trigger auto categorization (if enabled)
- [ ] Update tab title → Should trigger recategorization (with debouncing)
- [ ] Close tabs → Should not trigger unnecessary recategorization
- [ ] Switch windows → Should respect per-window categorization

**Expected:** Appropriate triggering with sensible debouncing

---

### 5. Edge Cases and Boundary Conditions

#### Test J: Unusual Tab Content
- [ ] Empty tab titles → Should handle gracefully, not crash
- [ ] Very long tab titles (>200 chars) → Should truncate appropriately
- [ ] Special characters in titles (emojis, Unicode) → Should handle correctly
- [ ] Chrome extension URLs → Should assign to "Uncategorized"
- [ ] Chrome internal pages (chrome://settings) → Should assign to "Uncategorized"

**Expected:** No errors, appropriate handling of all edge cases

#### Test K: Large Tab Sets
- [ ] Test with 100+ tabs → Should complete within reasonable time (<30 seconds)
- [ ] Test with 200+ tabs → Should not crash or timeout
- [ ] Monitor memory usage → Should not increase dramatically
- [ ] Check rate limiting → Should respect provider limits

**Expected:** Scalable performance, proper rate limiting

#### Test L: Mixed Content Scenarios
- [ ] Mix of known and unknown domains → Should categorize known domains correctly, unknown as "Uncategorized"
- [ ] Conflicting domain/title signals → Domain should take precedence
- [ ] Tabs with misleading titles → Domain authority should override
- [ ] Duplicate URLs in different windows → Should handle consistently

**Expected:** Domain-first approach consistently applied

---

### 6. Confidence Scoring Validation

#### Test M: Confidence Score Accuracy
- [ ] Exact domain matches → Confidence ≥ 0.95
- [ ] Subdomain matches → Confidence ≥ 0.90
- [ ] Title pattern matches → Confidence 0.75-0.85
- [ ] Uncertain assignments → Confidence ≤ 0.50

**Expected:** Confidence scores reflect actual categorization certainty

#### Test N: Cache TTL Behavior
- [ ] High confidence tabs (>0.9) → Should cache for 24 hours
- [ ] Medium confidence tabs (0.7-0.9) → Should cache for 6-12 hours
- [ ] Low confidence tabs (<0.7) → Should cache for 1-3 hours
- [ ] Very low confidence tabs (<0.5) → Should cache for 30 minutes

**Expected:** Dynamic cache TTL based on confidence levels

---

### 7. User Experience Validation

#### Test O: User Interface Consistency
- [ ] Popup displays correct algorithm selection
- [ ] Auto mode toggle works correctly
- [ ] Provider selection saves and loads properly
- [ ] Auto mode behavior dropdown functions correctly
- [ ] "Organize Tabs Now" button works with new logic

**Expected:** All UI elements function normally with enhanced categorization

#### Test P: Error Message Quality
- [ ] Clear messages when AI provider fails
- [ ] Informative logging about category rejections
- [ ] Helpful warnings about deprecated methods
- [ ] User-friendly error handling for invalid configurations

**Expected:** Clear, actionable error messages and logging

---

### 8. Real-World Scenario Testing

#### Test Q: Typical User Workflows

**Workflow 1: Daily Work Session**
- [ ] Open work-related tabs (Gmail, Docs, GitHub, Slack)
- [ ] Enable auto mode with "Smart" behavior
- [ ] Add new work tabs throughout session
- [ ] Verify appropriate categorization without generic assignments

**Workflow 2: Mixed Browsing Session**
- [ ] Open mixed tabs (work, entertainment, shopping, news)
- [ ] Test manual reorganization with "Organize Tabs Now"
- [ ] Verify no tabs assigned to generic categories
- [ ] Check that entertainment sites aren't miscategorized as news

**Workflow 3: Research Session (Academic)**
- [ ] Open genuine academic papers from arxiv.org, scholar.google.com
- [ ] Open general information sites (Wikipedia, documentation)
- [ ] Verify only genuine academic content gets "Research" category
- [ ] Confirm Wikipedia, docs, tutorials get appropriate specific categories

**Expected:** Real-world workflows produce accurate, specific categorizations

---

## Post-Test Validation

### Performance Verification
- [ ] Categorization completes within 10 seconds for typical tab counts (20-50 tabs)
- [ ] No significant memory leaks during extended testing
- [ ] Rate limiting respects provider constraints
- [ ] Cache performance maintains good hit rates

### Quality Assurance Checklist
- [ ] Zero generic category assignments observed
- [ ] Domain authority consistently overrides ambiguous titles
- [ ] "Uncategorized" used appropriately for genuinely unclear cases
- [ ] Confidence scores correlate with categorization accuracy
- [ ] Auto mode settings persist correctly across browser sessions

### User Acceptance Criteria
- [ ] Users would find categorizations more accurate and specific
- [ ] Reduction in "Research" misassignments
- [ ] Elimination of "Tools", "Misc", "Other" categories
- [ ] Appropriate handling of entertainment vs news distinctions
- [ ] Clear rationale for "Uncategorized" assignments

---

## Issues and Observations

### Critical Issues (Must Fix Before Release)
```
Issue: 
Impact: 
Steps to Reproduce:
Expected Behavior:
Actual Behavior:
```

### Minor Issues (Address in Future Updates)
```
Issue:
Impact:
Suggested Improvement:
```

### Positive Observations
```
Improvement:
User Benefit:
Confidence Impact:
```

---

## Test Completion Sign-off

### Test Summary
- **Total Manual Tests Executed:** ___/47
- **Critical Issues Found:** ___
- **Minor Issues Found:** ___
- **Overall Assessment:** [ ] Ready for Release [ ] Needs Fixes [ ] Major Issues

### Tester Information
- **Tester Name:** ________________
- **Test Date:** ________________
- **Test Duration:** ________________
- **Browser Version:** ________________
- **Extension Version:** ________________

### Final Approval
- [ ] All critical functionality works as expected
- [ ] No generic category assignments observed
- [ ] Auto mode settings function correctly
- [ ] Performance is acceptable
- [ ] Error handling is robust

**Tester Signature:** ________________

**Date:** ________________

---

## Additional Notes

### Performance Observations
```
Categorization Speed:
Memory Usage:
Rate Limiting Behavior:
Cache Effectiveness:
```

### User Experience Notes
```
Categorization Accuracy:
Interface Responsiveness:
Error Message Clarity:
Overall Improvement:
```

### Recommendations for Future Enhancements
```
1.
2. 
3.