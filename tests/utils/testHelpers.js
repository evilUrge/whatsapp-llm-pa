/**
 * Test Helper Utilities
 * Shared utilities for testing across the application
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Mock logger for testing
 */
class MockLogger {
    constructor() {
        this.logs = {
            debug: [],
            info: [],
            warn: [],
            error: []
        };
    }

    debug(message, context) {
        this.logs.debug.push({ message, context, timestamp: Date.now() });
    }

    info(message, context) {
        this.logs.info.push({ message, context, timestamp: Date.now() });
    }

    warn(message, context) {
        this.logs.warn.push({ message, context, timestamp: Date.now() });
    }

    error(message, context) {
        this.logs.error.push({ message, context, timestamp: Date.now() });
    }

    clear() {
        this.logs = {
            debug: [],
            info: [],
            warn: [],
            error: []
        };
    }

    getLastLog(level) {
        return this.logs[level] && this.logs[level].length > 0
            ? this.logs[level][this.logs[level].length - 1]
            : null;
    }

    hasLogContaining(level, text) {
        return this.logs[level].some(log =>
            log.message.includes(text) ||
            (log.context && JSON.stringify(log.context).includes(text))
        );
    }

    getLogCount(level) {
        return this.logs[level].length;
    }
}

/**
 * Mock database for testing StorageService
 */
class MockDatabase {
    constructor() {
        this.data = new Map();
        this.queries = [];
    }

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.queries.push({ sql, params, type: 'run' });

            // Simulate successful execution
            resolve({
                lastID: Math.floor(Math.random() * 1000),
                changes: 1
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.queries.push({ sql, params, type: 'get' });

            // Return mock data based on query
            if (sql.includes('SELECT') && sql.includes('conversations')) {
                resolve({
                    id: 1,
                    chat_id: 'test_chat@c.us',
                    created_at: Date.now(),
                    last_activity: Date.now(),
                    message_count: 5,
                    is_active: 1
                });
            } else if (sql.includes('SELECT') && sql.includes('messages')) {
                resolve({
                    id: 1,
                    conversation_id: 1,
                    content: 'Test message',
                    sender: 'test_sender',
                    timestamp: Date.now(),
                    message_type: 'text'
                });
            } else {
                resolve(null);
            }
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.queries.push({ sql, params, type: 'all' });

            // Return mock array data
            resolve([]);
        });
    }

    close() {
        return Promise.resolve();
    }

    getQueries() {
        return this.queries;
    }

    clearQueries() {
        this.queries = [];
    }
}

/**
 * Test assertion helpers
 */
class TestAssertions {
    static assertEqual(actual, expected, message = '') {
        if (actual !== expected) {
            throw new Error(`Assertion failed${message ? ': ' + message : ''}\nExpected: ${expected}\nActual: ${actual}`);
        }
    }

    static assertTrue(condition, message = '') {
        if (!condition) {
            throw new Error(`Assertion failed${message ? ': ' + message : ''}\nExpected: true\nActual: ${condition}`);
        }
    }

    static assertFalse(condition, message = '') {
        if (condition) {
            throw new Error(`Assertion failed${message ? ': ' + message : ''}\nExpected: false\nActual: ${condition}`);
        }
    }

    static assertThrows(fn, message = '') {
        try {
            fn();
            throw new Error(`Assertion failed${message ? ': ' + message : ''}\nExpected function to throw`);
        } catch (error) {
            // Expected behavior
        }
    }

    static async assertThrowsAsync(fn, message = '') {
        try {
            await fn();
            throw new Error(`Assertion failed${message ? ': ' + message : ''}\nExpected async function to throw`);
        } catch (error) {
            // Expected behavior
        }
    }

    static assertContains(container, item, message = '') {
        if (!container.includes || !container.includes(item)) {
            throw new Error(`Assertion failed${message ? ': ' + message : ''}\nExpected container to include: ${item}`);
        }
    }

    static assertInstanceOf(object, constructor, message = '') {
        if (!(object instanceof constructor)) {
            throw new Error(`Assertion failed${message ? ': ' + message : ''}\nExpected instance of: ${constructor.name}`);
        }
    }
}

/**
 * Test runner utility
 */
class TestRunner {
    constructor(name) {
        this.name = name;
        this.tests = [];
        this.beforeEachFn = null;
        this.afterEachFn = null;
        this.beforeAllFn = null;
        this.afterAllFn = null;
    }

