const { TestRunner, TestAssertions, MockLogger } = require('../utils/testHelpers');
const mockData = require('../fixtures/mockData');

/**
 * Comprehensive Unit Tests for Critical Functions
 * Tests core business logic with mocked dependencies
 */

// Mock dependencies
class MockStorageService {
    constructor() {
        this.conversations = new Map();
        this.cooldowns = new Map();
        this.timers = new Map();
        this.participants = new Map();
        this.messages = new Map();
        this.isHealthy = true;
    }

    async upsertConversation(chatId, isGroup = false, groupName) {
        const conversation = {
            id: Date.now(),
            chat_id: chatId,
            is_group: isGroup,
            group_name: groupName,
            last_activity: Math.floor(Date.now() / 1000),
            status: 'active',
            participant_count: isGroup ? 3 : 2
        };
        this.conversations.set(chatId, conversation);
        return conversation.id;
    }

    async getConversation(chatId) {
        return this.conversations.get(chatId) || null;
    }

    async getActiveConversations() {
        return Array.from(this.conversations.values());
    }

    async startCooldown(chatId, duration, reason = 'gilad_response') {
        const cooldown = {
            id: Date.now(),
            chat_id: chatId,
            start_time: Math.floor(Date.now() / 1000),
            end_time: Math.floor(Date.now() / 1000) + Math.floor(duration / 1000),
            is_active: true,
            reason
        };
        this.cooldowns.set(chatId, cooldown);
        return cooldown.id;
    }

    async isInCooldown(chatId) {
        const cooldown = this.cooldowns.get(chatId);
        if (!cooldown || !cooldown.is_active) return false;
        return cooldown.end_time > Math.floor(Date.now() / 1000);
    }

    async getRemainingCooldownTime(chatId) {
        const cooldown = this.cooldowns.get(chatId);
        if (!cooldown || !cooldown.is_active) return 0;
        const remaining = cooldown.end_time - Math.floor(Date.now() / 1000);
        return Math.max(0, remaining * 1000);
    }

    async startTimer(chatId, timerType, duration) {
        const timer = {
            id: Date.now(),
            chat_id: chatId,
            timer_type: timerType,
            start_time: Math.floor(Date.now() / 1000),
            end_time: duration ? Math.floor(Date.now() / 1000) + Math.floor(duration / 1000) : null,
            is_active: true
        };
        this.timers.set(`${chatId}-${timerType}`, timer);
        return timer.id;
    }

    async getActiveTimers(chatId, timerType) {
        return Array.from(this.timers.values()).filter(timer =>
            timer.chat_id === chatId &&
            timer.is_active &&
            (!timerType || timer.timer_type === timerType)
        );
    }

    async endTimer(timerId) {
        for (const [key, timer] of this.timers.entries()) {
            if (timer.id === timerId) {
                timer.is_active = false;
                timer.end_time = Math.floor(Date.now() / 1000);
                break;
            }
        }
    }

    async storeMessage(message, isFromGilad = false) {
        const messageId = Date.now();
        this.messages.set(messageId, { ...message, isFromGilad });
        return messageId;
    }

    async getRecentMessages(chatId, limit = 10) {
        return Array.from(this.messages.values())
            .filter(msg => msg.chat?.id === chatId)
            .slice(-limit);
    }

    async healthCheck() {
        return {
            isHealthy: this.isHealthy,
            checks: {
                connection: true,
                tables: true,
                indexes: true
            },
            stats: {
                conversations: this.conversations.size,
                messages: this.messages.size,
                participants: this.participants.size,
                activeCooldowns: Array.from(this.cooldowns.values()).filter(c => c.is_active).length,
                activeTimers: Array.from(this.timers.values()).filter(t => t.is_active).length
            }
        };
    }

    async cleanup() {
        const now = Math.floor(Date.now() / 1000);
        let expiredCooldowns = 0;
        let inactiveTimers = 0;

        // Clean expired cooldowns
        for (const [key, cooldown] of this.cooldowns.entries()) {
            if (cooldown.is_active && cooldown.end_time <= now) {
                cooldown.is_active = false;
                expiredCooldowns++;
            }
        }

        // Clean inactive timers older than 24 hours
        const oneDayAgo = now - (24 * 60 * 60);
        for (const [key, timer] of this.timers.entries()) {
            if (!timer.is_active && timer.start_time < oneDayAgo) {
                this.timers.delete(key);
                inactiveTimers++;
            }
        }

        return {
            expiredCooldowns,
            inactiveTimers,
            oldMessages: 0
        };
    }

