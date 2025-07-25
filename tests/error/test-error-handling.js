const { TestRunner, TestAssertions, MockLogger, TimeHelpers } = require('../utils/testHelpers');
const mockData = require('../fixtures/mockData');

/**
 * Error Handling and Recovery Tests
 * Tests system resilience, error recovery, and graceful degradation scenarios
 */

// Error Simulation Classes
class ErrorSimulationStorageService {
    constructor() {
        this.isConnected = true;
        this.errorMode = null;
        this.failureCount = 0;
        this.maxFailures = 3;
        this.recoveryTime = 1000;
        this.circuitBreakerOpen = false;
        this.lastFailureTime = 0;
        this.operationLog = [];
    }

    async healthCheck() {
        return this.executeWithErrorHandling('healthCheck', async () => {
            if (!this.isConnected) {
                throw new Error('Database connection lost');
            }
            return {
                isHealthy: true,
                checks: { connection: true, tables: true, indexes: true },
                stats: { conversations: 10, messages: 50 }
            };
        });
    }

    async upsertConversation(chatId, isGroup = false, groupName) {
        return this.executeWithErrorHandling('upsertConversation', async () => {
            if (this.errorMode === 'database_lock') {
                throw new Error('SQLITE_BUSY: database is locked');
            }
            return Date.now();
        });
    }

    async storeMessage(message, isFromGilad = false) {
        return this.executeWithErrorHandling('storeMessage', async () => {
            if (this.errorMode === 'disk_full') {
                throw new Error('ENOSPC: no space left on device');
            }
            return Date.now();
        });
    }

    async startCooldown(chatId, duration, reason = 'test') {
        return this.executeWithErrorHandling('startCooldown', async () => {
            if (this.errorMode === 'constraint_violation') {
                throw new Error('UNIQUE constraint failed');
            }
            return Date.now();
        });
    }

    async isInCooldown(chatId) {
        return this.executeWithErrorHandling('isInCooldown', async () => {
            return false;
        });
    }

    async getActiveConversations() {
        return this.executeWithErrorHandling('getActiveConversations', async () => {
            return [];
        });
    }

    async cleanup() {
        return this.executeWithErrorHandling('cleanup', async () => {
            return { expiredCooldowns: 0, inactiveTimers: 0, oldMessages: 0 };
        });
    }

    async close() {
        return this.executeWithErrorHandling('close', async () => {
            this.isConnected = false;
        });
    }

    // Error handling utilities
    async executeWithErrorHandling(operation, fn) {
        this.operationLog.push({ operation, timestamp: Date.now(), status: 'started' });

        // Circuit breaker logic
        if (this.circuitBreakerOpen) {
            const timeSinceLastFailure = Date.now() - this.lastFailureTime;
            if (timeSinceLastFailure < this.recoveryTime) {
                const error = new Error(`Circuit breaker open for ${operation}`);
                this.operationLog.push({ operation, timestamp: Date.now(), status: 'circuit_breaker', error: error.message });
                throw error;
            } else {
                // Try to close circuit breaker
                this.circuitBreakerOpen = false;
                this.failureCount = 0;
            }
        }

        try {
            const result = await fn();
            this.operationLog.push({ operation, timestamp: Date.now(), status: 'success' });
            return result;
        } catch (error) {
            this.failureCount++;
            this.lastFailureTime = Date.now();
            this.operationLog.push({ operation, timestamp: Date.now(), status: 'error', error: error.message });

            // Open circuit breaker if too many failures
            if (this.failureCount >= this.maxFailures) {
                this.circuitBreakerOpen = true;
            }

            throw error;
        }
    }

    // Test control methods
    setErrorMode(mode) {
        this.errorMode = mode;
    }

    disconnect() {
        this.isConnected = false;
    }

    reconnect() {
        this.isConnected = true;
        this.errorMode = null;
        this.failureCount = 0;
        this.circuitBreakerOpen = false;
    }

    getOperationLog() {
        return [...this.operationLog];
    }

    clearOperationLog() {
        this.operationLog = [];
    }

    isCircuitBreakerOpen() {
        return this.circuitBreakerOpen;
    }
}

