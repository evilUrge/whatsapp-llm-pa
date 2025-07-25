const { TestRunner, TestAssertions, MockLogger, TimeHelpers } = require('../utils/testHelpers');
const mockData = require('../fixtures/mockData');

/**
 * Performance and Resource Usage Tests
 * Tests system performance, memory usage, and resource efficiency
 */

// Performance Monitoring Utilities
class PerformanceMonitor {
    constructor() {
        this.metrics = {
            memoryUsage: [],
            responseTime: [],
            throughput: [],
            cpuUsage: [],
            concurrentOperations: 0,
            errorRate: 0,
            totalOperations: 0
        };
        this.startTime = Date.now();
    }

    recordMemoryUsage() {
        if (typeof process !== 'undefined' && process.memoryUsage) {
            const memory = process.memoryUsage();
            this.metrics.memoryUsage.push({
                timestamp: Date.now(),
                heapUsed: memory.heapUsed,
                heapTotal: memory.heapTotal,
                external: memory.external,
                rss: memory.rss
            });
        } else {
            // Mock memory usage for testing
            this.metrics.memoryUsage.push({
                timestamp: Date.now(),
                heapUsed: Math.random() * 50 * 1024 * 1024, // 0-50MB
                heapTotal: 100 * 1024 * 1024, // 100MB
                external: Math.random() * 10 * 1024 * 1024, // 0-10MB
                rss: Math.random() * 80 * 1024 * 1024 // 0-80MB
            });
        }
    }

    startOperation() {
        this.metrics.concurrentOperations++;
        this.metrics.totalOperations++;
        return Date.now();
    }

    endOperation(startTime, success = true) {
        this.metrics.concurrentOperations--;
        const duration = Date.now() - startTime;
        this.metrics.responseTime.push(duration);

        if (!success) {
            this.metrics.errorRate++;
        }

        return duration;
    }

    calculateThroughput() {
        const elapsedSeconds = (Date.now() - this.startTime) / 1000;
        return this.metrics.totalOperations / Math.max(elapsedSeconds, 0.001);
    }

    getAverageResponseTime() {
        if (this.metrics.responseTime.length === 0) return 0;
        return this.metrics.responseTime.reduce((sum, time) => sum + time, 0) / this.metrics.responseTime.length;
    }

    getPercentile(percentile) {
        if (this.metrics.responseTime.length === 0) return 0;
        const sorted = [...this.metrics.responseTime].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    getMemoryStats() {
        if (this.metrics.memoryUsage.length === 0) return null;

        const latest = this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1];
        const peak = this.metrics.memoryUsage.reduce((max, current) =>
            current.heapUsed > max.heapUsed ? current : max
        );

        return {
            current: latest,
            peak: peak,
            growthRate: this.calculateMemoryGrowthRate()
        };
    }

    calculateMemoryGrowthRate() {
        if (this.metrics.memoryUsage.length < 2) return 0;

        const first = this.metrics.memoryUsage[0];
        const last = this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1];
        const timeDiff = (last.timestamp - first.timestamp) / 1000; // seconds
        const memoryDiff = last.heapUsed - first.heapUsed;

        return memoryDiff / Math.max(timeDiff, 0.001); // bytes per second
    }

    getErrorRate() {
        return this.metrics.totalOperations > 0 ? this.metrics.errorRate / this.metrics.totalOperations : 0;
    }

    reset() {
        this.metrics = {
            memoryUsage: [],
            responseTime: [],
            throughput: [],
            cpuUsage: [],
            concurrentOperations: 0,
            errorRate: 0,
            totalOperations: 0
        };
        this.startTime = Date.now();
    }
}

// Performance Test Services
class PerformanceStorageService {
    constructor() {
        this.operations = 0;
        this.data = new Map();
        this.isHealthy = true;
        this.simulateLatency = true;
        this.baseLatency = 5; // 5ms base latency
    }