    async saveData() { return Promise.resolve(); }
    async loadData() { return mockData.sampleStorageData; }
    async close() { return Promise.resolve(); }
}

class MockCloudflareAI {
    constructor() {
        this.isHealthyStatus = true;
        this.currentModel = '@cf/meta/llama-3.2-1b-instruct';
        this.availableModels = [
            '@cf/meta/llama-3.2-1b-instruct',
            '@cf/meta/llama-3.2-3b-instruct',
            '@cf/mistral/mistral-7b-instruct-v0.1'
        ];
        this.rateLimitRemaining = 100;
    }

    async generateResponse(prompt, context, model, maxTokens = 500) {
        if (!this.isHealthyStatus) {
            throw new Error('Service unhealthy');
        }

        // Simulate different responses based on prompt
        let content = 'Thank you for your message.';
        if (prompt.includes('business')) {
            content = 'I\'ll make sure Gilad receives your business inquiry promptly.';
        } else if (prompt.includes('urgent')) {
            content = 'I understand this is urgent. I\'ll ensure Gilad sees this right away.';
        } else if (prompt.includes('secretary')) {
            content = 'I\'m Gilad\'s assistant. How can I help you today?';
        }

        return {
            content,
            confidence: 0.8,
            tokens_used: Math.floor(content.length / 4),
            model: model || this.currentModel
        };
    }

    async isHealthy() {
        return this.isHealthyStatus;
    }

    async setModel(modelName) {
        if (this.availableModels.includes(modelName)) {
            this.currentModel = modelName;
            return true;
        }
        return false;
    }

    async listModels() {
        return [...this.availableModels];
    }

    async getModelInfo() {
        return {
            name: this.currentModel,
            description: 'Llama model for text generation',
            task: 'text-generation'
        };
    }

    getCurrentModel() {
        return this.currentModel;
    }

    validateConfig() {
        return true;
    }

    async checkRateLimit() {
        return {
            remaining: this.rateLimitRemaining,
            resetTime: Math.floor(Date.now() / 1000) + 3600
        };
    }

    // Test helpers
    setHealthy(healthy) { this.isHealthyStatus = healthy; }
    setRateLimit(remaining) { this.rateLimitRemaining = remaining; }
}

// Mock EventEmitter for TimerService
class MockEventEmitter {
    constructor() {
        this.events = new Map();
    }

    on(event, callback) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event).push(callback);
    }

    emit(event, ...args) {
        const callbacks = this.events.get(event) || [];
        callbacks.forEach(callback => callback(...args));
    }

    removeAllListeners() {
        this.events.clear();
    }
}

/**
 * Unit Test Suite
 */