class ErrorSimulationCloudflareAI {
    constructor() {
        this.isHealthy = true;
        this.errorMode = null;
        this.requestCount = 0;
        this.failureCount = 0;
        this.rateLimitRemaining = 100;
        this.maxRetries = 3;
        this.timeout = 5000;
        this.operationLog = [];
    }

    async generateResponse(prompt, context, model, maxTokens = 500) {
        this.requestCount++;
        return this.executeWithRetry('generateResponse', async () => {
            if (this.errorMode === 'timeout') {
                await TimeHelpers.sleep(this.timeout + 1000);
                throw new Error('Request timeout');
            }

            if (this.errorMode === 'rate_limit') {
                this.rateLimitRemaining = 0;
                throw new Error('Rate limit exceeded');
            }

            if (this.errorMode === 'model_unavailable') {
                throw new Error('Model temporarily unavailable');
            }

            if (this.errorMode === 'network_error') {
                throw new Error('ECONNREFUSED: Connection refused');
            }

            if (this.errorMode === 'api_error') {
                throw new Error('API Error: Invalid request format');
            }

            // Simulate successful response
            return {
                content: 'Test response from AI service',
                confidence: 0.8,
                tokens_used: 25,
                model: model || '@cf/meta/llama-3.2-1b-instruct'
            };
        });
    }

    async isHealthy() {
        return this.executeWithRetry('isHealthy', async () => {
            if (this.errorMode === 'service_down') {
                throw new Error('AI service is down');
            }
            return this.isHealthy;
        });
    }

    async listModels() {
        return this.executeWithRetry('listModels', async () => {
            if (this.errorMode === 'auth_error') {
                throw new Error('Authentication failed');
            }
            return ['@cf/meta/llama-3.2-1b-instruct'];
        });
    }

    async executeWithRetry(operation, fn) {
        this.operationLog.push({ operation, timestamp: Date.now(), status: 'started' });

        let lastError;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const result = await fn();
                if (attempt > 0) {
                    this.operationLog.push({
                        operation,
                        timestamp: Date.now(),
                        status: 'success_after_retry',
                        attempts: attempt + 1
                    });
                } else {
                    this.operationLog.push({ operation, timestamp: Date.now(), status: 'success' });
                }
                return result;
            } catch (error) {
                lastError = error;
                this.failureCount++;

                if (attempt < this.maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
                    this.operationLog.push({
                        operation,
                        timestamp: Date.now(),
                        status: 'retry',
                        attempt: attempt + 1,
                        delay,
                        error: error.message
                    });
                    await TimeHelpers.sleep(delay);
                } else {
                    this.operationLog.push({
                        operation,
                        timestamp: Date.now(),
                        status: 'failed',
                        attempts: attempt + 1,
                        error: error.message
                    });
                }
            }
        }

        throw lastError;
    }

    // Test control methods
    setErrorMode(mode) {
        this.errorMode = mode;
    }

    setHealthy(healthy) {
        this.isHealthy = healthy;
    }

    setRateLimit(remaining) {
        this.rateLimitRemaining = remaining;
    }

    getOperationLog() {
        return [...this.operationLog];
    }

    clearOperationLog() {
        this.operationLog = [];
    }

    getRequestCount() {
        return this.requestCount;
    }

    getFailureCount() {
        return this.failureCount;
    }

    reset() {
        this.isHealthy = true;
        this.errorMode = null;
        this.requestCount = 0;
        this.failureCount = 0;
        this.rateLimitRemaining = 100;
        this.operationLog = [];
    }
}

class ErrorSimulationTimerService {
    constructor() {
        this.isHealthy = true;
        this.errorMode = null;
        this.activeTimers = new Map();
        this.operationLog = [];
        this.memoryLeakSimulation = false;
        this.memoryUsage = 50; // MB
    }

    async getHealthStatus() {
        this.operationLog.push({ operation: 'getHealthStatus', timestamp: Date.now() });

        if (this.errorMode === 'memory_leak') {
            this.memoryUsage += 10; // Simulate memory growth
            if (this.memoryUsage > 500) {
                throw new Error('Out of memory');
            }
        }

        if (this.errorMode === 'timer_corruption') {
            throw new Error('Timer data structure corrupted');
        }

        return {
            isHealthy: this.isHealthy,
            timersCount: this.activeTimers.size,
            activeTimers: this.activeTimers.size,
            memoryUsage: this.memoryUsage,
            lastCleanup: new Date().toISOString()
        };
    }