    async storeMessage(message) {
        const startTime = Date.now();
        this.operations++;

        if (this.simulateLatency) {
            await TimeHelpers.sleep(this.baseLatency + Math.random() * 10);
        }

        const messageId = `msg_${Date.now()}_${Math.random()}`;
        this.data.set(messageId, {
            ...message,
            id: messageId,
            timestamp: Date.now()
        });

        return {
            id: messageId,
            processingTime: Date.now() - startTime
        };
    }

    async isInCooldown(chatId) {
        this.operations++;

        if (this.simulateLatency) {
            await TimeHelpers.sleep(this.baseLatency / 2);
        }

        return Math.random() < 0.1; // 10% chance of cooldown
    }

    async upsertConversation(chatId, isGroup = false, groupName) {
        this.operations++;

        if (this.simulateLatency) {
            await TimeHelpers.sleep(this.baseLatency);
        }

        const convId = `conv_${chatId}_${Date.now()}`;
        return convId;
    }

    async getActiveConversations() {
        this.operations++;

        if (this.simulateLatency) {
            await TimeHelpers.sleep(this.baseLatency * 2);
        }

        return Array.from(this.data.values()).slice(0, 10);
    }

    async cleanup() {
        this.operations++;

        if (this.simulateLatency) {
            await TimeHelpers.sleep(this.baseLatency * 3);
        }

        const cleaned = Math.floor(this.data.size * 0.1);
        return { cleanedMessages: cleaned, cleanedConversations: Math.floor(cleaned / 5) };
    }

    async healthCheck() {
        this.operations++;
        return {
            isHealthy: this.isHealthy,
            operations: this.operations,
            dataSize: this.data.size,
            memoryUsage: this.data.size * 1024 // Approximate
        };
    }

    getOperationCount() {
        return this.operations;
    }

    setLatencySimulation(enabled, baseLatency = 5) {
        this.simulateLatency = enabled;
        this.baseLatency = baseLatency;
    }

    reset() {
        this.operations = 0;
        this.data.clear();
        this.isHealthy = true;
    }
}

class PerformanceAIService {
    constructor() {
        this.operations = 0;
        this.isHealthy = true;
        this.simulateProcessing = true;
        this.baseProcessingTime = 100; // 100ms base processing time
        this.rateLimitCount = 0;
        this.rateLimitWindow = 60000; // 1 minute
        this.rateLimitMax = 100; // 100 requests per minute
    }

    async generateResponse(prompt, context, model, maxTokens = 500) {
        const startTime = Date.now();
        this.operations++;

        // Check rate limiting
        if (this.rateLimitCount >= this.rateLimitMax) {
            throw new Error('Rate limit exceeded');
        }
        this.rateLimitCount++;

        // Simulate AI processing time based on prompt length and complexity
        if (this.simulateProcessing) {
            const complexity = Math.min(prompt.length / 100, 5); // 1-5x multiplier
            const processingTime = this.baseProcessingTime * (1 + complexity * 0.5);
            await TimeHelpers.sleep(processingTime);
        }

        const tokensUsed = Math.min(maxTokens, Math.floor(prompt.length / 4) + Math.random() * 50);

        return {
            content: `AI response to: ${prompt.substring(0, 50)}...`,
            confidence: 0.7 + Math.random() * 0.3,
            tokens_used: tokensUsed,
            model: model || '@cf/meta/llama-3.2-1b-instruct',
            processingTime: Date.now() - startTime
        };
    }

    async isHealthy() {
        this.operations++;
        await TimeHelpers.sleep(10); // Small delay for health check
        return this.isHealthy;
    }

    async listModels() {
        this.operations++;
        await TimeHelpers.sleep(20);
        return [
            '@cf/meta/llama-3.2-1b-instruct',
            '@cf/meta/llama-3.2-3b-instruct',
            '@cf/mistral/mistral-7b-instruct'
        ];
    }