    beforeAll(fn) {
        this.beforeAllFn = fn;
        return this;
    }

    afterAll(fn) {
        this.afterAllFn = fn;
        return this;
    }

    beforeEach(fn) {
        this.beforeEachFn = fn;
        return this;
    }

    afterEach(fn) {
        this.afterEachFn = fn;
        return this;
    }

    test(name, fn) {
        this.tests.push({ name, fn });
        return this;
    }

    async run() {
        const results = {
            name: this.name,
            passed: 0,
            failed: 0,
            tests: []
        };

        console.log(`\n🧪 Running test suite: ${this.name}`);
        console.log('='.repeat(50));

        try {
            if (this.beforeAllFn) {
                await this.beforeAllFn();
            }

            for (const test of this.tests) {
                const testResult = {
                    name: test.name,
                    passed: false,
                    error: null,
                    duration: 0
                };

                try {
                    if (this.beforeEachFn) {
                        await this.beforeEachFn();
                    }

                    const startTime = Date.now();
                    await test.fn();
                    testResult.duration = Date.now() - startTime;
                    testResult.passed = true;
                    results.passed++;

                    console.log(`✅ ${test.name} (${testResult.duration}ms)`);

                } catch (error) {
                    testResult.error = error.message;
                    results.failed++;
                    console.log(`❌ ${test.name} - ${error.message}`);
                } finally {
                    if (this.afterEachFn) {
                        try {
                            await this.afterEachFn();
                        } catch (error) {
                            console.warn(`Warning: afterEach failed for ${test.name}: ${error.message}`);
                        }
                    }
                }

                results.tests.push(testResult);
            }

            if (this.afterAllFn) {
                await this.afterAllFn();
            }

        } catch (error) {
            console.error(`💥 Test suite setup/teardown failed: ${error.message}`);
        }

        // Print summary
        console.log('\n' + '='.repeat(50));
        console.log(`📊 ${this.name} Summary:`);
        console.log(`✅ Passed: ${results.passed}`);
        console.log(`❌ Failed: ${results.failed}`);
        console.log(`📊 Total:  ${results.passed + results.failed}`);

        return results;
    }
}

/**
 * Environment setup helpers
 */
class TestEnvironment {
    static setupTestEnv() {
        return {
            CLOUDFLARE_API_TOKEN: 'test-token-12345',
            CLOUDFLARE_ACCOUNT_ID: 'test-account-67890',
            AI_MODEL_NAME: '@cf/meta/llama-3.2-1b-instruct',
            CLOUDFLARE_MAX_TOKENS: '256',
            RESPONSE_DELAY_MS: '1000',
            COOLDOWN_PERIOD_MS: '60000',
            MAX_CONTEXT_MESSAGES: '5',
            SECRETARY_MODE: 'true',
            RATE_LIMIT_PER_MINUTE: '10',
            RETRY_ATTEMPTS: '3',
            DATABASE_PATH: ':memory:',
            WHATSAPP_SESSION_PATH: './tests/fixtures/test-session',
            NODE_ENV: 'test',
            LOG_LEVEL: 'error'
        };
    }

    static async withTestEnv(env, fn) {
        const originalEnv = { ...process.env };

        try {
            // Set test environment
            Object.assign(process.env, env);
            return await fn();
        } finally {
            // Restore original environment
            Object.keys(process.env).forEach(key => {
                if (key in originalEnv) {
                    process.env[key] = originalEnv[key];
                } else {
                    delete process.env[key];
                }
            });
        }
    }

    static createTempDir() {
        const tempDir = path.join(__dirname, '..', 'fixtures', 'temp', Date.now().toString());
        fs.mkdirSync(tempDir, { recursive: true });
        return tempDir;
    }

    static cleanupTempDir(dirPath) {
        if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
        }
    }
}

/**
 * Time helpers for testing
 */
class TimeHelpers {
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static timeout(promise, ms, message = 'Operation timed out') {
        return Promise.race([
            promise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(message)), ms))
        ]);
    }

    static async waitFor(condition, timeout = 5000, interval = 100) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            if (await condition()) {
                return true;
            }
            await this.sleep(interval);
        }

        throw new Error(`Condition not met within ${timeout}ms`);
    }
}

module.exports = {
    MockLogger,
    MockDatabase,
    TestAssertions,
    TestRunner,
    TestEnvironment,
    TimeHelpers
};