const { TestRunner, TestAssertions, MockLogger } = require('../utils/testHelpers');
const mockData = require('../fixtures/mockData');

/**
 * Integration Flow Tests for WhatsApp LLM Personal Assistant
 * Tests complete message processing workflows and service integration
 */

// Enhanced Mock Services for Integration Testing
class IntegrationMockStorageService {
    constructor() {
        this.conversations = new Map();
        this.participants = new Map();
        this.messages = new Map();
        this.cooldowns = new Map();
        this.timers = new Map();
        this.settings = mockData.mockEnvironmentConfig.app;
    }

    async upsertConversation(chatId, isGroup = false, groupName) {
        const conversation = {
            id: Date.now() + Math.random(),
            chat_id: chatId,
            is_group: isGroup,
            group_name: groupName,
            last_activity: Math.floor(Date.now() / 1000),
            status: 'active',
            participant_count: isGroup ? 3 : 2
        };
        this.conversations.set(chatId, conversation);
        await this.updateParticipantCount(chatId, conversation.participant_count);
        return conversation.id;
    }

    async getConversation(chatId) {
        return this.conversations.get(chatId) || null;
    }

    async getActiveConversations() {
        return Array.from(this.conversations.values()).filter(c => c.status === 'active');
    }

    async updateParticipantCount(chatId, count) {
        const conv = this.conversations.get(chatId);
        if (conv) {
            conv.participant_count = count;
            conv.last_activity = Math.floor(Date.now() / 1000);
        }
    }

    async storeMessage(message, isFromGilad = false) {
        const messageId = Date.now() + Math.random();
        this.messages.set(messageId, {
            id: messageId,
            chat_id: message.chat.id,
            content: message.body,
            sender: message.from,
            timestamp: message.timestamp,
            is_from_gilad: isFromGilad
        });

        // Update conversation activity
        const conv = this.conversations.get(message.chat.id);
        if (conv) {
            conv.last_activity = Math.floor(Date.now() / 1000);
        }

        return messageId;
    }

    async getRecentMessages(chatId, limit = 10) {
        return Array.from(this.messages.values())
            .filter(msg => msg.chat_id === chatId)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit)
            .reverse();
    }

    async startCooldown(chatId, duration, reason = 'gilad_response') {
        const cooldown = {
            id: Date.now() + Math.random(),
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
            id: Date.now() + Math.random(),
            chat_id: chatId,
            timer_type: timerType,
            start_time: Math.floor(Date.now() / 1000),
            end_time: duration ? Math.floor(Date.now() / 1000) + Math.floor(duration / 1000) : null,
            is_active: true
        };
        this.timers.set(`${chatId}-${timerType}-${timer.id}`, timer);
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

    async healthCheck() {
        return {
            isHealthy: true,
            checks: { connection: true, tables: true, indexes: true },
            stats: {
                conversations: this.conversations.size,
                messages: this.messages.size,
                activeCooldowns: Array.from(this.cooldowns.values()).filter(c => c.is_active).length,
                activeTimers: Array.from(this.timers.values()).filter(t => t.is_active).length
            }
        };
    }

    async saveData() { return Promise.resolve(); }
    async loadData() { return mockData.sampleStorageData; }
    async cleanup() {
        return { expiredCooldowns: 0, inactiveTimers: 0, oldMessages: 0 };
    }
    async close() { return Promise.resolve(); }
}

class IntegrationMockCloudflareAI {
    constructor() {
        this.isHealthyStatus = true;
        this.responseDelay = 100; // Simulate AI processing time
        this.currentModel = '@cf/meta/llama-3.2-1b-instruct';
        this.requestCount = 0;
    }