    startResponseTimer(chatId, callback) {
        this.operationLog.push({ operation: 'startResponseTimer', chatId, timestamp: Date.now() });

        if (this.errorMode === 'timer_creation_failed') {
            throw new Error('Failed to create timer');
        }

        const timer = {
            chatId,
            callback,
            startTime: Date.now(),
            timer: setTimeout(async () => {
                try {
                    await callback();
                } catch (error) {
                    this.operationLog.push({
                        operation: 'timer_callback_error',
                        chatId,
                        error: error.message,
                        timestamp: Date.now()
                    });
                }
            }, 100) // Short timeout for testing
        };

        this.activeTimers.set(chatId, timer);
        return timer;
    }

    cancelTimer(chatId) {
        this.operationLog.push({ operation: 'cancelTimer', chatId, timestamp: Date.now() });

        const timer = this.activeTimers.get(chatId);
        if (timer) {
            clearTimeout(timer.timer);
            this.activeTimers.delete(chatId);
            return true;
        }
        return false;
    }

    async cleanup() {
        this.operationLog.push({ operation: 'cleanup', timestamp: Date.now() });

        if (this.errorMode === 'cleanup_failed') {
            throw new Error('Cleanup operation failed');
        }

        // Simulate cleanup reducing memory usage
        if (this.memoryUsage > 50) {
            this.memoryUsage = Math.max(50, this.memoryUsage - 20);
        }

        return { cleanedTimers: 5, memoryFreed: 20 };
    }

    // Test control methods
    setErrorMode(mode) {
        this.errorMode = mode;
    }

    setHealthy(healthy) {
        this.isHealthy = healthy;
    }

    simulateMemoryLeak() {
        this.memoryLeakSimulation = true;
        this.errorMode = 'memory_leak';
    }

    getOperationLog() {
        return [...this.operationLog];
    }

    clearOperationLog() {
        this.operationLog = [];
    }

    getMemoryUsage() {
        return this.memoryUsage;
    }

    isReady() {
        return this.isHealthy;
    }
}

// Error Recovery System
class ErrorRecoverySystem {
    constructor() {
        this.storageService = new ErrorSimulationStorageService();
        this.aiService = new ErrorSimulationCloudflareAI();
        this.timerService = new ErrorSimulationTimerService();
        this.logger = new MockLogger();

        this.errorCounts = {
            storage: 0,
            ai: 0,
            timer: 0,
            system: 0
        };

        this.recoveryAttempts = {
            storage: 0,
            ai: 0,
            timer: 0
        };

        this.fallbackModes = {
            aiService: false,
            storageService: false,
            timerService: false
        };

        this.circuitBreakers = {
            storage: { open: false, lastFailure: 0, failures: 0 },
            ai: { open: false, lastFailure: 0, failures: 0 },
            timer: { open: false, lastFailure: 0, failures: 0 }
        };

        this.isRecovering = false;
        this.recoveryStartTime = null;
        this.maxRecoveryTime = 30000; // 30 seconds
    }