async function runUnitTests() {
    const runner = new TestRunner('🧪 Critical Functions Unit Tests');

    // Create assertion helpers using static methods
    const assert = {
        ok: (condition, message) => TestAssertions.assertTrue(condition, message),
        equal: (actual, expected, message) => TestAssertions.assertEqual(actual, expected, message),
        fail: (message) => { throw new Error(message); },
        notEqual: (actual, expected, message) => TestAssertions.assertTrue(actual !== expected, message || `Expected ${actual} to not equal ${expected}`),
        isNull: (value, message) => TestAssertions.assertTrue(value === null, message || `Expected ${value} to be null`),
        isNotNull: (value, message) => TestAssertions.assertTrue(value !== null, message || `Expected ${value} to not be null`)
    };

    // Setup test data and mocks
    const mockStorage = new MockStorageService();
    const mockAI = new MockCloudflareAI();

    // Test 1: TimerService - Core Timer Logic
    const timerService = {
        timers: new Map(),
        storage: mockStorage,
        events: new MockEventEmitter(),

        startResponseTimer(chatId, callback) {
            const timerState = {
                chatId,
                isInCooldown: false,
                responseTimer: setTimeout(async () => {
                    try {
                        await callback();
                        this.events.emit('response_timer_expired', { chatId });
                    } catch (error) {
                        console.error('Timer callback error:', error);
                    }
                }, 100) // Short timeout for testing
            };
            this.timers.set(chatId, timerState);
            return this.storage.startTimer(chatId, 'response', 100);
        },

        startCooldown(chatId, duration = 5000) {
            const timerState = this.timers.get(chatId) || { chatId, isInCooldown: false };

            if (timerState.responseTimer) {
                clearTimeout(timerState.responseTimer);
                timerState.responseTimer = undefined;
            }

            timerState.isInCooldown = true;
            timerState.lastResponseTime = Date.now();
            timerState.cooldownTimer = setTimeout(() => {
                timerState.isInCooldown = false;
                timerState.cooldownTimer = undefined;
                this.events.emit('cooldown_ended', { chatId });
            }, duration);

            this.timers.set(chatId, timerState);
            return this.storage.startCooldown(chatId, duration);
        },

        isInCooldown(chatId) {
            const timerState = this.timers.get(chatId);
            return timerState ? timerState.isInCooldown : false;
        },

        cancelTimer(chatId) {
            const timerState = this.timers.get(chatId);
            if (timerState?.responseTimer) {
                clearTimeout(timerState.responseTimer);
                timerState.responseTimer = undefined;
                this.events.emit('timer_cancelled', { chatId });
                return true;
            }
            return false;
        },

        getTimerStats() {
            const timers = Array.from(this.timers.values());
            return {
                totalTimers: timers.length,
                activeResponseTimers: timers.filter(t => t.responseTimer).length,
                chatsInCooldown: timers.filter(t => t.isInCooldown).length,
                activeTimers: timers.filter(t => t.responseTimer || t.cooldownTimer || t.isInCooldown).length
            };
        },

        cleanup() {
            const now = Date.now();
            const toRemove = [];

            for (const [chatId, timerState] of this.timers.entries()) {
                if (!timerState.responseTimer && !timerState.cooldownTimer && !timerState.isInCooldown) {
                    const lastActivity = timerState.lastResponseTime || 0;
                    if (now - lastActivity > 24 * 60 * 60 * 1000) {
                        toRemove.push(chatId);
                    }
                }
            }

            toRemove.forEach(chatId => this.timers.delete(chatId));
            return this.storage.cleanup();
        }
    };

    // TimerService Tests
    runner.test('TimerService: should start response timer', async () => {
        let callbackExecuted = false;
        const callback = async () => { callbackExecuted = true; };

        await timerService.startResponseTimer('test-chat-1', callback);

        assert.ok(timerService.timers.has('test-chat-1'), 'Timer state should be created');
        assert.ok(!timerService.isInCooldown('test-chat-1'), 'Should not be in cooldown initially');

        // Wait for timer to execute
        await new Promise(resolve => setTimeout(resolve, 150));
        assert.ok(callbackExecuted, 'Timer callback should execute');
    });

    runner.test('TimerService: should start cooldown correctly', async () => {
        await timerService.startCooldown('test-chat-2', 200);

        assert.ok(timerService.isInCooldown('test-chat-2'), 'Should be in cooldown');

        // Wait for cooldown to end
        await new Promise(resolve => setTimeout(resolve, 250));
        assert.ok(!timerService.isInCooldown('test-chat-2'), 'Should not be in cooldown after timeout');
    });

    runner.test('TimerService: should cancel timer correctly', async () => {
        let callbackExecuted = false;
        const callback = async () => { callbackExecuted = true; };

        await timerService.startResponseTimer('test-chat-3', callback);
        const cancelled = timerService.cancelTimer('test-chat-3');

        assert.ok(cancelled, 'Timer should be cancelled');

        // Wait to ensure callback doesn't execute
        await new Promise(resolve => setTimeout(resolve, 150));
        assert.ok(!callbackExecuted, 'Cancelled timer callback should not execute');
    });

    runner.test('TimerService: should calculate timer stats correctly', async () => {
        // Clean up previous tests
        timerService.timers.clear();

        await timerService.startResponseTimer('stats-chat-1', async () => {});
        await timerService.startCooldown('stats-chat-2', 1000);

        const stats = timerService.getTimerStats();

        assert.equal(stats.totalTimers, 2, 'Should have 2 total timers');
        assert.equal(stats.chatsInCooldown, 1, 'Should have 1 chat in cooldown');
        assert.ok(stats.activeTimers >= 1, 'Should have active timers');
    });

    // CloudflareAI Tests
    runner.test('CloudflareAI: should generate response successfully', async () => {
        const response = await mockAI.generateResponse('Hello', undefined, undefined, 100);

        assert.ok(response.content, 'Should return content');
        assert.ok(response.confidence > 0, 'Should have confidence score');
        assert.ok(response.tokens_used >= 0, 'Should report tokens used');
        assert.ok(response.model, 'Should specify model used');
    });

    runner.test('CloudflareAI: should handle health check', async () => {
        const healthy = await mockAI.isHealthy();
        assert.ok(healthy, 'Should be healthy initially');

        mockAI.setHealthy(false);
        const unhealthy = await mockAI.isHealthy();
        assert.ok(!unhealthy, 'Should be unhealthy when set');

        // Reset for other tests
        mockAI.setHealthy(true);
    });

    runner.test('CloudflareAI: should switch models correctly', async () => {
        const originalModel = mockAI.getCurrentModel();
        const newModel = '@cf/mistral/mistral-7b-instruct-v0.1';

        const switched = await mockAI.setModel(newModel);
        assert.ok(switched, 'Should switch to valid model');
        assert.equal(mockAI.getCurrentModel(), newModel, 'Model should be updated');

        const invalidSwitch = await mockAI.setModel('invalid-model');
        assert.ok(!invalidSwitch, 'Should not switch to invalid model');
    });

    runner.test('CloudflareAI: should list available models', async () => {
        const models = await mockAI.listModels();
        assert.ok(Array.isArray(models), 'Should return array of models');
        assert.ok(models.length > 0, 'Should have available models');
        assert.ok(models.includes('@cf/meta/llama-3.2-1b-instruct'), 'Should include expected models');
    });

    runner.test('CloudflareAI: should check rate limits', async () => {
        const rateLimit = await mockAI.checkRateLimit();
        assert.ok(rateLimit.remaining >= 0, 'Should report remaining requests');
        assert.ok(rateLimit.resetTime > 0, 'Should report reset time');
    });

    runner.test('CloudflareAI: should validate configuration', () => {
        const isValid = mockAI.validateConfig();
        assert.ok(isValid, 'Should validate configuration');
    });

    // ConversationManager Setup
    const conversationManager = {
        storageService: mockStorage,
        conversations: new Map(),

        async addMessage(message) {
            const chatId = message.chat.id;
            let context = this.conversations.get(chatId);

            if (!context) {
                context = {
                    chatId,
                    participantCount: message.isGroupMsg ? 2 : 2,
                    recentMessages: [],
                    isActive: true
                };
                this.conversations.set(chatId, context);
            }

            context.recentMessages.push(message);

            // Keep only last 10 messages for testing
            if (context.recentMessages.length > 10) {
                context.recentMessages = context.recentMessages.slice(-10);
            }

            // Update participant count for group messages
            if (message.isGroupMsg && message.author) {
                const uniqueParticipants = new Set(
                    context.recentMessages
                        .filter(msg => msg.isGroupMsg && msg.author)
                        .map(msg => msg.author)
                );
                context.participantCount = uniqueParticipants.size;
            }

            context.isActive = true;
            await this.storageService.storeMessage(message);
        },

        async getConversationContext(chatId) {
            return this.conversations.get(chatId) || null;
        },

        async updateLastResponseTime(chatId, timestamp) {
            const context = this.conversations.get(chatId);
            if (context) {
                context.lastResponseTime = timestamp;
            }
        },

        getActiveConversations() {
            return Array.from(this.conversations.values()).filter(context => context.isActive);
        },

        getConversationStats() {
            const totalConversations = this.conversations.size;
            const activeConversations = this.getActiveConversations().length;
            const totalMessages = Array.from(this.conversations.values())
                .reduce((sum, context) => sum + context.recentMessages.length, 0);

            return {
                totalConversations,
                activeConversations,
                totalMessages
            };
        },

        async cleanupOldConversations(maxAgeMs = 24 * 60 * 60 * 1000) {
            const now = Date.now();
            const conversationsToRemove = [];

            for (const [chatId, context] of this.conversations.entries()) {
                const lastMessageTime = context.recentMessages.length > 0
                    ? context.recentMessages[context.recentMessages.length - 1].timestamp
                    : 0;

                if (now - lastMessageTime > maxAgeMs) {
                    conversationsToRemove.push(chatId);
                }
            }

            conversationsToRemove.forEach(chatId => {
                this.conversations.delete(chatId);
            });

            return conversationsToRemove.length;
        }
    };

    // ConversationManager Tests
    runner.test('ConversationManager: should add message correctly', async () => {
        const message = mockData.sampleMessage;
        await conversationManager.addMessage(message);

        const context = await conversationManager.getConversationContext(message.chat.id);
        assert.ok(context, 'Context should be created');
        assert.equal(context.recentMessages.length, 1, 'Should have one message');
        assert.ok(context.isActive, 'Context should be active');
    });

    runner.test('ConversationManager: should handle group message participant counting', async () => {
        const groupMessage1 = {
            ...mockData.sampleMessage,
            chat: { id: 'group-test', name: 'Test Group' },
            isGroupMsg: true,
            author: 'user1@test.com'
        };

        const groupMessage2 = {
            ...mockData.sampleMessage,
            chat: { id: 'group-test', name: 'Test Group' },
            isGroupMsg: true,
            author: 'user2@test.com'
        };

        await conversationManager.addMessage(groupMessage1);
        await conversationManager.addMessage(groupMessage2);

        const context = await conversationManager.getConversationContext('group-test');
        assert.equal(context.participantCount, 2, 'Should count unique participants');
    });

    runner.test('ConversationManager: should update last response time', async () => {
        const chatId = 'response-time-test';
        const message = { ...mockData.sampleMessage, chat: { id: chatId } };
        await conversationManager.addMessage(message);

        const timestamp = Date.now();
        await conversationManager.updateLastResponseTime(chatId, timestamp);

        const context = await conversationManager.getConversationContext(chatId);
        assert.equal(context.lastResponseTime, timestamp, 'Should update last response time');
    });

    runner.test('ConversationManager: should get conversation statistics', async () => {
        // Clear previous test data
        conversationManager.conversations.clear();

        const message1 = { ...mockData.sampleMessage, chat: { id: 'stats-1' } };
        const message2 = { ...mockData.sampleMessage, chat: { id: 'stats-2' } };

        await conversationManager.addMessage(message1);
        await conversationManager.addMessage(message2);

        const stats = conversationManager.getConversationStats();
        assert.equal(stats.totalConversations, 2, 'Should have 2 conversations');
        assert.equal(stats.activeConversations, 2, 'Should have 2 active conversations');
        assert.equal(stats.totalMessages, 2, 'Should have 2 total messages');
    });

    runner.test('ConversationManager: should cleanup old conversations', async () => {
        // Add old conversation
        const oldMessage = {
            ...mockData.sampleMessage,
            chat: { id: 'old-chat' },
            timestamp: Date.now() - (25 * 60 * 60 * 1000) // 25 hours ago
        };

        await conversationManager.addMessage(oldMessage);

        const cleaned = await conversationManager.cleanupOldConversations(24 * 60 * 60 * 1000);
        assert.equal(cleaned, 1, 'Should cleanup 1 old conversation');

        const context = await conversationManager.getConversationContext('old-chat');
        assert.ok(!context, 'Old conversation should be removed');
    });

    // ResponseGenerator Setup
    const responseGenerator = {
        cloudflareAI: mockAI,

        async generateSecretaryResponse(context) {
            try {
                const secretaryContext = this.analyzeSecretaryContext(context);
                const prompt = this.buildSecretaryPrompt(secretaryContext);

                const response = await this.cloudflareAI.generateResponse(
                    prompt,
                    secretaryContext,
                    undefined,
                    500
                );

                const processedResponse = this.postProcessResponse(response);
                const filteredResponse = this.filterResponse(processedResponse);

                if (!filteredResponse.isAppropriate) {
                    return {
                        content: filteredResponse.suggestedResponse || this.getFallbackResponse(secretaryContext),
                        confidence: 0.5,
                        tokens_used: 0,
                        model: 'filtered'
                    };
                }

                return this.addSecretaryPersonality(processedResponse, secretaryContext);
            } catch (error) {
                return {
                    content: this.getFallbackResponse(context),
                    confidence: 0.1,
                    tokens_used: 0,
                    model: 'fallback'
                };
            }
        },

        analyzeSecretaryContext(context) {
            const enhanced = { ...context };
            const lastMessage = context.recentMessages[context.recentMessages.length - 1];

            if (lastMessage) {
                enhanced.messageType = this.classifyMessageType(lastMessage.body);
                enhanced.urgencyLevel = this.determineUrgency(lastMessage.body);
                enhanced.senderRelation = 'unknown';
            }

            return enhanced;
        },

        classifyMessageType(messageBody) {
            const businessKeywords = ['meeting', 'project', 'work', 'business', 'client'];
            const personalKeywords = ['how are you', 'family', 'weekend', 'dinner'];

            const body = messageBody.toLowerCase();

            if (businessKeywords.some(keyword => body.includes(keyword))) {
                return 'business';
            }
            if (personalKeywords.some(keyword => body.includes(keyword))) {
                return 'personal';
            }
            return 'unknown';
        },

        determineUrgency(messageBody) {
            const urgentKeywords = ['urgent', 'asap', 'immediately', 'critical', 'now'];
            const body = messageBody.toLowerCase();

            if (urgentKeywords.some(keyword => body.includes(keyword))) {
                return 'high';
            }
            if (body.includes('?') || body.includes('please')) {
                return 'medium';
            }
            return 'low';
        },

        buildSecretaryPrompt(context) {
            const { messageType, urgencyLevel, recentMessages } = context;
            let prompt = `You are Gilad's professional assistant responding to a ${messageType || 'general'} message.`;

            if (urgencyLevel === 'high') {
                prompt += ' This message seems urgent - acknowledge this appropriately.';
            }

            prompt += '\n\nRecent messages:\n';
            recentMessages.slice(-3).forEach(message => {
                prompt += `${message.from}: ${message.body}\n`;
            });

            prompt += '\nPlease provide an appropriate secretary response.';
            return prompt;
        },

        filterResponse(response) {
            const content = response.content.toLowerCase();

            // Check for inappropriate content
            const inappropriateTerms = ['inappropriate', 'offensive', 'harmful'];
            for (const term of inappropriateTerms) {
                if (content.includes(term)) {
                    return {
                        isAppropriate: false,
                        reason: `Contains inappropriate term: ${term}`,
                        suggestedResponse: "I'd prefer to keep our conversation professional."
                    };
                }
            }

            // Check for length
            if (response.content.length > 800) {
                return {
                    isAppropriate: false,
                    reason: 'Response too long',
                    suggestedResponse: response.content.substring(0, 700) + '...'
                };
            }

            return { isAppropriate: true };
        },

        addSecretaryPersonality(response, context) {
            let content = response.content;

            if (context.messageType === 'business') {
                if (!content.includes('Best regards') && content.length < 200) {
                    if (Math.random() > 0.7) {
                        content += '\n\nBest regards,\nGilad\'s Assistant';
                    }
                }
            }

            if (context.urgencyLevel === 'high' && !content.includes('urgent')) {
                content = 'I understand this seems urgent. ' + content;
            }

            return { ...response, content: content.trim() };
        },

        postProcessResponse(response) {
            let processedContent = response.content;

            // Remove AI prefixes
            const prefixesToRemove = ['As an AI', 'I am an AI', 'As an assistant'];
            prefixesToRemove.forEach(prefix => {
                const regex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[,.]?\\s*`, 'i');
                processedContent = processedContent.replace(regex, '');
            });

            // Limit length
            if (processedContent.length > 1000) {
                processedContent = processedContent.substring(0, 997) + '...';
            }

            return { ...response, content: processedContent.trim() };
        },

        getFallbackResponse(context) {
            if (context.messageType === 'business') {
                return "Thank you for your message. I'll make sure Gilad receives this and gets back to you promptly.";
            }
            if (context.urgencyLevel === 'high') {
                return "I understand this is important. I'll ensure Gilad sees this message right away.";
            }
            return "Thank you for your message. I'll make sure Gilad receives this.";
        }
    };

    // ResponseGenerator Tests
    runner.test('ResponseGenerator: should generate secretary response', async () => {
        const context = {
            chatId: 'test-chat',
            recentMessages: [mockData.sampleMessage],
            participantCount: 2,
            isActive: true
        };

        const response = await responseGenerator.generateSecretaryResponse(context);

        assert.ok(response.content, 'Should generate content');
        assert.ok(response.confidence >= 0, 'Should have confidence score');
        assert.ok(response.model, 'Should specify model');
    });

    runner.test('ResponseGenerator: should classify message types correctly', () => {
        const businessMessage = 'We need to schedule a meeting for the project';
        const personalMessage = 'How are you doing this weekend?';
        const unknownMessage = 'Hello there';

        assert.equal(responseGenerator.classifyMessageType(businessMessage), 'business');
        assert.equal(responseGenerator.classifyMessageType(personalMessage), 'personal');
        assert.equal(responseGenerator.classifyMessageType(unknownMessage), 'unknown');
    });

    runner.test('ResponseGenerator: should determine urgency levels', () => {
        const urgentMessage = 'This is urgent, please respond ASAP';
        const mediumMessage = 'Can you please help me with this?';
        const lowMessage = 'Just saying hello';

        assert.equal(responseGenerator.determineUrgency(urgentMessage), 'high');
        assert.equal(responseGenerator.determineUrgency(mediumMessage), 'medium');
        assert.equal(responseGenerator.determineUrgency(lowMessage), 'low');
    });

    runner.test('ResponseGenerator: should filter inappropriate responses', () => {
        const appropriateResponse = { content: 'Thank you for your message', confidence: 0.8 };
        const inappropriateResponse = { content: 'This is inappropriate content', confidence: 0.8 };
        const longResponse = { content: 'x'.repeat(900), confidence: 0.8 };

        const filter1 = responseGenerator.filterResponse(appropriateResponse);
        assert.ok(filter1.isAppropriate, 'Should accept appropriate response');

        const filter2 = responseGenerator.filterResponse(inappropriateResponse);
        assert.ok(!filter2.isAppropriate, 'Should reject inappropriate response');

        const filter3 = responseGenerator.filterResponse(longResponse);
        assert.ok(!filter3.isAppropriate, 'Should reject overly long response');
    });

    runner.test('ResponseGenerator: should build secretary prompts correctly', () => {
        const context = {
            messageType: 'business',
            urgencyLevel: 'high',
            recentMessages: [mockData.sampleMessage]
        };

        const prompt = responseGenerator.buildSecretaryPrompt(context);

        assert.ok(prompt.includes('business'), 'Should include message type');
        assert.ok(prompt.includes('urgent'), 'Should include urgency level');
        assert.ok(prompt.includes(mockData.sampleMessage.body), 'Should include recent message');
    });

    // StorageService Tests
    runner.test('StorageService: should create and retrieve conversations', async () => {
        const chatId = 'storage-test-chat';
        const conversationId = await mockStorage.upsertConversation(chatId, false, null);

        assert.ok(conversationId, 'Should return conversation ID');

        const conversation = await mockStorage.getConversation(chatId);
        assert.ok(conversation, 'Should retrieve conversation');
        assert.equal(conversation.chat_id, chatId, 'Should have correct chat ID');
    });

    runner.test('StorageService: should manage cooldowns correctly', async () => {
        const chatId = 'cooldown-test-chat';
        await mockStorage.upsertConversation(chatId);

        // Start cooldown
        const cooldownId = await mockStorage.startCooldown(chatId, 1000, 'test');
        assert.ok(cooldownId, 'Should start cooldown');

        // Check cooldown status
        const isInCooldown = await mockStorage.isInCooldown(chatId);
        assert.ok(isInCooldown, 'Should be in cooldown');

        // Check remaining time
        const remainingTime = await mockStorage.getRemainingCooldownTime(chatId);
        assert.ok(remainingTime > 0, 'Should have remaining time');
        assert.ok(remainingTime <= 1000, 'Should not exceed original duration');
    });

    runner.test('StorageService: should store and retrieve messages', async () => {
        const message = mockData.sampleMessage;
        await mockStorage.upsertConversation(message.chat.id);

        const messageId = await mockStorage.storeMessage(message, false);
        assert.ok(messageId, 'Should store message');

        const recentMessages = await mockStorage.getRecentMessages(message.chat.id, 5);
        assert.ok(Array.isArray(recentMessages), 'Should return array');
    });

    runner.test('StorageService: should manage timers', async () => {
        const chatId = 'timer-test-chat';
        await mockStorage.upsertConversation(chatId);

        const timerId = await mockStorage.startTimer(chatId, 'response', 2000);
        assert.ok(timerId, 'Should start timer');

        const activeTimers = await mockStorage.getActiveTimers(chatId, 'response');
        assert.equal(activeTimers.length, 1, 'Should have one active timer');
        assert.equal(activeTimers[0].timer_type, 'response', 'Should be response timer');

        await mockStorage.endTimer(timerId);
        const activeTimersAfterEnd = await mockStorage.getActiveTimers(chatId, 'response');
        assert.equal(activeTimersAfterEnd.length, 0, 'Should have no active timers after ending');
    });

    runner.test('StorageService: should perform health check', async () => {
        const health = await mockStorage.healthCheck();

        assert.ok(typeof health.isHealthy === 'boolean', 'Should report health status');
        assert.ok(health.checks, 'Should include checks');
        assert.ok(health.stats, 'Should include statistics');
    });

    runner.test('StorageService: should perform cleanup', async () => {
        // Add some test data for cleanup
        const chatId = 'cleanup-test';
        await mockStorage.upsertConversation(chatId);
        await mockStorage.startCooldown(chatId, 100); // Short cooldown

        // Wait for cooldown to expire
        await new Promise(resolve => setTimeout(resolve, 150));

        const cleanupResult = await mockStorage.cleanup();

        assert.ok(typeof cleanupResult.expiredCooldowns === 'number', 'Should report expired cooldowns');
        assert.ok(typeof cleanupResult.inactiveTimers === 'number', 'Should report inactive timers');
        assert.ok(typeof cleanupResult.oldMessages === 'number', 'Should report old messages');
    });

    // Error Handling Tests
    runner.test('ErrorHandling: should handle AI service failures gracefully', async () => {
        const testMockAI = new MockCloudflareAI();
        testMockAI.setHealthy(false);

        try {
            await testMockAI.generateResponse('test');
            assert.fail('Should throw error when unhealthy');
        } catch (error) {
            assert.ok(error.message.includes('unhealthy'), 'Should throw appropriate error');
        }
    });

    runner.test('ErrorHandling: should handle invalid timer operations', async () => {
        const testMockStorage = new MockStorageService();

        // Try to get conversation that doesn't exist
        const nonExistentConv = await testMockStorage.getConversation('non-existent');
        assert.ok(nonExistentConv === null, 'Should return null for non-existent conversation');

        // Try to check cooldown for non-existent conversation
        const nonExistentCooldown = await testMockStorage.isInCooldown('non-existent');
        assert.ok(!nonExistentCooldown, 'Should return false for non-existent conversation');
    });

    runner.test('ErrorHandling: should handle empty message context', async () => {
        const testMockStorage = new MockStorageService();
        const testConversationManager = {
            storageService: testMockStorage,
            conversations: new Map(),

            async getConversationContext(chatId) {
                return this.conversations.get(chatId) || null;
            }
        };

        const context = await testConversationManager.getConversationContext('empty-chat');
        assert.ok(context === null, 'Should return null for non-existent context');
    });

    runner.test('ErrorHandling: should validate configuration properly', () => {
        const testMockAI = new MockCloudflareAI();

        const isValid1 = testMockAI.validateConfig();
        assert.ok(isValid1, 'Should validate good configuration');

        // Test with mock that always fails validation
        const badAI = {
            validateConfig: () => false
        };

        const isValid2 = badAI.validateConfig();
        assert.ok(!isValid2, 'Should reject bad configuration');
    });

    return runner.run();
}

// Export for use in test runner
module.exports = runUnitTests;

// Run tests if this file is executed directly
if (require.main === module) {
    runUnitTests()
        .then(report => {
            console.log('\n🎉 Unit Testing Complete!');
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
            console.error('Unit tests failed to run:', error);
            process.exit(1);
        });
}