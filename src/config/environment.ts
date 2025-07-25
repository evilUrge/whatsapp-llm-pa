import { EnvironmentConfig } from '../types';

/**
 * Environment configuration for the WhatsApp LLM Personal Assistant
 */
export const config: EnvironmentConfig = {
    cloudflare: {
        apiToken: process.env.CLOUDFLARE_API_TOKEN || '',
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
        model: process.env.AI_MODEL_NAME || '@cf/meta/llama-3.2-1b-instruct',
        maxTokens: parseInt(process.env.CLOUDFLARE_MAX_TOKENS || '500', 10),
        gatewayUrl: process.env.CLOUDFLARE_AI_GATEWAY_URL
    },
    database: {
        path: process.env.DATABASE_PATH || './data/conversations.db'
    },
    whatsapp: {
        sessionPath: process.env.WHATSAPP_SESSION_PATH || './data/session'
    },
    app: {
        responseDelayMs: parseInt(process.env.RESPONSE_DELAY_MS || '120000', 10), // 2 minutes
        cooldownPeriodMs: parseInt(process.env.COOLDOWN_PERIOD_MS || '18000000', 10), // 5 hours
        maxContextMessages: parseInt(process.env.MAX_CONTEXT_MESSAGES || '10', 10),
        enableLogging: process.env.ENABLE_LOGGING === 'true',
        secretaryMode: process.env.SECRETARY_MODE === 'true', // Enable secretary mode by default
        rateLimitPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '10', 10),
        retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3', 10)
    }
};

/**
 * Validates that all required environment variables are set
 */
export function validateEnvironment(): void {
    const requiredVars = [
        'CLOUDFLARE_API_TOKEN',
        'CLOUDFLARE_ACCOUNT_ID'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Validate numeric values
    const numericEnvVars = [
        { name: 'CLOUDFLARE_MAX_TOKENS', min: 1, max: 2048 },
        { name: 'RESPONSE_DELAY_MS', min: 1000, max: 600000 },
        { name: 'COOLDOWN_PERIOD_MS', min: 60000, max: 86400000 },
        { name: 'MAX_CONTEXT_MESSAGES', min: 1, max: 50 },
        { name: 'RATE_LIMIT_PER_MINUTE', min: 1, max: 100 },
        { name: 'RETRY_ATTEMPTS', min: 1, max: 10 }
    ];

    for (const envVar of numericEnvVars) {
        const value = process.env[envVar.name];
        if (value) {
            const numValue = parseInt(value, 10);
            if (isNaN(numValue) || numValue < envVar.min || numValue > envVar.max) {
                throw new Error(`Invalid value for ${envVar.name}: ${value}. Must be between ${envVar.min} and ${envVar.max}.`);
            }
        }
    }

    // Validate model name format
    const modelName = process.env.AI_MODEL_NAME || '@cf/meta/llama-3.2-1b-instruct';
    if (!modelName.startsWith('@cf/')) {
        console.warn(`Warning: Model name "${modelName}" doesn't follow Cloudflare format (@cf/...). This might cause issues.`);
    }
}

/**
 * Get configuration with runtime validation
 */
export function getValidatedConfig(): EnvironmentConfig {
    validateEnvironment();
    return config;
}

/**
 * Development configuration check
 */
export const isDevelopment = process.env.NODE_ENV === 'development';
export const isProduction = process.env.NODE_ENV === 'production';
export const isTest = process.env.NODE_ENV === 'test';

/**
 * Helper function to get Cloudflare AI configuration
 */
export function getCloudflareConfig() {
    return {
        apiToken: config.cloudflare.apiToken,
        accountId: config.cloudflare.accountId,
        gatewayUrl: config.cloudflare.gatewayUrl,
        model: config.cloudflare.model
    };
}

/**
 * Display current configuration (for debugging)
 */
export function displayConfig(): void {
    if (isDevelopment) {
        console.log('=== WhatsApp LLM PA Configuration ===');
        console.log(`Model: ${config.cloudflare.model}`);
        console.log(`Max Tokens: ${config.cloudflare.maxTokens}`);
        console.log(`Response Delay: ${config.app.responseDelayMs}ms`);
        console.log(`Cooldown Period: ${config.app.cooldownPeriodMs}ms`);
        console.log(`Max Context Messages: ${config.app.maxContextMessages}`);
        console.log(`Secretary Mode: ${config.app.secretaryMode}`);
        console.log(`Rate Limit: ${config.app.rateLimitPerMinute}/min`);
        console.log(`Retry Attempts: ${config.app.retryAttempts}`);
        console.log(`Logging Enabled: ${config.app.enableLogging}`);
        console.log(`Gateway URL: ${config.cloudflare.gatewayUrl || 'Default'}`);
        console.log('=====================================');
    }
}