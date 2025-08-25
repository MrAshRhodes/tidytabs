/**
 * Before/After Comparison Testing Framework
 * Validates improvements in AI categorization by comparing old vs new behavior
 */

import { CategoryAlgorithm } from '../src/algorithms/CategoryAlgorithm.js';
import { validateDomainFirst } from '../src/llm/PromptTemplates.js';
import problematicTabsData from './data/problematic-tabs.json' assert { type: 'json' };

class CategorizationComparisonTest {
  constructor() {
    this.results = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      improvements: 0,
      regressions: 0,
      details: []
    };
  }

  /**
   * Run comprehensive before/after comparison tests
   */
  async runComparisonTests() {
    console.log('🧪 Starting AI Categorization Improvement Validation Tests');
    console.log('=' .repeat(60));

    // Test each category of problematic examples
    for (const testCategory of problematicTabsData.testCases) {
      await this.testCategoryGroup(testCategory);
    }

    // Generate final report
    this.generateComparisonReport();
    return this.results;
  }

  /**
   * Test a group of related tabs (e.g., research bias examples)
   */
  async testCategoryGroup(testCategory) {
    console.log(`\n📋 Testing: ${testCategory.category}`);
    console.log(`📄 ${testCategory.description}`);
    console.log('-'.repeat(50));

    for (const tab of testCategory.tabs) {
      await this.testSingleTab(tab, testCategory.category);
    }
  }

  /**
   * Test a single tab against expected behavior
   */
  async testSingleTab(tab, groupCategory) {
    this.results.totalTests++;
    
    console.log(`\n🔍 Testing: ${tab.title}`);
    console.log(`   Domain: ${tab.domain}`);
    console.log(`   Expected: ${tab.expectedCategory}`);
    
    try {
      // Test new strict validation system
      const validation = CategoryAlgorithm.validateCategoryStrict(
        tab.problematicCategory, 
        {
          url: tab.url,
          title: tab.title,
          domain: tab.domain
        }
      );

      // Test domain-first validation
      const domainValidation = validateDomainFirst(tab.domain, tab.title);

      // Test confidence scoring
      const confidence = CategoryAlgorithm.getCategoryConfidence(
        tab.expectedCategory,
        tab,
        'domain_exact'
      );

      // Evaluate results
      const testResult = {
        tab: tab.title,
        domain: tab.domain,
        expectedCategory: tab.expectedCategory,
        problematicCategory: tab.problematicCategory,
        validationPassed: !validation.allowed || validation.suggestUncategorized,
        domainValidation: domainValidation,
        confidence: confidence,
        groupCategory: groupCategory,
        reason: tab.reason
      };

      // Determine if this is an improvement
      if (testResult.validationPassed && domainValidation.hasStrongDomainSignal) {
        this.results.improvements++;
        testResult.status = '✅ IMPROVED';
        console.log(`   ✅ IMPROVED: Strict validation correctly handles this case`);
      } else if (testResult.validationPassed) {
        this.results.passed++;
        testResult.status = '✅ PASSED';
        console.log(`   ✅ PASSED: Validation works correctly`);
      } else {
        this.results.failed++;
        testResult.status = '❌ FAILED';
        console.log(`   ❌ FAILED: Issue still exists`);
      }

      console.log(`   Confidence: ${confidence.toFixed(2)}`);
      console.log(`   Validation: ${validation.allowed ? 'ALLOWED' : 'REJECTED'}`);
      if (domainValidation.hasStrongDomainSignal) {
        console.log(`   Domain Signal: ${domainValidation.category} (confidence: ${domainValidation.confidence})`);
      }

      this.results.details.push(testResult);

    } catch (error) {
      this.results.failed++;
      console.log(`   ❌ ERROR: ${error.message}`);
      
      this.results.details.push({
        tab: tab.title,
        domain: tab.domain,
        status: '❌ ERROR',
        error: error.message
      });
    }
  }

  /**
   * Generate comprehensive comparison report
   */
  generateComparisonReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 AI CATEGORIZATION IMPROVEMENT TEST RESULTS');
    console.log('='.repeat(60));

    // Overall statistics
    console.log(`\n📈 OVERALL STATISTICS:`);
    console.log(`   Total Tests: ${this.results.totalTests}`);
    console.log(`   Improvements: ${this.results.improvements} (${((this.results.improvements / this.results.totalTests) * 100).toFixed(1)}%)`);
    console.log(`   Passed: ${this.results.passed} (${((this.results.passed / this.results.totalTests) * 100).toFixed(1)}%)`);
    console.log(`   Failed: ${this.results.failed} (${((this.results.failed / this.results.totalTests) * 100).toFixed(1)}%)`);
    console.log(`   Success Rate: ${(((this.results.improvements + this.results.passed) / this.results.totalTests) * 100).toFixed(1)}%`);

    // Group by test category
    console.log(`\n📋 RESULTS BY CATEGORY:`);
    const groupedResults = this.groupResultsByCategory();
    for (const [category, results] of Object.entries(groupedResults)) {
      const improved = results.filter(r => r.status === '✅ IMPROVED').length;
      const passed = results.filter(r => r.status === '✅ PASSED').length; 
      const failed = results.filter(r => r.status === '❌ FAILED').length;
      
      console.log(`   ${category}:`);
      console.log(`     Improved: ${improved}, Passed: ${passed}, Failed: ${failed}`);
    }

    // Key improvements
    console.log(`\n🎯 KEY IMPROVEMENTS:`);
    const improvements = this.results.details.filter(r => r.status === '✅ IMPROVED');
    improvements.forEach(improvement => {
      console.log(`   ✅ ${improvement.tab} - ${improvement.reason}`);
    });

    // Remaining issues
    const failures = this.results.details.filter(r => r.status === '❌ FAILED');
    if (failures.length > 0) {
      console.log(`\n⚠️  REMAINING ISSUES:`);
      failures.forEach(failure => {
        console.log(`   ❌ ${failure.tab} - Still needs attention`);
      });
    }

    // Confidence scoring analysis
    console.log(`\n📊 CONFIDENCE SCORING ANALYSIS:`);
    const avgConfidence = this.calculateAverageConfidence();
    console.log(`   Average Confidence: ${avgConfidence.toFixed(3)}`);
    console.log(`   High Confidence (>0.9): ${this.countHighConfidence()}`);
    console.log(`   Medium Confidence (0.7-0.9): ${this.countMediumConfidence()}`);
    console.log(`   Low Confidence (<0.7): ${this.countLowConfidence()}`);
  }

  /**
   * Group test results by category for analysis
   */
  groupResultsByCategory() {
    const grouped = {};
    this.results.details.forEach(result => {
      if (!grouped[result.groupCategory]) {
        grouped[result.groupCategory] = [];
      }
      grouped[result.groupCategory].push(result);
    });
    return grouped;
  }

  /**
   * Calculate average confidence score
   */
  calculateAverageConfidence() {
    const confidenceScores = this.results.details
      .filter(r => typeof r.confidence === 'number')
      .map(r => r.confidence);
    
    if (confidenceScores.length === 0) return 0;
    
    return confidenceScores.reduce((sum, conf) => sum + conf, 0) / confidenceScores.length;
  }

  /**
   * Count high confidence assignments
   */
  countHighConfidence() {
    return this.results.details.filter(r => r.confidence > 0.9).length;
  }

  /**
   * Count medium confidence assignments
   */
  countMediumConfidence() {
    return this.results.details.filter(r => r.confidence >= 0.7 && r.confidence <= 0.9).length;
  }

  /**
   * Count low confidence assignments
   */
  countLowConfidence() {
    return this.results.details.filter(r => r.confidence < 0.7).length;
  }

  /**
   * Export results for further analysis
   */
  exportResults() {
    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: this.results.totalTests,
        improvements: this.results.improvements,
        passed: this.results.passed,
        failed: this.results.failed,
        successRate: ((this.results.improvements + this.results.passed) / this.results.totalTests) * 100
      },
      confidenceAnalysis: {
        average: this.calculateAverageConfidence(),
        high: this.countHighConfidence(),
        medium: this.countMediumConfidence(),
        low: this.countLowConfidence()
      },
      detailedResults: this.results.details,
      categoryBreakdown: this.groupResultsByCategory()
    };
  }
}

