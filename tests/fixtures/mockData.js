/**
 * Mock Data for Testing
 * Sample data structures used across tests
 */

const mockMessages = [
    {
        id: 1,
        conversation_id: 1,
        content: "Hello, how are you?",
        sender: "user@example.com",
        timestamp: Date.now() - 300000, // 5 minutes ago
        message_type: "text"
    },
    {
        id: 2,
        conversation_id: 1,
        content: "I'm doing well, thank you for asking!",
        sender: "assistant",
        timestamp: Date.now() - 240000, // 4 minutes ago
        message_type: "text"
    },
    {
        id: 3,
        conversation_id: 1,
        content: "Can you help me with a technical question?",
        sender: "user@example.com",
        timestamp: Date.now() - 180000, // 3 minutes ago
        message_type: "text"
    }
];

const mockConversations = [
    {
        id: 1,
        chat_id: "test_chat_1@c.us",
        created_at: Date.now() - 3600000, // 1 hour ago
        last_activity: Date.now() - 180000, // 3 minutes ago
        message_count: 3,
        is_active: 1
    },
    {
        id: 2,
        chat_id: "test_chat_2@c.us",
        created_at: Date.now() - 7200000, // 2 hours ago
        last_activity: Date.now() - 3600000, // 1 hour ago
        message_count: 5,
        is_active: 0
    }
];

const mockWhatsAppMessages = [
    {
        id: { fromMe: false, remote: "test_chat@c.us", id: "msg_1" },
        body: "Hello, this is a test message",
        from: "test_user@c.us",
        to: "test_bot@c.us",
        timestamp: Math.floor(Date.now() / 1000),
        type: "chat",
        hasMedia: false,
        isStatus: false,
        isGroupMsg: false,
        isForwarded: false
    },
    {
        id: { fromMe: false, remote: "test_chat@c.us", id: "msg_2" },
        body: "Can you help me with something?",
        from: "test_user@c.us",
        to: "test_bot@c.us",
        timestamp: Math.floor(Date.now() / 1000) - 60,
        type: "chat",
        hasMedia: false,
        isStatus: false,
        isGroupMsg: false,
        isForwarded: false
    }
];

const mockAIResponses = [
    {
        prompt: "Hello, how are you?",
        response: "I'm doing well, thank you for asking! How can I assist you today?",
        model: "@cf/meta/llama-3.2-1b-instruct",
        tokens_used: 45,
        response_time: 1200
    },
    {
        prompt: "Can you help me with a technical question?",
        response: "Of course! I'd be happy to help you with your technical question. Please go ahead and ask.",
        model: "@cf/meta/llama-3.2-1b-instruct",
        tokens_used: 38,
        response_time: 950
    }
];

const mockTimerEvents = [
    {
        id: "timer_1",
        chat_id: "test_chat@c.us",
        type: "response_delay",
        scheduled_time: Date.now() + 120000, // 2 minutes from now
        created_at: Date.now(),
        is_active: true
    },
    {
        id: "timer_2",
        chat_id: "test_chat@c.us",
        type: "cooldown",
        scheduled_time: Date.now() + 18000000, // 5 hours from now
        created_at: Date.now(),
        is_active: true
    }
];

const mockCloudflareConfig = {
    apiToken: "test-cf-token-12345",
    accountId: "test-cf-account-67890",
    model: "@cf/meta/llama-3.2-1b-instruct",
    maxTokens: 500,
    gatewayUrl: "https://api.cloudflare.com/client/v4/accounts/test-account/ai/run"
};

const mockEnvironmentConfig = {
    cloudflare: mockCloudflareConfig,
    database: {
        path: ":memory:"
    },
    whatsapp: {
        sessionPath: "./tests/fixtures/test-session"
    },
    app: {
        responseDelayMs: 120000,
        cooldownPeriodMs: 18000000,
        maxContextMessages: 10,
        enableLogging: true,
        secretaryMode: true,
        rateLimitPerMinute: 10,
        retryAttempts: 3
    }
};

const mockServiceHealth = [
    {
        name: "storageService",
        isHealthy: true,
        status: "healthy",
        lastChecked: Date.now(),
        details: { database_connected: true, tables_exist: true }
    },
    {
        name: "timerService",
        isHealthy: true,
        status: "healthy",
        lastChecked: Date.now(),
        details: { active_timers: 2, cron_running: true }
    },
    {
        name: "cloudflareAI",
        isHealthy: true,
        status: "healthy",
        lastChecked: Date.now(),
        details: { api_accessible: true, model_available: true }
    }
];

