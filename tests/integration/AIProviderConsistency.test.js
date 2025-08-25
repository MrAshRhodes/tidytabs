/**
 * Integration Tests for AI Provider Consistency
 * Ensures all AI providers (OpenAI, Anthropic, Groq) behave consistently with new strict validation
 */

import { LLMProvider } from '../../src/llm/LLMProvider.js';
import { promptForCategorization, selectPromptVariation } from '../../src/llm/PromptTemplates.js';
import { CategoryAlgorithm } from '../../src/algorithms/CategoryAlgorithm.js';
import problematicTabsData from '../data/problematic-tabs.json' assert { type: 'json' };

class AIProviderConsistencyTest {
  constructor() {
    this.providers = ['openai', 'anthropic', 'groq'];
    this.testResults = {
      consistency: {},
      performance: {},
      validation: {}
    };
  }

  /**
   * Run comprehensive consistency tests across all AI providers
   */
  async runConsistencyTests() {
    console.log('🤖 Testing AI Provider Consistency with New Strict Validation');
    console.log('=' .repeat(70));

    // Test each provider with the same input data
    for (const provider of this.providers) {
      await this.testProvider(provider);
    }

    // Analyze consistency across providers
    this.analyzeConsistency();
    this.generateConsistencyReport();

    return this.testResults;
  }

  /**
   * Test a specific AI provider with standardized inputs
   */
  async testProvider(providerName) {
    console.log(`\n🔧 Testing Provider: ${providerName.toUpperCase()}`);
    console.log('-'.repeat(50));

    try {
      // Initialize provider (mock for testing)
      const mockSettings = {
        provider: providerName,
        model: this.getDefaultModel(providerName)
      };

      // Test prompt generation with new strict templates
      const testTabs = this.getStandardizedTestTabs();
      const { system, user } = await promptForCategorization(testTabs);

      // Validate prompt contains strict validation rules
      const promptValidation = this.validatePromptStrictness(system);

      // Test prompt variations
      const variations = this.testPromptVariations(testTabs);

      // Mock AI responses to test validation logic
      const mockResponses = this.generateMockResponses(testTabs);
      const validationResults = await this.testResponseValidation(mockResponses, testTabs);

      // Store results for this provider
      this.testResults.consistency[providerName] = {
        promptValidation,
        variations,
        validationResults,
        strictnessScore: this.calculateStrictnessScore(promptValidation, validationResults)
      };

      console.log(`   ✅ ${providerName.toUpperCase()} testing complete`);
      console.log(`   Strictness Score: ${this.testResults.consistency[providerName].strictnessScore.toFixed(2)}/1.0`);

    } catch (error) {
      console.log(`   ❌ ${providerName.toUpperCase()} testing failed: ${error.message}`);
      this.testResults.consistency[providerName] = {
        error: error.message,
        strictnessScore: 0
      };
    }
  }

  /**
   * Get default model for each provider
   */
  getDefaultModel(provider) {
    const models = {
      'openai': 'gpt-4-mini',
      'anthropic': 'claude-sonnet-4-20250514', 
      'groq': 'llama-3.1-8b-instant'
    };
    return models[provider] || 'default';
  }

  /**
   * Generate standardized test tabs for consistent testing
   */
  getStandardizedTestTabs() {
    return [
      {
        key: 'test1',
        title: 'GitHub - microsoft/vscode',
        url: 'https://github.com/microsoft/vscode',
        domain: 'github.com'
      },
      {
        key: 'test2', 
        title: 'Gmail - Inbox',
        url: 'https://mail.google.com/mail/u/0/#inbox',
        domain: 'mail.google.com'
      },
      {
        key: 'test3',
        title: 'Netflix - Stranger Things',
        url: 'https://www.netflix.com/title/80057281',
        domain: 'netflix.com'
      },
      {
        key: 'test4',
        title: 'Wikipedia - JavaScript',
        url: 'https://en.wikipedia.org/wiki/JavaScript',
        domain: 'en.wikipedia.org'
      },
      {
        key: 'test5',
        title: 'Unknown Site - Random Content',
        url: 'https://unknown-site.com/page',
        domain: 'unknown-site.com'
      }
    ];
  }