    async handleMessage(message) {
        const startTime = Date.now();
        let result = {
            success: false,
            action: 'failed',
            errors: [],
            warnings: [],
            fallbacksUsed: [],
            processingTime: 0
        };

        try {
            this.logger.info('Processing message with error handling', { chatId: message.chat.id });

            // 1. Store message with error handling
            try {
                await this.storageService.storeMessage(message);
                result.warnings.push('Message stored successfully');
            } catch (error) {
                this.handleStorageError('storeMessage', error);
                result.errors.push(`Storage error: ${error.message}`);
                if (this.fallbackModes.storageService) {
                    this.logger.warn('Using in-memory storage fallback');
                    result.fallbacksUsed.push('in-memory-storage');
                }
            }

            // 2. Check cooldown with error handling
            let isInCooldown = false;
            try {
                isInCooldown = await this.storageService.isInCooldown(message.chat.id);
            } catch (error) {
                this.handleStorageError('isInCooldown', error);
                result.errors.push(`Storage error in cooldown check: ${error.message}`);
                // Fallback: assume not in cooldown to continue processing
                isInCooldown = false;
                result.fallbacksUsed.push('assume-no-cooldown');
            }

            if (isInCooldown) {
                result.action = 'ignored_cooldown';
                result.success = true;
                return result;
            }

            // 3. Generate AI response with error handling and retries
            let aiResponse = null;
            try {
                aiResponse = await this.aiService.generateResponse(
                    message.body,
                    { chatId: message.chat.id, recentMessages: [message] },
                    undefined,
                    500
                );
                result.warnings.push('AI response generated successfully');
            } catch (error) {
                this.handleAIError('generateResponse', error);
                result.errors.push(`AI error: ${error.message}`);
                if (this.fallbackModes.aiService) {
                    aiResponse = this.getFallbackResponse(message);
                    result.fallbacksUsed.push('fallback-ai-response');
                    this.logger.warn('Using fallback AI response');
                } else {
                    // Still try to continue processing even without AI response
                    aiResponse = this.getFallbackResponse(message);
                    result.fallbacksUsed.push('emergency-fallback-response');
                }
            }

            // 4. Start timer with error handling
            try {
                this.timerService.startResponseTimer(message.chat.id, async () => {
                    this.logger.info('Timer callback executed', { chatId: message.chat.id });
                });
                result.warnings.push('Response timer started successfully');
            } catch (error) {
                this.handleTimerError('startResponseTimer', error);
                result.errors.push(`Timer error: ${error.message}`);
                if (this.fallbackModes.timerService) {
                    result.fallbacksUsed.push('no-timer-fallback');
                    this.logger.warn('Proceeding without timer due to timer service failure');
                }
            }

            result.success = true;
            result.action = 'processed_with_error_handling';
            result.response = aiResponse?.content || 'Fallback response';

        } catch (error) {
            this.errorCounts.system++;
            result.errors.push(`System error: ${error.message}`);
            this.logger.error('System error in message processing', { error: error.message });
        } finally {
            result.processingTime = Date.now() - startTime;
        }

        return result;
    }

    handleStorageError(operation, error) {
        this.errorCounts.storage++;
        this.updateCircuitBreaker('storage', error);
        this.logger.error(`Storage error in ${operation}`, { error: error.message });

        // Activate fallback mode if circuit breaker is open
        if (this.circuitBreakers.storage.open) {
            this.fallbackModes.storageService = true;
            this.startRecoveryProcess('storage');
        }
    }

    handleAIError(operation, error) {
        this.errorCounts.ai++;
        this.updateCircuitBreaker('ai', error);
        this.logger.error(`AI error in ${operation}`, { error: error.message });

        // Activate fallback mode if circuit breaker is open
        if (this.circuitBreakers.ai.open) {
            this.fallbackModes.aiService = true;
            this.startRecoveryProcess('ai');
        }
    }

    handleTimerError(operation, error) {
        this.errorCounts.timer++;
        this.updateCircuitBreaker('timer', error);
        this.logger.error(`Timer error in ${operation}`, { error: error.message });

        // Activate fallback mode if circuit breaker is open
        if (this.circuitBreakers.timer.open) {
            this.fallbackModes.timerService = true;
            this.startRecoveryProcess('timer');
        }
    }

    updateCircuitBreaker(service, error) {
        const breaker = this.circuitBreakers[service];
        breaker.failures++;
        breaker.lastFailure = Date.now();

        // Open circuit breaker after 3 failures
        if (breaker.failures >= 3) {
            breaker.open = true;
            this.logger.warn(`Circuit breaker opened for ${service}`, { failures: breaker.failures });
        }
    }

    getFallbackResponse(message) {
        return {
            content: `Thank you for your message. I'm experiencing technical difficulties and will respond as soon as possible.`,
            confidence: 0.5,
            tokens_used: 0,
            model: 'fallback'
        };
    }

    async startRecoveryProcess(service) {
        if (this.isRecovering) {
            return; // Already recovering
        }

        this.isRecovering = true;
        this.recoveryStartTime = Date.now();
        this.recoveryAttempts[service]++;

        this.logger.info(`Starting recovery process for ${service}`, {
            attempt: this.recoveryAttempts[service]
        });

        // Wait a bit before attempting recovery
        await TimeHelpers.sleep(1000);

        try {
            await this.attemptServiceRecovery(service);
            this.logger.info(`Recovery successful for ${service}`);
        } catch (error) {
            this.logger.error(`Recovery failed for ${service}`, { error: error.message });
        } finally {
            this.isRecovering = false;
        }
    }

