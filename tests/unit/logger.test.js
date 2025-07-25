/**
 * Unit Tests for Logger
 * Tests the structured logging and correlation ID functionality
 */

const { TestRunner, TestAssertions, TestEnvironment } = require('../utils/testHelpers');

async function testLogger() {
    const runner = new TestRunner('Logger Unit Tests');

    let Logger;

    runner.beforeAll(async () => {
        // Import Logger from compiled code
        const mainModule = require('../../dist/main');
        Logger = mainModule.Logger;
    });

    runner.test('should create logger with correlation ID', async () => {
        const logger = new Logger();
        TestAssertions.assertTrue(logger.correlationId.includes('whatsapp-llm-'), 'Correlation ID should have correct prefix');
        TestAssertions.assertTrue(logger.correlationId.length > 20, 'Correlation ID should be sufficiently long');
    });

    runner.test('should respect log level settings', async () => {
        await TestEnvironment.withTestEnv({ LOG_LEVEL: 'warn' }, async () => {
            const logger = new Logger();

            // Mock console methods to capture output
            const originalLog = console.log;
            const originalWarn = console.warn;
            const originalError = console.error;

            let logCalls = [];
            let warnCalls = [];
            let errorCalls = [];

            console.log = (...args) => logCalls.push(args);
            console.warn = (...args) => warnCalls.push(args);
            console.error = (...args) => errorCalls.push(args);

            try {
                logger.debug('Debug message');
                logger.info('Info message');
                logger.warn('Warning message');
                logger.error('Error message');

                // Only warn and error should be logged when level is 'warn'
                TestAssertions.assertEqual(logCalls.length, 0, 'Debug and info should not be logged');
                TestAssertions.assertEqual(warnCalls.length, 1, 'Warning should be logged');
                TestAssertions.assertEqual(errorCalls.length, 1, 'Error should be logged');
            } finally {
                console.log = originalLog;
                console.warn = originalWarn;
                console.error = originalError;
            }
        });
    });

    runner.test('should format messages as structured JSON', async () => {
        const logger = new Logger();

        const originalLog = console.log;
        let capturedLog = null;
        console.log = (message) => { capturedLog = message; };

        try {
            logger.info('Test message', { key: 'value', number: 42 });

            TestAssertions.assertTrue(capturedLog !== null, 'Log message should be captured');

            const logObject = JSON.parse(capturedLog);
            TestAssertions.assertEqual(logObject.level, 'INFO', 'Log level should be uppercase');
            TestAssertions.assertEqual(logObject.message, 'Test message', 'Message should match');
            TestAssertions.assertTrue(logObject.timestamp, 'Timestamp should be present');
            TestAssertions.assertTrue(logObject.correlationId, 'Correlation ID should be present');
            TestAssertions.assertEqual(logObject.context.key, 'value', 'Context should be included');
            TestAssertions.assertEqual(logObject.context.number, 42, 'Context should preserve data types');
        } finally {
            console.log = originalLog;
        }
    });

    runner.test('should allow setting custom correlation ID', async () => {
        const logger = new Logger();
        const customId = 'custom-correlation-123';

        logger.setCorrelationId(customId);

        const originalLog = console.log;
        let capturedLog = null;
        console.log = (message) => { capturedLog = message; };

        try {
            logger.info('Test message');
            const logObject = JSON.parse(capturedLog);
            TestAssertions.assertEqual(logObject.correlationId, customId, 'Custom correlation ID should be used');
        } finally {
            console.log = originalLog;
        }
    });

    runner.test('should handle logging without context', async () => {
        const logger = new Logger();

        const originalLog = console.log;
        let capturedLog = null;
        console.log = (message) => { capturedLog = message; };

        try {
            logger.info('Message without context');
            const logObject = JSON.parse(capturedLog);
            TestAssertions.assertEqual(logObject.message, 'Message without context');
            TestAssertions.assertTrue(logObject.context === undefined, 'Context should not be present');
        } finally {
            console.log = originalLog;
        }
    });

    return await runner.run();
}

