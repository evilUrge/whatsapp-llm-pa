import { WhatsAppMessage, MessageType, ResponseStatus, MessageAnalysis, ConversationContext } from '../types';
import { ConversationManager } from '../services/ConversationManager';
import { ResponseGenerator } from '../ai/ResponseGenerator';
import { TimerService } from '../services/TimerService';
import { StorageService } from '../services/StorageService';
import { config } from '../config/environment';

/**
 * Enhanced message handler that processes WhatsApp messages and implements secretary logic
 */
export class MessageHandler {
    private conversationManager: ConversationManager;
    private responseGenerator: ResponseGenerator;
    private timerService: TimerService;
    private storageService: StorageService;
    private secretaryMode: boolean;
    private giladWhatsAppId: string;
    private lastProcessedMessageId: string = '';
    private whatsappClient?: any; // Reference to WhatsAppClient for sending messages

    // Gilad identification patterns (these should be configured)
    private giladIdentifiers = [
        // These should be set from environment or config
        process.env.GILAD_WHATSAPP_NUMBER || '',
        process.env.GILAD_PHONE_NUMBER || '',
        // Add more identification patterns as needed
    ].filter(id => id.length > 0);

    constructor(
        conversationManager: ConversationManager,
        responseGenerator: ResponseGenerator,
        timerService: TimerService,
        storageService: StorageService
    ) {
        this.conversationManager = conversationManager;
        this.responseGenerator = responseGenerator;
        this.timerService = timerService;
        this.storageService = storageService;
        this.secretaryMode = config.app.secretaryMode || true;
        this.giladWhatsAppId = process.env.GILAD_WHATSAPP_ID || '';

        this.setupTimerServiceEvents();
        console.log(`MessageHandler initialized - Secretary mode: ${this.secretaryMode ? 'ON' : 'OFF'}`);
    }

    /**
     * Set up event listeners for TimerService
     */
    private setupTimerServiceEvents(): void {
        // Listen for response timer expiration
        this.timerService.on(TimerService.EVENTS.RESPONSE_TIMER_EXPIRED, async (data: { chatId: string }) => {
            console.log(`⏰ Response timer expired for chat ${data.chatId} - activating secretary mode`);
            await this.activateSecretaryMode(data.chatId);
        });

        // Listen for cooldown events
        this.timerService.on(TimerService.EVENTS.COOLDOWN_STARTED, (data: { chatId: string; duration: number }) => {
            console.log(`❄️ Cooldown started for chat ${data.chatId} (${data.duration}ms)`);
        });

        this.timerService.on(TimerService.EVENTS.COOLDOWN_ENDED, (data: { chatId: string }) => {
            console.log(`🔥 Cooldown ended for chat ${data.chatId}`);
        });

        // Listen for Gilad response events
        this.timerService.on(TimerService.EVENTS.GILAD_RESPONDED, (data: { chatId: string }) => {
            console.log(`👤 Gilad responded in chat ${data.chatId}`);
        });
    }

    /**
     * Handle incoming WhatsApp message with enhanced secretary logic
     */
    public async handleMessage(rawMessage: any): Promise<void> {
        try {
            const message = this.parseMessage(rawMessage);

            // Skip messages from self (bot messages)
            if (rawMessage.fromMe) {
                return;
            }

            // Avoid processing the same message twice
            if (message.id === this.lastProcessedMessageId) {
                return;
            }
            this.lastProcessedMessageId = message.id;

            // Skip messages we should ignore
            if (this.shouldIgnoreMessage(message)) {
                console.log(`🚫 Ignoring message from ${message.from}: ${message.body?.substring(0, 50)}...`);
                return;
            }

            console.log(`📩 Processing message from ${message.from}: ${message.body?.substring(0, 100)}...`);

            // Store message in database
            const isFromGilad = this.isFromGilad(message);
            await this.storageService.storeMessage(message, isFromGilad);

            // Update conversation context
            await this.conversationManager.addMessage(message);

            // Core secretary logic: Handle Gilad's responses
            if (isFromGilad) {
                console.log(`👤 Message from Gilad detected in chat ${message.chat.id}`);
                this.timerService.handleGiladResponse(message.chat.id);
                return; // Don't process Gilad's messages further
            }

            // Check if this is a new conversation thread that needs secretary intervention
            if (await this.isNewConversationThread(message)) {
                console.log(`🆕 New conversation thread detected in chat ${message.chat.id}`);

                // Start 2-minute response timer
                this.timerService.startResponseTimer(message.chat.id, async () => {
                    // This callback executes when Gilad doesn't respond within 2 minutes
                    await this.activateSecretaryMode(message.chat.id);
                });
            } else {
                // For ongoing conversations, check if we should respond based on other criteria
                if (await this.shouldRespondToOngoingConversation(message)) {
                    await this.scheduleResponse(message);
                }
            }

        } catch (error) {
            console.error('❌ Error in handleMessage:', error);
        }
    }