    async generateResponse(prompt, context, model, maxTokens = 500) {
        this.requestCount++;

        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, this.responseDelay));

        if (!this.isHealthyStatus) {
            throw new Error('AI service is unavailable');
        }

        // Generate contextual responses based on prompt content
        let content = 'Thank you for your message. I\'ll make sure Gilad receives this.';

        if (prompt.includes('business') || prompt.includes('meeting') || prompt.includes('project')) {
            content = 'Thank you for your business inquiry. I\'ll ensure Gilad reviews this and responds promptly.';
        } else if (prompt.includes('urgent') || prompt.includes('asap') || prompt.includes('immediately')) {
            content = 'I understand this is urgent. I\'ll make sure Gilad sees this message right away.';
        } else if (prompt.includes('secretary') || prompt.includes('assistant')) {
            content = 'Hello! I\'m Gilad\'s assistant. I\'ve received your message and will ensure he gets it.';
        } else if (context?.participantCount > 2) {
            content = 'Thank you for the group message. I\'ll make sure Gilad sees this when he\'s available.';
        }

        return {
            content,
            confidence: 0.8 + (Math.random() * 0.2), // 0.8-1.0
            tokens_used: Math.floor(content.length / 4),
            model: model || this.currentModel
        };
    }

    async isHealthy() {
        return this.isHealthyStatus;
    }

    setHealthy(healthy) {
        this.isHealthyStatus = healthy;
    }

    getRequestCount() {
        return this.requestCount;
    }

    resetRequestCount() {
        this.requestCount = 0;
    }

    getCurrentModel() { return this.currentModel; }
    validateConfig() { return true; }
}

class IntegrationMockWhatsAppClient {
    constructor() {
        this.isConnected = true;
        this.sentMessages = [];
        this.messageDelay = 50; // Simulate network delay
    }

    async sendMessage(chatId, message) {
        if (!this.isConnected) {
            throw new Error('WhatsApp client is not connected');
        }

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, this.messageDelay));

        const sentMessage = {
            chatId,
            message,
            timestamp: Date.now(),
            messageId: `sent_${Date.now()}_${Math.random()}`
        };

        this.sentMessages.push(sentMessage);
        return sentMessage.messageId;
    }

    getSentMessages() {
        return [...this.sentMessages];
    }

    clearSentMessages() {
        this.sentMessages = [];
    }

    setConnected(connected) {
        this.isConnected = connected;
    }

    isReady() {
        return this.isConnected;
    }
}

// Integrated Message Processing System
class MessageProcessingSystem {
    constructor() {
        this.storage = new IntegrationMockStorageService();
        this.ai = new IntegrationMockCloudflareAI();
        this.whatsapp = new IntegrationMockWhatsAppClient();
        this.logger = new MockLogger();

        // System configuration
        this.config = {
            responseDelayMs: 2000, // 2 seconds for testing (normally 2 minutes)
            cooldownPeriodMs: 5000, // 5 seconds for testing (normally 5 hours)
            maxContextMessages: 5,
            secretaryMode: true
        };

        // Active timers and state
        this.activeTimers = new Map();
        this.conversationContexts = new Map();
        this.systemMetrics = {
            messagesProcessed: 0,
            responsesGenerated: 0,
            timersCreated: 0,
            cooldownsActivated: 0,
            errors: 0
        };
    }

    async processIncomingMessage(message) {
        try {
            this.systemMetrics.messagesProcessed++;
            this.logger.info('Processing incoming message', { chatId: message.chat.id, from: message.from });

            // 1. Store the message
            await this.storage.storeMessage(message);

            // 2. Update/create conversation context
            await this.updateConversationContext(message);

            // 3. Check if chat is in cooldown
            const isInCooldown = await this.storage.isInCooldown(message.chat.id);
            if (isInCooldown) {
                this.logger.info('Chat is in cooldown, no response will be generated', { chatId: message.chat.id });
                return { action: 'ignored_cooldown', chatId: message.chat.id };
            }

            // 4. Check if message is from Gilad (simulated by checking sender)
            const isFromGilad = message.from.includes('gilad') || message.from.includes('owner');
            if (isFromGilad) {
                return await this.handleGiladMessage(message);
            }

            // 5. Start response timer for secretary mode
            return await this.startResponseTimer(message);

        } catch (error) {
            this.systemMetrics.errors++;
            this.logger.error('Error processing message', { error: error.message, chatId: message.chat.id });
            throw error;
        }
    }

