import { WhatsAppClient } from './client/WhatsAppClient';
import { MessageHandler } from './client/MessageHandler';
import { ConversationManager } from './services/ConversationManager';
import { TimerService } from './services/TimerService';
import { StorageService } from './services/StorageService';
import { CloudflareAI } from './ai/CloudflareAI';
import { ResponseGenerator } from './ai/ResponseGenerator';
import { config, validateEnvironment, displayConfig, getCloudflareConfig } from './config/environment';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Service health status interface
 */
interface ServiceHealth {
    name: string;
    isHealthy: boolean;
    status: string;
    details?: any;
    lastChecked: number;
}

/**
 * Application metrics interface
 */
interface AppMetrics {
    uptime: number;
    startTime: number;
    services: {
        [key: string]: {
            initialized: boolean;
            healthy: boolean;
            errors: number;
            lastError?: string;
            lastHealthCheck?: number;
        };
    };
    memory: {
        used: number;
        total: number;
        percentage: number;
    };
    conversations: {
        active: number;
        total: number;
        messages: number;
    };
    timers: {
        active: number;
        cooldowns: number;
        responses: number;
    };
}

/**
 * Service registry for dependency injection and lifecycle management
 */
class ServiceRegistry extends EventEmitter {
    private services: Map<string, any> = new Map();
    private healthStatus: Map<string, ServiceHealth> = new Map();
    private metrics: AppMetrics;
    private healthCheckInterval?: NodeJS.Timeout;
    private metricsInterval?: NodeJS.Timeout;
    private logger: Logger;

    constructor(logger: Logger) {
        super();
        this.logger = logger;
        this.metrics = this.initializeMetrics();
        this.setupPeriodicTasks();
    }

    /**
     * Register a service with the registry
     */
    register<T>(name: string, service: T): void {
        this.services.set(name, service);
        this.metrics.services[name] = {
            initialized: true,
            healthy: false,
            errors: 0
        };
        this.logger.info(`Service registered: ${name}`, { service: name });
    }

    /**
     * Get a service from the registry
     */
    get<T>(name: string): T | undefined {
        return this.services.get(name) as T;
    }

    /**
     * Check health of all services
     */
    async checkAllServicesHealth(): Promise<ServiceHealth[]> {
        const results: ServiceHealth[] = [];

        for (const [name, service] of this.services.entries()) {
            const health = await this.checkServiceHealth(name, service);
            this.healthStatus.set(name, health);
            results.push(health);

            // Update metrics
            if (this.metrics.services[name]) {
                this.metrics.services[name].healthy = health.isHealthy;
                this.metrics.services[name].lastHealthCheck = Date.now();
            }
        }

        return results;
    }

    /**
     * Check health of a specific service
     */
    private async checkServiceHealth(name: string, service: any): Promise<ServiceHealth> {
        const health: ServiceHealth = {
            name,
            isHealthy: false,
            status: 'unknown',
            lastChecked: Date.now()
        };

        try {
            // Check if service has a health check method
            if (typeof service.getHealthStatus === 'function') {
                const result = await service.getHealthStatus();
                health.isHealthy = result.isHealthy || false;
                health.status = result.isHealthy ? 'healthy' : 'unhealthy';
                health.details = result;
            } else if (typeof service.isHealthy === 'function') {
                health.isHealthy = await service.isHealthy();
                health.status = health.isHealthy ? 'healthy' : 'unhealthy';
            } else if (typeof service.isReady === 'function') {
                health.isHealthy = service.isReady();
                health.status = health.isHealthy ? 'ready' : 'not_ready';
            } else {
                // Basic health check - service exists and is not null
                health.isHealthy = service !== null && service !== undefined;
                health.status = health.isHealthy ? 'alive' : 'dead';
            }
        } catch (error) {
            health.isHealthy = false;
            health.status = 'error';
            health.details = { error: error instanceof Error ? error.message : 'Unknown error' };

            // Update error count
            if (this.metrics.services[name]) {
                this.metrics.services[name].errors++;
                this.metrics.services[name].lastError = health.details.error;
            }

            this.logger.error(`Health check failed for ${name}`, { service: name, error });
        }

        return health;
    }