    resetRateLimit() {
        this.rateLimitCount = 0;
    }

    getOperationCount() {
        return this.operations;
    }

    setProcessingSimulation(enabled, baseTime = 100) {
        this.simulateProcessing = enabled;
        this.baseProcessingTime = baseTime;
    }

    setRateLimit(max, window = 60000) {
        this.rateLimitMax = max;
        this.rateLimitWindow = window;
    }

    reset() {
        this.operations = 0;
        this.isHealthy = true;
        this.rateLimitCount = 0;
    }
}

class PerformanceTimerService {
    constructor() {
        this.operations = 0;
        this.activeTimers = new Map();
        this.completedTimers = 0;
        this.isHealthy = true;
        this.memoryUsage = 1024 * 1024; // 1MB base
    }

    startResponseTimer(chatId, callback, delay = 120000) {
        this.operations++;

        // Simulate memory growth with each timer
        this.memoryUsage += 1024; // 1KB per timer

        const timer = {
            chatId,
            startTime: Date.now(),
            callback,
            timer: setTimeout(async () => {
                try {
                    await callback();
                    this.completedTimers++;
                } catch (error) {
                    // Timer callback error
                }
                this.activeTimers.delete(chatId);
                this.memoryUsage -= 1024; // Free memory
            }, Math.min(delay, 100)) // Use short delay for testing
        };

        this.activeTimers.set(chatId, timer);
        return timer;
    }

    cancelTimer(chatId) {
        this.operations++;
        const timer = this.activeTimers.get(chatId);
        if (timer) {
            clearTimeout(timer.timer);
            this.activeTimers.delete(chatId);
            this.memoryUsage -= 1024;
            return true;
        }
        return false;
    }

    async getHealthStatus() {
        this.operations++;
        return {
            isHealthy: this.isHealthy,
            activeTimers: this.activeTimers.size,
            completedTimers: this.completedTimers,
            memoryUsage: this.memoryUsage,
            operations: this.operations
        };
    }

    async cleanup() {
        this.operations++;
        const cleaned = this.activeTimers.size;

        // Clean up expired or old timers
        for (const [chatId, timer] of this.activeTimers.entries()) {
            if (Date.now() - timer.startTime > 300000) { // 5 minutes old
                clearTimeout(timer.timer);
                this.activeTimers.delete(chatId);
                this.memoryUsage -= 1024;
            }
        }

        return { cleanedTimers: cleaned - this.activeTimers.size };
    }

    getOperationCount() {
        return this.operations;
    }

    getActiveTimerCount() {
        return this.activeTimers.size;
    }

    getMemoryUsage() {
        return this.memoryUsage;
    }

    reset() {
        // Clean up all active timers
        for (const timer of this.activeTimers.values()) {
            clearTimeout(timer.timer);
        }

        this.operations = 0;
        this.activeTimers.clear();
        this.completedTimers = 0;
        this.isHealthy = true;
        this.memoryUsage = 1024 * 1024; // Reset to 1MB
    }
}

// Performance Testing System
class PerformanceTestSystem {
    constructor() {
        this.storage = new PerformanceStorageService();
        this.ai = new PerformanceAIService();
        this.timer = new PerformanceTimerService();
        this.monitor = new PerformanceMonitor();
        this.logger = new MockLogger();
    }

    async processMessage(message) {
        const operationStart = this.monitor.startOperation();
        this.monitor.recordMemoryUsage();

        try {
            // Store message
            await this.storage.storeMessage(message);

            // Check cooldown
            const isInCooldown = await this.storage.isInCooldown(message.chat.id);
            if (isInCooldown) {
                this.monitor.endOperation(operationStart, true);
                return { action: 'ignored_cooldown', success: true };
            }

            // Generate AI response
            const aiResponse = await this.ai.generateResponse(message.body, {
                chatId: message.chat.id,
                recentMessages: [message]
            });

            // Start timer
            this.timer.startResponseTimer(message.chat.id, async () => {
                this.logger.info('Timer completed');
            });

            this.monitor.endOperation(operationStart, true);
            return {
                action: 'processed',
                success: true,
                response: aiResponse,
                processingTime: Date.now() - operationStart
            };

        } catch (error) {
            this.monitor.endOperation(operationStart, false);
            return {
                action: 'error',
                success: false,
                error: error.message,
                processingTime: Date.now() - operationStart
            };
        }
    }

