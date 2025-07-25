const { TestRunner, TestAssertions, MockLogger, TimeHelpers } = require('../utils/testHelpers');
const mockData = require('../fixtures/mockData');

/**
 * Simplified Error Recovery Testing
 * Focused on core error handling patterns without long delays
 */

// Simple Error Simulation Services
class MockFailingStorageService {
    constructor() {
        this.failureMode = null;
        this.operationCount = 0;
        this.errors = [];
    }

    async storeMessage(message) {
        this.operationCount++;
        if (this.failureMode === 'database_error') {
            const error = new Error('SQLITE_BUSY: database is locked');
            this.errors.push(error);
            throw error;
        }
        return { id: Date.now(), success: true };
    }

    async isInCooldown(chatId) {
        this.operationCount++;
        if (this.failureMode === 'connection_error') {
            const error = new Error('Database connection lost');
            this.errors.push(error);
            throw error;
        }
        return false;
    }

    async healthCheck() {
        if (this.failureMode === 'health_check_fail') {
            throw new Error('Health check failed');
        }
        return { isHealthy: true };
    }

    setFailureMode(mode) {
        this.failureMode = mode;
    }

    getOperationCount() {
        return this.operationCount;
    }

    getErrors() {
        return [...this.errors];
    }

    reset() {
        this.failureMode = null;
        this.operationCount = 0;
        this.errors = [];
    }
}

class MockFailingAIService {
    constructor() {
        this.failureMode = null;
        this.operationCount = 0;
        this.errors = [];
        this.retryCount = 0;
    }

    async generateResponse(prompt, context) {
        this.operationCount++;

        if (this.failureMode === 'timeout') {
            this.retryCount++;
            const error = new Error('Request timeout');
            this.errors.push(error);
            throw error;
        }

        if (this.failureMode === 'rate_limit') {
            const error = new Error('Rate limit exceeded');
            this.errors.push(error);
            throw error;
        }

        if (this.failureMode === 'service_unavailable') {
            const error = new Error('AI service temporarily unavailable');
            this.errors.push(error);
            throw error;
        }

        return {
            content: 'AI response generated successfully',
            confidence: 0.8,
            model: 'test-model'
        };
    }

    async isHealthy() {
        if (this.failureMode === 'health_fail') {
            throw new Error('AI service health check failed');
        }
        return true;
    }

    setFailureMode(mode) {
        this.failureMode = mode;
    }

    getOperationCount() {
        return this.operationCount;
    }

    getErrors() {
        return [...this.errors];
    }

    getRetryCount() {
        return this.retryCount;
    }

    reset() {
        this.failureMode = null;
        this.operationCount = 0;
        this.errors = [];
        this.retryCount = 0;
    }
}

class MockFailingTimerService {
    constructor() {
        this.failureMode = null;
        this.activeTimers = new Map();
        this.operationCount = 0;
        this.errors = [];
    }

    startResponseTimer(chatId, callback) {
        this.operationCount++;

        if (this.failureMode === 'timer_creation_failed') {
            const error = new Error('Failed to create timer');
            this.errors.push(error);
            throw error;
        }

        if (this.failureMode === 'memory_issue') {
            const error = new Error('Timer service memory issue');
            this.errors.push(error);
            throw error;
        }

        // Use very short timeout for testing (10ms)
        const timer = setTimeout(callback, 10);
        this.activeTimers.set(chatId, timer);
        return { chatId, timer };
    }

    cancelTimer(chatId) {
        const timer = this.activeTimers.get(chatId);
        if (timer) {
            clearTimeout(timer);
            this.activeTimers.delete(chatId);
            return true;
        }
        return false;
    }

    async getHealthStatus() {
        if (this.failureMode === 'memory_issue') {
            throw new Error('Timer service memory issue');
        }
        return {
            isHealthy: true,
            activeTimers: this.activeTimers.size
        };
    }

    setFailureMode(mode) {
        this.failureMode = mode;
    }

    getOperationCount() {
        return this.operationCount;
    }

    getErrors() {
        return [...this.errors];
    }

    getActiveTimerCount() {
        return this.activeTimers.size;
    }

    cleanup() {
        for (const timer of this.activeTimers.values()) {
            clearTimeout(timer);
        }
        this.activeTimers.clear();
    }

    reset() {
        this.cleanup();
        this.failureMode = null;
        this.operationCount = 0;
        this.errors = [];
    }
}

