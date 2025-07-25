/**
 * Core types and interfaces for the WhatsApp LLM Personal Assistant
 */

export interface WhatsAppMessage {
    id: string;
    body: string;
    from: string;
    to: string;
    timestamp: number;
    isGroupMsg: boolean;
    chat: {
        id: string;
        name: string;
    };
    author?: string;
}

export interface AIResponse {
    content: string;
    confidence: number;
    tokens_used: number;
    model: string;
}

export interface ConversationContext {
    chatId: string;
    participantCount: number;
    recentMessages: WhatsAppMessage[];
    lastResponseTime?: number;
    isActive: boolean;
}

export interface TimerState {
    chatId: string;
    responseTimer?: NodeJS.Timeout;
    cooldownTimer?: NodeJS.Timeout;
    lastResponseTime?: number;
    isInCooldown: boolean;
}

export interface StorageData {
    conversations: Record<string, ConversationContext>;
    timers: Record<string, TimerState>;
    settings: AppSettings;
}

export interface AppSettings {
    responseDelayMs: number;
    cooldownPeriodMs: number;
    maxContextMessages: number;
    enableLogging: boolean;
    secretaryMode?: boolean;
    rateLimitPerMinute?: number;
    retryAttempts?: number;
}

export interface CloudflareAIConfig {
    apiToken: string;
    accountId: string;
    model: string;
    maxTokens: number;
    gatewayUrl?: string;
}

export interface EnvironmentConfig {
    cloudflare: CloudflareAIConfig;
    database: {
        path: string;
    };
    whatsapp: {
        sessionPath: string;
    };
    app: AppSettings;
}

export enum MessageType {
    TEXT = 'text',
    IMAGE = 'image',
    AUDIO = 'audio',
    VIDEO = 'video',
    DOCUMENT = 'document',
    STICKER = 'sticker',
    LOCATION = 'location',
    CONTACT = 'contact'
}

export enum ResponseStatus {
    PENDING = 'pending',
    GENERATING = 'generating',
    SENT = 'sent',
    FAILED = 'failed',
    COOLDOWN = 'cooldown'
}

/**
 * Extended types for AI service integration
 */

export interface AIServiceConfig {
    provider: 'cloudflare' | 'openai' | 'anthropic';
    model: string;
    apiKey: string;
    baseUrl?: string;
    timeout?: number;
    maxRetries?: number;
}

export interface SecretaryPersonality {
    tone: 'formal' | 'casual' | 'friendly' | 'professional';
    responseStyle: 'concise' | 'detailed' | 'contextual';
    businessHours?: {
        start: string; // HH:MM format
        end: string;   // HH:MM format
        timezone: string;
    };
}

export interface ConversationMemory {
    chatId: string;
    interactions: Array<{
        role: 'user' | 'assistant';
        content: string;
        timestamp: number;
        metadata?: {
            messageType?: string;
            urgency?: string;
            sentiment?: string;
        };
    }>;
    summary?: string;
    lastUpdated: number;
}

export interface RateLimitInfo {
    remaining: number;
    resetTime: number;
    limit: number;
}

export interface AIServiceHealth {
    isHealthy: boolean;
    responseTime?: number;
    lastChecked: number;
    errorCount: number;
    modelAvailable: boolean;
}

export interface MessageAnalysis {
    sentiment: 'positive' | 'negative' | 'neutral';
    urgency: 'low' | 'medium' | 'high';
    category: 'business' | 'personal' | 'support' | 'social' | 'other';
    keyTopics: string[];
    requiresResponse: boolean;
    confidence: number;
}

export interface ResponseGenerationOptions {
    maxTokens?: number;
    temperature?: number;
    includeContext?: boolean;
    responseStyle?: 'secretary' | 'casual' | 'professional' | 'helpful';
    urgency?: 'low' | 'medium' | 'high';
    personalityOverride?: Partial<SecretaryPersonality>;
}

export interface CloudflareAIRequest {
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
    max_tokens?: number;
    temperature?: number;
    stream?: boolean;
    stop?: string[];
}

export interface CloudflareAIResponse {
    result: {
        response?: string;
        generated_text?: string;
        confidence?: number;
        tokens_used?: number;
    };
    success: boolean;
    errors?: Array<{
        code: number;
        message: string;
    }>;
    messages?: Array<{
        code: number;
        message: string;
    }>;
}

export interface ErrorDetails {
    code: string;
    message: string;
    timestamp: number;
    context?: Record<string, any>;
    retryable: boolean;
}

/**
 * Integration interfaces for existing services
 */

export interface WhatsAppClientEvents {
    'message': (message: WhatsAppMessage) => void;
    'ready': () => void;
    'qr': (qrCode: string) => void;
    'authenticated': () => void;
    'auth_failure': (message: string) => void;
    'disconnected': (reason: string) => void;
    'error': (error: Error) => void;
}

export interface TimerServiceEvents {
    'response_triggered': (chatId: string) => void;
    'cooldown_started': (chatId: string, duration: number) => void;
    'cooldown_ended': (chatId: string) => void;
    'timer_error': (chatId: string, error: Error) => void;
}

export interface StorageServiceEvents {
    'data_saved': (key: string) => void;
    'data_loaded': (key: string) => void;
    'storage_error': (error: Error) => void;
}

/**
 * Utility types
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: number;
    context?: Record<string, any>;
    source?: string;
}

export type EventCallback<T = any> = (...args: T[]) => void;

export interface EventEmitter<T extends Record<string, EventCallback>> {
    on<K extends keyof T>(event: K, callback: T[K]): void;
    off<K extends keyof T>(event: K, callback: T[K]): void;
    emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): void;
}