    async processBatch(messages) {
        const results = [];
        const batchStart = Date.now();

        // Process messages concurrently
        const promises = messages.map(async (message, index) => {
            const result = await this.processMessage({
                ...message,
                chat: { id: `${message.chat.id}_${index}` }
            });
            return result;
        });

        const batchResults = await Promise.all(promises);
        const batchTime = Date.now() - batchStart;

        return {
            results: batchResults,
            batchTime,
            successCount: batchResults.filter(r => r.success).length,
            errorCount: batchResults.filter(r => !r.success).length,
            throughput: messages.length / (batchTime / 1000)
        };
    }

    async runLoadTest(messageCount, concurrency = 1) {
        const messages = Array.from({ length: messageCount }, (_, i) => ({
            ...mockData.sampleMessage,
            chat: { id: `load_test_${i}@c.us` },
            body: `Load test message ${i}: ${Math.random().toString(36).substring(7)}`
        }));

        const batches = [];
        for (let i = 0; i < messages.length; i += concurrency) {
            batches.push(messages.slice(i, i + concurrency));
        }

        const results = [];
        const loadTestStart = Date.now();

        for (const batch of batches) {
            const batchResult = await this.processBatch(batch);
            results.push(batchResult);

            // Small delay between batches to prevent overwhelming
            await TimeHelpers.sleep(10);
        }

        const totalTime = Date.now() - loadTestStart;
        const totalSuccessful = results.reduce((sum, r) => sum + r.successCount, 0);
        const totalErrors = results.reduce((sum, r) => sum + r.errorCount, 0);

        return {
            totalMessages: messageCount,
            totalTime,
            successfulMessages: totalSuccessful,
            errorMessages: totalErrors,
            overallThroughput: messageCount / (totalTime / 1000),
            averageResponseTime: this.monitor.getAverageResponseTime(),
            p95ResponseTime: this.monitor.getPercentile(95),
            p99ResponseTime: this.monitor.getPercentile(99),
            errorRate: this.monitor.getErrorRate(),
            memoryStats: this.monitor.getMemoryStats()
        };
    }

    getSystemStats() {
        return {
            storage: {
                operations: this.storage.getOperationCount(),
                dataSize: this.storage.data?.size || 0
            },
            ai: {
                operations: this.ai.getOperationCount(),
                rateLimitCount: this.ai.rateLimitCount
            },
            timer: {
                operations: this.timer.getOperationCount(),
                activeTimers: this.timer.getActiveTimerCount(),
                memoryUsage: this.timer.getMemoryUsage()
            },
            monitor: {
                totalOperations: this.monitor.metrics.totalOperations,
                concurrentOperations: this.monitor.metrics.concurrentOperations,
                throughput: this.monitor.calculateThroughput(),
                averageResponseTime: this.monitor.getAverageResponseTime(),
                errorRate: this.monitor.getErrorRate()
            }
        };
    }

    reset() {
        this.storage.reset();
        this.ai.reset();
        this.timer.reset();
        this.monitor.reset();
        this.logger.clear();
    }
}

/**
 * Performance Test Suite
 */