    async updateConversationContext(message) {
        const chatId = message.chat.id;

        // Ensure conversation exists in storage
        await this.storage.upsertConversation(chatId, message.isGroupMsg, message.chat.name);

        // Update in-memory context
        let context = this.conversationContexts.get(chatId);
        if (!context) {
            context = {
                chatId,
                participantCount: message.isGroupMsg ? 2 : 2,
                recentMessages: [],
                isActive: true,
                lastActivity: Date.now()
            };
        }

        // Add message to context
        context.recentMessages.push(message);

        // Keep only recent messages
        if (context.recentMessages.length > this.config.maxContextMessages) {
            context.recentMessages = context.recentMessages.slice(-this.config.maxContextMessages);
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

        context.lastActivity = Date.now();
        this.conversationContexts.set(chatId, context);
    }

    async handleGiladMessage(message) {
        this.logger.info('Message from Gilad detected', { chatId: message.chat.id });

        // Cancel any active response timer
        await this.cancelResponseTimer(message.chat.id);

        // Start cooldown period
        await this.startCooldown(message.chat.id);

        return { action: 'gilad_response', chatId: message.chat.id, cooldownStarted: true };
    }

    async startResponseTimer(message) {
        const chatId = message.chat.id;
        this.systemMetrics.timersCreated++;

        // Cancel any existing timer
        await this.cancelResponseTimer(chatId);

        this.logger.info('Starting response timer', { chatId, delayMs: this.config.responseDelayMs });

        // Store timer in database
        const timerId = await this.storage.startTimer(chatId, 'response', this.config.responseDelayMs);

        // Start in-memory timer
        const timer = setTimeout(async () => {
            try {
                await this.activateSecretaryMode(chatId);
            } catch (error) {
                this.logger.error('Error in response timer callback', { error: error.message, chatId });
            }
        }, this.config.responseDelayMs);

        this.activeTimers.set(chatId, { timer, timerId, type: 'response' });

        return { action: 'timer_started', chatId, delayMs: this.config.responseDelayMs, timerId };
    }

    async cancelResponseTimer(chatId) {
        const activeTimer = this.activeTimers.get(chatId);
        if (activeTimer && activeTimer.type === 'response') {
            clearTimeout(activeTimer.timer);
            await this.storage.endTimer(activeTimer.timerId);
            this.activeTimers.delete(chatId);
            this.logger.info('Response timer cancelled', { chatId });
            return true;
        }
        return false;
    }

    async activateSecretaryMode(chatId) {
        this.logger.info('Activating secretary mode', { chatId });
        this.systemMetrics.responsesGenerated++;

        // Remove timer from active timers
        this.activeTimers.delete(chatId);

        // Get conversation context
        const context = this.conversationContexts.get(chatId);
        if (!context) {
            throw new Error(`No conversation context found for chat ${chatId}`);
        }

        // Generate AI response
        const prompt = this.buildSecretaryPrompt(context);
        const aiResponse = await this.ai.generateResponse(prompt, context, undefined, 500);

        // Process and filter response
        const processedResponse = this.processSecretaryResponse(aiResponse, context);

        // Send response via WhatsApp
        const messageId = await this.whatsapp.sendMessage(chatId, processedResponse.content);

        // Store the sent message
        const responseMessage = {
            id: messageId,
            body: processedResponse.content,
            from: 'assistant',
            to: chatId,
            timestamp: Math.floor(Date.now() / 1000),
            chat: { id: chatId },
            isGroupMsg: context.participantCount > 2
        };
        await this.storage.storeMessage(responseMessage, true);

        // Start cooldown
        await this.startCooldown(chatId);

        return {
            action: 'secretary_response_sent',
            chatId,
            messageId,
            response: processedResponse.content,
            aiModel: aiResponse.model,
            tokensUsed: aiResponse.tokens_used
        };
    }

    buildSecretaryPrompt(context) {
        const { recentMessages, participantCount } = context;

        let prompt = 'You are Gilad\'s professional assistant responding to ';
        prompt += participantCount > 2 ? 'a group conversation' : 'a private message';
        prompt += '. Recent conversation:\n\n';

        // Add recent messages
        recentMessages.slice(-3).forEach(message => {
            const sender = message.from.split('@')[0] || 'User';
            prompt += `${sender}: ${message.body}\n`;
        });

        prompt += '\nPlease provide a professional, helpful response as Gilad\'s assistant.';
        return prompt;
    }

    processSecretaryResponse(aiResponse, context) {
        let content = aiResponse.content;

        // Add professional closing for business-like messages
        const lastMessage = context.recentMessages[context.recentMessages.length - 1];
        if (lastMessage && this.isBusinessMessage(lastMessage.body)) {
            if (content.length < 200 && Math.random() > 0.5) {
                content += '\n\nBest regards,\nGilad\'s Assistant';
            }
        }

        return {
            ...aiResponse,
            content: content.trim()
        };
    }

    isBusinessMessage(messageBody) {
        const businessKeywords = ['meeting', 'project', 'work', 'business', 'client', 'proposal'];
        const body = messageBody.toLowerCase();
        return businessKeywords.some(keyword => body.includes(keyword));
    }

    async startCooldown(chatId) {
        this.systemMetrics.cooldownsActivated++;
        this.logger.info('Starting cooldown', { chatId, durationMs: this.config.cooldownPeriodMs });

        const cooldownId = await this.storage.startCooldown(chatId, this.config.cooldownPeriodMs);

        // Set timer to clean up cooldown
        setTimeout(async () => {
            this.logger.info('Cooldown ended', { chatId });
        }, this.config.cooldownPeriodMs);

        return cooldownId;
    }

    getSystemMetrics() {
        return {
            ...this.systemMetrics,
            activeTimers: this.activeTimers.size,
            activeConversations: this.conversationContexts.size,
            aiRequestCount: this.ai.getRequestCount(),
            sentMessages: this.whatsapp.getSentMessages().length
        };
    }

    async getHealthStatus() {
        const storageHealth = await this.storage.healthCheck();
        const aiHealth = await this.ai.isHealthy();
        const whatsappHealth = this.whatsapp.isReady();

        return {
            isHealthy: storageHealth.isHealthy && aiHealth && whatsappHealth,
            services: {
                storage: storageHealth,
                ai: { isHealthy: aiHealth, requestCount: this.ai.getRequestCount() },
                whatsapp: { isHealthy: whatsappHealth, sentMessages: this.whatsapp.getSentMessages().length }
            },
            metrics: this.getSystemMetrics()
        };
    }

    // Cleanup method for tests
    async cleanup() {
        // Clear all active timers
        for (const [chatId, activeTimer] of this.activeTimers.entries()) {
            clearTimeout(activeTimer.timer);
            await this.storage.endTimer(activeTimer.timerId);
        }
        this.activeTimers.clear();

        // Clear contexts
        this.conversationContexts.clear();

        // Reset metrics
        this.systemMetrics = {
            messagesProcessed: 0,
            responsesGenerated: 0,
            timersCreated: 0,
            cooldownsActivated: 0,
            errors: 0
        };

        // Reset mock services
        this.ai.resetRequestCount();
        this.whatsapp.clearSentMessages();
        this.logger.clear();
    }
}

/**
 * Integration Test Suite
 */
async function runIntegrationTests() {
    const runner = new TestRunner('🔄 Integration Flow Tests');

    // Create assertion helpers
    const assert = {
        ok: (condition, message) => TestAssertions.assertTrue(condition, message),
        equal: (actual, expected, message) => TestAssertions.assertEqual(actual, expected, message),
        notEqual: (actual, expected, message) => TestAssertions.assertTrue(actual !== expected, message || `Expected ${actual} to not equal ${expected}`),
        greaterThan: (actual, expected, message) => TestAssertions.assertTrue(actual > expected, message || `Expected ${actual} to be greater than ${expected}`),
        isNull: (value, message) => TestAssertions.assertTrue(value === null, message || `Expected ${value} to be null`),
        isNotNull: (value, message) => TestAssertions.assertTrue(value !== null, message || `Expected ${value} to not be null`),
        contains: (container, item, message) => TestAssertions.assertContains(container, item, message)
    };

    let system;

    // Setup before each test
    runner.beforeEach(async () => {
        system = new MessageProcessingSystem();
    });

    // Cleanup after each test
    runner.afterEach(async () => {
        if (system) {
            await system.cleanup();
        }
    });

    // Test 1: Basic Message Processing Flow
    runner.test('should process incoming message and start response timer', async () => {
        const message = {
            ...mockData.sampleMessage,
            timestamp: Math.floor(Date.now() / 1000)
        };

        const result = await system.processIncomingMessage(message);

        assert.equal(result.action, 'timer_started', 'Should start response timer');
        assert.equal(result.chatId, message.chat.id, 'Should return correct chat ID');
        assert.ok(result.timerId, 'Should return timer ID');

        const metrics = system.getSystemMetrics();
        assert.equal(metrics.messagesProcessed, 1, 'Should track processed messages');
        assert.equal(metrics.timersCreated, 1, 'Should track created timers');
    });

    // Test 2: Secretary Mode Activation
    runner.test('should activate secretary mode after response timer expires', async () => {
        const message = {
            ...mockData.sampleMessage,
            body: 'Hello, I need help with a project',
            timestamp: Math.floor(Date.now() / 1000)
        };

        // Process message to start timer
        await system.processIncomingMessage(message);

        // Wait for timer to expire (using short delay for testing)
        await new Promise(resolve => setTimeout(resolve, system.config.responseDelayMs + 100));

        const metrics = system.getSystemMetrics();
        assert.equal(metrics.responsesGenerated, 1, 'Should generate response');
        assert.equal(metrics.cooldownsActivated, 1, 'Should activate cooldown');

        const sentMessages = system.whatsapp.getSentMessages();
        assert.equal(sentMessages.length, 1, 'Should send one message');
        assert.equal(sentMessages[0].chatId, message.chat.id, 'Should send to correct chat');
        assert.ok(sentMessages[0].message.length > 0, 'Should send non-empty message');
    });

    // Test 3: Gilad Response Handling
    runner.test('should handle Gilad response and start cooldown', async () => {
        const message = {
            ...mockData.sampleMessage,
            from: 'gilad@example.com',
            body: 'Thanks for the message!',
            timestamp: Math.floor(Date.now() / 1000)
        };

        const result = await system.processIncomingMessage(message);

        assert.equal(result.action, 'gilad_response', 'Should recognize Gilad response');
        assert.ok(result.cooldownStarted, 'Should start cooldown');

        const metrics = system.getSystemMetrics();
        assert.equal(metrics.cooldownsActivated, 1, 'Should activate cooldown');

        // Check that chat is in cooldown
        const isInCooldown = await system.storage.isInCooldown(message.chat.id);
        assert.ok(isInCooldown, 'Chat should be in cooldown');
    });

    // Test 4: Cooldown Prevention
    runner.test('should ignore messages during cooldown period', async () => {
        const chatId = 'cooldown-test-chat';

        // Start cooldown
        await system.startCooldown(chatId);

        const message = {
            ...mockData.sampleMessage,
            chat: { id: chatId, name: 'Cooldown Test' },
            timestamp: Math.floor(Date.now() / 1000)
        };

        const result = await system.processIncomingMessage(message);

        assert.equal(result.action, 'ignored_cooldown', 'Should ignore message during cooldown');

        const metrics = system.getSystemMetrics();
        assert.equal(metrics.timersCreated, 0, 'Should not create timer during cooldown');

        const sentMessages = system.whatsapp.getSentMessages();
        assert.equal(sentMessages.length, 0, 'Should not send any messages during cooldown');
    });

    // Test 5: Group Message Handling
    runner.test('should handle group messages correctly', async () => {
        const groupMessage = {
            ...mockData.sampleMessage,
            chat: { id: 'group-chat@g.us', name: 'Project Team' },
            isGroupMsg: true,
            author: 'user1@example.com',
            body: 'Can we schedule a team meeting?',
            timestamp: Math.floor(Date.now() / 1000)
        };

        await system.processIncomingMessage(groupMessage);

        // Wait for secretary response
        await new Promise(resolve => setTimeout(resolve, system.config.responseDelayMs + 100));

        const sentMessages = system.whatsapp.getSentMessages();
        assert.equal(sentMessages.length, 1, 'Should send response to group');

        const context = system.conversationContexts.get(groupMessage.chat.id);
        assert.ok(context.participantCount >= 2, 'Should track group participants');
    });

    // Test 6: Business Message Processing
    runner.test('should handle business messages with appropriate responses', async () => {
        const businessMessage = {
            ...mockData.sampleMessage,
            body: 'I need to schedule a business meeting with you next week',
            timestamp: Math.floor(Date.now() / 1000)
        };

        await system.processIncomingMessage(businessMessage);

        // Wait for secretary response
        await new Promise(resolve => setTimeout(resolve, system.config.responseDelayMs + 100));

        const sentMessages = system.whatsapp.getSentMessages();
        assert.equal(sentMessages.length, 1, 'Should send business response');

        const responseContent = sentMessages[0].message.toLowerCase();
        assert.ok(
            responseContent.includes('business') || responseContent.includes('professional') || responseContent.includes('gilad'),
            'Should include business-appropriate language'
        );
    });

    // Test 7: Concurrent Message Handling
    runner.test('should handle multiple concurrent messages correctly', async () => {
        const messages = [
            { ...mockData.sampleMessage, chat: { id: 'chat1@c.us' }, body: 'Message 1', timestamp: Math.floor(Date.now() / 1000) },
            { ...mockData.sampleMessage, chat: { id: 'chat2@c.us' }, body: 'Message 2', timestamp: Math.floor(Date.now() / 1000) },
            { ...mockData.sampleMessage, chat: { id: 'chat3@c.us' }, body: 'Message 3', timestamp: Math.floor(Date.now() / 1000) }
        ];

        // Process messages concurrently
        const results = await Promise.all(
            messages.map(msg => system.processIncomingMessage(msg))
        );

        assert.equal(results.length, 3, 'Should process all messages');
        results.forEach(result => {
            assert.equal(result.action, 'timer_started', 'Each message should start a timer');
        });

        const metrics = system.getSystemMetrics();
        assert.equal(metrics.messagesProcessed, 3, 'Should track all processed messages');
        assert.equal(metrics.timersCreated, 3, 'Should create timer for each chat');

        // Wait for all timers to expire
        await new Promise(resolve => setTimeout(resolve, system.config.responseDelayMs + 200));

        const sentMessages = system.whatsapp.getSentMessages();
        assert.equal(sentMessages.length, 3, 'Should send response to all chats');

        // Check that all chats are in cooldown
        for (const message of messages) {
            const isInCooldown = await system.storage.isInCooldown(message.chat.id);
            assert.ok(isInCooldown, `Chat ${message.chat.id} should be in cooldown`);
        }
    });

    // Test 8: Error Handling in Integration Flow
    runner.test('should handle AI service failures gracefully', async () => {
        const message = {
            ...mockData.sampleMessage,
            body: 'Test message for AI failure',
            timestamp: Math.floor(Date.now() / 1000)
        };

        // Simulate AI service failure
        system.ai.setHealthy(false);

        await system.processIncomingMessage(message);

        // Wait for secretary mode activation attempt
        await new Promise(resolve => setTimeout(resolve, system.config.responseDelayMs + 100));

        const metrics = system.getSystemMetrics();
        assert.greaterThan(metrics.errors, 0, 'Should track errors');

        const sentMessages = system.whatsapp.getSentMessages();
        assert.equal(sentMessages.length, 0, 'Should not send message when AI fails');
    });

    // Test 9: WhatsApp Connection Failure
    runner.test('should handle WhatsApp connection failures', async () => {
        const message = {
            ...mockData.sampleMessage,
            body: 'Test message for WhatsApp failure',
            timestamp: Math.floor(Date.now() / 1000)
        };

        await system.processIncomingMessage(message);

        // Simulate WhatsApp disconnection before response
        system.whatsapp.setConnected(false);

        // Wait for secretary mode activation attempt
        await new Promise(resolve => setTimeout(resolve, system.config.responseDelayMs + 100));

        const metrics = system.getSystemMetrics();
        assert.greaterThan(metrics.errors, 0, 'Should track WhatsApp errors');

        const sentMessages = system.whatsapp.getSentMessages();
        assert.equal(sentMessages.length, 0, 'Should not send message when WhatsApp is disconnected');
    });

    // Test 10: Conversation Context Management
    runner.test('should maintain conversation context across multiple messages', async () => {
        const chatId = 'context-test-chat';
        const messages = [
            { ...mockData.sampleMessage, chat: { id: chatId }, body: 'First message', timestamp: Math.floor(Date.now() / 1000) },
            { ...mockData.sampleMessage, chat: { id: chatId }, body: 'Second message', timestamp: Math.floor(Date.now() / 1000) + 1 },
            { ...mockData.sampleMessage, chat: { id: chatId }, body: 'Third message', timestamp: Math.floor(Date.now() / 1000) + 2 }
        ];

        // Process messages sequentially
        for (const message of messages) {
            await system.processIncomingMessage(message);
            // Cancel timer to avoid secretary responses interfering
            await system.cancelResponseTimer(chatId);
        }

        const context = system.conversationContexts.get(chatId);
        assert.ok(context, 'Should maintain conversation context');
        assert.equal(context.recentMessages.length, 3, 'Should store all recent messages');
        assert.equal(context.chatId, chatId, 'Should have correct chat ID');
        assert.ok(context.isActive, 'Should be active');

        const storedMessages = await system.storage.getRecentMessages(chatId, 10);
        assert.equal(storedMessages.length, 3, 'Should persist all messages in storage');
    });

    // Test 11: System Health Monitoring
    runner.test('should provide comprehensive health status', async () => {
        // Process some messages to generate activity
        const message = {
            ...mockData.sampleMessage,
            body: 'Health check test message',
            timestamp: Math.floor(Date.now() / 1000)
        };

        await system.processIncomingMessage(message);

        const healthStatus = await system.getHealthStatus();

        assert.ok(healthStatus.isHealthy, 'System should be healthy');
        assert.ok(healthStatus.services.storage.isHealthy, 'Storage should be healthy');
        assert.ok(healthStatus.services.ai.isHealthy, 'AI service should be healthy');
        assert.ok(healthStatus.services.whatsapp.isHealthy, 'WhatsApp should be healthy');

        assert.ok(healthStatus.metrics, 'Should provide metrics');
        assert.greaterThan(healthStatus.metrics.messagesProcessed, 0, 'Should track message processing');
    });

    // Test 12: Timer Cancellation and Management
    runner.test('should properly cancel and manage response timers', async () => {
        const chatId = 'timer-test-chat';
        const message = {
            ...mockData.sampleMessage,
            chat: { id: chatId },
            body: 'Timer cancellation test',
            timestamp: Math.floor(Date.now() / 1000)
        };

        // Start first timer
        const result1 = await system.processIncomingMessage(message);
        assert.equal(result1.action, 'timer_started', 'Should start first timer');

        // Start second timer (should cancel first)
        const message2 = {
            ...message,
            body: 'Second message to cancel first timer',
            timestamp: Math.floor(Date.now() / 1000) + 1
        };

        const result2 = await system.processIncomingMessage(message2);
        assert.equal(result2.action, 'timer_started', 'Should start second timer');

        const metrics = system.getSystemMetrics();
        assert.equal(metrics.timersCreated, 2, 'Should have created 2 timers total');
        assert.equal(metrics.activeTimers, 1, 'Should have 1 active timer');

        // Cancel the active timer
        const cancelled = await system.cancelResponseTimer(chatId);
        assert.ok(cancelled, 'Should successfully cancel timer');

        const finalMetrics = system.getSystemMetrics();
        assert.equal(finalMetrics.activeTimers, 0, 'Should have 0 active timers after cancellation');
    });

    return runner.run();
}

// Export for use in test runner
module.exports = runIntegrationTests;

// Run tests if this file is executed directly
if (require.main === module) {
    runIntegrationTests()
        .then(report => {
            console.log('\n🎉 Integration Testing Complete!');
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
            console.error('Integration tests failed to run:', error);
            process.exit(1);
        });
}