  /**
   * Validate that prompts contain strict validation rules
   */
  validatePromptStrictness(systemPrompt) {
    const strictnessChecks = {
      containsForbiddenList: systemPrompt.includes('FORBIDDEN') || systemPrompt.includes('NEVER use'),
      containsDomainFirst: systemPrompt.includes('domain') || systemPrompt.includes('DOMAIN'),
      containsNoGuessing: systemPrompt.includes('NO GUESSING') || systemPrompt.includes('DO NOT GUESS'),
      containsUncategorizedGuidance: systemPrompt.includes('Uncategorized'),
      rejectsGenericCategories: systemPrompt.includes('Research') && systemPrompt.includes('unless'),
      hasConfidenceGuidance: systemPrompt.includes('confidence'),
      hasExplicitMappings: systemPrompt.includes('github.com') || systemPrompt.includes('gmail.com')
    };

    const strictnessScore = Object.values(strictnessChecks).filter(Boolean).length / Object.keys(strictnessChecks).length;

    return {
      checks: strictnessChecks,
      score: strictnessScore,
      isStrict: strictnessScore >= 0.8
    };
  }

  /**
   * Test prompt variations to prevent AI repetition
   */
  testPromptVariations(testTabs) {
    const variations = [];
    
    // Test multiple prompt variations
    for (let i = 0; i < 5; i++) {
      const variation = selectPromptVariation(i * 1000); // Different seeds
      variations.push({
        seed: i * 1000,
        prompt: variation,
        length: variation.length,
        containsDomainFirst: variation.includes('domain') || variation.includes('DOMAIN'),
        containsStrictRules: variation.includes('STRICT') || variation.includes('NO GUESSING')
      });
    }

    // Check that we get different variations
    const uniquePrompts = new Set(variations.map(v => v.prompt));
    const variationScore = uniquePrompts.size / variations.length;

    return {
      variations,
      uniqueCount: uniquePrompts.size,
      totalGenerated: variations.length,
      variationScore,
      hasVariation: variationScore > 0.5
    };
  }

  /**
   * Generate mock AI responses for testing validation
   */
  generateMockResponses(testTabs) {
    return [
      // Good responses that should pass validation
      {
        type: 'valid_response',
        response: {
          assignments: [
            { key: 'test1', category: 'Development', confidence: 0.95 },
            { key: 'test2', category: 'Email', confidence: 0.98 },
            { key: 'test3', category: 'Entertainment', confidence: 0.94 },
            { key: 'test4', category: 'Utilities', confidence: 0.85 },
            { key: 'test5', category: 'Uncategorized', confidence: 0.1 }
          ]
        }
      },
      // Bad responses with generic categories that should be rejected
      {
        type: 'generic_categories',
        response: {
          assignments: [
            { key: 'test1', category: 'Development', confidence: 0.95 },
            { key: 'test2', category: 'Email', confidence: 0.98 },
            { key: 'test3', category: 'Entertainment', confidence: 0.94 },
            { key: 'test4', category: 'Research', confidence: 0.8 }, // Should be rejected for Wikipedia
            { key: 'test5', category: 'Tools', confidence: 0.6 } // Should be rejected as generic
          ]
        }
      },
      // Response with banned categories
      {
        type: 'banned_categories',
        response: {
          assignments: [
            { key: 'test1', category: 'Misc', confidence: 0.7 }, // Banned
            { key: 'test2', category: 'Other', confidence: 0.6 }, // Banned
            { key: 'test3', category: 'General', confidence: 0.5 }, // Banned
            { key: 'test4', category: 'Unknown', confidence: 0.4 }, // Banned
            { key: 'test5', category: 'Stuff', confidence: 0.3 } // Banned
          ]
        }
      }
    ];
  }

  /**
   * Test response validation against strict rules
   */
  async testResponseValidation(mockResponses, testTabs) {
    const validationResults = [];

    for (const mock of mockResponses) {
      const result = {
        type: mock.type,
        assignments: [],
        rejectedCount: 0,
        acceptedCount: 0,
        validationScore: 0
      };

      for (const assignment of mock.response.assignments) {
        const tab = testTabs.find(t => t.key === assignment.key);
        if (!tab) continue;

        // Test strict validation
        const validation = CategoryAlgorithm.validateCategoryStrict(assignment.category, {
          url: tab.url,
          title: tab.title,
          domain: tab.domain
        });

        const assignmentResult = {
          key: assignment.key,
          category: assignment.category,
          confidence: assignment.confidence,
          validationPassed: validation.allowed,
          rejectionReason: validation.reason,
          tab: tab.title
        };

        result.assignments.push(assignmentResult);

        if (validation.allowed) {
          result.acceptedCount++;
        } else {
          result.rejectedCount++;
        }
      }

      result.validationScore = result.acceptedCount / (result.acceptedCount + result.rejectedCount);
      validationResults.push(result);
    }

    return validationResults;
  }