const mockConversationStats = {
    activeConversations: 3,
    totalConversations: 15,
    totalMessages: 127,
    averageMessagesPerConversation: 8.47,
    oldestConversation: Date.now() - (7 * 24 * 60 * 60 * 1000), // 7 days ago
    newestConversation: Date.now() - (30 * 60 * 1000) // 30 minutes ago
};

const mockTimerStats = {
    activeTimers: 5,
    chatsInCooldown: 2,
    activeResponseTimers: 3,
    completedTimers: 42,
    averageResponseTime: 125000 // 2m 5s
};

const mockAppMetrics = {
    uptime: 3600000, // 1 hour
    startTime: Date.now() - 3600000,
    services: {
        storageService: { initialized: true, healthy: true, errors: 0 },
        timerService: { initialized: true, healthy: true, errors: 0 },
        conversationManager: { initialized: true, healthy: true, errors: 1 },
        cloudflareAI: { initialized: true, healthy: true, errors: 0 },
        responseGenerator: { initialized: true, healthy: true, errors: 0 },
        messageHandler: { initialized: true, healthy: true, errors: 0 },
        whatsappClient: { initialized: true, healthy: false, errors: 2 }
    },
    memory: {
        used: 67108864, // 64MB
        total: 134217728, // 128MB
        percentage: 50
    },
    conversations: mockConversationStats,
    timers: mockTimerStats
};

// Mock error scenarios
const mockErrors = {
    databaseError: new Error("SQLITE_BUSY: database is locked"),
    networkError: new Error("ECONNREFUSED: Connection refused"),
    aiServiceError: new Error("AI service temporarily unavailable"),
    whatsappError: new Error("WhatsApp Web client disconnected"),
    configurationError: new Error("Invalid configuration: missing required field"),
    timeoutError: new Error("Operation timed out after 30000ms"),
    validationError: new Error("Validation failed: invalid input format")
};

// Helper functions for creating test data
const createMockMessage = (overrides = {}) => ({
    ...mockMessages[0],
    id: Math.floor(Math.random() * 10000),
    timestamp: Date.now(),
    ...overrides
});

const createMockConversation = (overrides = {}) => ({
    ...mockConversations[0],
    id: Math.floor(Math.random() * 10000),
    chat_id: `test_chat_${Math.floor(Math.random() * 1000)}@c.us`,
    created_at: Date.now(),
    last_activity: Date.now(),
    ...overrides
});

const createMockWhatsAppMessage = (overrides = {}) => ({
    ...mockWhatsAppMessages[0],
    id: {
        ...mockWhatsAppMessages[0].id,
        id: `msg_${Math.floor(Math.random() * 10000)}`
    },
    timestamp: Math.floor(Date.now() / 1000),
    ...overrides
});

const createMockTimer = (overrides = {}) => ({
    ...mockTimerEvents[0],
    id: `timer_${Math.floor(Math.random() * 10000)}`,
    created_at: Date.now(),
    scheduled_time: Date.now() + 120000,
    ...overrides
});

// Sample message for easy testing
const sampleMessage = {
    id: "test_msg_001",
    body: "Hello, this is a test message",
    from: "test_user@c.us",
    to: "test_bot@c.us",
    timestamp: Math.floor(Date.now() / 1000),
    isGroupMsg: false,
    isForwarded: false,
    chat: {
        id: "test_chat@c.us",
        name: "Test Chat"
    },
    author: "test_user@c.us"
};

// Sample storage data structure
const sampleStorageData = {
    conversations: {},
    timers: {},
    settings: mockEnvironmentConfig.app
};

module.exports = {
    mockMessages,
    mockConversations,
    mockWhatsAppMessages,
    mockAIResponses,
    mockTimerEvents,
    mockCloudflareConfig,
    mockEnvironmentConfig,
    mockServiceHealth,
    mockConversationStats,
    mockTimerStats,
    mockAppMetrics,
    mockErrors,
    sampleMessage,
    sampleStorageData,
    createMockMessage,
    createMockConversation,
    createMockWhatsAppMessage,
    createMockTimer
};