    /**
     * Determine if this is a new conversation thread requiring secretary intervention
     */
    public async isNewConversationThread(message: WhatsAppMessage): Promise<boolean> {
        // This is a simplified implementation - in practice, you might want more sophisticated logic

        try {
            // Get conversation context
            const context = await this.conversationManager.getConversationContext(message.chat.id);

            // No previous conversation context
            if (!context) {
                return true;
            }

            // No recent messages in context
            if (!context.recentMessages || context.recentMessages.length === 0) {
                return true;
            }

            // Last message was more than 2 hours ago (indicating conversation restart)
            const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
            const lastMessage = context.recentMessages[context.recentMessages.length - 1];
            return lastMessage.timestamp < twoHoursAgo;
        } catch (error) {
            console.error('Error checking conversation thread:', error);
            // Default to treating as new thread if we can't determine
            return true;
        }
    }

    /**
     * Check if a message is from Gilad
     */
    public isFromGilad(message: WhatsAppMessage): boolean {
        const sender = message.author || message.from;

        // Check against known Gilad identifiers
        if (this.giladIdentifiers.length > 0) {
            return this.giladIdentifiers.some(id =>
                sender.includes(id) || id.includes(sender.replace(/@.*$/, ''))
            );
        }

        // Fallback: check against configured WhatsApp ID
        if (this.giladWhatsAppId) {
            return sender.includes(this.giladWhatsAppId) ||
                   this.giladWhatsAppId.includes(sender.replace(/@.*$/, ''));
        }

        // Additional checks could include:
        // - Contact name matching
        // - Phone number matching
        // - Stored contact identification

        return false;
    }

    /**
     * Activate secretary mode for a conversation
     */
    public async activateSecretaryMode(chatId: string): Promise<void> {
        try {
            console.log(`🤖 Activating secretary mode for chat ${chatId}`);

            const context = await this.conversationManager.getConversationContext(chatId);
            if (!context) {
                console.error(`No conversation context found for chat ${chatId}`);
                return;
            }

            // Generate and send secretary response
            const response = await this.generateResponse(context);

            // Send the response via WhatsApp if client is connected
            const messageSent = await this.sendWhatsAppMessage(chatId, response.content);
            if (messageSent) {
                console.log(`✅ Secretary response sent to ${chatId}: ${response.content.substring(0, 100)}...`);
            } else {
                console.error(`❌ Failed to send secretary response to ${chatId}`);
                // Still log the response for debugging
                console.log(`🤖 Generated secretary response (not sent): ${response.content}`);
            }

            // Create a bot message for the response
            const botMessage: WhatsAppMessage = {
                id: `bot_${Date.now()}_${chatId}`,
                body: response.content,
                from: 'secretary_bot',
                to: chatId,
                timestamp: Date.now(),
                isGroupMsg: context.recentMessages[0]?.isGroupMsg || false,
                chat: { id: chatId, name: context.recentMessages[0]?.chat.name || 'Unknown' },
                author: 'secretary_bot'
            };

            // Store the bot response
            await this.conversationManager.addMessage(botMessage);
            await this.conversationManager.updateLastResponseTime(chatId, Date.now());

            // Start cooldown period after responding
            this.timerService.startCooldown(chatId);

        } catch (error) {
            console.error(`❌ Error activating secretary mode for chat ${chatId}:`, error);
        }
    }

    /**
     * Generate an appropriate response for the conversation context
     */
    public async generateResponse(context: ConversationContext): Promise<{ content: string; confidence: number; tokens_used: number; model: string }> {
        try {
            if (this.secretaryMode) {
                return await this.responseGenerator.generateSecretaryResponse(context);
            } else {
                return await this.responseGenerator.generateResponse(context);
            }
        } catch (error) {
            console.error('Error generating response:', error);

            // Return fallback response
            return {
                content: "Thank you for your message. I'll make sure Gilad receives this and gets back to you as soon as possible.",
                confidence: 0.1,
                tokens_used: 0,
                model: 'fallback'
            };
        }
    }

    /**
     * Check if we should ignore this message
     */
    public shouldIgnoreMessage(message: WhatsAppMessage): boolean {
        // Skip empty messages
        if (!message.body || message.body.trim() === '') {
            return true;
        }

        // Skip system messages or notifications
        if (message.body.startsWith('~') || message.body.includes('Messages and calls are end-to-end encrypted')) {
            return true;
        }

        // Skip very short messages that might be reactions or acknowledgments
        if (message.body.length < 2) {
            return true;
        }

        // Skip messages that are just emojis (basic check)
        const emojiPattern = /^[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]+$/u;
        if (emojiPattern.test(message.body.trim())) {
            return true;
        }

        return false;
    }