    async attemptServiceRecovery(service) {
        switch (service) {
            case 'storage':
                // Attempt to reconnect to storage
                this.storageService.reconnect();
                await this.storageService.healthCheck();
                this.fallbackModes.storageService = false;
                this.circuitBreakers.storage = { open: false, lastFailure: 0, failures: 0 };
                break;

            case 'ai':
                // Reset AI service
                this.aiService.reset();
                await this.aiService.isHealthy();
                this.fallbackModes.aiService = false;
                this.circuitBreakers.ai = { open: false, lastFailure: 0, failures: 0 };
                break;

            case 'timer':
                // Reset timer service
                this.timerService.setHealthy(true);
                this.timerService.setErrorMode(null);
                await this.timerService.getHealthStatus();
                this.fallbackModes.timerService = false;
                this.circuitBreakers.timer = { open: false, lastFailure: 0, failures: 0 };
                break;
        }
    }

    async performSystemRecovery() {
        this.logger.info('Performing full system recovery');

        const recoveryResults = {
            storage: false,
            ai: false,
            timer: false
        };

        // Attempt recovery for all services
        for (const service of ['storage', 'ai', 'timer']) {
            try {
                await this.attemptServiceRecovery(service);
                recoveryResults[service] = true;
            } catch (error) {
                this.logger.error(`Failed to recover ${service}`, { error: error.message });
            }
        }

        return recoveryResults;
    }

    getSystemStatus() {
        return {
            errorCounts: { ...this.errorCounts },
            recoveryAttempts: { ...this.recoveryAttempts },
            fallbackModes: { ...this.fallbackModes },
            circuitBreakers: JSON.parse(JSON.stringify(this.circuitBreakers)),
            isRecovering: this.isRecovering,
            recoveryTime: this.recoveryStartTime ? Date.now() - this.recoveryStartTime : 0
        };
    }

    // Test utilities
    simulateStorageFailure(errorType) {
        this.storageService.setErrorMode(errorType);
    }

    simulateAIFailure(errorType) {
        this.aiService.setErrorMode(errorType);
    }

    simulateTimerFailure(errorType) {
        this.timerService.setErrorMode(errorType);
    }

    getAllOperationLogs() {
        return {
            storage: this.storageService.getOperationLog(),
            ai: this.aiService.getOperationLog(),
            timer: this.timerService.getOperationLog()
        };
    }

    reset() {
        // Reset all services
        this.storageService.reconnect();
        this.storageService.clearOperationLog();
        this.aiService.reset();
        this.timerService.setHealthy(true);
        this.timerService.setErrorMode(null);
        this.timerService.clearOperationLog();

        // Reset error tracking
        this.errorCounts = { storage: 0, ai: 0, timer: 0, system: 0 };
        this.recoveryAttempts = { storage: 0, ai: 0, timer: 0 };
        this.fallbackModes = { aiService: false, storageService: false, timerService: false };
        this.circuitBreakers = {
            storage: { open: false, lastFailure: 0, failures: 0 },
            ai: { open: false, lastFailure: 0, failures: 0 },
            timer: { open: false, lastFailure: 0, failures: 0 }
        };

        this.isRecovering = false;
        this.recoveryStartTime = null;
        this.logger.clear();
    }
}

/**
 * Error Handling Test Suite
 */
