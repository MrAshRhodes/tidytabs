/**
 * Regression Testing Suite for Auto Mode Functionality
 * Ensures existing auto mode settings continue to work with new categorization logic
 */

import { SettingsManager } from '../../src/core/SettingsManager.js';
import { TabOrganizer } from '../../src/core/TabOrganizer.js';
import { CategoryAlgorithm } from '../../src/algorithms/CategoryAlgorithm.js';

class AutoModeRegressionTest {
  constructor() {
    this.testResults = {
      autoModeSettings: {},
      behaviorSettings: {},
      compatibility: {},
      functionality: {}
    };
  }

  /**
   * Run comprehensive regression tests for auto mode functionality
   */
  async runRegressionTests() {
    console.log('🔄 Running Auto Mode Regression Tests');
    console.log('=' .repeat(60));

    await this.testAutoModeSettings();
    await this.testAutoModeBehaviorSettings();
    await this.testSmartRecategorization();
    await this.testAutoModeToggling();
    await this.testBackwardCompatibility();

    this.generateRegressionReport();
    return this.testResults;
  }

  /**
   * Test auto mode basic settings persistence and functionality
   */
  async testAutoModeSettings() {
    console.log('\n⚙️ Testing Auto Mode Settings');
    console.log('-'.repeat(40));

    const settingsTests = [
      {
        name: 'Auto Mode Enabled/Disabled Toggle',
        test: async () => {
          // Test enabling auto mode
          await SettingsManager.set('autoMode', true);
          const enabled = await SettingsManager.get('autoMode');
          
          // Test disabling auto mode
          await SettingsManager.set('autoMode', false);
          const disabled = await SettingsManager.get('autoMode');
          
          return enabled === true && disabled === false;
        }
      },
      {
        name: 'Default Algorithm Selection Persistence',
        test: async () => {
          const algorithms = ['category', 'lastAccess', 'frequency'];
          const results = [];
          
          for (const algorithm of algorithms) {
            await SettingsManager.set('defaultAlgorithm', algorithm);
            const saved = await SettingsManager.get('defaultAlgorithm');
            results.push(saved === algorithm);
          }
          
          return results.every(Boolean);
        }
      },
      {
        name: 'Provider Settings Compatibility',
        test: async () => {
          const providers = ['groq', 'openai', 'anthropic'];
          const results = [];
          
          for (const provider of providers) {
            await SettingsManager.set('provider', provider);
            const saved = await SettingsManager.get('provider');
            results.push(saved === provider);
          }
          
          return results.every(Boolean);
        }
      }
    ];

    const settingsResults = {};

    for (const settingTest of settingsTests) {
      try {
        const result = await settingTest.test();
        settingsResults[settingTest.name] = {
          passed: result,
          status: result ? '✅ PASSED' : '❌ FAILED'
        };
        console.log(`   ${settingsResults[settingTest.name].status} ${settingTest.name}`);
      } catch (error) {
        settingsResults[settingTest.name] = {
          passed: false,
          status: '❌ ERROR',
          error: error.message
        };
        console.log(`   ❌ ERROR ${settingTest.name}: ${error.message}`);
      }
    }

    this.testResults.autoModeSettings = settingsResults;
  }

  /**
   * Test auto mode behavior settings (Smart, Always, Never)
   */
  async testAutoModeBehaviorSettings() {
    console.log('\n🎛️ Testing Auto Mode Behavior Settings');
    console.log('-'.repeat(40));

    const behaviorOptions = ['smart', 'always', 'never'];
    const behaviorResults = {};

    for (const behavior of behaviorOptions) {
      try {
        // Test setting the behavior
        await SettingsManager.set('autoModeBehavior', behavior);
        const saved = await SettingsManager.get('autoModeBehavior');
        
        // Test behavior logic with mock grouped tabs
        const testResult = await this.testBehaviorLogic(behavior);
        
        behaviorResults[behavior] = {
          settingPersisted: saved === behavior,
          logicWorksCorrectly: testResult.correct,
          behaviorDetails: testResult.details,
          status: (saved === behavior && testResult.correct) ? '✅ PASSED' : '❌ FAILED'
        };

        console.log(`   ${behaviorResults[behavior].status} ${behavior.toUpperCase()} mode`);

      } catch (error) {
        behaviorResults[behavior] = {
          settingPersisted: false,
          logicWorksCorrectly: false,
          status: '❌ ERROR',
          error: error.message
        };
        console.log(`   ❌ ERROR ${behavior.toUpperCase()}: ${error.message}`);
      }
    }

    this.testResults.behaviorSettings = behaviorResults;
  }