    /**
     * Get all services health status
     */
    getHealthStatus(): ServiceHealth[] {
        return Array.from(this.healthStatus.values());
    }

    /**
     * Get application metrics
     */
    getMetrics(): AppMetrics {
        this.updateMetrics();
        return { ...this.metrics };
    }

    /**
     * Setup periodic health checks and metrics collection
     */
    private setupPeriodicTasks(): void {
        // Health checks every 30 seconds
        this.healthCheckInterval = setInterval(async () => {
            try {
                await this.checkAllServicesHealth();
                this.emit('health_check_completed');
            } catch (error) {
                this.logger.error('Periodic health check failed', { error });
            }
        }, 30000);

        // Metrics update every 10 seconds
        this.metricsInterval = setInterval(() => {
            this.updateMetrics();
            this.emit('metrics_updated', this.metrics);
        }, 10000);
    }

    /**
     * Initialize metrics structure
     */
    private initializeMetrics(): AppMetrics {
        return {
            uptime: 0,
            startTime: Date.now(),
            services: {},
            memory: { used: 0, total: 0, percentage: 0 },
            conversations: { active: 0, total: 0, messages: 0 },
            timers: { active: 0, cooldowns: 0, responses: 0 }
        };
    }

    /**
     * Update application metrics
     */
    private updateMetrics(): void {
        // Update uptime
        this.metrics.uptime = Date.now() - this.metrics.startTime;

        // Update memory usage
        const memUsage = process.memoryUsage();
        this.metrics.memory = {
            used: memUsage.heapUsed,
            total: memUsage.heapTotal,
            percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100
        };

        // Update service-specific metrics
        try {
            const conversationManager = this.get<ConversationManager>('conversationManager');
            if (conversationManager) {
                const stats = conversationManager.getConversationStats();
                this.metrics.conversations = {
                    active: stats.activeConversations,
                    total: stats.totalConversations,
                    messages: stats.totalMessages
                };
            }

            const timerService = this.get<TimerService>('timerService');
            if (timerService) {
                const stats = timerService.getTimerStats();
                this.metrics.timers = {
                    active: stats.activeTimers,
                    cooldowns: stats.chatsInCooldown,
                    responses: stats.activeResponseTimers
                };
            }
        } catch (error) {
            this.logger.error('Error updating metrics', { error });
        }
    }

    /**
     * Shutdown the registry and cleanup resources
     */
    async shutdown(): Promise<void> {
        this.logger.info('Shutting down service registry');

        // Clear intervals
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }

        // Shutdown services in reverse dependency order
        const shutdownOrder = [
            'whatsappClient',
            'messageHandler',
            'responseGenerator',
            'cloudflareAI',
            'timerService',
            'conversationManager',
            'storageService'
        ];

        for (const serviceName of shutdownOrder) {
            const service = this.services.get(serviceName);
            if (service) {
                try {
                    if (typeof service.destroy === 'function') {
                        await service.destroy();
                        this.logger.info(`Service destroyed: ${serviceName}`);
                    } else if (typeof service.close === 'function') {
                        await service.close();
                        this.logger.info(`Service closed: ${serviceName}`);
                    }
                } catch (error) {
                    this.logger.error(`Error shutting down ${serviceName}`, { service: serviceName, error });
                }
            }
        }

        this.services.clear();
        this.healthStatus.clear();
        this.removeAllListeners();
    }
}

/**
 * Enhanced logger with structured logging and correlation IDs
 */
class Logger {
    private correlationId: string;
    private logLevel: string;

    constructor() {
        this.correlationId = this.generateCorrelationId();
        this.logLevel = process.env.LOG_LEVEL || 'info';
    }