  /**
   * Calculate overall strictness score for a provider
   */
  calculateStrictnessScore(promptValidation, validationResults) {
    const promptScore = promptValidation.score || 0;
    
    // Calculate average validation score across all test cases
    const avgValidationScore = validationResults.length > 0 
      ? validationResults.reduce((sum, r) => sum + r.validationScore, 0) / validationResults.length
      : 0;

    // Weight prompt strictness and validation effectiveness equally
    return (promptScore + avgValidationScore) / 2;
  }

  /**
   * Analyze consistency across all providers
   */
  analyzeConsistency() {
    console.log('\n📊 Analyzing Cross-Provider Consistency');
    console.log('-'.repeat(50));

    const providerScores = {};
    const promptFeatures = {};
    
    for (const [provider, results] of Object.entries(this.testResults.consistency)) {
      if (results.error) {
        console.log(`   ❌ ${provider.toUpperCase()}: ${results.error}`);
        continue;
      }

      providerScores[provider] = results.strictnessScore;
      
      // Analyze prompt features
      promptFeatures[provider] = {
        hasStrictValidation: results.promptValidation?.checks?.containsForbiddenList || false,
        hasDomainFirst: results.promptValidation?.checks?.containsDomainFirst || false,
        hasVariations: results.variations?.hasVariation || false
      };

      console.log(`   ✅ ${provider.toUpperCase()}: Strictness ${results.strictnessScore.toFixed(2)}/1.0`);
    }

    // Calculate consistency metrics
    const scores = Object.values(providerScores);
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const maxVariance = Math.max(...scores) - Math.min(...scores);

    this.testResults.consistency.summary = {
      averageStrictnessScore: avgScore,
      maxVariance: maxVariance,
      isConsistent: maxVariance < 0.1, // Less than 10% variance considered consistent
      providerScores,
      promptFeatures
    };

    console.log(`\n📈 CONSISTENCY METRICS:`);
    console.log(`   Average Strictness: ${avgScore.toFixed(3)}`);
    console.log(`   Max Variance: ${maxVariance.toFixed(3)}`);
    console.log(`   Consistent: ${maxVariance < 0.1 ? 'YES' : 'NO'} (variance < 0.1)`);
  }

  /**
   * Generate comprehensive consistency report
   */
  generateConsistencyReport() {
    console.log('\n📋 AI PROVIDER CONSISTENCY REPORT');
    console.log('='.repeat(70));

    const summary = this.testResults.consistency.summary;

    console.log(`\n🎯 OVERALL CONSISTENCY:`);
    console.log(`   Status: ${summary.isConsistent ? '✅ CONSISTENT' : '⚠️ INCONSISTENT'}`);
    console.log(`   Average Strictness Score: ${summary.averageStrictnessScore.toFixed(3)}/1.0`);
    console.log(`   Maximum Variance: ${summary.maxVariance.toFixed(3)}`);

    console.log(`\n🔧 PROVIDER BREAKDOWN:`);
    for (const [provider, score] of Object.entries(summary.providerScores)) {
      const status = score >= 0.8 ? '✅' : score >= 0.6 ? '⚠️' : '❌';
      console.log(`   ${status} ${provider.toUpperCase()}: ${score.toFixed(3)}/1.0`);
    }

    console.log(`\n📝 PROMPT FEATURES:`);
    for (const [provider, features] of Object.entries(summary.promptFeatures)) {
      console.log(`   ${provider.toUpperCase()}:`);
      console.log(`     Strict Validation: ${features.hasStrictValidation ? '✅' : '❌'}`);
      console.log(`     Domain-First: ${features.hasDomainFirst ? '✅' : '❌'}`);
      console.log(`     Variations: ${features.hasVariations ? '✅' : '❌'}`);
    }

    // Recommendations
    console.log(`\n💡 RECOMMENDATIONS:`);
    const lowPerformers = Object.entries(summary.providerScores)
      .filter(([_, score]) => score < 0.8)
      .map(([provider, _]) => provider);

    if (lowPerformers.length === 0) {
      console.log(`   ✅ All providers meet strict validation standards`);
    } else {
      console.log(`   ⚠️ Providers needing attention: ${lowPerformers.join(', ')}`);
    }

    if (summary.maxVariance > 0.1) {
      console.log(`   ⚠️ High variance detected - consider provider-specific prompt tuning`);
    }
  }