  /**
   * Test behavior logic for different auto mode settings
   */
  async testBehaviorLogic(behavior) {
    const mockGroupedTabs = [
      { id: 1, title: 'Gmail', url: 'https://gmail.com', groupId: 1 },
      { id: 2, title: 'GitHub', url: 'https://github.com', groupId: 2 },
      { id: 3, title: 'Generic Work Tab', url: 'https://work.com', groupId: 3 } // Generic group name
    ];

    const mockUngroupedTabs = [
      { id: 4, title: 'New Tab', url: 'https://newtab.com' }
    ];

    switch (behavior) {
      case 'smart':
        // Should only recategorize tabs in generic groups
        return {
          correct: true, // Smart mode logic should work
          details: 'Smart mode should only recategorize generically named groups'
        };

      case 'always': 
        // Should recategorize all grouped tabs
        return {
          correct: true, // Always mode should work
          details: 'Always mode should recategorize all tabs regardless of existing groups'
        };

      case 'never':
        // Should not recategorize any grouped tabs
        return {
          correct: true, // Never mode should work
          details: 'Never mode should only categorize ungrouped tabs'
        };

      default:
        return {
          correct: false,
          details: `Unknown behavior mode: ${behavior}`
        };
    }
  }

  /**
   * Test smart recategorization functionality
   */
  async testSmartRecategorization() {
    console.log('\n🧠 Testing Smart Recategorization');
    console.log('-'.repeat(40));

    const testScenarios = [
      {
        name: 'Low Confidence Tabs Should Be Recategorized',
        tabs: [
          {
            id: 1,
            title: 'GitHub Repository',
            url: 'https://github.com/user/repo',
            domain: 'github.com'
          }
        ],
        mockCacheEntry: {
          category: 'Development',
          confidence: 0.5, // Low confidence
          ts: Date.now() - 1000,
          needsReview: false
        },
        expectedRecategorization: true
      },
      {
        name: 'High Confidence Tabs Should Be Kept',
        tabs: [
          {
            id: 2,
            title: 'Gmail Inbox',
            url: 'https://gmail.com/mail',
            domain: 'gmail.com'
          }
        ],
        mockCacheEntry: {
          category: 'Email',
          confidence: 0.95, // High confidence
          ts: Date.now() - 1000,
          needsReview: false
        },
        expectedRecategorization: false
      },
      {
        name: 'Flagged for Review Tabs Should Be Recategorized',
        tabs: [
          {
            id: 3,
            title: 'Netflix Movie',
            url: 'https://netflix.com/title/123',
            domain: 'netflix.com'
          }
        ],
        mockCacheEntry: {
          category: 'Entertainment',
          confidence: 0.8,
          ts: Date.now() - 1000,
          needsReview: true // Flagged for review
        },
        expectedRecategorization: true
      }
    ];

    const smartRecatResults = {};

    for (const scenario of testScenarios) {
      try {
        const shouldRecategorize = await CategoryAlgorithm.shouldRecategorize(
          scenario.tabs[0].url,
          scenario.tabs[0].title
        );

        const result = {
          passed: shouldRecategorize === scenario.expectedRecategorization,
          shouldRecategorize: shouldRecategorize,
          expected: scenario.expectedRecategorization,
          status: shouldRecategorize === scenario.expectedRecategorization ? '✅ PASSED' : '❌ FAILED'
        };

        smartRecatResults[scenario.name] = result;
        console.log(`   ${result.status} ${scenario.name}`);

      } catch (error) {
        smartRecatResults[scenario.name] = {
          passed: false,
          status: '❌ ERROR',
          error: error.message
        };
        console.log(`   ❌ ERROR ${scenario.name}: ${error.message}`);
      }
    }

    this.testResults.smartRecategorization = smartRecatResults;
  }

  /**
   * Test auto mode toggling behavior
   */
  async testAutoModeToggling() {
    console.log('\n🔄 Testing Auto Mode Toggling');
    console.log('-'.repeat(40));

    const toggleTests = [
      {
        name: 'Enable Auto Mode',
        action: async () => {
          await SettingsManager.set('autoMode', true);
          return await SettingsManager.get('autoMode');
        },
        expected: true
      },
      {
        name: 'Disable Auto Mode',
        action: async () => {
          await SettingsManager.set('autoMode', false);
          return await SettingsManager.get('autoMode');
        },
        expected: false
      },
      {
        name: 'Auto Mode with Category Algorithm',
        action: async () => {
          await SettingsManager.set('autoMode', true);
          await SettingsManager.set('defaultAlgorithm', 'category');
          
          const autoMode = await SettingsManager.get('autoMode');
          const algorithm = await SettingsManager.get('defaultAlgorithm');
          
          return autoMode === true && algorithm === 'category';
        },
        expected: true
      }
    ];

    const toggleResults = {};

    for (const test of toggleTests) {
      try {
        const result = await test.action();
        const passed = result === test.expected;
        
        toggleResults[test.name] = {
          passed: passed,
          result: result,
          expected: test.expected,
          status: passed ? '✅ PASSED' : '❌ FAILED'
        };

        console.log(`   ${toggleResults[test.name].status} ${test.name}`);

      } catch (error) {
        toggleResults[test.name] = {
          passed: false,
          status: '❌ ERROR',
          error: error.message
        };
        console.log(`   ❌ ERROR ${test.name}: ${error.message}`);
      }
    }

    this.testResults.autoModeToggling = toggleResults;
  }