    private generateCorrelationId(): string {
        return `whatsapp-llm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    private shouldLog(level: string): boolean {
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        const currentLevel = levels[this.logLevel as keyof typeof levels] || 1;
        const messageLevel = levels[level as keyof typeof levels] || 1;
        return messageLevel >= currentLevel;
    }

    private formatMessage(level: string, message: string, context?: any): string {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            correlationId: this.correlationId,
            message,
            ...(context && { context })
        };

        return JSON.stringify(logEntry);
    }

    debug(message: string, context?: any): void {
        if (this.shouldLog('debug')) {
            console.log(this.formatMessage('debug', message, context));
        }
    }

    info(message: string, context?: any): void {
        if (this.shouldLog('info')) {
            console.log(this.formatMessage('info', message, context));
        }
    }

    warn(message: string, context?: any): void {
        if (this.shouldLog('warn')) {
            console.warn(this.formatMessage('warn', message, context));
        }
    }

    error(message: string, context?: any): void {
        if (this.shouldLog('error')) {
            console.error(this.formatMessage('error', message, context));
        }
    }

    setCorrelationId(id: string): void {
        this.correlationId = id;
    }
}

/**
 * Application lifecycle manager
 */
class ApplicationLifecycle {
    private logger: Logger;
    private serviceRegistry: ServiceRegistry;
    private shutdownTimeout: number = 30000; // 30 seconds
    private isShuttingDown: boolean = false;

    constructor(logger: Logger, serviceRegistry: ServiceRegistry) {
        this.logger = logger;
        this.serviceRegistry = serviceRegistry;
        this.setupSignalHandlers();
    }

    /**
     * Start the application with comprehensive validation and initialization
     */
    async startup(): Promise<void> {
        this.logger.info('🚀 Starting WhatsApp LLM Personal Assistant');

        try {
            // Phase 1: Environment validation
            this.logger.info('Phase 1: Validating environment configuration');
            this.validateEnvironment();
            this.displayConfiguration();

            // Phase 2: Initialize core services
            this.logger.info('Phase 2: Initializing core services');
            await this.initializeCoreServices();

            // Phase 3: Service health validation
            this.logger.info('Phase 3: Validating service health');
            await this.validateServiceHealth();

            // Phase 4: Initialize dependent services
            this.logger.info('Phase 4: Initializing dependent services');
            await this.initializeDependentServices();

            // Phase 5: Start WhatsApp client
            this.logger.info('Phase 5: Starting WhatsApp client');
            await this.startWhatsAppClient();

            // Phase 6: Final validation and monitoring setup
            this.logger.info('Phase 6: Setting up monitoring and final validation');
            await this.setupMonitoring();

            this.logger.info('✅ WhatsApp LLM Personal Assistant startup completed successfully');
            this.logStartupSummary();

        } catch (error) {
            this.logger.error('❌ Application startup failed', { error });
            await this.emergencyShutdown();
            throw error;
        }
    }

    /**
     * Validate environment configuration
     */
    private validateEnvironment(): void {
        try {
            validateEnvironment();
            this.logger.info('Environment validation successful');
        } catch (error) {
            this.logger.error('Environment validation failed', { error });
            this.displayEnvironmentHelp();
            throw error;
        }
    }

    /**
     * Display configuration in structured format
     */
    private displayConfiguration(): void {
        if (process.env.NODE_ENV === 'development') {
            displayConfig();
        }

        this.logger.info('Configuration loaded', {
            model: config.cloudflare.model,
            maxTokens: config.cloudflare.maxTokens,
            responseDelay: `${config.app.responseDelayMs / 1000}s`,
            cooldownPeriod: `${config.app.cooldownPeriodMs / (1000 * 60 * 60)}h`,
            secretaryMode: config.app.secretaryMode,
            rateLimit: `${config.app.rateLimitPerMinute}/min`
        });
    }

    /**
     * Initialize core services (storage, timers, conversations)
     */
    private async initializeCoreServices(): Promise<void> {
        // Initialize storage service
        this.logger.info('Initializing StorageService');
        const storageService = new StorageService();
        this.serviceRegistry.register('storageService', storageService);

        // Wait for storage to be fully initialized
        await this.waitForServiceReady(storageService, 'StorageService');

        // Initialize timer service
        this.logger.info('Initializing TimerService');
        const timerService = new TimerService(storageService);
        this.serviceRegistry.register('timerService', timerService);

        // Wait for timer service to be ready
        await this.waitForServiceReady(timerService, 'TimerService');

        // Initialize conversation manager
        this.logger.info('Initializing ConversationManager');
        const conversationManager = new ConversationManager(storageService);
        this.serviceRegistry.register('conversationManager', conversationManager);

        this.logger.info('Core services initialized successfully');
    }

    /**
     * Validate service health after initialization
     */
    private async validateServiceHealth(): Promise<void> {
        const healthResults = await this.serviceRegistry.checkAllServicesHealth();
        const unhealthyServices = healthResults.filter(result => !result.isHealthy);

        if (unhealthyServices.length > 0) {
            this.logger.warn('Some services are unhealthy', {
                unhealthyServices: unhealthyServices.map(s => ({ name: s.name, status: s.status }))
            });
        } else {
            this.logger.info('All services are healthy');
        }
    }

    /**
     * Initialize dependent services (AI, response generator, message handler)
     */
    private async initializeDependentServices(): Promise<void> {
        // Initialize Cloudflare AI
        this.logger.info('Initializing CloudflareAI');
        const cloudflareConfig = getCloudflareConfig();
        const cloudflareAI = new CloudflareAI(
            cloudflareConfig.apiToken,
            cloudflareConfig.accountId,
            cloudflareConfig.gatewayUrl,
            cloudflareConfig.model
        );
        this.serviceRegistry.register('cloudflareAI', cloudflareAI);

        // Test AI service health
        this.logger.info('Testing AI service connectivity');
        const isAIHealthy = await cloudflareAI.isHealthy();
        if (!isAIHealthy) {
            this.logger.warn('AI service health check failed - continuing with degraded functionality');
        } else {
            const modelInfo = await cloudflareAI.getModelInfo();
            this.logger.info('AI service is healthy', {
                model: modelInfo?.name || cloudflareConfig.model,
                description: modelInfo?.description
            });
        }

        // Initialize response generator
        this.logger.info('Initializing ResponseGenerator');
        const responseGenerator = new ResponseGenerator(cloudflareAI);
        this.serviceRegistry.register('responseGenerator', responseGenerator);

        // Initialize message handler
        this.logger.info('Initializing MessageHandler');
        const conversationManager = this.serviceRegistry.get<ConversationManager>('conversationManager')!;
        const timerService = this.serviceRegistry.get<TimerService>('timerService')!;
        const storageService = this.serviceRegistry.get<StorageService>('storageService')!;

        const messageHandler = new MessageHandler(
            conversationManager,
            responseGenerator,
            timerService,
            storageService
        );
        this.serviceRegistry.register('messageHandler', messageHandler);

        this.logger.info('Dependent services initialized successfully');
    }

    /**
     * Start WhatsApp client and establish connection
     */
    private async startWhatsAppClient(): Promise<void> {
        const messageHandler = this.serviceRegistry.get<MessageHandler>('messageHandler')!;

        this.logger.info('Creating WhatsApp client');
        const whatsappClient = new WhatsAppClient(messageHandler);
        this.serviceRegistry.register('whatsappClient', whatsappClient);

        // Connect message handler to client for sending messages
        messageHandler.setWhatsAppClient?.(whatsappClient);

        // Initialize with enhanced error handling
        let initializationAttempts = 0;
        const maxAttempts = 3;

        while (initializationAttempts < maxAttempts) {
            try {
                this.logger.info(`WhatsApp client initialization attempt ${initializationAttempts + 1}`);
                await whatsappClient.initialize();

                // Wait for client to be ready
                await this.waitForWhatsAppReady(whatsappClient);
                break;

            } catch (error) {
                initializationAttempts++;
                this.logger.error(`WhatsApp initialization attempt ${initializationAttempts} failed`, { error });

                if (initializationAttempts >= maxAttempts) {
                    throw new Error(`Failed to initialize WhatsApp client after ${maxAttempts} attempts`);
                }

                // Wait before retry
                await this.sleep(5000 * initializationAttempts);
            }
        }

        this.logger.info('WhatsApp client initialized successfully');
    }

    /**
     * Setup monitoring and periodic maintenance
     */
    private async setupMonitoring(): Promise<void> {
        const conversationManager = this.serviceRegistry.get<ConversationManager>('conversationManager')!;
        const cloudflareAI = this.serviceRegistry.get<CloudflareAI>('cloudflareAI')!;

        // Enhanced periodic maintenance
        setInterval(async () => {
            try {
                this.logger.info('Running periodic maintenance');

                // Conversation cleanup
                await conversationManager.cleanupOldConversations(24 * 60 * 60 * 1000);
                const stats = conversationManager.getConversationStats();
                this.logger.info('Conversation cleanup completed', { stats });

                // AI service health monitoring
                const isAIHealthy = await cloudflareAI.isHealthy();
                if (!isAIHealthy) {
                    this.logger.warn('AI service health check failed during maintenance');
                }

                // Rate limit monitoring
                const rateLimit = await cloudflareAI.checkRateLimit();
                if (rateLimit && rateLimit.remaining < 10) {
                    this.logger.warn('AI service rate limit warning', {
                        remaining: rateLimit.remaining,
                        resetTime: new Date(rateLimit.resetTime * 1000).toISOString()
                    });
                }

                // Memory usage monitoring
                const memUsage = process.memoryUsage();
                const memoryPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
                if (memoryPercentage > 80) {
                    this.logger.warn('High memory usage detected', {
                        used: Math.round(memUsage.heapUsed / 1024 / 1024),
                        total: Math.round(memUsage.heapTotal / 1024 / 1024),
                        percentage: Math.round(memoryPercentage)
                    });
                }

            } catch (error) {
                this.logger.error('Periodic maintenance failed', { error });
            }
        }, 60 * 60 * 1000); // Every hour

        // Service health monitoring
        setInterval(async () => {
            try {
                const healthResults = await this.serviceRegistry.checkAllServicesHealth();
                const unhealthyServices = healthResults.filter(result => !result.isHealthy);

                if (unhealthyServices.length > 0) {
                    this.logger.warn('Unhealthy services detected', {
                        services: unhealthyServices.map(s => ({ name: s.name, status: s.status }))
                    });

                    // Attempt service recovery
                    await this.attemptServiceRecovery(unhealthyServices);
                }
            } catch (error) {
                this.logger.error('Health monitoring failed', { error });
            }
        }, 5 * 60 * 1000); // Every 5 minutes
    }

    /**
     * Attempt to recover unhealthy services
     */
    private async attemptServiceRecovery(unhealthyServices: ServiceHealth[]): Promise<void> {
        for (const serviceHealth of unhealthyServices) {
            try {
                this.logger.info(`Attempting recovery for ${serviceHealth.name}`);

                const service = this.serviceRegistry.get(serviceHealth.name);
                if (service && typeof (service as any).forceReconnect === 'function') {
                    await (service as any).forceReconnect();
                    this.logger.info(`Recovery attempted for ${serviceHealth.name}`);
                }
            } catch (error) {
                this.logger.error(`Recovery failed for ${serviceHealth.name}`, { error });
            }
        }
    }

    /**
     * Wait for a service to be ready
     */
    private async waitForServiceReady(service: any, serviceName: string, timeout: number = 30000): Promise<void> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            if (typeof service.isReady === 'function' && service.isReady()) {
                return;
            }
            await this.sleep(1000);
        }

        this.logger.warn(`Service ${serviceName} not ready after ${timeout}ms`);
    }

    /**
     * Wait for WhatsApp client to be ready
     */
    private async waitForWhatsAppReady(client: WhatsAppClient, timeout: number = 120000): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                client.removeAllListeners();
                reject(new Error('WhatsApp client ready timeout'));
            }, timeout);

            client.once('ready', () => {
                clearTimeout(timeoutId);
                resolve();
            });

            client.once('error', (error) => {
                clearTimeout(timeoutId);
                reject(error);
            });
        });
    }

    /**
     * Log startup summary
     */
    private logStartupSummary(): void {
        const metrics = this.serviceRegistry.getMetrics();

        this.logger.info('🎉 Application startup summary', {
            services: Object.keys(metrics.services).length,
            healthyServices: Object.values(metrics.services).filter(s => s.healthy).length,
            secretaryMode: config.app.secretaryMode ? 'Enabled' : 'Disabled',
            aiModel: config.cloudflare.model,
            responseDelay: `${config.app.responseDelayMs / 1000}s`,
            cooldownPeriod: `${config.app.cooldownPeriodMs / (1000 * 60 * 60)}h`,
            memoryUsage: `${Math.round(metrics.memory.percentage)}%`
        });
    }

    /**
     * Display environment help on validation failure
     */
    private displayEnvironmentHelp(): void {
        console.error('\n📋 Required environment variables:');
        console.error('- CLOUDFLARE_API_TOKEN: Your Cloudflare API token');
        console.error('- CLOUDFLARE_ACCOUNT_ID: Your Cloudflare account ID');
        console.error('\n📄 Optional environment variables:');
        console.error('- AI_MODEL_NAME: AI model to use (default: @cf/meta/llama-3.2-1b-instruct)');
        console.error('- CLOUDFLARE_AI_GATEWAY_URL: Custom gateway URL');
        console.error('- SECRETARY_MODE: Enable secretary mode (default: true)');
        console.error('- RESPONSE_DELAY_MS: Response delay in milliseconds (default: 120000)');
        console.error('- COOLDOWN_PERIOD_MS: Cooldown period in milliseconds (default: 18000000)');
        console.error('- LOG_LEVEL: Logging level (debug, info, warn, error)');
    }

    /**
     * Setup signal handlers for graceful shutdown
     */
    private setupSignalHandlers(): void {
        const signals = ['SIGINT', 'SIGTERM', 'SIGUSR2'];

        signals.forEach(signal => {
            process.on(signal, async () => {
                this.logger.info(`Received ${signal}, initiating graceful shutdown`);
                await this.gracefulShutdown();
                process.exit(0);
            });
        });

        process.on('uncaughtException', async (error) => {
            this.logger.error('💥 Uncaught Exception', { error: error.message, stack: error.stack });
            await this.emergencyShutdown();
            process.exit(1);
        });

        process.on('unhandledRejection', async (reason, promise) => {
            this.logger.error('💥 Unhandled Rejection', { reason, promise });
            await this.emergencyShutdown();
            process.exit(1);
        });
    }

    /**
     * Graceful shutdown with timeout
     */
    async gracefulShutdown(): Promise<void> {
        if (this.isShuttingDown) {
            this.logger.warn('Shutdown already in progress');
            return;
        }

        this.isShuttingDown = true;
        this.logger.info('🛑 Starting graceful shutdown');

        const shutdownPromise = this.serviceRegistry.shutdown();
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Shutdown timeout')), this.shutdownTimeout);
        });

        try {
            await Promise.race([shutdownPromise, timeoutPromise]);
            this.logger.info('✅ Graceful shutdown completed');
        } catch (error) {
            this.logger.error('❌ Graceful shutdown failed', { error });
            await this.emergencyShutdown();
        }
    }

    /**
     * Emergency shutdown for critical failures
     */
    private async emergencyShutdown(): Promise<void> {
        this.logger.error('🚨 Emergency shutdown initiated');

        try {
            // Force shutdown without waiting for graceful cleanup
            await Promise.race([
                this.serviceRegistry.shutdown(),
                new Promise(resolve => setTimeout(resolve, 5000)) // 5 second emergency timeout
            ]);
        } catch (error) {
            this.logger.error('Emergency shutdown error', { error });
        }

        this.logger.error('💀 Emergency shutdown completed');
    }

    /**
     * Utility sleep function
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Main application entry point
 */
async function main(): Promise<void> {
    const logger = new Logger();
    const serviceRegistry = new ServiceRegistry(logger);
    const lifecycle = new ApplicationLifecycle(logger, serviceRegistry);

    // Global error handling
    global.logger = logger;
    global.serviceRegistry = serviceRegistry;

    try {
        await lifecycle.startup();

        // Application is now running
        logger.info('🌟 WhatsApp LLM Personal Assistant is now running');

    } catch (error) {
        logger.error('💥 Fatal startup error', { error });
        process.exit(1);
    }
}

// Export for testing and external access
export { Logger, ServiceRegistry, ApplicationLifecycle };

// Start the application
if (require.main === module) {
    main().catch((error) => {
        console.error('💥 Unhandled startup error:', error);
        process.exit(1);
    });
}