    /**
     * Check if we should respond to an ongoing conversation
     */
    private async shouldRespondToOngoingConversation(message: WhatsAppMessage): Promise<boolean> {
        // Don't respond if in cooldown
        if (this.timerService.isInCooldown(message.chat.id)) {
            console.log(`Chat ${message.chat.id} is in cooldown, skipping response`);
            return false;
        }

        // Only respond if secretary mode is enabled
        if (!this.secretaryMode) {
            return false;
        }

        // Analyze message for urgency or business importance
        const analysis = this.analyzeMessage(message);

        // Respond to high-urgency messages even in ongoing conversations
        if (analysis.urgency === 'high') {
            console.log('High urgency message in ongoing conversation, will respond');
            return true;
        }

        // Respond to business-related messages
        if (analysis.category === 'business' && analysis.requiresResponse) {
            console.log('Business message requiring response in ongoing conversation');
            return true;
        }

        return false;
    }

    /**
     * Parse raw WhatsApp message into our format
     */
    private parseMessage(rawMessage: any): WhatsAppMessage {
        return {
            id: rawMessage.id._serialized || rawMessage.id,
            body: rawMessage.body || '',
            from: rawMessage.from,
            to: rawMessage.to,
            timestamp: rawMessage.timestamp * 1000, // Convert to milliseconds
            isGroupMsg: rawMessage.isGroupMsg || false,
            chat: {
                id: rawMessage.from,
                name: rawMessage.chat?.name || 'Unknown'
            },
            author: rawMessage.author || rawMessage.from
        };
    }

    /**
     * Check if message is a media message
     */
    private isMediaMessage(rawMessage: any): boolean {
        return rawMessage.hasMedia ||
               rawMessage.type === 'image' ||
               rawMessage.type === 'audio' ||
               rawMessage.type === 'video' ||
               rawMessage.type === 'document' ||
               rawMessage.type === 'sticker';
    }

    /**
     * Determine if we should respond to this message
     */
    private async shouldRespond(message: WhatsAppMessage): Promise<boolean> {
        // Don't respond if in cooldown
        if (this.timerService.isInCooldown(message.chat.id)) {
            console.log(`Chat ${message.chat.id} is in cooldown, skipping response`);
            return false;
        }

        // Check if conversation is active enough
        const context = await this.conversationManager.getConversationContext(message.chat.id);
        if (!context || context.recentMessages.length < 2) {
            console.log('Not enough conversation context for response');
            return false;
        }

        // Enhanced logic for secretary mode
        if (this.secretaryMode) {
            const analysis = this.analyzeMessage(message);

            // Always respond to high urgency messages
            if (analysis.urgency === 'high') {
                console.log('High urgency message detected, will respond');
                return true;
            }

            // Respond to business-related messages
            if (analysis.category === 'business') {
                console.log('Business message detected, will respond');
                return true;
            }

            // Respond to messages that require a response
            if (analysis.requiresResponse) {
                console.log('Message requires response based on analysis');
                return true;
            }
        }

        // Basic fallback logic
        return context.recentMessages.length >= 3; // Respond after some conversation
    }

    /**
     * Analyze message content for better response decisions
     */
    private analyzeMessage(message: WhatsAppMessage): MessageAnalysis {
        const body = message.body.toLowerCase();

        // Determine urgency
        const urgentKeywords = ['urgent', 'asap', 'emergency', 'immediately', 'critical', 'deadline'];
        const urgency = urgentKeywords.some(keyword => body.includes(keyword)) ? 'high' : 'medium';

        // Determine category
        const businessKeywords = ['meeting', 'project', 'work', 'business', 'client', 'proposal', 'contract'];
        const personalKeywords = ['how are you', 'family', 'friend', 'weekend', 'vacation'];

        let category: MessageAnalysis['category'] = 'other';
        if (businessKeywords.some(keyword => body.includes(keyword))) {
            category = 'business';
        } else if (personalKeywords.some(keyword => body.includes(keyword))) {
            category = 'personal';
        }

        // Determine if response is required
        const requiresResponse = body.includes('?') ||
                               body.includes('please') ||
                               body.includes('can you') ||
                               body.includes('could you') ||
                               urgency === 'high';

        // Basic sentiment analysis
        const positiveWords = ['good', 'great', 'excellent', 'happy', 'thanks', 'thank you'];
        const negativeWords = ['bad', 'terrible', 'problem', 'issue', 'angry', 'frustrated'];

        let sentiment: MessageAnalysis['sentiment'] = 'neutral';
        if (positiveWords.some(word => body.includes(word))) {
            sentiment = 'positive';
        } else if (negativeWords.some(word => body.includes(word))) {
            sentiment = 'negative';
        }

        return {
            sentiment,
            urgency,
            category,
            keyTopics: [], // Could be enhanced with NLP
            requiresResponse,
            confidence: 0.7 // Basic confidence score
        };
    }