async function runErrorHandlingTests() {
    const runner = new TestRunner('🚨 Error Handling & Recovery Tests');

    // Create assertion helpers
    const assert = {
        ok: (condition, message) => TestAssertions.assertTrue(condition, message),
        equal: (actual, expected, message) => TestAssertions.assertEqual(actual, expected, message),
        notEqual: (actual, expected, message) => TestAssertions.assertTrue(actual !== expected, message || `Expected ${actual} to not equal ${expected}`),
        greaterThan: (actual, expected, message) => TestAssertions.assertTrue(actual > expected, message || `Expected ${actual} to be greater than ${expected}`),
        lessThan: (actual, expected, message) => TestAssertions.assertTrue(actual < expected, message || `Expected ${actual} to be less than ${expected}`),
        isNull: (value, message) => TestAssertions.assertTrue(value === null, message || `Expected ${value} to be null`),
        isNotNull: (value, message) => TestAssertions.assertTrue(value !== null, message || `Expected ${value} to not be null`),
        contains: (container, item, message) => TestAssertions.assertContains(container, item, message)
    };

    let errorSystem;

    // Setup before each test
    runner.beforeEach(async () => {
        errorSystem = new ErrorRecoverySystem();
    });

    // Cleanup after each test
    runner.afterEach(async () => {
        if (errorSystem) {
            errorSystem.reset();
        }
    });

    // Test 1: Database Connection Failure Recovery
    runner.test('should handle database connection failures and recover', async () => {
        const message = mockData.sampleMessage;

        // Simulate database connection failure
        errorSystem.simulateStorageFailure('database_lock');

        const result = await errorSystem.handleMessage(message);

        assert.greaterThan(result.errors.length, 0, 'Should report storage errors');
        assert.ok(result.fallbacksUsed.length > 0, 'Should use fallback mechanisms');

        const status = errorSystem.getSystemStatus();
        assert.greaterThan(status.errorCounts.storage, 0, 'Should track storage errors');

        // Test recovery
        const recoveryResult = await errorSystem.performSystemRecovery();
        assert.ok(recoveryResult.storage, 'Storage should recover successfully');

        const finalStatus = errorSystem.getSystemStatus();
        assert.ok(!finalStatus.fallbackModes.storageService, 'Should exit storage fallback mode');
    });

    // Test 2: AI Service Timeout and Retry Logic
    runner.test('should handle AI service timeouts with proper retry logic', async () => {
        const message = mockData.sampleMessage;

        // Simulate AI timeout
        errorSystem.simulateAIFailure('timeout');

        const startTime = Date.now();
        const result = await errorSystem.handleMessage(message);
        const processingTime = Date.now() - startTime;

        // Should have attempted retries (increasing processing time)
        assert.greaterThan(processingTime, 1000, 'Should show retry delays');
        assert.ok(result.fallbacksUsed.includes('fallback-ai-response'), 'Should use AI fallback');

        const aiLogs = errorSystem.aiService.getOperationLog();
        const retryLogs = aiLogs.filter(log => log.status === 'retry');
        assert.greaterThan(retryLogs.length, 0, 'Should show retry attempts');
    });

    // Test 3: Circuit Breaker Pattern
    runner.test('should implement circuit breaker pattern correctly', async () => {
        const message = mockData.sampleMessage;

        // Cause multiple failures to trigger circuit breaker
        errorSystem.simulateStorageFailure('database_lock');

        for (let i = 0; i < 4; i++) {
            await errorSystem.handleMessage(message);
        }

        const status = errorSystem.getSystemStatus();
        assert.ok(status.circuitBreakers.storage.open, 'Circuit breaker should be open');
        assert.greaterThan(status.circuitBreakers.storage.failures, 2, 'Should track failure count');
        assert.ok(status.fallbackModes.storageService, 'Should activate fallback mode');
    });

    // Test 4: Memory Leak Detection and Recovery
    runner.test('should detect and handle memory leak scenarios', async () => {
        // Simulate memory leak in timer service
        errorSystem.timerService.simulateMemoryLeak();

        const initialMemory = errorSystem.timerService.getMemoryUsage();

        // Trigger operations that cause memory growth
        for (let i = 0; i < 10; i++) {
            try {
                await errorSystem.timerService.getHealthStatus();
            } catch (error) {
                // Expected to fail eventually due to memory
                break;
            }
        }

        const currentMemory = errorSystem.timerService.getMemoryUsage();
        assert.greaterThan(currentMemory, initialMemory, 'Should detect memory growth');

        // Test cleanup reduces memory
        try {
            await errorSystem.timerService.cleanup();
            const postCleanupMemory = errorSystem.timerService.getMemoryUsage();
            assert.lessThan(postCleanupMemory, currentMemory, 'Cleanup should reduce memory usage');
        } catch (error) {
            // Cleanup might fail in severe cases - that's expected
            assert.ok(error.message.includes('memory') || error.message.includes('cleanup'), 'Should be memory-related error');
        }
    });

    // Test 5: Network Connectivity Issues
    runner.test('should handle network connectivity issues gracefully', async () => {
        const message = mockData.sampleMessage;

        // Simulate network errors
        errorSystem.simulateAIFailure('network_error');

        const result = await errorSystem.handleMessage(message);

        assert.ok(result.fallbacksUsed.includes('fallback-ai-response'), 'Should use fallback for network errors');
        assert.ok(result.errors.some(error => error.includes('ECONNREFUSED')), 'Should report network error');

        const aiLogs = errorSystem.aiService.getOperationLog();
        const networkErrorLogs = aiLogs.filter(log => log.error && log.error.includes('ECONNREFUSED'));
        assert.greaterThan(networkErrorLogs.length, 0, 'Should log network errors');
    });

    // Test 6: Rate Limiting and Backoff
    runner.test('should handle rate limiting with proper backoff', async () => {
        const message = mockData.sampleMessage;

        // Simulate rate limit exceeded
        errorSystem.simulateAIFailure('rate_limit');

        const result = await errorSystem.handleMessage(message);

        assert.ok(result.errors.some(error => error.includes('Rate limit')), 'Should report rate limit error');

        const aiLogs = errorSystem.aiService.getOperationLog();
        const rateLimitLogs = aiLogs.filter(log => log.error && log.error.includes('Rate limit'));
        assert.greaterThan(rateLimitLogs.length, 0, 'Should log rate limit errors');
    });

    // Test 7: Cascading Failure Prevention
    runner.test('should prevent cascading failures across services', async () => {
        const message = mockData.sampleMessage;

        // Simulate failures in multiple services
        errorSystem.simulateStorageFailure('database_lock');
        errorSystem.simulateAIFailure('service_down');
        errorSystem.simulateTimerFailure('timer_creation_failed');

        const result = await errorSystem.handleMessage(message);

        // System should still partially function with fallbacks
        assert.ok(result.fallbacksUsed.length > 0, 'Should use multiple fallbacks');
        assert.greaterThan(result.errors.length, 1, 'Should report multiple service errors');

        const status = errorSystem.getSystemStatus();
        assert.greaterThan(status.errorCounts.storage, 0, 'Should track storage errors');
        assert.greaterThan(status.errorCounts.ai, 0, 'Should track AI errors');
        assert.greaterThan(status.errorCounts.timer, 0, 'Should track timer errors');

        // Despite multiple failures, should not crash
        assert.ok(result.processingTime > 0, 'Should complete processing despite failures');
    });

    // Test 8: Data Consistency During Failures
    runner.test('should maintain data consistency during partial failures', async () => {
        const message = mockData.sampleMessage;

        // Simulate failure after partial operation
        errorSystem.simulateStorageFailure('constraint_violation');

        const result = await errorSystem.handleMessage(message);

        // Check that partial operations are handled gracefully
        const storageLogs = errorSystem.storageService.getOperationLog();
        const failedOperations = storageLogs.filter(log => log.status === 'error');
        assert.greaterThan(failedOperations.length, 0, 'Should log failed operations');

        // System should continue despite storage failures
        assert.ok(result.processingTime > 0, 'Should complete processing');
        assert.ok(result.fallbacksUsed.length > 0, 'Should use fallback mechanisms');
    });

    // Test 9: Service Recovery Verification
    runner.test('should verify service recovery is complete', async () => {
        const message = mockData.sampleMessage;

        // Cause service failures
        errorSystem.simulateStorageFailure('database_lock');
        errorSystem.simulateAIFailure('model_unavailable');

        // Process message to trigger failures
        await errorSystem.handleMessage(message);

        const initialStatus = errorSystem.getSystemStatus();
        assert.ok(initialStatus.fallbackModes.storageService, 'Storage should be in fallback mode');
        assert.ok(initialStatus.fallbackModes.aiService, 'AI should be in fallback mode');

        // Perform recovery
        const recoveryResult = await errorSystem.performSystemRecovery();
        assert.ok(recoveryResult.storage, 'Storage recovery should succeed');
        assert.ok(recoveryResult.ai, 'AI recovery should succeed');

        // Verify recovery is complete
        const finalStatus = errorSystem.getSystemStatus();
        assert.ok(!finalStatus.fallbackModes.storageService, 'Storage should exit fallback mode');
        assert.ok(!finalStatus.fallbackModes.aiService, 'AI should exit fallback mode');
        assert.ok(!finalStatus.circuitBreakers.storage.open, 'Storage circuit breaker should close');
        assert.ok(!finalStatus.circuitBreakers.ai.open, 'AI circuit breaker should close');

        // Process message again to verify full functionality
        const postRecoveryResult = await errorSystem.handleMessage(message);
        assert.equal(postRecoveryResult.fallbacksUsed.length, 0, 'Should not need fallbacks after recovery');
    });

    // Test 10: Error Logging and Monitoring
    runner.test('should provide comprehensive error logging and monitoring', async () => {
        const message = mockData.sampleMessage;

        // Generate various types of errors
        errorSystem.simulateStorageFailure('disk_full');
        await errorSystem.handleMessage(message);

        errorSystem.simulateAIFailure('auth_error');
        await errorSystem.handleMessage(message);

        // Check logging
        const logs = errorSystem.logger.logs;
        assert.greaterThan(logs.error.length, 0, 'Should log errors');
        assert.greaterThan(logs.warn.length, 0, 'Should log warnings');

        // Check operation logs
        const operationLogs = errorSystem.getAllOperationLogs();
        assert.ok(operationLogs.storage.length > 0, 'Should log storage operations');
        assert.ok(operationLogs.ai.length > 0, 'Should log AI operations');

        // Check error tracking
        const status = errorSystem.getSystemStatus();
        assert.greaterThan(status.errorCounts.storage, 0, 'Should track storage errors');
        assert.greaterThan(status.errorCounts.ai, 0, 'Should track AI errors');
    });

    // Test 11: Graceful Degradation
    runner.test('should gracefully degrade functionality under load', async () => {
        const messages = Array.from({ length: 5 }, (_, i) => ({
            ...mockData.sampleMessage,
            chat: { id: `chat-${i}@c.us` },
            body: `Test message ${i}`
        }));

        // Simulate high error rates
        errorSystem.simulateStorageFailure('database_lock');
        errorSystem.simulateAIFailure('timeout');

        const results = [];
        for (const message of messages) {
            const result = await errorSystem.handleMessage(message);
            results.push(result);
        }

        // Check that system handled load gracefully
        const successfulResults = results.filter(r => r.success);
        assert.greaterThan(successfulResults.length, 0, 'Should handle some messages successfully');

        const fallbacksUsed = results.reduce((acc, r) => acc + r.fallbacksUsed.length, 0);
        assert.greaterThan(fallbacksUsed, 0, 'Should use fallback mechanisms under load');

        const status = errorSystem.getSystemStatus();
        assert.ok(status.circuitBreakers.storage.open || status.circuitBreakers.ai.open,
            'Circuit breakers should engage under sustained failures');
    });

    // Test 12: Recovery Time Monitoring
    runner.test('should monitor and limit recovery time', async () => {
        const message = mockData.sampleMessage;

        // Simulate failure that triggers recovery
        errorSystem.simulateStorageFailure('database_lock');

        // Process multiple messages to trigger circuit breaker
        for (let i = 0; i < 4; i++) {
            await errorSystem.handleMessage(message);
        }

        const preRecoveryStatus = errorSystem.getSystemStatus();
        assert.ok(preRecoveryStatus.circuitBreakers.storage.open, 'Circuit breaker should be open');

        // Start recovery and monitor time
        const recoveryStartTime = Date.now();
        const recoveryResult = await errorSystem.performSystemRecovery();
        const recoveryTime = Date.now() - recoveryStartTime;

        assert.ok(recoveryResult.storage, 'Recovery should succeed');
        assert.lessThan(recoveryTime, errorSystem.maxRecoveryTime, 'Recovery should complete within time limit');

        const postRecoveryStatus = errorSystem.getSystemStatus();
        assert.ok(!postRecoveryStatus.circuitBreakers.storage.open, 'Circuit breaker should close after recovery');
    });

    return runner.run();
}

// Export for use in test runner
module.exports = runErrorHandlingTests;

// Run tests if this file is executed directly
if (require.main === module) {
    runErrorHandlingTests()
        .then(report => {
            console.log('\n🎉 Error Handling Testing Complete!');
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
            console.error('Error handling tests failed to run:', error);
            process.exit(1);
        });
}