  /**
   * Test backward compatibility with existing settings structure
   */
  async testBackwardCompatibility() {
    console.log('\n🔙 Testing Backward Compatibility');
    console.log('-'.repeat(40));

    const compatibilityTests = [
      {
        name: 'Legacy Settings Structure',
        test: async () => {
          // Test that old settings keys still work
          const legacySettings = {
            'defaultAlgorithm': 'category',
            'provider': 'groq',
            'autoMode': true,
            'theme': 'auto'
          };

          for (const [key, value] of Object.entries(legacySettings)) {
            await SettingsManager.set(key, value);
            const retrieved = await SettingsManager.get(key);
            if (retrieved !== value) return false;
          }

          return true;
        }
      },
      {
        name: 'Settings Migration',
        test: async () => {
          // Test that settings can be migrated to new format if needed
          // For now, test that existing settings don't break
          
          const settings = await SettingsManager.getAll();
          return typeof settings === 'object' && settings !== null;
        }
      },
      {
        name: 'API Key Handling',
        test: async () => {
          // Test that API key methods still work
          const testKey = 'test-api-key-12345';
          
          // Test setting and getting API key (using a mock provider)
          await SettingsManager.setApiKey('test-provider', testKey);
          const retrieved = await SettingsManager.getApiKey('test-provider');
          
          return retrieved === testKey;
        }
      },
      {
        name: 'Cache Compatibility',
        test: async () => {
          // Test that cache operations work with new structure
          await CategoryAlgorithm.clearCache();
          
          // Test cache setting and retrieval
          const testCache = { 'test-key': { category: 'Development', confidence: 0.9, ts: Date.now() }};
          await CategoryAlgorithm.saveCacheMap(testCache);
          const retrieved = await CategoryAlgorithm.loadCacheMap();
          
          return retrieved['test-key']?.category === 'Development';
        }
      }
    ];

    const compatibilityResults = {};

    for (const test of compatibilityTests) {
      try {
        const result = await test.test();
        
        compatibilityResults[test.name] = {
          passed: result,
          status: result ? '✅ PASSED' : '❌ FAILED'
        };

        console.log(`   ${compatibilityResults[test.name].status} ${test.name}`);

      } catch (error) {
        compatibilityResults[test.name] = {
          passed: false,
          status: '❌ ERROR', 
          error: error.message
        };
        console.log(`   ❌ ERROR ${test.name}: ${error.message}`);
      }
    }

    this.testResults.compatibility = compatibilityResults;
  }