    /**
     * Schedule a response after the configured delay
     */
    private async scheduleResponse(message: WhatsAppMessage): Promise<void> {
        console.log(`Scheduling response for chat ${message.chat.id}`);

        this.timerService.scheduleResponse(
            message.chat.id,
            async () => {
                await this.generateAndSendResponse(message);
            }
        );
    }

    /**
     * Generate and send AI response using secretary mode if enabled
     */
    private async generateAndSendResponse(message: WhatsAppMessage): Promise<void> {
        try {
            console.log(`Generating response for chat ${message.chat.id}`);

            const context = await this.conversationManager.getConversationContext(message.chat.id);
            if (!context) {
                console.error('No conversation context found');
                return;
            }

            // Use secretary response generation if enabled
            const response = this.secretaryMode
                ? await this.responseGenerator.generateSecretaryResponse(context)
                : await this.responseGenerator.generateResponse(context);

            // Here we would send the message back through the WhatsApp client
            // For now, just log it
            console.log(`Generated response (${response.model}): ${response.content}`);
            console.log(`Response confidence: ${response.confidence}, Tokens used: ${response.tokens_used}`);

            // Start cooldown period
            this.timerService.startCooldown(message.chat.id);

            // Update conversation with bot response
            const botMessage: WhatsAppMessage = {
                id: `bot_${Date.now()}`,
                body: response.content,
                from: 'bot',
                to: message.chat.id,
                timestamp: Date.now(),
                isGroupMsg: message.isGroupMsg,
                chat: message.chat,
                author: 'bot'
            };

            await this.conversationManager.addMessage(botMessage);
            await this.conversationManager.updateLastResponseTime(message.chat.id, Date.now());

        } catch (error) {
            console.error('Error generating response:', error);

            // Send fallback response in case of error
            const fallbackMessage = this.secretaryMode
                ? "Thank you for your message. I'll make sure Gilad receives this."
                : "I apologize, but I encountered an issue. Please try again later.";

            console.log(`Fallback response: ${fallbackMessage}`);
        }
    }

    /**
     * Enable or disable secretary mode
     */
    public setSecretaryMode(enabled: boolean): void {
        this.secretaryMode = enabled;
        console.log(`Secretary mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Get current secretary mode status
     */
    public isSecretaryModeEnabled(): boolean {
        return this.secretaryMode;
    }

    /**
     * Handle specific message types (future enhancement)
     */
    public async handleSpecialMessage(message: WhatsAppMessage, messageType: MessageType): Promise<void> {
        switch (messageType) {
            case MessageType.IMAGE:
                console.log('Handling image message');
                // Could implement image analysis
                break;
            case MessageType.AUDIO:
                console.log('Handling audio message');
                // Could implement speech-to-text
                break;
            case MessageType.DOCUMENT:
                console.log('Handling document message');
                // Could implement document processing
                break;
            default:
                console.log(`Handling ${messageType} message`);
        }
    }

    /**
     * Set WhatsApp client reference for message sending
     */
    public setWhatsAppClient(client: any): void {
        this.whatsappClient = client;
        console.log('📱 WhatsApp client connected to MessageHandler');
    }

    /**
     * Send message via WhatsApp client
     */
    private async sendWhatsAppMessage(chatId: string, message: string): Promise<boolean> {
        if (!this.whatsappClient) {
            console.error('❌ WhatsApp client not connected to MessageHandler');
            return false;
        }

        try {
            await this.whatsappClient.sendMessage(chatId, message);
            return true;
        } catch (error) {
            console.error('❌ Failed to send WhatsApp message:', error);
            return false;
        }
    }

    /**
     * Get message processing statistics
     */
    public getProcessingStats(): {
        messagesProcessed: number;
        giladMessagesDetected: number;
        secretaryResponsesGenerated: number;
        conversationThreadsDetected: number;
    } {
        // This would need to be implemented with actual counters
        return {
            messagesProcessed: 0,
            giladMessagesDetected: 0,
            secretaryResponsesGenerated: 0,
            conversationThreadsDetected: 0
        };
    }

    /**
     * Update Gilad identifiers (for dynamic configuration)
     */
    public updateGiladIdentifiers(identifiers: string[]): void {
        this.giladIdentifiers = identifiers.filter(id => id.length > 0);
        console.log(`👤 Updated Gilad identifiers: ${this.giladIdentifiers.length} patterns`);
    }

    /**
     * Set Gilad WhatsApp ID directly
     */
    public setGiladWhatsAppId(whatsappId: string): void {
        this.giladWhatsAppId = whatsappId;
        console.log(`👤 Set Gilad WhatsApp ID: ${whatsappId}`);
    }
}