// Error Recovery System
class SimpleErrorRecoverySystem {
    constructor() {
        this.storage = new MockFailingStorageService();
        this.ai = new MockFailingAIService();
        this.timer = new MockFailingTimerService();
        this.logger = new MockLogger();

        this.errorCounts = { storage: 0, ai: 0, timer: 0, system: 0 };
        this.fallbacksUsed = [];
        this.circuitBreakers = {
            storage: { open: false, failures: 0 },
            ai: { open: false, failures: 0 },
            timer: { open: false, failures: 0 }
        };
    }

    async processMessage(message) {
        const result = {
            success: false,
            errors: [],
            fallbacks: [],
            warnings: []
        };

        try {
            // 1. Store message with error handling
            try {
                await this.storage.storeMessage(message);
                result.warnings.push('Message stored successfully');
            } catch (error) {
                this.errorCounts.storage++;
                this.updateCircuitBreaker('storage');
                result.errors.push(`Storage: ${error.message}`);

                // Always use fallback for storage errors
                result.fallbacks.push('in-memory-storage');
            }

            // 2. Check cooldown with error handling
            try {
                await this.storage.isInCooldown(message.chat.id);
            } catch (error) {
                this.errorCounts.storage++;
                result.errors.push(`Cooldown check: ${error.message}`);
                result.fallbacks.push('assume-no-cooldown');
            }

            // 3. Generate AI response with error handling
            let aiResponse = null;
            try {
                aiResponse = await this.ai.generateResponse(message.body, {});
                result.warnings.push('AI response generated');
            } catch (error) {
                this.errorCounts.ai++;
                this.updateCircuitBreaker('ai');
                result.errors.push(`AI: ${error.message}`);

                // Always provide fallback response
                aiResponse = { content: 'Fallback response due to AI error' };
                result.fallbacks.push('fallback-ai-response');
            }

            // 4. Start timer with error handling
            try {
                this.timer.startResponseTimer(message.chat.id, () => {
                    this.logger.info('Timer executed');
                });
                result.warnings.push('Timer started');
            } catch (error) {
                this.errorCounts.timer++;
                this.updateCircuitBreaker('timer');
                result.errors.push(`Timer: ${error.message}`);
                result.fallbacks.push('no-timer');
            }

            result.success = true;
            result.response = aiResponse;

        } catch (error) {
            this.errorCounts.system++;
            result.errors.push(`System: ${error.message}`);
        }

        return result;
    }

    updateCircuitBreaker(service) {
        const breaker = this.circuitBreakers[service];
        breaker.failures++;

        // Open circuit after 3 failures
        if (breaker.failures >= 3) {
            breaker.open = true;
        }
    }

    async performRecovery(service) {
        try {
            switch (service) {
                case 'storage':
                    this.storage.reset();
                    await this.storage.healthCheck();
                    this.circuitBreakers.storage = { open: false, failures: 0 };
                    return true;

                case 'ai':
                    this.ai.reset();
                    await this.ai.isHealthy();
                    this.circuitBreakers.ai = { open: false, failures: 0 };
                    return true;

                case 'timer':
                    this.timer.reset();
                    await this.timer.getHealthStatus();
                    this.circuitBreakers.timer = { open: false, failures: 0 };
                    return true;
            }
        } catch (error) {
            this.logger.error(`Recovery failed for ${service}:`, error.message);
            return false;
        }
    }

    getSystemStatus() {
        return {
            errorCounts: { ...this.errorCounts },
            circuitBreakers: JSON.parse(JSON.stringify(this.circuitBreakers)),
            operationCounts: {
                storage: this.storage.getOperationCount(),
                ai: this.ai.getOperationCount(),
                timer: this.timer.getOperationCount()
            }
        };
    }

    reset() {
        this.storage.reset();
        this.ai.reset();
        this.timer.reset();
        this.errorCounts = { storage: 0, ai: 0, timer: 0, system: 0 };
        this.fallbacksUsed = [];
        this.circuitBreakers = {
            storage: { open: false, failures: 0 },
            ai: { open: false, failures: 0 },
            timer: { open: false, failures: 0 }
        };
        this.logger.clear();
    }
}

/**
 * Simplified Error Recovery Test Suite
 */