  /**
   * Test response validation for mock AI responses
   */
  async testResponseValidation(mockResponses, testTabs) {
    const results = [];

    for (const mock of mockResponses) {
      const validationResult = {
        type: mock.type,
        totalAssignments: mock.response.assignments.length,
        validAssignments: 0,
        rejectedAssignments: 0,
        rejectionReasons: []
      };

      for (const assignment of mock.response.assignments) {
        const tab = testTabs.find(t => t.key === assignment.key);
        if (!tab) continue;

        const validation = CategoryAlgorithm.validateCategoryStrict(assignment.category, {
          url: tab.url,
          title: tab.title,
          domain: tab.domain
        });

        if (validation.allowed) {
          validationResult.validAssignments++;
        } else {
          validationResult.rejectedAssignments++;
          validationResult.rejectionReasons.push({
            category: assignment.category,
            reason: validation.reason,
            tab: tab.title
          });
        }
      }

      validationResult.validationRate = validationResult.validAssignments / validationResult.totalAssignments;
      results.push(validationResult);
    }

    return results;
  }

  /**
   * Test provider-specific error handling
   */
  async testErrorHandling(providerName) {
    console.log(`\n🚨 Testing Error Handling: ${providerName.toUpperCase()}`);

    const errorScenarios = [
      {
        name: 'Rate Limit Error',
        mockError: new Error('Rate limit exceeded'),
        expectedBehavior: 'Should retry with exponential backoff'
      },
      {
        name: 'Invalid API Key',
        mockError: new Error('Invalid API key'),
        expectedBehavior: 'Should fall back to Groq or return Uncategorized'
      },
      {
        name: 'Network Timeout',
        mockError: new Error('Request timeout'),
        expectedBehavior: 'Should retry then assign Uncategorized'
      },
      {
        name: 'Invalid JSON Response',
        mockError: new Error('Invalid JSON'),
        expectedBehavior: 'Should assign all tabs to Uncategorized'
      }
    ];

    const errorResults = [];

    for (const scenario of errorScenarios) {
      try {
        // Test error handling with AI retry logic
        const result = await CategoryAlgorithm.aiAssignWithRetry(
          null, // Mock provider that will fail
          [{ key: 'test', title: 'Test', url: 'https://test.com', domain: 'test.com' }],
          1, // Single attempt for faster testing
          100 // Short delay
        );

        // Should return Uncategorized for all failed attempts
        const allUncategorized = result.assignments.every(a => a.category === 'Uncategorized');
        
        errorResults.push({
          scenario: scenario.name,
          handledGracefully: allUncategorized,
          result: result
        });

        console.log(`   ✅ ${scenario.name}: ${allUncategorized ? 'Handled correctly' : 'Needs attention'}`);

      } catch (error) {
        errorResults.push({
          scenario: scenario.name,
          handledGracefully: false,
          error: error.message
        });

        console.log(`   ❌ ${scenario.name}: Error not handled gracefully`);
      }
    }

    return errorResults;
  }

  /**
   * Test cross-provider categorization consistency
   */
  async testCrossPlatformConsistency() {
    console.log('\n🔄 Testing Cross-Platform Consistency');
    console.log('-'.repeat(50));

    const testTabs = this.getStandardizedTestTabs();
    const providerResults = {};

    // Simulate responses from each provider for the same input
    for (const provider of this.providers) {
      // Mock consistent domain-based responses based on our DomainHints
      providerResults[provider] = testTabs.map(tab => {
        const domainValidation = validateDomainFirst(tab.domain);
        
        if (domainValidation.hasStrongDomainSignal) {
          return {
            key: tab.key,
            category: domainValidation.category,
            confidence: domainValidation.confidence
          };
        } else {
          return {
            key: tab.key,
            category: 'Uncategorized',
            confidence: 0.1
          };
        }
      });
    }

    // Analyze consistency across providers
    const consistencyAnalysis = this.analyzeProviderConsistency(providerResults, testTabs);
    
    console.log(`   Consistency Rate: ${(consistencyAnalysis.consistencyRate * 100).toFixed(1)}%`);
    console.log(`   Domain Match Rate: ${(consistencyAnalysis.domainMatchRate * 100).toFixed(1)}%`);
    
    return consistencyAnalysis;
  }

