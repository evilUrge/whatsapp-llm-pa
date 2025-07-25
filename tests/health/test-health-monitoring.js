const { TestRunner, TestAssertions, MockLogger } = require('../utils/testHelpers');
const mockData = require('../fixtures/mockData');

/**
 * Health Check and Monitoring Tests
 * Tests system health monitoring, metrics collection, and operational status
 */

// Enhanced Mock Services for Health Testing
class HealthMockStorageService {
    constructor() {
        this.isHealthy = true;
        this.connectionDelay = 50;
        this.lastHealthCheck = null;
        this.healthCheckCount = 0;
        this.errorSimulation = null;

        // Mock database stats
        this.stats = {
            conversations: 15,
            messages: 342,
            participants: 28,
            activeCooldowns: 3,
            activeTimers: 7,
            settings: 12
        };
    }

    async healthCheck() {
        this.healthCheckCount++;
        this.lastHealthCheck = Date.now();

        // Simulate connection delay
        await new Promise(resolve => setTimeout(resolve, this.connectionDelay));

        if (this.errorSimulation) {
            const error = this.errorSimulation;
            this.errorSimulation = null; // Reset after one error
            throw error;
        }

        if (!this.isHealthy) {
            return {
                isHealthy: false,
                checks: {
                    connection: false,
                    tables: false,
                    indexes: false
                },
                stats: null,
                error: 'Database connection failed'
            };
        }

        return {
            isHealthy: true,
            checks: {
                connection: true,
                tables: true,
                indexes: true
            },
            stats: { ...this.stats },
            responseTime: this.connectionDelay
        };
    }

    async getDetailedStats() {
        if (!this.isHealthy) {
            throw new Error('Database unavailable');
        }

        return {
            ...this.stats,
            dbSize: '2.4MB',
            queryPerformance: {
                avgQueryTime: 12.5,
                slowQueries: 0,
                totalQueries: 1247
            }
        };
    }

    setHealthy(healthy) {
        this.isHealthy = healthy;
    }

    setConnectionDelay(delay) {
        this.connectionDelay = delay;
    }

    simulateError(error) {
        this.errorSimulation = error;
    }

    getHealthCheckCount() {
        return this.healthCheckCount;
    }

    getLastHealthCheck() {
        return this.lastHealthCheck;
    }

    // Mock other methods
    async cleanup() {
        return { expiredCooldowns: 2, inactiveTimers: 1, oldMessages: 15 };
    }

    async close() { return Promise.resolve(); }
}

class HealthMockCloudflareAI {
    constructor() {
        this.isHealthy = true;
        this.responseTime = 800;
        this.healthCheckCount = 0;
        this.rateLimitRemaining = 100;
        this.modelAvailable = true;
        this.errorSimulation = null;
    }

    async isHealthy() {
        this.healthCheckCount++;

        // Simulate response time
        await new Promise(resolve => setTimeout(resolve, this.responseTime / 10));

        if (this.errorSimulation) {
            const error = this.errorSimulation;
            this.errorSimulation = null;
            throw error;
        }

        return this.isHealthy && this.modelAvailable;
    }

    async getModelInfo() {
        if (!this.isHealthy) {
            throw new Error('AI service unavailable');
        }

        return {
            name: '@cf/meta/llama-3.2-1b-instruct',
            description: 'Meta Llama model for text generation',
            task: 'text-generation',
            availability: this.modelAvailable ? 'available' : 'unavailable'
        };
    }

    async checkRateLimit() {
        if (!this.isHealthy) {
            throw new Error('Rate limit check failed');
        }

        return {
            remaining: this.rateLimitRemaining,
            resetTime: Math.floor(Date.now() / 1000) + 3600
        };
    }

    getPerformanceMetrics() {
        return {
            averageResponseTime: this.responseTime,
            healthCheckCount: this.healthCheckCount,
            lastHealthCheck: Date.now(),
            uptime: '99.8%'
        };
    }

    setHealthy(healthy) {
        this.isHealthy = healthy;
    }

    setResponseTime(time) {
        this.responseTime = time;
    }

    setRateLimit(remaining) {
        this.rateLimitRemaining = remaining;
    }