async function testServiceRegistry() {
    const runner = new TestRunner('ServiceRegistry Unit Tests');

    let ServiceRegistry, Logger;
    let logger, registry;

    runner.beforeAll(async () => {
        const mainModule = require('../../dist/main');
        ServiceRegistry = mainModule.ServiceRegistry;
        Logger = mainModule.Logger;
    });

    runner.beforeEach(async () => {
        logger = new Logger();
        registry = new ServiceRegistry(logger);
    });

    runner.afterEach(async () => {
        if (registry) {
            await registry.shutdown();
        }
    });

    runner.test('should register and retrieve services', async () => {
        const mockService = { name: 'test-service', isHealthy: () => true };

        registry.register('testService', mockService);
        const retrieved = registry.get('testService');

        TestAssertions.assertEqual(retrieved, mockService, 'Retrieved service should match registered service');
    });

    runner.test('should return undefined for non-existent service', async () => {
        const retrieved = registry.get('nonExistentService');
        TestAssertions.assertEqual(retrieved, undefined, 'Non-existent service should return undefined');
    });

    runner.test('should track service metrics on registration', async () => {
        const mockService = { name: 'test-service' };

        registry.register('testService', mockService);
        const metrics = registry.getMetrics();

        TestAssertions.assertTrue(metrics.services.testService, 'Service should be tracked in metrics');
        TestAssertions.assertTrue(metrics.services.testService.initialized, 'Service should be marked as initialized');
    });

    runner.test('should perform health checks on services', async () => {
        const healthyService = {
            name: 'healthy-service',
            getHealthStatus: async () => ({ isHealthy: true, status: 'All good' })
        };
        const unhealthyService = {
            name: 'unhealthy-service',
            isHealthy: async () => false
        };

        registry.register('healthyService', healthyService);
        registry.register('unhealthyService', unhealthyService);

        const healthResults = await registry.checkAllServicesHealth();

        TestAssertions.assertEqual(healthResults.length, 2, 'Should return health status for all services');

        const healthyResult = healthResults.find(r => r.name === 'healthyService');
        const unhealthyResult = healthResults.find(r => r.name === 'unhealthyService');

        TestAssertions.assertTrue(healthyResult.isHealthy, 'Healthy service should report healthy');
        TestAssertions.assertFalse(unhealthyResult.isHealthy, 'Unhealthy service should report unhealthy');
    });

    runner.test('should handle service health check errors gracefully', async () => {
        const faultyService = {
            name: 'faulty-service',
            getHealthStatus: async () => { throw new Error('Health check failed'); }
        };

        registry.register('faultyService', faultyService);

        const healthResults = await registry.checkAllServicesHealth();
        const result = healthResults.find(r => r.name === 'faultyService');

        TestAssertions.assertFalse(result.isHealthy, 'Service with error should report unhealthy');
        TestAssertions.assertEqual(result.status, 'error', 'Status should be error');
        TestAssertions.assertTrue(result.details.error.includes('Health check failed'), 'Error details should be included');
    });

    runner.test('should update metrics correctly', async () => {
        const initialMetrics = registry.getMetrics();

        TestAssertions.assertTrue(initialMetrics.uptime >= 0, 'Uptime should be non-negative');
        TestAssertions.assertTrue(initialMetrics.startTime <= Date.now(), 'Start time should be in the past');
        TestAssertions.assertTrue(initialMetrics.memory.percentage >= 0, 'Memory percentage should be non-negative');
    });

    runner.test('should shutdown services in correct order', async () => {
        const shutdownOrder = [];

        const service1 = {
            name: 'service1',
            destroy: async () => { shutdownOrder.push('service1'); }
        };
        const service2 = {
            name: 'service2',
            close: async () => { shutdownOrder.push('service2'); }
        };

        registry.register('whatsappClient', service1); // Should be shut down first
        registry.register('storageService', service2); // Should be shut down last

        await registry.shutdown();

        TestAssertions.assertEqual(shutdownOrder[0], 'service1', 'WhatsApp client should shutdown first');
        TestAssertions.assertEqual(shutdownOrder[1], 'service2', 'Storage service should shutdown last');
    });

    return await runner.run();
}

async function main() {
    console.log('🧪 Running Logger and ServiceRegistry Unit Tests\n');

    try {
        const results = [];
        results.push(await testLogger());
        results.push(await testServiceRegistry());

        // Summary
        const totalPassed = results.reduce((sum, result) => sum + result.passed, 0);
        const totalFailed = results.reduce((sum, result) => sum + result.failed, 0);

        console.log('\n' + '='.repeat(70));
        console.log('🏁 Logger & ServiceRegistry Test Summary');
        console.log('='.repeat(70));
        console.log(`✅ Total Passed: ${totalPassed}`);
        console.log(`❌ Total Failed: ${totalFailed}`);
        console.log(`📊 Total Tests:  ${totalPassed + totalFailed}`);

        const success = totalFailed === 0;
        console.log(`\n${success ? '🎉' : '💥'} Logger & ServiceRegistry tests ${success ? 'completed successfully' : 'failed'}`);

        process.exit(success ? 0 : 1);

    } catch (error) {
        console.error('💥 Test execution failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { testLogger, testServiceRegistry };