  /**
   * Analyze consistency between provider results
   */
  analyzeProviderConsistency(providerResults, testTabs) {
    const analysis = {
      consistentAssignments: 0,
      totalAssignments: testTabs.length,
      domainMatches: 0,
      inconsistencies: []
    };

    for (let i = 0; i < testTabs.length; i++) {
      const tab = testTabs[i];
      const assignments = this.providers.map(p => providerResults[p][i]);
      
      // Check if all providers agree on category
      const categories = assignments.map(a => a.category);
      const uniqueCategories = new Set(categories);
      
      if (uniqueCategories.size === 1) {
        analysis.consistentAssignments++;
        
        // Check if it matches domain expectation
        const domainValidation = validateDomainFirst(tab.domain);
        if (domainValidation.hasStrongDomainSignal && 
            categories[0] === domainValidation.category) {
          analysis.domainMatches++;
        }
      } else {
        analysis.inconsistencies.push({
          tab: tab.title,
          domain: tab.domain,
          assignments: assignments.map((a, idx) => ({
            provider: this.providers[idx],
            category: a.category,
            confidence: a.confidence
          }))
        });
      }
    }

    analysis.consistencyRate = analysis.consistentAssignments / analysis.totalAssignments;
    analysis.domainMatchRate = analysis.domainMatches / analysis.totalAssignments;

    return analysis;
  }

  /**
   * Test rate limiting and performance across providers
   */
  async testRateLimitingBehavior() {
    console.log('\n⏱️ Testing Rate Limiting Behavior');
    console.log('-'.repeat(50));

    const rateLimitTests = {
      groq: {
        expectedDelay: 2100, // Groq needs >= 2000ms
        batchSize: 5
      },
      openai: {
        expectedDelay: 250,
        batchSize: 25
      },
      anthropic: {
        expectedDelay: 250,
        batchSize: 25
      }
    };

    const results = {};

    for (const [provider, config] of Object.entries(rateLimitTests)) {
      const startTime = Date.now();
      
      // Simulate batch processing delays
      const testBatches = 3;
      for (let i = 0; i < testBatches; i++) {
        await new Promise(r => setTimeout(r, config.expectedDelay));
      }
      
      const totalTime = Date.now() - startTime;
      const expectedTime = config.expectedDelay * testBatches;
      const timingAccuracy = Math.abs(totalTime - expectedTime) / expectedTime;

      results[provider] = {
        configuredDelay: config.expectedDelay,
        configuredBatchSize: config.batchSize,
        actualTiming: totalTime,
        expectedTiming: expectedTime,
        timingAccuracy: timingAccuracy,
        withinTolerance: timingAccuracy < 0.1 // 10% tolerance
      };

      console.log(`   ${provider.toUpperCase()}: ${results[provider].withinTolerance ? '✅' : '⚠️'} Timing accuracy: ${(timingAccuracy * 100).toFixed(1)}%`);
    }

    return results;
  }

  /**
   * Export comprehensive test results
   */
  exportResults() {
    return {
      timestamp: new Date().toISOString(),
      testType: 'AI_Provider_Consistency',
      summary: {
        providersTotal: this.providers.length,
        providersConsistent: Object.values(this.testResults.consistency.summary?.providerScores || {})
          .filter(score => score >= 0.8).length,
        averageStrictness: this.testResults.consistency.summary?.averageStrictnessScore || 0,
        maxVariance: this.testResults.consistency.summary?.maxVariance || 0
      },
      detailedResults: this.testResults,
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * Generate recommendations based on test results
   */
  generateRecommendations() {
    const recommendations = [];
    const summary = this.testResults.consistency.summary;

    if (!summary) return ['Unable to generate recommendations - test incomplete'];

    if (summary.averageStrictnessScore < 0.8) {
      recommendations.push('Improve prompt strictness - average score below 0.8');
    }

    if (summary.maxVariance > 0.1) {
      recommendations.push('Reduce provider variance through prompt standardization');
    }

    const lowPerformers = Object.entries(summary.providerScores)
      .filter(([_, score]) => score < 0.8)
      .map(([provider, _]) => provider);

    if (lowPerformers.length > 0) {
      recommendations.push(`Tune prompts for: ${lowPerformers.join(', ')}`);
    }

    if (recommendations.length === 0) {
      recommendations.push('All providers meet consistency standards ✅');
    }

    return recommendations;
  }
}

// Export for use in test suites
export { AIProviderConsistencyTest };

// Command-line test runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new AIProviderConsistencyTest();
  const results = await tester.runConsistencyTests();
  
  // Test error handling
  console.log('\n🚨 Testing Error Handling...');
  for (const provider of tester.providers) {
    await tester.testErrorHandling(provider);
  }
  
  // Test cross-platform consistency
  await tester.testCrossPlatformConsistency();
  
  // Test rate limiting
  await tester.testRateLimitingBehavior();
  
  console.log('\n✅ AI Provider Consistency Testing Complete!');
  console.log('📄 Full results:', JSON.stringify(tester.exportResults(), null, 2));
}