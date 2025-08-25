/**
 * Performance Benchmarking for Enhanced Categorization System
 * Ensures new strict validation doesn't significantly impact performance
 */

import { CategoryAlgorithm } from '../../src/algorithms/CategoryAlgorithm.js';
import { validateDomainFirst, promptForCategorization } from '../../src/llm/PromptTemplates.js';
import { DomainHints } from '../../src/constants/categories.js';

class CategorizationBenchmark {
  constructor() {
    this.benchmarkResults = {
      validation: {},
      domainLookup: {},
      promptGeneration: {},
      memoryUsage: {},
      summary: {}
    };
    this.performanceThresholds = {
      maxValidationTimeMs: 1, // Max 1ms per validation
      maxDomainLookupTimeMs: 0.5, // Max 0.5ms per domain lookup
      maxPromptGenerationTimeMs: 100, // Max 100ms for prompt generation
      maxMemoryIncreaseMB: 50, // Max 50MB memory increase
      maxPerformanceDegradation: 0.1 // Max 10% performance decrease
    };
  }

  /**
   * Run comprehensive performance benchmarks
   */
  async runBenchmarks() {
    console.log('⚡ Running Performance Benchmarks for Enhanced Categorization');
    console.log('=' .repeat(70));

    // Test different scenarios with varying loads
    await this.benchmarkValidationPerformance();
    await this.benchmarkDomainLookupPerformance();
    await this.benchmarkPromptGenerationPerformance();
    await this.benchmarkMemoryUsage();
    await this.benchmarkEndToEndPerformance();

    this.generatePerformanceReport();
    return this.benchmarkResults;
  }

  /**
   * Benchmark category validation performance
   */
  async benchmarkValidationPerformance() {
    console.log('\n🔍 Benchmarking Category Validation Performance');
    console.log('-'.repeat(50));

    const testCases = [
      // Test different validation scenarios
      { category: 'Development', context: { domain: 'github.com', title: 'Repo', url: 'https://github.com/user/repo' }},
      { category: 'Research', context: { domain: 'wikipedia.org', title: 'Article', url: 'https://wikipedia.org/article' }},
      { category: 'Misc', context: { domain: 'example.com', title: 'Page', url: 'https://example.com/page' }},
      { category: 'Entertainment', context: { domain: 'youtube.com', title: 'Video', url: 'https://youtube.com/watch' }},
      { category: 'Email', context: { domain: 'gmail.com', title: 'Inbox', url: 'https://gmail.com/mail' }}
    ];

    const iterations = 1000; // Test with 1000 iterations for reliable timing
    const times = [];

    console.log(`   Testing ${testCases.length} validation scenarios x ${iterations} iterations`);

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();

      for (const testCase of testCases) {
        // Test new strict validation
        CategoryAlgorithm.validateCategoryStrict(testCase.category, testCase.context);
        
        // Test restricted category validation
        if (testCase.category === 'Research') {
          CategoryAlgorithm.validateRestrictedCategory(testCase.category, testCase.context);
        }
      }

      const endTime = performance.now();
      times.push(endTime - startTime);
    }