/**
 * Performance comparison between old and new categorization systems
 */
class PerformanceComparison {
  constructor() {
    this.metrics = {
      genericCategoryUsage: {
        before: 0,
        after: 0
      },
      domainAccuracy: {
        before: 0,
        after: 0
      },
      uncategorizedRate: {
        before: 0,
        after: 0
      },
      averageConfidence: {
        before: 0,
        after: 0
      }
    };
  }

  /**
   * Simulate old categorization behavior for comparison
   */
  simulateOldBehavior(tabs) {
    // Simulate old behavior that allowed generic categories
    const oldResults = tabs.map(tab => {
      const domain = tab.domain.toLowerCase();
      
      // Old system would often default to Research, Tools, etc.
      if (domain.includes('wikipedia') || 
          domain.includes('medium') || 
          tab.title.toLowerCase().includes('tutorial')) {
        return { category: 'Research', confidence: 0.6 }; // Generic assignment
      }
      
      if (domain.includes('github')) {
        return { category: 'Development', confidence: 0.8 };
      }
      
      // Old system would guess with generic categories
      return { category: 'Tools', confidence: 0.5 }; // Generic fallback
    });

    return oldResults;
  }

  /**
   * Test new categorization behavior
   */
  async testNewBehavior(tabs) {
    const newResults = [];
    
    for (const tab of tabs) {
      // Test domain-first validation
      const domainValidation = validateDomainFirst(tab.domain, tab.title);
      
      if (domainValidation.hasStrongDomainSignal) {
        newResults.push({
          category: domainValidation.category,
          confidence: domainValidation.confidence
        });
      } else {
        // New system assigns Uncategorized instead of guessing
        newResults.push({
          category: 'Uncategorized',
          confidence: 0.1
        });
      }
    }

    return newResults;
  }