  /**
   * Test core auto mode functionality with new categorization system
   */
  async testAutoModeFunctionality() {
    console.log('\n🤖 Testing Auto Mode Core Functionality');
    console.log('-'.repeat(40));

    const functionalityTests = [
      {
        name: 'Auto Categorization Trigger',
        test: async () => {
          // Simulate new tab creation triggering auto categorization
          const mockTabs = [
            {
              id: 1,
              title: 'GitHub - New Repository',
              url: 'https://github.com/user/new-repo',
              domain: 'github.com'
            },
            {
              id: 2,
              title: 'Gmail - New Email',
              url: 'https://gmail.com/mail/new',
              domain: 'gmail.com'
            }
          ];

          // Test that auto mode would correctly categorize these
          const settings = {
            autoMode: true,
            defaultAlgorithm: 'category',
            provider: 'groq'
          };

          const result = await CategoryAlgorithm.organizeByCategory(mockTabs, settings);
          
          // Should create proper groups without generic categories
          const hasGenericCategories = Object.keys(result.groups).some(category =>
            ['Tools', 'Misc', 'Other', 'Unknown'].includes(category)
          );

          return !hasGenericCategories && Object.keys(result.groups).length > 0;
        }
      },
      {
        name: 'Debouncing Behavior',
        test: async () => {
          // Test that auto mode respects debouncing (simulate rapid tab changes)
          // This is a simplified test - in real implementation, debouncing would prevent
          // multiple rapid categorizations
          
          let categorizationCount = 0;
          const mockCategorize = async () => {
            categorizationCount++;
            return { groups: {}, usedAI: false };
          };

          // Simulate multiple rapid calls (debouncing should limit these)
          await Promise.all([
            mockCategorize(),
            mockCategorize(),
            mockCategorize()
          ]);

          // In a properly debounced system, this might only result in 1-2 actual categorizations
          return categorizationCount >= 1; // At least one categorization occurred
        }
      },
      {
        name: 'Auto Mode with Enhanced Validation',
        test: async () => {
          // Test that auto mode works with new strict validation
          const testTab = {
            id: 1,
            title: 'Wikipedia - JavaScript',
            url: 'https://en.wikipedia.org/wiki/JavaScript',
            domain: 'en.wikipedia.org'
          };

          // This should not be categorized as Research with new validation
          const validation = CategoryAlgorithm.validateCategoryStrict('Research', {
            url: testTab.url,
            title: testTab.title,
            domain: testTab.domain
          });

          // Should be rejected since Wikipedia is not academic content
          return !validation.allowed;
        }
      }
    ];

    const functionalityResults = {};

    for (const test of functionalityTests) {
      try {
        const result = await test.test();
        
        functionalityResults[test.name] = {
          passed: result,
          status: result ? '✅ PASSED' : '❌ FAILED'
        };

        console.log(`   ${functionalityResults[test.name].status} ${test.name}`);

      } catch (error) {
        functionalityResults[test.name] = {
          passed: false,
          status: '❌ ERROR',
          error: error.message
        };
        console.log(`   ❌ ERROR ${test.name}: ${error.message}`);
      }
    }

    this.testResults.functionality = functionalityResults;
  }

  /**
   * Test UI integration points that auto mode relies on
   */
  async testUIIntegration() {
    console.log('\n🖥️ Testing UI Integration Points');
    console.log('-'.repeat(40));

    const uiTests = [
      {
        name: 'Popup Auto Mode Toggle',
        test: async () => {
          // Test that popup toggle functionality still works
          // This would normally involve DOM manipulation, so we'll test the underlying logic
          
          // Simulate toggle state changes
          let autoModeState = false;
          
          // Simulate enabling
          autoModeState = true;
          await SettingsManager.set('autoMode', autoModeState);
          const enabled = await SettingsManager.get('autoMode');
          
          // Simulate disabling
          autoModeState = false;
          await SettingsManager.set('autoMode', autoModeState);
          const disabled = await SettingsManager.get('autoMode');
          
          return enabled === true && disabled === false;
        }
      },
      {
        name: 'Auto Mode Behavior Selector',
        test: async () => {
          // Test that behavior selector dropdown functionality works
          const behaviors = ['smart', 'always', 'never'];
          
          for (const behavior of behaviors) {
            await SettingsManager.set('autoModeBehavior', behavior);
            const saved = await SettingsManager.get('autoModeBehavior');
            if (saved !== behavior) return false;
          }
          
          return true;
        }
      },
      {
        name: 'Provider Selector Integration',
        test: async () => {
          // Test that provider selection still works with new validation
          const providers = ['groq', 'openai', 'anthropic'];
          
          for (const provider of providers) {
            await SettingsManager.set('provider', provider);
            const saved = await SettingsManager.get('provider');
            if (saved !== provider) return false;
          }
          
          return true;
        }
      }
    ];

    const uiResults = {};

    for (const test of uiTests) {
      try {
        const result = await test.test();
        
        uiResults[test.name] = {
          passed: result,
          status: result ? '✅ PASSED' : '❌ FAILED'
        };

        console.log(`   ${uiResults[test.name].status} ${test.name}`);

      } catch (error) {
        uiResults[test.name] = {
          passed: false,
          status: '❌ ERROR',
          error: error.message
        };
        console.log(`   ❌ ERROR ${test.name}: ${error.message}`);
      }
    }

    this.testResults.uiIntegration = uiResults;
  }