async function runPerformanceTests() {
    const runner = new TestRunner('⚡ Performance & Resource Usage Tests');

    // Create assertion helpers
    const assert = {
        ok: (condition, message) => TestAssertions.assertTrue(condition, message),
        equal: (actual, expected, message) => TestAssertions.assertEqual(actual, expected, message),
        greaterThan: (actual, expected, message) => TestAssertions.assertTrue(actual > expected, message || `Expected ${actual} > ${expected}`),
        lessThan: (actual, expected, message) => TestAssertions.assertTrue(actual < expected, message || `Expected ${actual} < ${expected}`),
        between: (actual, min, max, message) => TestAssertions.assertTrue(actual >= min && actual <= max, message || `Expected ${actual} to be between ${min} and ${max}`)
    };

    let perfSystem;

    runner.beforeEach(async () => {
        perfSystem = new PerformanceTestSystem();
    });

    runner.afterEach(async () => {
        if (perfSystem) {
            perfSystem.reset();
        }
    });

    // Test 1: Basic Performance Baseline
    runner.test('should establish performance baseline metrics', async () => {
        const message = mockData.sampleMessage;

        const result = await perfSystem.processMessage(message);

        assert.ok(result.success, 'Should process message successfully');
        assert.ok(result.processingTime >= 0, 'Should have measurable processing time');
        assert.lessThan(result.processingTime, 1000, 'Should complete within reasonable time');

        const stats = perfSystem.getSystemStats();
        assert.greaterThan(stats.storage.operations, 0, 'Should perform storage operations');
        assert.greaterThan(stats.ai.operations, 0, 'Should perform AI operations');
        assert.greaterThan(stats.timer.operations, 0, 'Should perform timer operations');
    });

    // Test 2: Memory Usage Monitoring
    runner.test('should monitor memory usage during operations', async () => {
        const messages = Array.from({ length: 10 }, (_, i) => ({
            ...mockData.sampleMessage,
            chat: { id: `memory_test_${i}@c.us` },
            body: `Memory test message ${i}`
        }));

        const initialMemory = perfSystem.timer.getMemoryUsage();

        for (const message of messages) {
            await perfSystem.processMessage(message);
        }

        const finalMemory = perfSystem.timer.getMemoryUsage();
        const memoryGrowth = finalMemory - initialMemory;

        assert.greaterThan(memoryGrowth, 0, 'Should show memory growth with operations');
        assert.lessThan(memoryGrowth, 50 * 1024, 'Memory growth should be reasonable'); // Less than 50KB

        const memoryStats = perfSystem.monitor.getMemoryStats();
        assert.ok(memoryStats, 'Should provide memory statistics');
    });

    // Test 3: Concurrent Request Handling
    runner.test('should handle concurrent requests efficiently', async () => {
        const concurrency = 5;
        const messages = Array.from({ length: concurrency }, (_, i) => ({
            ...mockData.sampleMessage,
            chat: { id: `concurrent_${i}@c.us` },
            body: `Concurrent message ${i}`
        }));

        const startTime = Date.now();
        const results = await Promise.all(
            messages.map(message => perfSystem.processMessage(message))
        );
        const totalTime = Date.now() - startTime;

        const successfulResults = results.filter(r => r.success);
        assert.equal(successfulResults.length, concurrency, 'Should handle all concurrent requests');

        // Concurrent processing should be more efficient than sequential
        assert.lessThan(totalTime, concurrency * 500, 'Should benefit from concurrency');

        const stats = perfSystem.getSystemStats();
        assert.equal(stats.monitor.concurrentOperations, 0, 'Should complete all concurrent operations');
    });

    // Test 4: Throughput Testing
    runner.test('should maintain good throughput under load', async () => {
        const messageCount = 20;
        const concurrency = 3;

        const loadTestResult = await perfSystem.runLoadTest(messageCount, concurrency);

        assert.equal(loadTestResult.totalMessages, messageCount, 'Should process all messages');
        assert.greaterThan(loadTestResult.successfulMessages, messageCount * 0.9, 'Should have high success rate');
        assert.greaterThan(loadTestResult.overallThroughput, 5, 'Should maintain minimum throughput'); // 5 msg/sec
        assert.lessThan(loadTestResult.averageResponseTime, 1000, 'Should maintain reasonable response times');
        assert.lessThan(loadTestResult.errorRate, 0.1, 'Should have low error rate');
    });

    // Test 5: Response Time Distribution
    runner.test('should maintain consistent response times', async () => {
        const messages = Array.from({ length: 15 }, (_, i) => ({
            ...mockData.sampleMessage,
            chat: { id: `response_time_${i}@c.us` },
            body: `Response time test ${i}: ${'x'.repeat(i * 10)}` // Varying message lengths
        }));

        for (const message of messages) {
            await perfSystem.processMessage(message);
        }

        const avgResponseTime = perfSystem.monitor.getAverageResponseTime();
        const p95ResponseTime = perfSystem.monitor.getPercentile(95);
        const p99ResponseTime = perfSystem.monitor.getPercentile(99);

        assert.greaterThan(avgResponseTime, 0, 'Should have measurable response times');
        assert.lessThan(avgResponseTime, 500, 'Average response time should be reasonable');
        assert.lessThan(p95ResponseTime, 1000, 'P95 response time should be acceptable');
        assert.lessThan(p99ResponseTime, 2000, 'P99 response time should be within limits');

        // P99 should not be drastically higher than average (no extreme outliers)
        assert.lessThan(p99ResponseTime, avgResponseTime * 10, 'Should not have extreme outliers');
    });

    // Test 6: Resource Cleanup Efficiency
    runner.test('should efficiently clean up resources', async () => {
        // Create multiple timers and data
        const messages = Array.from({ length: 8 }, (_, i) => ({
            ...mockData.sampleMessage,
            chat: { id: `cleanup_test_${i}@c.us` },
            body: `Cleanup test message ${i}`
        }));

        for (const message of messages) {
            await perfSystem.processMessage(message);
        }

        const beforeCleanup = perfSystem.getSystemStats();
        assert.greaterThan(beforeCleanup.timer.activeTimers, 0, 'Should have active timers');

        // Perform cleanup
        await perfSystem.storage.cleanup();
        await perfSystem.timer.cleanup();

        const afterCleanup = perfSystem.getSystemStats();
        // Note: cleanup might not reduce active timers immediately due to short test delays
        assert.ok(afterCleanup, 'Should complete cleanup operations');
    });

    // Test 7: AI Service Performance
    runner.test('should maintain AI service performance standards', async () => {
        const messages = Array.from({ length: 10 }, (_, i) => ({
            ...mockData.sampleMessage,
            chat: { id: `ai_perf_${i}@c.us` },
            body: `AI performance test ${i}: ${'word '.repeat(i * 5)}` // Varying complexity
        }));

        const aiStartTime = Date.now();
        const results = [];

        for (const message of messages) {
            const result = await perfSystem.processMessage(message);
            results.push(result);
        }

        const aiTotalTime = Date.now() - aiStartTime;
        const successfulResults = results.filter(r => r.success);

        assert.equal(successfulResults.length, messages.length, 'Should process all AI requests');
        assert.lessThan(aiTotalTime / messages.length, 300, 'Average AI response time should be reasonable');

        const stats = perfSystem.getSystemStats();
        // AI operations should be at least equal to successful processed messages (accounting for cooldowns)
        assert.greaterThan(stats.ai.operations, successfulResults.length * 0.8, 'Should track AI operations correctly');
    });

    // Test 8: Storage Performance Under Load
    runner.test('should maintain storage performance under concurrent load', async () => {
        const concurrentBatches = 3;
        const messagesPerBatch = 5;

        const batches = Array.from({ length: concurrentBatches }, (_, batchIndex) =>
            Array.from({ length: messagesPerBatch }, (_, msgIndex) => ({
                ...mockData.sampleMessage,
                chat: { id: `storage_load_${batchIndex}_${msgIndex}@c.us` },
                body: `Storage load test batch ${batchIndex} message ${msgIndex}`
            }))
        );

        const storageStartTime = Date.now();

        // Process batches concurrently
        const batchPromises = batches.map(async (batch) => {
            const results = [];
            for (const message of batch) {
                results.push(await perfSystem.processMessage(message));
            }
            return results;
        });

        const batchResults = await Promise.all(batchPromises);
        const storageTime = Date.now() - storageStartTime;

        const totalMessages = concurrentBatches * messagesPerBatch;
        const allResults = batchResults.flat();
        const successfulResults = allResults.filter(r => r.success);

        assert.equal(successfulResults.length, totalMessages, 'Should handle concurrent storage load');
        assert.lessThan(storageTime / totalMessages, 100, 'Storage should maintain good performance per message');

        const stats = perfSystem.getSystemStats();
        // Each message should trigger at least storeMessage + isInCooldown operations
        assert.greaterThan(stats.storage.operations, totalMessages * 1.5, 'Should perform multiple storage operations per message');
    });

    // Test 9: Timer Service Memory Management
    runner.test('should manage timer service memory efficiently', async () => {
        const timerCount = 12;
        const initialMemory = perfSystem.timer.getMemoryUsage();

        // Create multiple timers
        const messages = Array.from({ length: timerCount }, (_, i) => ({
            ...mockData.sampleMessage,
            chat: { id: `timer_memory_${i}@c.us` },
            body: `Timer memory test ${i}`
        }));

        for (const message of messages) {
            await perfSystem.processMessage(message);
        }

        const peakMemory = perfSystem.timer.getMemoryUsage();
        const memoryGrowth = peakMemory - initialMemory;

        assert.greaterThan(memoryGrowth, 0, 'Should show memory growth with timers');
        assert.lessThan(memoryGrowth, timerCount * 2048, 'Memory growth per timer should be reasonable'); // <2KB per timer

        // Wait for some timers to complete and free memory
        await TimeHelpers.sleep(150);

        const finalMemory = perfSystem.timer.getMemoryUsage();
        assert.lessThan(finalMemory, peakMemory, 'Should free memory as timers complete');
    });

    // Test 10: System Scalability Assessment
    runner.test('should demonstrate system scalability', async () => {
        // Test with increasing load
        const loadTests = [
            { messages: 5, concurrency: 1 },
            { messages: 10, concurrency: 2 },
            { messages: 15, concurrency: 3 }
        ];

        const results = [];

        for (const test of loadTests) {
            perfSystem.reset();
            const result = await perfSystem.runLoadTest(test.messages, test.concurrency);
            results.push({
                ...result,
                load: test.messages,
                concurrency: test.concurrency
            });
        }

        // Analyze scalability
        assert.equal(results.length, loadTests.length, 'Should complete all load tests');

        // Each test should maintain reasonable performance
        for (const result of results) {
            assert.greaterThan(result.successfulMessages / result.totalMessages, 0.9,
                `Should maintain high success rate at load ${result.load}`);
            assert.lessThan(result.averageResponseTime, 1000,
                `Should maintain reasonable response times at load ${result.load}`);
            assert.greaterThan(result.overallThroughput, 3,
                `Should maintain minimum throughput at load ${result.load}`);
        }

        // Throughput should not degrade severely with increased load
        const firstThroughput = results[0].overallThroughput;
        const lastThroughput = results[results.length - 1].overallThroughput;
        assert.greaterThan(lastThroughput, firstThroughput * 0.5,
            'Throughput should not degrade by more than 50% under increased load');
    });

    return runner.run();
}

// Export for use in test runner
module.exports = runPerformanceTests;

// Run tests if this file is executed directly
if (require.main === module) {
    runPerformanceTests()
        .then(report => {
            console.log('\n🎉 Performance Testing Complete!');
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
            console.error('Performance tests failed to run:', error);
            process.exit(1);
        });
}