async function runErrorRecoveryTests() {
    const runner = new TestRunner('🚨 Error Recovery Tests');

    // Create assertion helpers
    const assert = {
        ok: (condition, message) => TestAssertions.assertTrue(condition, message),
        equal: (actual, expected, message) => TestAssertions.assertEqual(actual, expected, message),
        greaterThan: (actual, expected, message) => TestAssertions.assertTrue(actual > expected, message || `Expected ${actual} > ${expected}`),
        contains: (container, item, message) => TestAssertions.assertContains(container, item, message)
    };

    let errorSystem;

    runner.beforeEach(async () => {
        errorSystem = new SimpleErrorRecoverySystem();
    });

    runner.afterEach(async () => {
        if (errorSystem) {
            errorSystem.reset();
        }
    });

    // Test 1: Storage Error Handling
    runner.test('should handle storage errors with fallbacks', async () => {
        const message = mockData.sampleMessage;

        errorSystem.storage.setFailureMode('database_error');
        const result = await errorSystem.processMessage(message);

        assert.ok(result.errors.some(e => e.includes('SQLITE_BUSY')), 'Should report database error');
        assert.contains(result.fallbacks, 'in-memory-storage', 'Should use storage fallback');
        assert.greaterThan(errorSystem.errorCounts.storage, 0, 'Should count storage errors');
    });

    // Test 2: AI Service Error Handling
    runner.test('should handle AI service errors with fallback responses', async () => {
        const message = mockData.sampleMessage;

        errorSystem.ai.setFailureMode('timeout');
        const result = await errorSystem.processMessage(message);

        assert.ok(result.errors.some(e => e.includes('timeout')), 'Should report timeout error');
        assert.contains(result.fallbacks, 'fallback-ai-response', 'Should use AI fallback');
        assert.equal(result.response.content, 'Fallback response due to AI error', 'Should provide fallback response');
    });

    // Test 3: Timer Service Error Handling
    runner.test('should handle timer service errors gracefully', async () => {
        const message = mockData.sampleMessage;

        errorSystem.timer.setFailureMode('timer_creation_failed');
        const result = await errorSystem.processMessage(message);

        assert.ok(result.errors.some(e => e.includes('Failed to create timer')), 'Should report timer error');
        assert.contains(result.fallbacks, 'no-timer', 'Should use no-timer fallback');
        assert.ok(result.success, 'Should still succeed without timer');
    });

    // Test 4: Circuit Breaker Pattern
    runner.test('should open circuit breaker after multiple failures', async () => {
        const message = mockData.sampleMessage;

        errorSystem.storage.setFailureMode('database_error');

        // Cause multiple failures
        for (let i = 0; i < 4; i++) {
            await errorSystem.processMessage(message);
        }

        const status = errorSystem.getSystemStatus();
        assert.ok(status.circuitBreakers.storage.open, 'Storage circuit breaker should be open');
        assert.greaterThan(status.circuitBreakers.storage.failures, 2, 'Should track failure count');
    });

    // Test 5: Multiple Service Failures
    runner.test('should handle multiple simultaneous service failures', async () => {
        const message = mockData.sampleMessage;

        errorSystem.storage.setFailureMode('connection_error');
        errorSystem.ai.setFailureMode('service_unavailable');
        errorSystem.timer.setFailureMode('memory_issue');

        const result = await errorSystem.processMessage(message);

        assert.greaterThan(result.errors.length, 2, 'Should report multiple errors');
        assert.greaterThan(result.fallbacks.length, 2, 'Should use multiple fallbacks');
        assert.ok(result.success, 'Should still succeed with fallbacks');

        const status = errorSystem.getSystemStatus();
        assert.greaterThan(status.errorCounts.storage, 0, 'Should track storage errors');
        assert.greaterThan(status.errorCounts.ai, 0, 'Should track AI errors');
        assert.greaterThan(status.errorCounts.timer, 0, 'Should track timer errors');
    });

    // Test 6: Service Recovery
    runner.test('should recover services after failures', async () => {
        const message = mockData.sampleMessage;

        // Cause storage failure
        errorSystem.storage.setFailureMode('database_error');
        await errorSystem.processMessage(message);

        const preRecoveryStatus = errorSystem.getSystemStatus();
        assert.greaterThan(preRecoveryStatus.errorCounts.storage, 0, 'Should have storage errors');

        // Perform recovery
        const recoverySuccess = await errorSystem.performRecovery('storage');
        assert.ok(recoverySuccess, 'Storage recovery should succeed');

        const postRecoveryStatus = errorSystem.getSystemStatus();
        assert.equal(postRecoveryStatus.circuitBreakers.storage.failures, 0, 'Should reset failure count');
        assert.ok(!postRecoveryStatus.circuitBreakers.storage.open, 'Should close circuit breaker');
    });

    // Test 7: Graceful Degradation
    runner.test('should provide graceful degradation under failures', async () => {
        const message = mockData.sampleMessage;

        // Simulate partial system failure
        errorSystem.storage.setFailureMode('database_error');
        errorSystem.timer.setFailureMode('timer_creation_failed');

        const result = await errorSystem.processMessage(message);

        // Should still complete processing with reduced functionality
        assert.ok(result.success, 'Should succeed with degraded functionality');
        assert.ok(result.response, 'Should provide some response');
        assert.greaterThan(result.fallbacks.length, 0, 'Should use fallback mechanisms');

        // Core functionality (AI) should still work
        assert.ok(result.warnings.some(w => w.includes('AI response')), 'AI should still work');
    });

    // Test 8: Error Recovery Verification
    runner.test('should verify complete recovery functionality', async () => {
        const message = mockData.sampleMessage;

        // Cause multiple service failures
        errorSystem.storage.setFailureMode('health_check_fail');
        errorSystem.ai.setFailureMode('health_fail');

        // Process to trigger failures
        await errorSystem.processMessage(message);

        // Perform recovery for all services
        const storageRecovery = await errorSystem.performRecovery('storage');
        const aiRecovery = await errorSystem.performRecovery('ai');

        assert.ok(storageRecovery, 'Storage recovery should complete');
        assert.ok(aiRecovery, 'AI recovery should complete');

        // Verify system works normally after recovery
        const postRecoveryResult = await errorSystem.processMessage(message);
        assert.equal(postRecoveryResult.fallbacks.length, 0, 'Should not need fallbacks after recovery');
        assert.greaterThan(postRecoveryResult.warnings.length, 0, 'Should show normal operation');
    });

    // Test 9: Error Logging and Monitoring
    runner.test('should provide comprehensive error tracking', async () => {
        const message = mockData.sampleMessage;

        // Generate different types of errors
        errorSystem.storage.setFailureMode('database_error');
        await errorSystem.processMessage(message);

        errorSystem.ai.setFailureMode('rate_limit');
        await errorSystem.processMessage(message);

        // Check error tracking
        const status = errorSystem.getSystemStatus();
        assert.greaterThan(status.errorCounts.storage, 0, 'Should track storage errors');
        assert.greaterThan(status.errorCounts.ai, 0, 'Should track AI errors');
        assert.greaterThan(status.operationCounts.storage, 0, 'Should track storage operations');
        assert.greaterThan(status.operationCounts.ai, 0, 'Should track AI operations');

        // Check individual service error logs
        const storageErrors = errorSystem.storage.getErrors();
        const aiErrors = errorSystem.ai.getErrors();
        assert.greaterThan(storageErrors.length, 0, 'Should log storage errors');
        assert.greaterThan(aiErrors.length, 0, 'Should log AI errors');
    });

    // Test 10: System Resilience Under Load
    runner.test('should maintain resilience under sustained errors', async () => {
        const messages = Array.from({ length: 5 }, (_, i) => ({
            ...mockData.sampleMessage,
            chat: { id: `chat-${i}@c.us` },
            body: `Message ${i}`
        }));

        // Set intermittent failures
        errorSystem.storage.setFailureMode('connection_error');

        const results = [];
        for (const message of messages) {
            const result = await errorSystem.processMessage(message);
            results.push(result);
        }

        // System should handle all messages despite errors
        const successfulResults = results.filter(r => r.success);
        assert.equal(successfulResults.length, messages.length, 'Should handle all messages');

        const totalFallbacks = results.reduce((sum, r) => sum + r.fallbacks.length, 0);
        assert.greaterThan(totalFallbacks, 0, 'Should use fallback mechanisms');

        const status = errorSystem.getSystemStatus();
        assert.greaterThan(status.operationCounts.storage, messages.length, 'Should process all messages');
    });

    return runner.run();
}

// Export for use in test runner
module.exports = runErrorRecoveryTests;

// Run tests if this file is executed directly
if (require.main === module) {
    runErrorRecoveryTests()
        .then(report => {
            console.log('\n🎉 Error Recovery Testing Complete!');
            console.log(`✅ Passed: ${report.passed}`);
            console.log(`❌ Failed: ${report.failed}`);
            console.log(`📊 Total: ${report.passed + report.failed}`);

            if (report.failed > 0) {
                console.log('\n❌ Failed Tests:');
                report.tests.filter(test => !test.passed).forEach(test => {
                    console.log(`  - ${test.name}: ${test.error}`);
                });
            }

            const hasFailures = report.failed > 0;
            process.exit(hasFailures ? 1 : 0);
        })
        .catch(error => {
            console.error('Error recovery tests failed to run:', error);
            process.exit(1);
        });
}