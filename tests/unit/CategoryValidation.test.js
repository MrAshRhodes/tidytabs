/**
 * Unit Tests for Enhanced Category Validation Logic
 * Tests the new strict validation system and domain-first categorization
 */

import { CategoryAlgorithm } from '../../src/algorithms/CategoryAlgorithm.js';
import { validateDomainFirst } from '../../src/llm/PromptTemplates.js';
import { DomainHints } from '../../src/constants/categories.js';

describe('CategoryValidation - Strict Validation System', () => {
  
  describe('validateCategoryStrict', () => {
    test('should reject banned generic categories', () => {
      const bannedCategories = ['misc', 'other', 'tools', 'unknown', 'general'];
      
      bannedCategories.forEach(category => {
        const result = CategoryAlgorithm.validateCategoryStrict(category, {
          url: 'https://example.com',
          title: 'Example Title',
          domain: 'example.com'
        });
        
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('banned');
        expect(result.suggestUncategorized).toBe(true);
      });
    });

    test('should allow canonical categories', () => {
      const canonicalCategories = ['Email', 'Work', 'Development', 'Shopping', 'Entertainment'];
      
      canonicalCategories.forEach(category => {
        const result = CategoryAlgorithm.validateCategoryStrict(category, {
          url: 'https://example.com',
          title: 'Example Title',
          domain: 'example.com'
        });
        
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe('Category approved');
      });
    });

    test('should handle empty or invalid category names', () => {
      const invalidNames = ['', null, undefined, '   '];
      
      invalidNames.forEach(name => {
        const result = CategoryAlgorithm.validateCategoryStrict(name);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Empty category name');
      });
    });
  });

  describe('validateRestrictedCategory - Research Validation', () => {
    test('should allow Research for academic domains', () => {
      const academicDomains = [
        'arxiv.org',
        'scholar.google.com',
        'pubmed.ncbi.nlm.nih.gov',
        'nature.com',
        'ieee.org'
      ];

      academicDomains.forEach(domain => {
        const result = CategoryAlgorithm.validateRestrictedCategory('Research', {
          url: `https://${domain}/paper`,
          title: 'Academic Paper Title',
          domain: domain
        });

        expect(result.allowed).toBe(true);
        expect(result.confidence).toBeGreaterThan(0.8);
        expect(result.reason).toContain('academic content');
      });
    });

    test('should reject Research for non-academic content', () => {
      const nonAcademicCases = [
        {
          domain: 'wikipedia.org',
          title: 'JavaScript - Wikipedia',
          url: 'https://en.wikipedia.org/wiki/JavaScript'
        },
        {
          domain: 'medium.com',
          title: 'How to Build a REST API',
          url: 'https://medium.com/@author/rest-api-tutorial'
        },
        {
          domain: 'stackoverflow.com',
          title: 'How to center a div',
          url: 'https://stackoverflow.com/questions/123/center-div'
        }
      ];

      nonAcademicCases.forEach(testCase => {
        const result = CategoryAlgorithm.validateRestrictedCategory('Research', testCase);

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('not academic/scholarly content');
        expect(result.suggestAlternatives).toContain('Development');
        expect(result.suggestUncategorized).toBe(true);
      });
    });

    test('should allow Research for academic title patterns', () => {
      const academicTitles = [
        'Peer-reviewed study on machine learning',
        'Journal publication: Neural Networks',
        'Scientific study: Climate change research',
        'University research: Quantum computing'
      ];

      academicTitles.forEach(title => {
        const result = CategoryAlgorithm.validateRestrictedCategory('Research', {
          url: 'https://unknown-university.edu/paper',
          title: title,
          domain: 'unknown-university.edu'
        });

        expect(result.allowed).toBe(true);
        expect(result.confidence).toBeGreaterThan(0.8);
      });
    });
  });

  describe('Domain-First Validation', () => {
    test('validateDomainFirst should detect exact domain matches', () => {
      const exactMatches = [
        { domain: 'github.com', expectedCategory: 'Development' },
        { domain: 'gmail.com', expectedCategory: 'Email' },
        { domain: 'netflix.com', expectedCategory: 'Entertainment' },
        { domain: 'amazon.com', expectedCategory: 'Shopping' }
      ];

      exactMatches.forEach(({ domain, expectedCategory }) => {
        const result = validateDomainFirst(domain);
        
        expect(result.hasStrongDomainSignal).toBe(true);
        expect(result.category).toBe(expectedCategory);
        expect(result.confidence).toBe(0.95);
        expect(result.source).toBe('domain_exact_match');
      });
    });

    test('validateDomainFirst should detect subdomain patterns', () => {
      const subdomainCases = [
        { domain: 'mail.google.com', expectedCategory: 'Email' },
        { domain: 'docs.github.com', expectedCategory: 'Development' },
        { domain: 'music.youtube.com', expectedCategory: 'Entertainment' }
      ];

      subdomainCases.forEach(({ domain, expectedCategory }) => {
        const result = validateDomainFirst(domain);
        
        expect(result.hasStrongDomainSignal).toBe(true);
        expect(result.confidence).toBe(0.9);
        expect(result.source).toBe('domain_pattern_match');
      });
    });

    test('validateDomainFirst should return no signal for unknown domains', () => {
      const unknownDomains = ['unknown.com', 'randomsite.org', 'mystery.net'];

      unknownDomains.forEach(domain => {
        const result = validateDomainFirst(domain);
        expect(result.hasStrongDomainSignal).toBe(false);
      });
    });

    test('validateDomainFirst should handle edge cases', () => {
      const edgeCases = [null, undefined, '', '   '];

      edgeCases.forEach(domain => {
        const result = validateDomainFirst(domain);
        expect(result.hasStrongDomainSignal).toBe(false);
      });
    });
  });

  describe('Enhanced Confidence Scoring', () => {
    test('should assign highest confidence for exact domain matches', () => {
      const confidence = CategoryAlgorithm.getCategoryConfidence(
        'Development',
        { 
          url: 'https://github.com/user/repo',
          title: 'GitHub Repository',
          domain: 'github.com'
        },
        'domain_exact'
      );

      expect(confidence).toBe(0.98);
    });

    test('should assign high confidence for subdomain matches', () => {
      const confidence = CategoryAlgorithm.getCategoryConfidence(
        'Development',
        {
          url: 'https://docs.github.com/api',
          title: 'API Documentation', 
          domain: 'docs.github.com'
        },
        'domain_pattern'
      );

      expect(confidence).toBe(0.94);
    });

    test('should assign medium confidence for title pattern matches', () => {
      const confidence = CategoryAlgorithm.getCategoryConfidence(
        'Development',
        {
          url: 'https://randomsite.com/tutorial',
          title: 'GitHub Tutorial for Beginners',
          domain: 'randomsite.com'
        },
        'title_pattern'
      );

      expect(confidence).toBeGreaterThan(0.8);
      expect(confidence).toBeLessThan(0.9);
    });

    test('should assign low confidence for unknown domains', () => {
      const confidence = CategoryAlgorithm.getCategoryConfidence(
        'Development',
        {
          url: 'https://unknown.com/page',
          title: 'Random Page',
          domain: 'unknown.com'
        },
        'uncertain'
      );

      expect(confidence).toBeLessThan(0.4);
    });

    test('should analyze confidence factors correctly', () => {
      const analysis = CategoryAlgorithm.analyzeCategoryConfidence(
        'github.com',
        'GitHub - microsoft/vscode',
        'Development'
      );

      expect(analysis.score).toBe(0.98);
      expect(analysis.factors).toContain('exact_domain_match');
      expect(analysis.source).toBe('domain_exact');
    });
  });

  describe('Strict Domain-Only Logic', () => {
    test('strictDomainOnly should only return explicit matches', () => {
      // Test known domain
      const knownResult = CategoryAlgorithm.strictDomainOnly({
        domain: 'github.com',
        title: 'GitHub Repository',
        url: 'https://github.com/user/repo'
      });
      expect(knownResult).toBe('Development');

      // Test unknown domain  
      const unknownResult = CategoryAlgorithm.strictDomainOnly({
        domain: 'unknown.com',
        title: 'Random Site',
        url: 'https://unknown.com/page'
      });
      expect(unknownResult).toBeNull();
    });

    test('strictDomainOnly should handle subdomain patterns', () => {
      const result = CategoryAlgorithm.strictDomainOnly({
        domain: 'mail.google.com',
        title: 'Gmail Inbox',
        url: 'https://mail.google.com/mail'
      });
      expect(result).toBe('Email');
    });

    test('strictDomainOnly should not guess for partial matches', () => {
      // Domain that contains "news" but isn't in our hints
      const result = CategoryAlgorithm.strictDomainOnly({
        domain: 'localnews.randomsite.com',
        title: 'Local News Site',
        url: 'https://localnews.randomsite.com'
      });
      expect(result).toBeNull(); // Should not guess "News"
    });
  });

  describe('Legacy Method Deprecation', () => {
    test('simpleDomainHeuristic should warn and use strict logic', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const result = CategoryAlgorithm.simpleDomainHeuristic({
        domain: 'github.com',
        title: 'GitHub Repository',
        url: 'https://github.com/user/repo'
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('DEPRECATED: simpleDomainHeuristic called')
      );
      expect(result).toBe('Development'); // Should still work via strictDomainOnly
      
      consoleSpy.mockRestore();
    });

    test('simpleDomainHeuristic should not provide generic fallbacks', () => {
      const result = CategoryAlgorithm.simpleDomainHeuristic({
        domain: 'unknown.com',
        title: 'Random Content',
        url: 'https://unknown.com/page'
      });

      expect(result).toBeNull(); // Should not default to "Utilities" anymore
    });
  });

  describe('Banned Category Detection', () => {
    test('isBannedCategory should detect all banned categories', () => {
      const bannedCategories = [
        'misc', 'other', 'general', 'unknown', 'tools', 
        'utilities', 'resources', 'stuff', 'random'
      ];

      bannedCategories.forEach(category => {
        const isBanned = CategoryAlgorithm.isBannedCategory(category);
        expect(isBanned).toBe(true);
      });
    });

    test('isBannedCategory should allow canonical categories', () => {
      const canonicalCategories = [
        'Email', 'Work', 'Development', 'Shopping', 
        'Entertainment', 'Social', 'News', 'Finance'
      ];

      canonicalCategories.forEach(category => {
        const isBanned = CategoryAlgorithm.isBannedCategory(category);
        expect(isBanned).toBe(false);
      });
    });

    test('isBannedCategory should handle case insensitivity', () => {
      const variations = ['MISC', 'Other', 'gEnErAl', 'TOOLS'];

      variations.forEach(category => {
        const isBanned = CategoryAlgorithm.isBannedCategory(category);
        expect(isBanned).toBe(true);
      });
    });
  });

  describe('Known Pattern Validation', () => {
    test('should correctly identify entertainment sites', () => {
      const entertainmentCases = [
        {
          url: 'https://imdb.com/title/tt123456',
          title: 'Movie Title - IMDb',
          domain: 'imdb.com'
        },
        {
          url: 'https://youtube.com/watch?v=abc123',
          title: 'Video Title - YouTube',
          domain: 'youtube.com'
        },
        {
          url: 'https://netflix.com/title/show',
          title: 'TV Show - Netflix',
          domain: 'netflix.com'
        }
      ];

      entertainmentCases.forEach(testCase => {
        const result = CategoryAlgorithm.validateKnownPatterns(
          testCase.url,
          testCase.title,
          testCase.domain
        );
        expect(result).toBe('Entertainment');
      });
    });

    test('should correctly identify development sites', () => {
      const developmentCases = [
        {
          url: 'https://github.com/user/repo',
          title: 'Repository - GitHub',
          domain: 'github.com'
        },
        {
          url: 'https://stackoverflow.com/questions/123',
          title: 'Programming Question',
          domain: 'stackoverflow.com'
        },
        {
          url: 'https://npmjs.com/package/name',
          title: 'Package - npm',
          domain: 'npmjs.com'
        }
      ];

      developmentCases.forEach(testCase => {
        const result = CategoryAlgorithm.validateKnownPatterns(
          testCase.url,
          testCase.title,
          testCase.domain
        );
        expect(result).toBe('Development');
      });
    });

    test('should not categorize entertainment sites as news', () => {
      // Test that entertainment sites don't get miscategorized as News
      // even if title contains "news"
      const result = CategoryAlgorithm.validateKnownPatterns(
        'https://imdb.com/news/movie-news',
        'Movie News - IMDb',
        'imdb.com'
      );
      
      expect(result).toBe('Entertainment'); // Should be Entertainment, not News
    });

    test('should return null for unknown patterns', () => {
      const result = CategoryAlgorithm.validateKnownPatterns(
        'https://unknown.com/page',
        'Random Page Title',
        'unknown.com'
      );
      
      expect(result).toBeNull();
    });
  });

  describe('Domain Category Mapping', () => {
    test('getDomainCategory should handle exact matches', () => {
      const exactMatches = [
        { domain: 'github.com', expected: 'Development' },
        { domain: 'gmail.com', expected: 'Email' },
        { domain: 'amazon.com', expected: 'Shopping' }
      ];

      exactMatches.forEach(({ domain, expected }) => {
        const result = CategoryAlgorithm.getDomainCategory(domain);
        expect(result).toBe(expected);
      });
    });

    test('getDomainCategory should handle subdomain matches', () => {
      const subdomainMatches = [
        { domain: 'mail.google.com', expected: 'Email' },
        { domain: 'docs.github.com', expected: 'Development' }
      ];

      subdomainMatches.forEach(({ domain, expected }) => {
        const result = CategoryAlgorithm.getDomainCategory(domain);
        expect(result).toBe(expected);
      });
    });

    test('getDomainCategory should not use generic pattern fallbacks', () => {
      // These should return null instead of guessing
      const ambiguousDomains = [
        'newssite.unknown.com', // Contains "news" but not a known news domain
        'shoplocal.randomsite.com', // Contains "shop" but not a known shopping domain
        'learningplatform.com' // Contains "learn" but not a known learning domain
      ];

      ambiguousDomains.forEach(domain => {
        const result = CategoryAlgorithm.getDomainCategory(domain);
        expect(result).toBeNull(); // Should not guess based on partial patterns
      });
    });
  });

  describe('Fallback Domain Grouping', () => {
    test('fallbackToDomainGrouping should use strict domain-only logic', () => {
      const testTabs = [
        {
          id: 1,
          title: 'GitHub Repository',
          url: 'https://github.com/user/repo'
        },
        {
          id: 2,
          title: 'Unknown Site',
          url: 'https://unknown.com/page'
        },
        {
          id: 3,
          title: 'Gmail Inbox',
          url: 'https://gmail.com/mail'
        }
      ];

      const result = CategoryAlgorithm.fallbackToDomainGrouping(testTabs);

      expect(result.usedAI).toBe(false);
      expect(result.groups['Development']).toContain(1); // GitHub tab
      expect(result.groups['Email']).toContain(3); // Gmail tab
      expect(result.groups['Uncategorized']).toContain(2); // Unknown tab
    });

    test('fallbackToDomainGrouping should not create generic categories', () => {
      const testTabs = [
        {
          id: 1,
          title: 'Random Tool',
          url: 'https://randomtool.com'
        },
        {
          id: 2,  
          title: 'Some Utility',
          url: 'https://someutil.net'
        }
      ];

      const result = CategoryAlgorithm.fallbackToDomainGrouping(testTabs);

      // Should not create generic categories like "Tools" or "Utilities"
      expect(result.groups['Tools']).toBeUndefined();
      expect(result.groups['Utilities']).toBeUndefined();
      expect(result.groups['Misc']).toBeUndefined();
      
      // All unknown tabs should go to Uncategorized
      expect(result.groups['Uncategorized']).toEqual([1, 2]);
    });
  });

  describe('Category Normalization', () => {
    test('normalizeCategory should handle synonym mapping', () => {
      const synonymTests = [
        { input: 'email', expected: 'Email' },
        { input: 'programming', expected: 'Development' },
        { input: 'ecommerce', expected: 'Shopping' },
        { input: 'video', expected: 'Entertainment' }
      ];

      synonymTests.forEach(({ input, expected }) => {
        const result = CategoryAlgorithm.normalizeCategory(input);
        expect(result).toBe(expected);
      });
    });

    test('normalizeCategory should preserve canonical categories', () => {
      const canonical = ['Email', 'Work', 'Development', 'Entertainment'];

      canonical.forEach(category => {
        const result = CategoryAlgorithm.normalizeCategory(category);
        expect(result).toBe(category);
      });
    });

    test('normalizeCategory should handle edge cases', () => {
      const edgeCases = [
        { input: '', expected: 'Unknown' },
        { input: '   ', expected: 'Unknown' },
        { input: 'Category/With/Slashes', expected: 'Category' }, // Should take first segment
        { input: 'very long category name with many words', expected: 'Very Long Category' } // Should limit to 3 words
      ];

      edgeCases.forEach(({ input, expected }) => {
        const result = CategoryAlgorithm.normalizeCategory(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Integration with Enhanced DomainHints', () => {
    test('should utilize expanded domain mappings', () => {
      // Test some of the new domain mappings we added
      const newMappings = [
        { domain: 'discord.com', expected: 'Email' },
        { domain: 'notion.so', expected: 'Work' },
        { domain: 'figma.com', expected: 'Work' },
        { domain: 'coinbase.com', expected: 'Finance' },
        { domain: 'booking.com', expected: 'Travel' }
      ];

      newMappings.forEach(({ domain, expected }) => {
        expect(DomainHints[domain]).toBe(expected);
        
        const validation = validateDomainFirst(domain);
        expect(validation.hasStrongDomainSignal).toBe(true);
        expect(validation.category).toBe(expected);
      });
    });

    test('should handle comprehensive entertainment domain coverage', () => {
      const entertainmentDomains = [
        'youtube.com', 'netflix.com', 'spotify.com', 'imdb.com',
        'rottentomatoes.com', 'twitch.tv', 'disney.com', 'hulu.com'
      ];

      entertainmentDomains.forEach(domain => {
        expect(DomainHints[domain]).toBe('Entertainment');
      });
    });

    test('should handle comprehensive development domain coverage', () => {
      const developmentDomains = [
        'github.com', 'gitlab.com', 'stackoverflow.com', 'npmjs.com',
        'docker.com', 'kubernetes.io', 'terraform.io'
      ];

      developmentDomains.forEach(domain => {
        expect(DomainHints[domain]).toBe('Development');
      });
    });
  });
}

// Export test utilities for use in other test files
export {
  CategoryAlgorithm,
  validateDomainFirst
};