    setModelAvailable(available) {
        this.modelAvailable = available;
    }

    simulateError(error) {
        this.errorSimulation = error;
    }
}

class HealthMockTimerService {
    constructor() {
        this.isHealthy = true;
        this.activeTimers = new Map();
        this.healthCheckCount = 0;
        this.cronRunning = true;
        this.errorSimulation = null;

        // Add some mock timers
        this.activeTimers.set('chat1', { type: 'response', created: Date.now() });
        this.activeTimers.set('chat2', { type: 'cooldown', created: Date.now() - 60000 });
        this.activeTimers.set('chat3', { type: 'response', created: Date.now() - 30000 });
    }

    async getHealthStatus() {
        this.healthCheckCount++;

        if (this.errorSimulation) {
            const error = this.errorSimulation;
            this.errorSimulation = null;
            throw error;
        }

        if (!this.isHealthy) {
            return {
                isHealthy: false,
                timersCount: 0,
                activeTimers: 0,
                lastCleanup: 'Error',
                cronRunning: false,
                error: 'Timer service is down'
            };
        }

        return {
            isHealthy: true,
            timersCount: this.activeTimers.size,
            activeTimers: Array.from(this.activeTimers.values()).filter(t => t.type).length,
            lastCleanup: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
            cronRunning: this.cronRunning,
            performance: {
                averageTimerAccuracy: '±50ms',
                missedTimers: 0,
                totalTimersProcessed: 1247
            }
        };
    }

    getTimerStats() {
        return {
            totalTimers: this.activeTimers.size,
            activeResponseTimers: Array.from(this.activeTimers.values()).filter(t => t.type === 'response').length,
            chatsInCooldown: Array.from(this.activeTimers.values()).filter(t => t.type === 'cooldown').length,
            activeTimers: this.activeTimers.size
        };
    }

    setHealthy(healthy) {
        this.isHealthy = healthy;
    }

    setCronRunning(running) {
        this.cronRunning = running;
    }

    simulateError(error) {
        this.errorSimulation = error;
    }

    addMockTimer(chatId, type) {
        this.activeTimers.set(chatId, { type, created: Date.now() });
    }

    isReady() {
        return this.isHealthy;
    }
}

// System Health Monitor
class SystemHealthMonitor {
    constructor() {
        this.storageService = new HealthMockStorageService();
        this.aiService = new HealthMockCloudflareAI();
        this.timerService = new HealthMockTimerService();
        this.logger = new MockLogger();

        this.healthHistory = [];
        this.metricsHistory = [];
        this.alertThresholds = {
            responseTime: 5000,
            errorRate: 0.05,
            healthCheckFailures: 3,
            memoryUsage: 0.85
        };

        this.systemMetrics = {
            uptime: Date.now(),
            totalRequests: 0,
            totalErrors: 0,
            lastHealthCheck: null,
            healthCheckCount: 0
        };

        this.alerts = [];
        this.isMonitoring = false;
        this.monitoringInterval = null;
    }