  /**
   * Run performance comparison analysis
   */
  async runComparison() {
    console.log('\n🔄 Running Performance Comparison Analysis');
    console.log('-'.repeat(50));

    const testTabs = problematicTabsData.testCases.flatMap(category => category.tabs);
    
    const oldResults = this.simulateOldBehavior(testTabs);
    const newResults = await this.testNewBehavior(testTabs);

    // Calculate metrics
    this.calculateMetrics(testTabs, oldResults, newResults);
    this.generatePerformanceReport();

    return this.metrics;
  }

  /**
   * Calculate improvement metrics
   */
  calculateMetrics(tabs, oldResults, newResults) {
    const genericCategories = ['Research', 'Tools', 'Utilities', 'Misc', 'Other'];
    
    // Generic category usage
    this.metrics.genericCategoryUsage.before = oldResults.filter(r => 
      genericCategories.includes(r.category)
    ).length;
    
    this.metrics.genericCategoryUsage.after = newResults.filter(r => 
      genericCategories.includes(r.category)
    ).length;

    // Domain accuracy (tabs with known domains correctly categorized)
    const knownDomainTabs = tabs.filter(tab => tab.expectedCategory !== 'Uncategorized');
    
    this.metrics.domainAccuracy.before = oldResults.filter((r, i) => 
      knownDomainTabs[i] && r.category === knownDomainTabs[i].expectedCategory
    ).length;
    
    this.metrics.domainAccuracy.after = newResults.filter((r, i) => 
      tabs[i] && r.category === tabs[i].expectedCategory
    ).length;

    // Uncategorized rate
    this.metrics.uncategorizedRate.before = oldResults.filter(r => 
      r.category === 'Uncategorized'
    ).length;
    
    this.metrics.uncategorizedRate.after = newResults.filter(r => 
      r.category === 'Uncategorized'
    ).length;

    // Average confidence
    this.metrics.averageConfidence.before = 
      oldResults.reduce((sum, r) => sum + r.confidence, 0) / oldResults.length;
    
    this.metrics.averageConfidence.after = 
      newResults.reduce((sum, r) => sum + r.confidence, 0) / newResults.length;
  }

