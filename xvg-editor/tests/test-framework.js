/**
 * XVG Editor Test Framework
 * Professional testing framework with proper assertions, isolation, and reporting
 */

class XVGTestFramework {
  constructor() {
    this.tests = [];
    this.results = [];
    this.currentTest = null;
    this.originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info
    };
    this.testOutput = [];
    this.startTime = null;
    this.endTime = null;
  }

  /**
   * Add a test case
   */
  test(name, testFunction) {
    this.tests.push({
      name,
      function: testFunction,
      status: 'pending',
      startTime: null,
      endTime: null,
      duration: 0,
      assertions: [],
      errors: []
    });
  }

  /**
   * Run all tests
   */
  async runAll() {
    this.startTime = Date.now();
    this.results = [];
    
    console.log('🧪 Starting XVG Test Suite...');
    console.log(`📊 Running ${this.tests.length} tests`);
    
    for (const test of this.tests) {
      await this.runTest(test);
    }
    
    this.endTime = Date.now();
    this.generateReport();
  }

  /**
   * Run a single test
   */
  async runTest(test) {
    test.status = 'running';
    test.startTime = Date.now();
    test.assertions = [];
    test.errors = [];
    
    this.currentTest = test;
    
    try {
      // Set up test isolation
      this.setupTestIsolation();
      
      // Run the test
      await test.function();
      
      // Check if test passed
      const failedAssertions = test.assertions.filter(a => !a.passed);
      if (failedAssertions.length === 0 && test.errors.length === 0) {
        test.status = 'passed';
        console.log(`✅ ${test.name} - PASSED`);
      } else {
        test.status = 'failed';
        console.log(`❌ ${test.name} - FAILED`);
      }
      
    } catch (error) {
      test.status = 'failed';
      test.errors.push({
        type: 'uncaught',
        message: error.message,
        stack: error.stack
      });
      console.log(`❌ ${test.name} - FAILED (Uncaught Error)`);
    } finally {
      test.endTime = Date.now();
      test.duration = test.endTime - test.startTime;
      
      // Clean up test isolation
      this.cleanupTestIsolation();
      
      this.results.push(test);
    }
  }

  /**
   * Set up test isolation
   */
  setupTestIsolation() {
    // Store original console functions
    this.originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info
    };
    
    // Set up test console that captures output
    this.setupTestConsole();
    
    // Clear test output
    this.testOutput = [];
  }

  /**
   * Clean up test isolation
   */
  cleanupTestIsolation() {
    // Restore original console functions
    console.log = this.originalConsole.log;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.info = this.originalConsole.info;
  }

  /**
   * Set up test console that captures output
   */
  setupTestConsole() {
    const self = this;
    
    console.log = function(...args) {
      self.originalConsole.log.apply(console, args);
      self.testOutput.push({ type: 'log', message: args.join(' '), timestamp: Date.now() });
    };
    
    console.warn = function(...args) {
      self.originalConsole.warn.apply(console, args);
      self.testOutput.push({ type: 'warn', message: args.join(' '), timestamp: Date.now() });
    };
    
    console.error = function(...args) {
      self.originalConsole.error.apply(console, args);
      self.testOutput.push({ type: 'error', message: args.join(' '), timestamp: Date.now() });
    };
    
    console.info = function(...args) {
      self.originalConsole.info.apply(console, args);
      self.testOutput.push({ type: 'info', message: args.join(' '), timestamp: Date.now() });
    };
  }

  /**
   * Assertion methods
   */
  assert(condition, message = 'Assertion failed') {
    const assertion = {
      passed: !!condition,
      message,
      timestamp: Date.now()
    };
    
    this.currentTest.assertions.push(assertion);
    
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  assertEqual(actual, expected, message = 'Values are not equal') {
    const passed = actual === expected;
    const assertion = {
      passed,
      message: `${message} (expected: ${expected}, actual: ${actual})`,
      timestamp: Date.now()
    };
    
    this.currentTest.assertions.push(assertion);
    
    if (!passed) {
      throw new Error(`Assertion failed: ${assertion.message}`);
    }
  }

  assertNotEqual(actual, expected, message = 'Values are equal') {
    const passed = actual !== expected;
    const assertion = {
      passed,
      message: `${message} (expected: not ${expected}, actual: ${actual})`,
      timestamp: Date.now()
    };
    
    this.currentTest.assertions.push(assertion);
    
    if (!passed) {
      throw new Error(`Assertion failed: ${assertion.message}`);
    }
  }

  assertTrue(condition, message = 'Condition is not true') {
    this.assertEqual(condition, true, message);
  }

  assertFalse(condition, message = 'Condition is not false') {
    this.assertEqual(condition, false, message);
  }

  assertNull(value, message = 'Value is not null') {
    this.assertEqual(value, null, message);
  }

  assertNotNull(value, message = 'Value is null') {
    this.assertNotEqual(value, null, message);
  }

  assertUndefined(value, message = 'Value is not undefined') {
    this.assertEqual(value, undefined, message);
  }

  assertNotUndefined(value, message = 'Value is undefined') {
    this.assertNotEqual(value, undefined, message);
  }

  assertThrows(fn, expectedError = null, message = 'Function did not throw') {
    let threw = false;
    let actualError = null;
    
    try {
      fn();
    } catch (error) {
      threw = true;
      actualError = error;
    }
    
    const assertion = {
      passed: threw,
      message: threw ? 
        (expectedError ? `Function threw ${actualError.message} (expected: ${expectedError})` : 'Function threw as expected') :
        message,
      timestamp: Date.now()
    };
    
    this.currentTest.assertions.push(assertion);
    
    if (!threw) {
      throw new Error(`Assertion failed: ${message}`);
    }
    
    if (expectedError && actualError.message !== expectedError) {
      throw new Error(`Assertion failed: Expected error "${expectedError}", got "${actualError.message}"`);
    }
  }

  assertDoesNotThrow(fn, message = 'Function threw an error') {
    let threw = false;
    let actualError = null;
    
    try {
      fn();
    } catch (error) {
      threw = true;
      actualError = error;
    }
    
    const assertion = {
      passed: !threw,
      message: threw ? `${message}: ${actualError.message}` : 'Function did not throw as expected',
      timestamp: Date.now()
    };
    
    this.currentTest.assertions.push(assertion);
    
    if (threw) {
      throw new Error(`Assertion failed: ${assertion.message}`);
    }
  }

  /**
   * Generate test report
   */
  generateReport() {
    const totalTests = this.tests.length;
    const passedTests = this.results.filter(r => r.status === 'passed').length;
    const failedTests = this.results.filter(r => r.status === 'failed').length;
    const totalDuration = this.endTime - this.startTime;
    
    console.log('\n📊 Test Report');
    console.log('='.repeat(50));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(`Duration: ${totalDuration}ms`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.filter(r => r.status === 'failed').forEach(test => {
        console.log(`  - ${test.name}`);
        test.errors.forEach(error => {
          console.log(`    Error: ${error.message}`);
        });
        test.assertions.filter(a => !a.passed).forEach(assertion => {
          console.log(`    Assertion: ${assertion.message}`);
        });
      });
    }
    
    // Generate HTML report if in browser
    if (typeof document !== 'undefined') {
      this.generateHTMLReport();
    }
  }

  /**
   * Generate HTML report
   */
  generateHTMLReport() {
    const reportContainer = document.getElementById('test-report');
    if (!reportContainer) return;
    
    const totalTests = this.tests.length;
    const passedTests = this.results.filter(r => r.status === 'passed').length;
    const failedTests = this.results.filter(r => r.status === 'failed').length;
    const totalDuration = this.endTime - this.startTime;
    
    reportContainer.innerHTML = `
      <div class="test-summary">
        <h2>Test Report</h2>
        <div class="summary-stats">
          <div class="stat">
            <span class="label">Total Tests:</span>
            <span class="value">${totalTests}</span>
          </div>
          <div class="stat">
            <span class="label">Passed:</span>
            <span class="value success">${passedTests}</span>
          </div>
          <div class="stat">
            <span class="label">Failed:</span>
            <span class="value error">${failedTests}</span>
          </div>
          <div class="stat">
            <span class="label">Duration:</span>
            <span class="value">${totalDuration}ms</span>
          </div>
          <div class="stat">
            <span class="label">Success Rate:</span>
            <span class="value">${((passedTests / totalTests) * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>
      
      <div class="test-results">
        ${this.results.map(test => `
          <div class="test-result ${test.status}">
            <div class="test-header">
              <span class="test-name">${test.name}</span>
              <span class="test-status">${test.status.toUpperCase()}</span>
              <span class="test-duration">${test.duration}ms</span>
            </div>
            ${test.assertions.length > 0 ? `
              <div class="test-assertions">
                <h4>Assertions (${test.assertions.length})</h4>
                ${test.assertions.map(assertion => `
                  <div class="assertion ${assertion.passed ? 'passed' : 'failed'}">
                    ${assertion.passed ? '✅' : '❌'} ${assertion.message}
                  </div>
                `).join('')}
              </div>
            ` : ''}
            ${test.errors.length > 0 ? `
              <div class="test-errors">
                <h4>Errors (${test.errors.length})</h4>
                ${test.errors.map(error => `
                  <div class="error">
                    <strong>${error.type}:</strong> ${error.message}
                    ${error.stack ? `<pre>${error.stack}</pre>` : ''}
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }
}

// Export for use in tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = XVGTestFramework;
} else {
  window.XVGTestFramework = XVGTestFramework;
}