    async performHealthCheck() {
        const startTime = Date.now();
        this.systemMetrics.healthCheckCount++;
        this.systemMetrics.lastHealthCheck = startTime;

        const healthResult = {
            timestamp: startTime,
            services: {},
            overall: {
                isHealthy: true,
                responseTime: 0,
                services: 0,
                healthyServices: 0
            },
            system: this.getSystemMetrics(),
            alerts: []
        };

        try {
            // Check Storage Service
            try {
                const storageHealth = await this.storageService.healthCheck();
                healthResult.services.storage = {
                    name: 'StorageService',
                    isHealthy: storageHealth.isHealthy,
                    responseTime: storageHealth.responseTime || 0,
                    details: storageHealth,
                    lastCheck: Date.now()
                };
            } catch (error) {
                healthResult.services.storage = {
                    name: 'StorageService',
                    isHealthy: false,
                    error: error.message,
                    lastCheck: Date.now()
                };
                this.generateAlert('storage', 'Storage service health check failed', error.message);
            }

            // Check AI Service
            try {
                const aiHealthy = await this.aiService.isHealthy();
                const aiMetrics = this.aiService.getPerformanceMetrics();
                healthResult.services.ai = {
                    name: 'CloudflareAI',
                    isHealthy: aiHealthy,
                    responseTime: aiMetrics.averageResponseTime,
                    details: {
                        healthy: aiHealthy,
                        metrics: aiMetrics,
                        modelInfo: await this.aiService.getModelInfo(),
                        rateLimit: await this.aiService.checkRateLimit()
                    },
                    lastCheck: Date.now()
                };
            } catch (error) {
                healthResult.services.ai = {
                    name: 'CloudflareAI',
                    isHealthy: false,
                    error: error.message,
                    lastCheck: Date.now()
                };
                this.generateAlert('ai', 'AI service health check failed', error.message);
            }

            // Check Timer Service
            try {
                const timerHealth = await this.timerService.getHealthStatus();
                healthResult.services.timer = {
                    name: 'TimerService',
                    isHealthy: timerHealth.isHealthy,
                    details: timerHealth,
                    lastCheck: Date.now()
                };
            } catch (error) {
                healthResult.services.timer = {
                    name: 'TimerService',
                    isHealthy: false,
                    error: error.message,
                    lastCheck: Date.now()
                };
                this.generateAlert('timer', 'Timer service health check failed', error.message);
            }

            // Calculate overall health
            const services = Object.values(healthResult.services);
            healthResult.overall.services = services.length;
            healthResult.overall.healthyServices = services.filter(s => s.isHealthy).length;
            healthResult.overall.isHealthy = healthResult.overall.healthyServices === healthResult.overall.services;
            healthResult.overall.responseTime = Date.now() - startTime;

            // Check response time threshold
            if (healthResult.overall.responseTime > this.alertThresholds.responseTime) {
                this.generateAlert('performance', 'Health check response time exceeded threshold',
                    `Response time: ${healthResult.overall.responseTime}ms`);
            }

            // Store health history
            this.healthHistory.push({
                timestamp: startTime,
                isHealthy: healthResult.overall.isHealthy,
                responseTime: healthResult.overall.responseTime,
                healthyServices: healthResult.overall.healthyServices,
                totalServices: healthResult.overall.services
            });

            // Keep only last 50 health checks
            if (this.healthHistory.length > 50) {
                this.healthHistory = this.healthHistory.slice(-50);
            }

            this.logger.info('Health check completed', {
                isHealthy: healthResult.overall.isHealthy,
                responseTime: healthResult.overall.responseTime,
                services: `${healthResult.overall.healthyServices}/${healthResult.overall.services}`
            });

            return healthResult;

        } catch (error) {
            this.logger.error('Health check failed', { error: error.message });
            this.generateAlert('system', 'System health check failed', error.message);

            return {
                timestamp: startTime,
                overall: {
                    isHealthy: false,
                    error: error.message,
                    responseTime: Date.now() - startTime
                },
                services: {},
                system: this.getSystemMetrics()
            };
        }
    }

    async collectMetrics() {
        const metrics = {
            timestamp: Date.now(),
            system: this.getSystemMetrics(),
            services: {
                storage: {
                    healthCheckCount: this.storageService.getHealthCheckCount(),
                    lastHealthCheck: this.storageService.getLastHealthCheck(),
                    stats: await this.getStorageMetrics()
                },
                ai: {
                    performance: this.aiService.getPerformanceMetrics()
                },
                timer: {
                    stats: this.timerService.getTimerStats(),
                    healthCheckCount: this.timerService.healthCheckCount
                }
            },
            health: {
                totalHealthChecks: this.systemMetrics.healthCheckCount,
                recentHealthScore: this.calculateHealthScore(),
                alertCount: this.alerts.length
            }
        };

        this.metricsHistory.push(metrics);

        // Keep only last 100 metrics snapshots
        if (this.metricsHistory.length > 100) {
            this.metricsHistory = this.metricsHistory.slice(-100);
        }

        return metrics;
    }

    async getStorageMetrics() {
        try {
            return await this.storageService.getDetailedStats();
        } catch (error) {
            this.logger.warn('Failed to get storage metrics', { error: error.message });
            return { error: error.message };
        }
    }