  /**
   * Generate performance improvement report
   */
  generatePerformanceReport() {
    console.log('\n📊 PERFORMANCE COMPARISON REPORT');
    console.log('='.repeat(50));

    // Generic category reduction
    const genericReduction = this.metrics.genericCategoryUsage.before - this.metrics.genericCategoryUsage.after;
    const genericReductionPct = (genericReduction / this.metrics.genericCategoryUsage.before) * 100;
    
    console.log(`\n🎯 GENERIC CATEGORY ELIMINATION:`);
    console.log(`   Before: ${this.metrics.genericCategoryUsage.before} generic assignments`);
    console.log(`   After: ${this.metrics.genericCategoryUsage.after} generic assignments`);
    console.log(`   Reduction: ${genericReduction} (${genericReductionPct.toFixed(1)}% improvement)`);

    // Domain accuracy improvement
    const accuracyImprovement = this.metrics.domainAccuracy.after - this.metrics.domainAccuracy.before;
    
    console.log(`\n🎯 DOMAIN ACCURACY:`);
    console.log(`   Before: ${this.metrics.domainAccuracy.before} correct`);
    console.log(`   After: ${this.metrics.domainAccuracy.after} correct`);
    console.log(`   Improvement: ${accuracyImprovement > 0 ? '+' : ''}${accuracyImprovement} assignments`);

    // Uncategorized handling
    console.log(`\n🎯 UNCATEGORIZED HANDLING:`);
    console.log(`   Before: ${this.metrics.uncategorizedRate.before} uncategorized`);
    console.log(`   After: ${this.metrics.uncategorizedRate.after} uncategorized`);
    console.log(`   Note: Higher "after" rate is GOOD - indicates less guessing`);

    // Confidence scoring
    const confidenceImprovement = this.metrics.averageConfidence.after - this.metrics.averageConfidence.before;
    
    console.log(`\n🎯 CONFIDENCE SCORING:`);
    console.log(`   Before: ${this.metrics.averageConfidence.before.toFixed(3)} average confidence`);
    console.log(`   After: ${this.metrics.averageConfidence.after.toFixed(3)} average confidence`);
    console.log(`   Change: ${confidenceImprovement > 0 ? '+' : ''}${confidenceImprovement.toFixed(3)}`);

    // Success metrics
    const successRate = ((this.results.improvements + this.results.passed) / this.results.totalTests) * 100;
    
    console.log(`\n🏆 SUCCESS METRICS:`);
    console.log(`   Overall Success Rate: ${successRate.toFixed(1)}%`);
    console.log(`   Improvements Detected: ${this.results.improvements}`);
    console.log(`   Tests Passed: ${this.results.passed}`);
    console.log(`   Tests Failed: ${this.results.failed}`);
  }
}

// Export for use in test suites
export { CategorizationComparisonTest, PerformanceComparison };

// Command-line test runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new CategorizationComparisonTest();
  const results = await tester.runComparisonTests();
  
  const performanceTest = new PerformanceComparison();
  const perfResults = await performanceTest.runComparison();
  
  console.log('\n✅ Comparison testing complete!');
  console.log(`   Export results with: JSON.stringify(results, null, 2)`);
}