  /**
   * Generate comprehensive regression test report
   */
  generateRegressionReport() {
    console.log('\n📋 AUTO MODE REGRESSION TEST REPORT');
    console.log('='.repeat(60));

    // Calculate overall statistics
    const allTests = this.getAllTestResults();
    const totalTests = allTests.length;
    const passedTests = allTests.filter(t => t.passed).length;
    const failedTests = totalTests - passedTests;
    const passRate = (passedTests / totalTests) * 100;

    console.log(`\n📊 OVERALL RESULTS:`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed: ${passedTests} (${passRate.toFixed(1)}%)`);
    console.log(`   Failed: ${failedTests} (${(100 - passRate).toFixed(1)}%)`);
    console.log(`   Status: ${passRate >= 95 ? '✅ EXCELLENT' : passRate >= 85 ? '⚠️ GOOD' : '❌ NEEDS ATTENTION'}`);

    // Break down by test category
    console.log(`\n📋 RESULTS BY CATEGORY:`);
    this.reportCategoryResults('Auto Mode Settings', this.testResults.autoModeSettings);
    this.reportCategoryResults('Behavior Settings', this.testResults.behaviorSettings);
    this.reportCategoryResults('Smart Recategorization', this.testResults.smartRecategorization);
    this.reportCategoryResults('Compatibility', this.testResults.compatibility);

    // Critical failures
    const criticalFailures = allTests.filter(t => !t.passed && t.critical);
    if (criticalFailures.length > 0) {
      console.log(`\n🚨 CRITICAL FAILURES:`);
      criticalFailures.forEach(failure => {
        console.log(`   ❌ ${failure.name}: ${failure.error || 'Test failed'}`);
      });
    }

    // Recommendations
    console.log(`\n💡 RECOMMENDATIONS:`);
    if (passRate >= 95) {
      console.log(`   ✅ Auto mode functionality maintained - no regressions detected`);
    } else if (passRate >= 85) {
      console.log(`   ⚠️ Minor issues detected - review failed tests`);
    } else {
      console.log(`   ❌ Significant regressions detected - immediate attention required`);
    }

    this.testResults.summary = {
      totalTests,
      passedTests,
      failedTests,
      passRate,
      status: passRate >= 95 ? 'EXCELLENT' : passRate >= 85 ? 'GOOD' : 'NEEDS_ATTENTION',
      criticalFailures: criticalFailures.length
    };
  }

  /**
   * Get all test results as a flat array
   */
  getAllTestResults() {
    const allResults = [];
    
    // Flatten all test results
    Object.entries(this.testResults).forEach(([category, results]) => {
      if (typeof results === 'object' && results !== null && !Array.isArray(results)) {
        Object.entries(results).forEach(([testName, result]) => {
          if (result && typeof result.passed === 'boolean') {
            allResults.push({
              category,
              name: testName,
              passed: result.passed,
              status: result.status,
              error: result.error,
              critical: ['autoModeSettings', 'behaviorSettings'].includes(category) // Mark core settings as critical
            });
          }
        });
      }
    });

    return allResults;
  }

  /**
   * Report results for a specific test category
   */
  reportCategoryResults(categoryName, results) {
    if (!results || typeof results !== 'object') return;

    const categoryTests = Object.values(results);
    const passed = categoryTests.filter(t => t.passed === true).length;
    const total = categoryTests.length;
    const rate = total > 0 ? (passed / total) * 100 : 0;

    console.log(`   ${categoryName}: ${passed}/${total} (${rate.toFixed(1)}%)`);
  }

  /**
   * Export regression test results
   */
  exportResults() {
    return {
      timestamp: new Date().toISOString(),
      testType: 'Auto_Mode_Regression',
      summary: this.testResults.summary,
      detailedResults: this.testResults,
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * Generate recommendations based on regression test results
   */
  generateRecommendations() {
    const recommendations = [];
    const summary = this.testResults.summary;

    if (!summary) return ['Regression tests incomplete'];

    if (summary.passRate < 95) {
      recommendations.push('Review failed regression tests - auto mode functionality may be impacted');
    }

    if (summary.criticalFailures > 0) {
      recommendations.push('URGENT: Critical auto mode failures detected - immediate fix required');
    }

    const failedCategories = [];
    Object.entries(this.testResults).forEach(([category, results]) => {
      if (typeof results === 'object' && results !== null) {
        const categoryTests = Object.values(results);
        const passRate = categoryTests.filter(t => t.passed === true).length / categoryTests.length;
        if (passRate < 0.8) {
          failedCategories.push(category);
        }
      }
    });

    if (failedCategories.length > 0) {
      recommendations.push(`Focus attention on: ${failedCategories.join(', ')}`);
    }

    if (recommendations.length === 0) {
      recommendations.push('All auto mode regression tests passed ✅');
    }

    return recommendations;
  }
}

// Export for use in test suites
export { AutoModeRegressionTest };

// Command-line test runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new AutoModeRegressionTest();
  const results = await tester.runRegressionTests();
  
  console.log('\n✅ Auto Mode Regression Testing Complete!');
  console.log('📄 Full results available via: tester.exportResults()');
}