    calculateHealthScore() {
        if (this.healthHistory.length === 0) return 1.0;

        const recentChecks = this.healthHistory.slice(-10); // Last 10 checks
        const healthyCount = recentChecks.filter(check => check.isHealthy).length;
        return healthyCount / recentChecks.length;
    }

    generateAlert(service, message, details) {
        const alert = {
            id: `alert_${Date.now()}_${Math.random()}`,
            timestamp: Date.now(),
            service,
            severity: this.determineAlertSeverity(service, message),
            message,
            details,
            acknowledged: false
        };

        this.alerts.push(alert);
        this.logger.warn('Health alert generated', alert);

        // Keep only last 50 alerts
        if (this.alerts.length > 50) {
            this.alerts = this.alerts.slice(-50);
        }

        return alert;
    }

    determineAlertSeverity(service, message) {
        if (message.includes('failed') || message.includes('unavailable')) {
            return 'critical';
        } else if (message.includes('threshold') || message.includes('slow')) {
            return 'warning';
        }
        return 'info';
    }

    getSystemMetrics() {
        const uptime = Date.now() - this.systemMetrics.uptime;
        const errorRate = this.systemMetrics.totalRequests > 0
            ? this.systemMetrics.totalErrors / this.systemMetrics.totalRequests
            : 0;

        return {
            uptime,
            uptimeFormatted: this.formatUptime(uptime),
            totalRequests: this.systemMetrics.totalRequests,
            totalErrors: this.systemMetrics.totalErrors,
            errorRate,
            healthCheckCount: this.systemMetrics.healthCheckCount,
            lastHealthCheck: this.systemMetrics.lastHealthCheck,
            memory: this.getMemoryUsage(),
            timestamp: Date.now()
        };
    }

    getMemoryUsage() {
        // Simulate memory usage
        return {
            used: Math.floor(Math.random() * 100) + 50, // 50-150 MB
            total: 256,
            percentage: Math.random() * 0.3 + 0.4 // 40-70%
        };
    }

    formatUptime(uptimeMs) {
        const seconds = Math.floor(uptimeMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
        if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    startMonitoring(intervalMs = 10000) {
        if (this.isMonitoring) {
            this.logger.warn('Monitoring already started');
            return;
        }

        this.isMonitoring = true;
        this.monitoringInterval = setInterval(async () => {
            try {
                await this.performHealthCheck();
                await this.collectMetrics();
            } catch (error) {
                this.logger.error('Monitoring cycle failed', { error: error.message });
            }
        }, intervalMs);

        this.logger.info('Health monitoring started', { interval: intervalMs });
    }

    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        this.isMonitoring = false;
        this.logger.info('Health monitoring stopped');
    }

    getHealthHistory() {
        return [...this.healthHistory];
    }

    getMetricsHistory() {
        return [...this.metricsHistory];
    }

    getAlerts(unacknowledgedOnly = false) {
        return unacknowledgedOnly
            ? this.alerts.filter(alert => !alert.acknowledged)
            : [...this.alerts];
    }

    acknowledgeAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
            alert.acknowledgedAt = Date.now();
            return true;
        }
        return false;
    }

    clearAlerts() {
        this.alerts = [];
    }

    // Simulate system load for testing
    simulateLoad(requests, errors = 0) {
        this.systemMetrics.totalRequests += requests;
        this.systemMetrics.totalErrors += errors;
    }

    // Test helpers
    reset() {
        this.healthHistory = [];
        this.metricsHistory = [];
        this.alerts = [];
        this.systemMetrics = {
            uptime: Date.now(),
            totalRequests: 0,
            totalErrors: 0,
            lastHealthCheck: null,
            healthCheckCount: 0
        };
        this.stopMonitoring();
    }
}

/**
 * Health Monitoring Test Suite
 */