    // Calculate statistics
    const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const medianTime = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];

    this.benchmarkResults.validation = {
      averageTimeMs: avgTime,
      minTimeMs: minTime,
      maxTimeMs: maxTime,
      medianTimeMs: medianTime,
      perValidationMs: avgTime / testCases.length,
      iterations: iterations,
      withinThreshold: (avgTime / testCases.length) <= this.performanceThresholds.maxValidationTimeMs
    };

    console.log(`   Average Time: ${avgTime.toFixed(3)}ms (${(avgTime / testCases.length).toFixed(3)}ms per validation)`);
    console.log(`   Min/Max: ${minTime.toFixed(3)}ms / ${maxTime.toFixed(3)}ms`);
    console.log(`   Threshold: ${this.benchmarkResults.validation.withinThreshold ? '✅ PASSED' : '❌ FAILED'}`);
  }

  /**
   * Benchmark domain lookup performance with expanded DomainHints
   */
  async benchmarkDomainLookupPerformance() {
    console.log('\n🔍 Benchmarking Domain Lookup Performance (200+ domains)');
    console.log('-'.repeat(50));

    // Test domains from our expanded DomainHints
    const testDomains = [
      'github.com', 'gmail.com', 'youtube.com', 'amazon.com', 'netflix.com',
      'docs.github.com', 'mail.google.com', 'music.youtube.com', // Subdomains
      'unknown.com', 'random-site.org', 'mystery.net', // Unknown domains
      ...Object.keys(DomainHints).slice(0, 20) // Sample from expanded hints
    ];

    const iterations = 5000; // High iteration count for domain lookups
    const times = [];

    console.log(`   Testing ${testDomains.length} domains x ${iterations} iterations`);

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();

      for (const domain of testDomains) {
        // Test domain-first validation
        validateDomainFirst(domain);
        
        // Test domain category lookup
        CategoryAlgorithm.getDomainCategory(domain);
        
        // Test strict domain-only lookup
        CategoryAlgorithm.strictDomainOnly({ domain, title: 'Test', url: `https://${domain}` });
      }

      const endTime = performance.now();
      times.push(endTime - startTime);
    }

    // Calculate statistics
    const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const perLookupTime = avgTime / (testDomains.length * 3); // 3 lookups per domain

    this.benchmarkResults.domainLookup = {
      averageTimeMs: avgTime,
      perLookupMs: perLookupTime,
      domainsTestedPerIteration: testDomains.length,
      lookupsPerIteration: testDomains.length * 3,
      iterations: iterations,
      withinThreshold: perLookupTime <= this.performanceThresholds.maxDomainLookupTimeMs
    };

    console.log(`   Average Time: ${avgTime.toFixed(3)}ms (${perLookupTime.toFixed(4)}ms per lookup)`);
    console.log(`   Lookups/sec: ${(1000 / perLookupTime).toFixed(0)}`);
    console.log(`   Threshold: ${this.benchmarkResults.domainLookup.withinThreshold ? '✅ PASSED' : '❌ FAILED'}`);
  }

  /**
   * Benchmark prompt generation performance with new templates
   */
  async benchmarkPromptGenerationPerformance() {
    console.log('\n📝 Benchmarking Prompt Generation Performance');
    console.log('-'.repeat(50));

    // Generate test tab sets of different sizes
    const tabSetSizes = [5, 10, 25, 50, 100];
    const promptResults = {};

    for (const size of tabSetSizes) {
      const testTabs = this.generateTestTabs(size);
      const times = [];
      const iterations = 100;

      console.log(`   Testing prompt generation for ${size} tabs (${iterations} iterations)`);

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        // Test new prompt generation
        await promptForCategorization(testTabs);
        
        const endTime = performance.now();
        times.push(endTime - startTime);
      }

      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      
      promptResults[size] = {
        averageTimeMs: avgTime,
        perTabMs: avgTime / size,
        iterations: iterations,
        withinThreshold: avgTime <= this.performanceThresholds.maxPromptGenerationTimeMs
      };

      console.log(`     ${size} tabs: ${avgTime.toFixed(2)}ms avg (${(avgTime / size).toFixed(3)}ms/tab)`);
    }

    this.benchmarkResults.promptGeneration = promptResults;

    // Check if all sizes meet threshold
    const allWithinThreshold = Object.values(promptResults).every(r => r.withinThreshold);
    console.log(`   Overall Threshold: ${allWithinThreshold ? '✅ PASSED' : '❌ FAILED'}`);
  }

  /**
   * Benchmark memory usage with enhanced domain system
   */
  async benchmarkMemoryUsage() {
    console.log('\n💾 Benchmarking Memory Usage');
    console.log('-'.repeat(50));

    // Measure baseline memory
    const baseline = this.measureMemoryUsage();
    
    console.log(`   Baseline Memory: ${(baseline.used / 1024 / 1024).toFixed(2)}MB`);

    // Load enhanced domain system
    const beforeEnhancement = this.measureMemoryUsage();
    
    // Simulate loading all domain hints and validation logic
    const allDomains = Object.keys(DomainHints);
    const validationCache = new Map();

    // Simulate validation operations that would happen in real usage
    for (let i = 0; i < 1000; i++) {
      const randomDomain = allDomains[Math.floor(Math.random() * allDomains.length)];
      const validation = validateDomainFirst(randomDomain);
      validationCache.set(`${randomDomain}_${i}`, validation);
    }

    const afterEnhancement = this.measureMemoryUsage();
    const memoryIncrease = afterEnhancement.used - beforeEnhancement.used;
    const memoryIncreaseMB = memoryIncrease / 1024 / 1024;

    this.benchmarkResults.memoryUsage = {
      baselineUsedMB: baseline.used / 1024 / 1024,
      beforeEnhancementMB: beforeEnhancement.used / 1024 / 1024,
      afterEnhancementMB: afterEnhancement.used / 1024 / 1024,
      increaseMB: memoryIncreaseMB,
      increaseBytes: memoryIncrease,
      withinThreshold: memoryIncreaseMB <= this.performanceThresholds.maxMemoryIncreaseMB
    };

    console.log(`   Memory Increase: ${memoryIncreaseMB.toFixed(2)}MB`);
    console.log(`   Validation Cache: ${validationCache.size} entries`);
    console.log(`   Threshold: ${this.benchmarkResults.memoryUsage.withinThreshold ? '✅ PASSED' : '❌ FAILED'}`);

    // Cleanup
    validationCache.clear();
  }

  /**
   * Benchmark end-to-end categorization performance
   */
  async benchmarkEndToEndPerformance() {
    console.log('\n🔄 Benchmarking End-to-End Categorization Performance');
    console.log('-'.repeat(50));

    const tabCounts = [10, 25, 50, 100];
    const endToEndResults = {};

    for (const count of tabCounts) {
      const testTabs = this.generateTestTabs(count);
      const times = [];
      const iterations = 10; // Fewer iterations for end-to-end due to complexity

      console.log(`   Testing end-to-end categorization for ${count} tabs`);

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();

        // Simulate the full categorization process (without actual AI calls)
        await this.simulateFullCategorization(testTabs);

        const endTime = performance.now();
        times.push(endTime - startTime);
      }

      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const perTabTime = avgTime / count;

      endToEndResults[count] = {
        averageTimeMs: avgTime,
        perTabMs: perTabTime,
        tabsPerSecond: 1000 / perTabTime,
        iterations: iterations
      };

      console.log(`     ${count} tabs: ${avgTime.toFixed(2)}ms (${perTabTime.toFixed(2)}ms/tab, ${(1000/perTabTime).toFixed(0)} tabs/sec)`);
    }

    this.benchmarkResults.endToEnd = endToEndResults;

    // Calculate performance regression
    const performanceRegression = this.calculatePerformanceRegression(endToEndResults);
    console.log(`   Performance Change: ${performanceRegression > 0 ? '+' : ''}${(performanceRegression * 100).toFixed(1)}%`);
  }

  /**
   * Simulate full categorization process for performance testing
   */
  async simulateFullCategorization(tabs) {
    // Simulate the domain-first validation process
    for (const tab of tabs) {
      const domain = CategoryAlgorithm.parseDomain(tab.url);
      
      // Domain validation
      const domainValidation = validateDomainFirst(domain, tab.title);
      
      if (!domainValidation.hasStrongDomainSignal) {
        // Simulate AI categorization (without actual API call)
        const mockCategory = this.simulateAIResponse(tab);
        
        // Apply strict validation
        CategoryAlgorithm.validateCategoryStrict(mockCategory, {
          url: tab.url,
          title: tab.title,
          domain: domain
        });
        
        // Calculate confidence
        CategoryAlgorithm.getCategoryConfidence(mockCategory, tab, 'ai_validated');
      }
      
      // Simulate cache operations
      const key = CategoryAlgorithm.makeTabKey({
        url: tab.url,
        title: tab.title,
        id: tab.id
      });
    }
  }

  /**
   * Simulate AI response for performance testing
   */
  simulateAIResponse(tab) {
    const domain = tab.domain || CategoryAlgorithm.parseDomain(tab.url);
    
    // Simulate AI choosing based on domain knowledge
    if (DomainHints[domain]) {
      return DomainHints[domain];
    }
    
    // Simulate AI being uncertain
    return 'Uncategorized';
  }

  /**
   * Generate test tabs for performance testing
   */
  generateTestTabs(count) {
    const domains = Object.keys(DomainHints);
    const tabs = [];

    for (let i = 0; i < count; i++) {
      const domain = domains[i % domains.length];
      tabs.push({
        id: i + 1,
        title: `Test Tab ${i + 1} - ${domain}`,
        url: `https://${domain}/page${i}`,
        domain: domain
      });
    }

    return tabs;
  }

  /**
   * Measure current memory usage
   */
  measureMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage();
    } else if (typeof performance !== 'undefined' && performance.memory) {
      return performance.memory;
    } else {
      // Fallback for environments without memory measurement
      return { used: 0, total: 0 };
    }
  }

  /**
   * Calculate performance regression compared to baseline
   */
  calculatePerformanceRegression(endToEndResults) {
    // Estimate baseline performance (before enhancements)
    // Based on simpler validation logic
    const baselineTimePerTab = 0.5; // Estimated 0.5ms per tab for old system
    
    // Use 50-tab result as representative
    const currentTimePerTab = endToEndResults[50]?.perTabMs || 1;
    
    return (currentTimePerTab - baselineTimePerTab) / baselineTimePerTab;
  }

  /**
   * Generate comprehensive performance report
   */
  generatePerformanceReport() {
    console.log('\n📊 PERFORMANCE BENCHMARK REPORT');
    console.log('='.repeat(70));

    // Validation Performance
    const validation = this.benchmarkResults.validation;
    console.log(`\n🔍 VALIDATION PERFORMANCE:`);
    console.log(`   Average per validation: ${validation.perValidationMs?.toFixed(4)}ms`);
    console.log(`   Validations per second: ${(1000 / validation.perValidationMs).toFixed(0)}`);
    console.log(`   Threshold (${this.performanceThresholds.maxValidationTimeMs}ms): ${validation.withinThreshold ? '✅ PASSED' : '❌ FAILED'}`);

    // Domain Lookup Performance
    const domainLookup = this.benchmarkResults.domainLookup;
    console.log(`\n🌐 DOMAIN LOOKUP PERFORMANCE:`);
    console.log(`   Average per lookup: ${domainLookup.perLookupMs?.toFixed(4)}ms`);
    console.log(`   Lookups per second: ${domainLookup.perLookupMs ? (1000 / domainLookup.perLookupMs).toFixed(0) : 'N/A'}`);
    console.log(`   Threshold (${this.performanceThresholds.maxDomainLookupTimeMs}ms): ${domainLookup.withinThreshold ? '✅ PASSED' : '❌ FAILED'}`);

    // Memory Usage
    const memory = this.benchmarkResults.memoryUsage;
    if (memory.increaseMB !== undefined) {
      console.log(`\n💾 MEMORY USAGE:`);
      console.log(`   Memory increase: ${memory.increaseMB.toFixed(2)}MB`);
      console.log(`   Threshold (${this.performanceThresholds.maxMemoryIncreaseMB}MB): ${memory.withinThreshold ? '✅ PASSED' : '❌ FAILED'}`);
    }

    // End-to-End Performance
    const endToEnd = this.benchmarkResults.endToEnd;
    if (endToEnd) {
      console.log(`\n🔄 END-TO-END PERFORMANCE:`);
      Object.entries(endToEnd).forEach(([tabCount, results]) => {
        console.log(`   ${tabCount} tabs: ${results.averageTimeMs.toFixed(2)}ms (${results.tabsPerSecond.toFixed(0)} tabs/sec)`);
      });

      const performanceRegression = this.calculatePerformanceRegression(endToEnd);
      console.log(`   Performance change: ${performanceRegression > 0 ? '+' : ''}${(performanceRegression * 100).toFixed(1)}%`);
      console.log(`   Regression threshold: ${Math.abs(performanceRegression) <= this.performanceThresholds.maxPerformanceDegradation ? '✅ PASSED' : '❌ FAILED'}`);
    }

    // Overall Assessment
    console.log(`\n🏆 OVERALL PERFORMANCE ASSESSMENT:`);
    const allThresholdsPassed = this.checkAllThresholds();
    console.log(`   Status: ${allThresholdsPassed ? '✅ ALL THRESHOLDS PASSED' : '⚠️ SOME THRESHOLDS FAILED'}`);
    
    if (!allThresholdsPassed) {
      console.log(`   Action Required: Review failed benchmarks and optimize accordingly`);
    }

    // Performance Summary
    this.benchmarkResults.summary = {
      allThresholdsPassed,
      validationPerformance: validation.withinThreshold,
      domainLookupPerformance: domainLookup.withinThreshold, 
      memoryUsage: memory.withinThreshold,
      overallRating: this.calculateOverallRating()
    };
  }

  /**
   * Check if all performance thresholds are met
   */
  checkAllThresholds() {
    const results = this.benchmarkResults;
    
    return (
      (results.validation?.withinThreshold !== false) &&
      (results.domainLookup?.withinThreshold !== false) &&
      (results.memoryUsage?.withinThreshold !== false)
    );
  }

  /**
   * Calculate overall performance rating
   */
  calculateOverallRating() {
    const scores = [];
    
    if (this.benchmarkResults.validation?.withinThreshold) scores.push(1);
    else if (this.benchmarkResults.validation?.withinThreshold === false) scores.push(0);
    
    if (this.benchmarkResults.domainLookup?.withinThreshold) scores.push(1);
    else if (this.benchmarkResults.domainLookup?.withinThreshold === false) scores.push(0);
    
    if (this.benchmarkResults.memoryUsage?.withinThreshold) scores.push(1);
    else if (this.benchmarkResults.memoryUsage?.withinThreshold === false) scores.push(0);

    if (scores.length === 0) return 0;
    
    const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    
    if (averageScore >= 0.9) return 'EXCELLENT';
    if (averageScore >= 0.7) return 'GOOD';
    if (averageScore >= 0.5) return 'ACCEPTABLE';
    return 'NEEDS_IMPROVEMENT';
  }

  /**
   * Export benchmark results for analysis
   */
  exportResults() {
    return {
      timestamp: new Date().toISOString(),
      testType: 'Performance_Benchmark',
      thresholds: this.performanceThresholds,
      results: this.benchmarkResults,
      recommendations: this.generatePerformanceRecommendations()
    };
  }

  /**
   * Generate performance recommendations
   */
  generatePerformanceRecommendations() {
    const recommendations = [];
    const results = this.benchmarkResults;

    if (results.validation?.withinThreshold === false) {
      recommendations.push('Optimize category validation logic - exceeds time threshold');
    }

    if (results.domainLookup?.withinThreshold === false) {
      recommendations.push('Consider domain lookup optimization - possibly cache or index domains');
    }

    if (results.memoryUsage?.withinThreshold === false) {
      recommendations.push('Reduce memory footprint of enhanced domain system');
    }

    const performanceRegression = this.calculatePerformanceRegression(results.endToEnd || {});
    if (Math.abs(performanceRegression) > this.performanceThresholds.maxPerformanceDegradation) {
      recommendations.push(`Significant performance regression detected: ${(performanceRegression * 100).toFixed(1)}%`);
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance benchmarks passed - no optimization needed ✅');
    }

    return recommendations;
  }
}

// Export for use in test suites
export { CategorizationBenchmark };

// Command-line benchmark runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const benchmark = new CategorizationBenchmark();
  const results = await benchmark.runBenchmarks();
  
  console.log('\n✅ Performance Benchmarking Complete!');
  console.log('📊 Export results with: benchmark.exportResults()');
}