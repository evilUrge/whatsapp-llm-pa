import { ConversationContext, WhatsAppMessage, StorageData } from '../types';
import { StorageService } from './StorageService';
import { config } from '../config/environment';

/**
 * Manages conversation contexts and message history
 */
export class ConversationManager {
    private storageService: StorageService;
    private conversations: Map<string, ConversationContext> = new Map();

    constructor(storageService: StorageService) {
        this.storageService = storageService;
        this.loadConversations();
    }

    /**
     * Add a message to the conversation context
     */
    public async addMessage(message: WhatsAppMessage): Promise<void> {
        const chatId = message.chat.id;
        let context = this.conversations.get(chatId);

        if (!context) {
            context = {
                chatId,
                participantCount: message.isGroupMsg ? 2 : 2, // Will be updated as we see more participants
                recentMessages: [],
                isActive: true
            };
            this.conversations.set(chatId, context);
        }

        // Add message to recent messages
        context.recentMessages.push(message);

        // Keep only the most recent messages
        if (context.recentMessages.length > config.app.maxContextMessages * 2) {
            context.recentMessages = context.recentMessages.slice(-config.app.maxContextMessages);
        }

        // Update participant count for group messages
        if (message.isGroupMsg && message.author) {
            const uniqueParticipants = new Set(
                context.recentMessages
                    .filter(msg => msg.isGroupMsg && msg.author)
                    .map(msg => msg.author!)
            );
            context.participantCount = uniqueParticipants.size;
        }

        // Mark conversation as active
        context.isActive = true;

        // Persist to storage
        await this.saveConversations();

        console.log(`Added message to conversation ${chatId}. Total messages: ${context.recentMessages.length}`);
    }

    /**
     * Get conversation context for a chat
     */
    public async getConversationContext(chatId: string): Promise<ConversationContext | null> {
        return this.conversations.get(chatId) || null;
    }

    /**
     * Update last response time for a conversation
     */
    public async updateLastResponseTime(chatId: string, timestamp: number): Promise<void> {
        const context = this.conversations.get(chatId);
        if (context) {
            context.lastResponseTime = timestamp;
            await this.saveConversations();
        }
    }

    /**
     * Mark conversation as inactive
     */
    public async deactivateConversation(chatId: string): Promise<void> {
        const context = this.conversations.get(chatId);
        if (context) {
            context.isActive = false;
            await this.saveConversations();
        }
    }

    /**
     * Get all active conversations
     */
    public getActiveConversations(): ConversationContext[] {
        return Array.from(this.conversations.values()).filter(context => context.isActive);
    }

    /**
     * Clean up old conversations
     */
    public async cleanupOldConversations(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
        const now = Date.now();
        const conversationsToRemove: string[] = [];

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
            console.log(`Cleaned up old conversation: ${chatId}`);
        });

        if (conversationsToRemove.length > 0) {
            await this.saveConversations();
        }
    }

    /**
     * Get conversation statistics
     */
    public getConversationStats(): {
        totalConversations: number;
        activeConversations: number;
        totalMessages: number;
    } {
        const totalConversations = this.conversations.size;
        const activeConversations = this.getActiveConversations().length;
        const totalMessages = Array.from(this.conversations.values())
            .reduce((sum, context) => sum + context.recentMessages.length, 0);

        return {
            totalConversations,
            activeConversations,
            totalMessages
        };
    }

    /**
     * Load conversations from storage
     */
    private async loadConversations(): Promise<void> {
        try {
            const data = await this.storageService.loadData();
            if (data.conversations) {
                Object.entries(data.conversations).forEach(([chatId, context]) => {
                    this.conversations.set(chatId, context);
                });
                console.log(`Loaded ${this.conversations.size} conversations from storage`);
            }
        } catch (error) {
            console.error('Error loading conversations:', error);
        }
    }

    /**
     * Save conversations to storage
     */
    private async saveConversations(): Promise<void> {
        try {
            const conversationsObject: Record<string, ConversationContext> = {};
            this.conversations.forEach((context, chatId) => {
                conversationsObject[chatId] = context;
            });

            await this.storageService.saveData({
                conversations: conversationsObject,
                timers: {},
                settings: config.app
            });
        } catch (error) {
            console.error('Error saving conversations:', error);
        }
    }
}