async function runHealthMonitoringTests() {
    const runner = new TestRunner('💊 Health Monitoring Tests');

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

    let monitor;

    // Setup before each test
    runner.beforeEach(async () => {
        monitor = new SystemHealthMonitor();
    });

    // Cleanup after each test
    runner.afterEach(async () => {
        if (monitor) {
            monitor.reset();
        }
    });

    // Test 1: Basic Health Check
    runner.test('should perform basic health check of all services', async () => {
        const healthResult = await monitor.performHealthCheck();

        assert.ok(healthResult.timestamp, 'Should have timestamp');
        assert.ok(healthResult.overall, 'Should have overall health status');
        assert.ok(healthResult.services, 'Should have services health status');
        assert.ok(healthResult.system, 'Should have system metrics');

        // Check overall health
        assert.ok(healthResult.overall.isHealthy, 'System should be healthy initially');
        assert.greaterThan(healthResult.overall.responseTime, 0, 'Should have response time');
        assert.equal(healthResult.overall.services, 3, 'Should check 3 services');
        assert.equal(healthResult.overall.healthyServices, 3, 'All services should be healthy');

        // Check individual services
        assert.ok(healthResult.services.storage, 'Should have storage health');
        assert.ok(healthResult.services.ai, 'Should have AI health');
        assert.ok(healthResult.services.timer, 'Should have timer health');

        assert.ok(healthResult.services.storage.isHealthy, 'Storage should be healthy');
        assert.ok(healthResult.services.ai.isHealthy, 'AI should be healthy');
        assert.ok(healthResult.services.timer.isHealthy, 'Timer should be healthy');
    });

    // Test 2: Service Failure Detection
    runner.test('should detect and report service failures', async () => {
        // Simulate storage service failure
        monitor.storageService.setHealthy(false);

        const healthResult = await monitor.performHealthCheck();

        assert.ok(!healthResult.overall.isHealthy, 'Overall system should be unhealthy');
        assert.equal(healthResult.overall.healthyServices, 2, 'Should have 2 healthy services');
        assert.equal(healthResult.overall.services, 3, 'Should still check all 3 services');

        assert.ok(!healthResult.services.storage.isHealthy, 'Storage should be unhealthy');
        assert.ok(healthResult.services.storage.details.error, 'Storage should have error details');

        // Check that alert was generated
        const alerts = monitor.getAlerts();
        assert.greaterThan(alerts.length, 0, 'Should generate alerts for failures');

        const storageAlert = alerts.find(alert => alert.service === 'storage');
        assert.ok(storageAlert, 'Should have storage-specific alert');
        assert.equal(storageAlert.severity, 'critical', 'Storage failure should be critical');
    });

    // Test 3: Performance Monitoring
    runner.test('should monitor and report performance metrics', async () => {
        // Set high response time to trigger performance alert
        monitor.storageService.setConnectionDelay(6000); // Above 5000ms threshold

        const healthResult = await monitor.performHealthCheck();

        assert.greaterThan(healthResult.overall.responseTime, 5000, 'Should detect slow response time');

        const alerts = monitor.getAlerts();
        const performanceAlert = alerts.find(alert => alert.service === 'performance');
        assert.ok(performanceAlert, 'Should generate performance alert');
        assert.equal(performanceAlert.severity, 'warning', 'Performance issue should be warning');
    });

    // Test 4: Metrics Collection
    runner.test('should collect and store system metrics', async () => {
        // Simulate some system activity
        monitor.simulateLoad(100, 5);

        const metrics = await monitor.collectMetrics();

        assert.ok(metrics.timestamp, 'Should have timestamp');
        assert.ok(metrics.system, 'Should have system metrics');
        assert.ok(metrics.services, 'Should have service metrics');
        assert.ok(metrics.health, 'Should have health metrics');

        // Check system metrics
        assert.equal(metrics.system.totalRequests, 100, 'Should track total requests');
        assert.equal(metrics.system.totalErrors, 5, 'Should track total errors');
        assert.equal(metrics.system.errorRate, 0.05, 'Should calculate error rate');
        assert.ok(metrics.system.uptime > 0, 'Should track uptime');

        // Check service metrics
        assert.ok(metrics.services.storage.stats, 'Should have storage stats');
        assert.ok(metrics.services.ai.performance, 'Should have AI performance');
        assert.ok(metrics.services.timer.stats, 'Should have timer stats');

        // Check metrics history
        const history = monitor.getMetricsHistory();
        assert.equal(history.length, 1, 'Should store metrics in history');
        assert.equal(history[0].timestamp, metrics.timestamp, 'Should store correct metrics');
    });

    // Test 5: Health History Tracking
    runner.test('should track health history over time', async () => {
        // Perform multiple health checks
        await monitor.performHealthCheck();

        // Simulate service failure
        monitor.aiService.setHealthy(false);
        await monitor.performHealthCheck();

        // Restore service
        monitor.aiService.setHealthy(true);
        await monitor.performHealthCheck();

        const history = monitor.getHealthHistory();
        assert.equal(history.length, 3, 'Should track 3 health checks');

        assert.ok(history[0].isHealthy, 'First check should be healthy');
        assert.ok(!history[1].isHealthy, 'Second check should be unhealthy');
        assert.ok(history[2].isHealthy, 'Third check should be healthy again');

        // Check health score calculation
        const healthScore = monitor.calculateHealthScore();
        assert.greaterThan(healthScore, 0.5, 'Health score should reflect mixed results');
        assert.lessThan(healthScore, 1.0, 'Health score should not be perfect');
    });

    // Test 6: Alert Management
    runner.test('should manage alerts correctly', async () => {
        // Generate some alerts by causing failures
        monitor.storageService.simulateError(new Error('Connection timeout'));
        monitor.aiService.simulateError(new Error('Rate limit exceeded'));

        await monitor.performHealthCheck();

        let alerts = monitor.getAlerts();
        assert.greaterThan(alerts.length, 0, 'Should generate alerts');

        const unacknowledgedAlerts = monitor.getAlerts(true);
        assert.equal(alerts.length, unacknowledgedAlerts.length, 'All alerts should be unacknowledged initially');

        // Acknowledge an alert
        if (alerts.length > 0) {
            const acknowledged = monitor.acknowledgeAlert(alerts[0].id);
            assert.ok(acknowledged, 'Should acknowledge alert successfully');

            const newUnacknowledged = monitor.getAlerts(true);
            assert.equal(newUnacknowledged.length, unacknowledgedAlerts.length - 1, 'Should reduce unacknowledged count');
        }

        // Clear all alerts
        monitor.clearAlerts();
        alerts = monitor.getAlerts();
        assert.equal(alerts.length, 0, 'Should clear all alerts');
    });

    // Test 7: Continuous Monitoring
    runner.test('should perform continuous monitoring', async () => {
        // Start monitoring with short interval for testing
        monitor.startMonitoring(100); // 100ms interval

        // Wait for several monitoring cycles
        await new Promise(resolve => setTimeout(resolve, 350));

        monitor.stopMonitoring();

        const history = monitor.getHealthHistory();
        assert.greaterThan(history.length, 2, 'Should perform multiple health checks');

        const metrics = monitor.getMetricsHistory();
        assert.greaterThan(metrics.length, 2, 'Should collect multiple metrics snapshots');
    });

    // Test 8: Error Recovery Detection
    runner.test('should detect service recovery after failures', async () => {
        // Start with healthy system
        await monitor.performHealthCheck();
        let healthScore = monitor.calculateHealthScore();
        assert.equal(healthScore, 1.0, 'Should start with perfect health');

        // Introduce failure
        monitor.timerService.setHealthy(false);
        await monitor.performHealthCheck();

        healthScore = monitor.calculateHealthScore();
        assert.lessThan(healthScore, 1.0, 'Health score should drop after failure');

        // Simulate recovery
        monitor.timerService.setHealthy(true);
        await monitor.performHealthCheck();

        const finalHealthScore = monitor.calculateHealthScore();
        assert.greaterThan(finalHealthScore, healthScore, 'Health score should improve after recovery');
    });

    // Test 9: Detailed Service Diagnostics
    runner.test('should provide detailed service diagnostics', async () => {
        const healthResult = await monitor.performHealthCheck();

        // Check storage diagnostics
        const storageHealth = healthResult.services.storage;
        assert.ok(storageHealth.details.checks, 'Should have storage check details');
        assert.ok(storageHealth.details.stats, 'Should have storage statistics');
        assert.ok(storageHealth.responseTime >= 0, 'Should have storage response time');

        // Check AI diagnostics
        const aiHealth = healthResult.services.ai;
        assert.ok(aiHealth.details.modelInfo, 'Should have AI model information');
        assert.ok(aiHealth.details.rateLimit, 'Should have rate limit information');
        assert.ok(aiHealth.details.metrics, 'Should have AI performance metrics');

        // Check timer diagnostics
        const timerHealth = healthResult.services.timer;
        assert.ok(timerHealth.details.performance, 'Should have timer performance data');
        assert.ok(typeof timerHealth.details.timersCount === 'number', 'Should have timer count');
        assert.ok(timerHealth.details.cronRunning !== undefined, 'Should have cron status');
    });

    // Test 10: System Resource Monitoring
    runner.test('should monitor system resources', async () => {
        const metrics = await monitor.collectMetrics();

        assert.ok(metrics.system.memory, 'Should monitor memory usage');
        assert.ok(typeof metrics.system.memory.used === 'number', 'Should have memory used');
        assert.ok(typeof metrics.system.memory.total === 'number', 'Should have total memory');
        assert.ok(typeof metrics.system.memory.percentage === 'number', 'Should have memory percentage');

        assert.ok(metrics.system.uptimeFormatted, 'Should have formatted uptime');
        assert.ok(typeof metrics.system.uptime === 'number', 'Should have numeric uptime');
    });

    // Test 11: Alert Severity Classification
    runner.test('should classify alert severity correctly', async () => {
        // Generate different types of alerts
        const criticalAlert = monitor.generateAlert('storage', 'Database connection failed', 'Connection refused');
        const warningAlert = monitor.generateAlert('performance', 'Response time threshold exceeded', 'Slow query detected');
        const infoAlert = monitor.generateAlert('ai', 'Model switched', 'Using backup model');

        assert.equal(criticalAlert.severity, 'critical', 'Database failure should be critical');
        assert.equal(warningAlert.severity, 'warning', 'Performance issue should be warning');
        assert.equal(infoAlert.severity, 'info', 'Model switch should be info');

        const alerts = monitor.getAlerts();
        assert.equal(alerts.length, 3, 'Should have 3 alerts');

        const criticalAlerts = alerts.filter(a => a.severity === 'critical');
        const warningAlerts = alerts.filter(a => a.severity === 'warning');
        const infoAlerts = alerts.filter(a => a.severity === 'info');

        assert.equal(criticalAlerts.length, 1, 'Should have 1 critical alert');
        assert.equal(warningAlerts.length, 1, 'Should have 1 warning alert');
        assert.equal(infoAlerts.length, 1, 'Should have 1 info alert');
    });

    // Test 12: Health Check Resilience
    runner.test('should handle health check failures gracefully', async () => {
        // Simulate complete system failure
        monitor.storageService.simulateError(new Error('Database crashed'));
        monitor.aiService.simulateError(new Error('AI service timeout'));
        monitor.timerService.simulateError(new Error('Timer service panic'));

        const healthResult = await monitor.performHealthCheck();

        assert.ok(healthResult.timestamp, 'Should still have timestamp');
        assert.ok(!healthResult.overall.isHealthy, 'System should be marked unhealthy');
        assert.greaterThan(healthResult.overall.responseTime, 0, 'Should have response time even with failures');

        // All services should report as unhealthy
        assert.ok(!healthResult.services.storage.isHealthy, 'Storage should be unhealthy');
        assert.ok(!healthResult.services.ai.isHealthy, 'AI should be unhealthy');
        assert.ok(!healthResult.services.timer.isHealthy, 'Timer should be unhealthy');

        // Should generate alerts for all failures
        const alerts = monitor.getAlerts();
        assert.greaterThan(alerts.length, 2, 'Should generate multiple alerts');
    });

    return runner.run();
}

// Export for use in test runner
module.exports = runHealthMonitoringTests;

// Run tests if this file is executed directly
if (require.main === module) {
    runHealthMonitoringTests()
        .then(report => {
            console.log('\n🎉 Health Monitoring Testing Complete!');
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
            console.error('Health monitoring tests failed to run:', error);
            process.exit(1);
        });
}