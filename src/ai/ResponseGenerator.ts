import { CloudflareAI } from './CloudflareAI';
import { ConversationContext, AIResponse, WhatsAppMessage } from '../types';
import { config } from '../config/environment';

/**
 * Secretary response context interface
 */
interface SecretaryContext extends ConversationContext {
    messageType?: 'business' | 'personal' | 'group' | 'unknown';
    urgencyLevel?: 'low' | 'medium' | 'high';
    senderRelation?: 'colleague' | 'friend' | 'family' | 'unknown';
}

/**
 * Response filtering result
 */
interface FilterResult {
    isAppropriate: boolean;
    reason?: string;
    suggestedResponse?: string;
}

/**
 * Generates contextual secretary-style responses using AI
 */
export class ResponseGenerator {
    private cloudflareAI: CloudflareAI;
    private conversationMemory: Map<string, Array<{role: string, content: string, timestamp: number}>> = new Map();

    constructor(cloudflareAI: CloudflareAI) {
        this.cloudflareAI = cloudflareAI;
    }

    /**
     * Generate a professional secretary-style response
     */
    public async generateSecretaryResponse(context: ConversationContext): Promise<AIResponse> {
        try {
            // Enhance context with secretary-specific information
            const secretaryContext = this.analyzeSecretaryContext(context);

            // Build a specialized prompt for secretary responses
            const prompt = this.buildSecretaryPrompt(secretaryContext);

            // Generate response using enhanced context
            const response = await this.cloudflareAI.generateResponse(
                prompt,
                secretaryContext,
                config.cloudflare.model,
                config.cloudflare.maxTokens
            );

            // Process and filter the response
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

            // Add secretary personality touches
            const finalResponse = this.addSecretaryPersonality(processedResponse, secretaryContext);

            // Store conversation context for future reference
            this.updateConversationMemory(context.chatId, prompt, finalResponse.content);

            return finalResponse;

        } catch (error) {
            console.error('Error generating secretary response:', error);

            // Return professional fallback response
            return {
                content: this.getFallbackResponse(context),
                confidence: 0.1,
                tokens_used: 0,
                model: 'fallback'
            };
        }
    }

    /**
     * Generate a standard response (legacy method for compatibility)
     */
    public async generateResponse(context: ConversationContext): Promise<AIResponse> {
        try {
            const prompt = this.buildPrompt(context);

            const response = await this.cloudflareAI.generateResponse(
                prompt,
                context,
                config.cloudflare.model,
                config.cloudflare.maxTokens
            );

            return this.postProcessResponse(response);

        } catch (error) {
            console.error('Error generating response:', error);

            return {
                content: 'I apologize, but I encountered an issue generating a response. Please try again later.',
                confidence: 0.1,
                tokens_used: 0,
                model: 'fallback'
            };
        }
    }

    /**
     * Build specialized prompt for secretary responses
     */
    public buildSecretaryPrompt(context: SecretaryContext): string {
        const { chatId, recentMessages, participantCount, messageType, urgencyLevel, senderRelation } = context;

        let prompt = `You are Gilad's professional personal assistant responding to a ${messageType || 'general'} WhatsApp message.`;

        // Add context-specific instructions
        if (messageType === 'business') {
            prompt += ` This appears to be a business-related conversation. Respond professionally and helpfully, representing Gilad's interests.`;
        } else if (messageType === 'personal') {
            prompt += ` This is a personal conversation. Be friendly but maintain appropriate professional boundaries.`;
        } else if (messageType === 'group') {
            prompt += ` This is a group chat with ${participantCount} participants. Be mindful of the group dynamic.`;
        }

        // Add urgency context
        if (urgencyLevel === 'high') {
            prompt += ` This message seems urgent - acknowledge this appropriately.`;
        }

        // Add relationship context
        if (senderRelation) {
            prompt += ` The sender appears to be a ${senderRelation}.`;
        }

        prompt += `\n\nRecent conversation context:\n`;

        // Add recent messages with better formatting
        const relevantMessages = recentMessages
            .slice(-5)
            .filter(msg => msg.from !== 'bot');

        relevantMessages.forEach(message => {
            const sender = this.getSenderName(message);
            const timeInfo = this.getTimeInfo(message.timestamp);
            prompt += `${sender}${timeInfo}: ${message.body}\n`;
        });

        prompt += `\nSecretary response guidelines:
- Be professional, helpful, and represent Gilad well
- Keep responses concise (under 150 words typically)
- Use appropriate tone for the conversation type
- Don't reveal you're an AI unless directly asked
- If asked about Gilad's availability or schedule, politely defer or ask them to contact him directly
- For business inquiries, be helpful but don't make commitments on Gilad's behalf
- Maintain conversation context and reference previous messages when relevant
- Use natural, conversational language

Please provide an appropriate response:`;

        return prompt;
    }

    /**
     * Build standard prompt (legacy method)
     */
    public buildPrompt(context: ConversationContext): string {
        const { recentMessages, participantCount } = context;

        let prompt = 'You are responding to a WhatsApp conversation. ';

        if (participantCount > 2) {
            prompt += `This is a group chat with ${participantCount} participants. `;
        } else {
            prompt += 'This is a private conversation. ';
        }

        prompt += 'Here are the recent messages:\n\n';

        // Add recent messages to context
        const relevantMessages = recentMessages
            .slice(-config.app.maxContextMessages)
            .filter(msg => msg.from !== 'bot');

        relevantMessages.forEach(message => {
            const sender = this.getSenderName(message);
            prompt += `${sender}: ${message.body}\n`;
        });

        prompt += '\nPlease provide a helpful, contextually appropriate response. ';
        prompt += 'Keep it concise and natural. Avoid being overly formal or robotic. ';
        prompt += 'Do not mention that you are an AI or that this is a WhatsApp conversation.';

        return prompt;
    }

    /**
     * Filter response for appropriateness and professionalism
     */
    public filterResponse(response: AIResponse): FilterResult {
        const content = response.content.toLowerCase();

        // Check for inappropriate content
        const inappropriateTerms = [
            'inappropriate', 'offensive', 'harmful', 'illegal', 'explicit',
            'nsfw', 'adult content', 'violence', 'hate speech'
        ];

        for (const term of inappropriateTerms) {
            if (content.includes(term)) {
                return {
                    isAppropriate: false,
                    reason: `Contains inappropriate term: ${term}`,
                    suggestedResponse: "I'd prefer to keep our conversation professional. Is there something else I can help you with?"
                };
            }
        }

        // Check for AI disclosure (should be minimal)
        const aiDisclosureTerms = [
            'as an ai', 'i am an ai', 'i\'m an ai', 'artificial intelligence',
            'language model', 'i\'m a bot', 'i am a bot'
        ];

        let hasAIDisclosure = false;
        for (const term of aiDisclosureTerms) {
            if (content.includes(term)) {
                hasAIDisclosure = true;
                break;
            }
        }

        // Check for overly long responses
        if (response.content.length > 800) {
            return {
                isAppropriate: false,
                reason: 'Response too long',
                suggestedResponse: response.content.substring(0, 700) + '...'
            };
        }

        // Check for professional tone
        const unprofessionalTerms = ['dude', 'bro', 'lol', 'lmao', 'wtf'];
        let hasUnprofessionalTerms = false;
        for (const term of unprofessionalTerms) {
            if (content.includes(term)) {
                hasUnprofessionalTerms = true;
                break;
            }
        }

        return {
            isAppropriate: true,
            reason: hasAIDisclosure ? 'Contains AI disclosure' : hasUnprofessionalTerms ? 'Contains unprofessional terms' : undefined
        };
    }

    /**
     * Add secretary-style personality to responses
     */
    public addSecretaryPersonality(response: AIResponse, context: SecretaryContext): AIResponse {
        let content = response.content;

        // Add appropriate closing based on context
        if (context.messageType === 'business' && !content.includes('Best regards') && !content.includes('Thank you')) {
            if (content.length < 200) {
                if (Math.random() > 0.7) {
                    content += '\n\nBest regards,\nGilad\'s Assistant';
                }
            }
        }

        // Add helpful context-aware suggestions
        if (context.urgencyLevel === 'high' && !content.includes('urgent')) {
            content = 'I understand this seems urgent. ' + content;
        }

        // Ensure professional but friendly tone
        content = this.adjustToneForSecretary(content, context);

        return {
            ...response,
            content: content.trim()
        };
    }

    /**
     * Analyze conversation context for secretary-specific insights
     */
    private analyzeSecretaryContext(context: ConversationContext): SecretaryContext {
        const enhanced: SecretaryContext = { ...context };

        // Analyze message type based on recent messages
        const lastMessage = context.recentMessages[context.recentMessages.length - 1];
        if (lastMessage) {
            enhanced.messageType = this.classifyMessageType(lastMessage.body);
            enhanced.urgencyLevel = this.determineUrgency(lastMessage.body);
            enhanced.senderRelation = this.analyzeSenderRelation(lastMessage, context);
        }

        return enhanced;
    }

    /**
     * Classify the type of message
     */
    private classifyMessageType(messageBody: string): 'business' | 'personal' | 'group' | 'unknown' {
        const businessKeywords = [
            'meeting', 'project', 'work', 'business', 'client', 'deadline',
            'proposal', 'contract', 'invoice', 'schedule', 'appointment'
        ];

        const personalKeywords = [
            'how are you', 'family', 'weekend', 'vacation', 'dinner',
            'movie', 'friend', 'birthday', 'party', 'holiday'
        ];

        const body = messageBody.toLowerCase();

        if (businessKeywords.some(keyword => body.includes(keyword))) {
            return 'business';
        }

        if (personalKeywords.some(keyword => body.includes(keyword))) {
            return 'personal';
        }

        return 'unknown';
    }

    /**
     * Determine message urgency level
     */
    private determineUrgency(messageBody: string): 'low' | 'medium' | 'high' {
        const urgentKeywords = [
            'urgent', 'asap', 'emergency', 'immediately', 'critical',
            'deadline', 'rush', 'quickly', 'now', 'today'
        ];

        const body = messageBody.toLowerCase();

        if (urgentKeywords.some(keyword => body.includes(keyword))) {
            return 'high';
        }

        if (body.includes('?') || body.includes('please') || body.includes('need')) {
            return 'medium';
        }

        return 'low';
    }

    /**
     * Analyze sender relationship
     */
    private analyzeSenderRelation(message: WhatsAppMessage, context: ConversationContext): 'colleague' | 'friend' | 'family' | 'unknown' {
        // This is a simplified analysis - in a real implementation,
        // you might have a contacts database or ML classification
        return 'unknown';
    }

    /**
     * Adjust tone specifically for secretary role
     */
    private adjustToneForSecretary(content: string, context: SecretaryContext): string {
        // Ensure professional greeting if it's the start of conversation
        if (context.recentMessages.length <= 1) {
            if (!content.toLowerCase().startsWith('hello') && !content.toLowerCase().startsWith('hi')) {
                content = 'Hello! ' + content;
            }
        }

        // Remove any casual language that might have slipped through
        content = content.replace(/\b(yeah|yep|nope|ok|okay)\b/gi, (match) => {
            switch (match.toLowerCase()) {
                case 'yeah':
                case 'yep':
                    return 'yes';
                case 'nope':
                    return 'no';
                case 'ok':
                case 'okay':
                    return 'certainly';
                default:
                    return match;
            }
        });

        return content;
    }

    /**
     * Get fallback response based on context
     */
    private getFallbackResponse(context: ConversationContext | SecretaryContext): string {
        const secretaryContext = context as SecretaryContext;

        if (secretaryContext.messageType === 'business') {
            return "Thank you for your message. I'll make sure Gilad receives this and gets back to you promptly.";
        }

        if (secretaryContext.urgencyLevel === 'high') {
            return "I understand this is important. I'll ensure Gilad sees this message right away.";
        }

        return "Thank you for your message. I'll make sure Gilad receives this.";
    }

    /**
     * Post-process generated response
     */
    private postProcessResponse(response: AIResponse): AIResponse {
        let processedContent = response.content;

        // Remove common AI-generated prefixes
        const prefixesToRemove = [
            'As an AI', 'I am an AI', 'I\'m an AI', 'As a language model',
            'I\'m a language model', 'As an assistant', 'I\'m an assistant'
        ];

        prefixesToRemove.forEach(prefix => {
            const regex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[,.]?\\s*`, 'i');
            processedContent = processedContent.replace(regex, '');
        });

        // Ensure response doesn't exceed reasonable length for WhatsApp
        if (processedContent.length > 1000) {
            processedContent = processedContent.substring(0, 997) + '...';
        }

        // Clean up any double spaces or newlines
        processedContent = processedContent.replace(/\s+/g, ' ').trim();

        return {
            ...response,
            content: processedContent
        };
    }

    /**
     * Extract sender name from message
     */
    private getSenderName(message: WhatsAppMessage): string {
        if (message.isGroupMsg && message.author) {
            const authorParts = message.author.split('@');
            return authorParts[0] || 'Unknown';
        }

        if (message.from !== 'bot') {
            const fromParts = message.from.split('@');
            return fromParts[0] || 'User';
        }

        return 'Bot';
    }

    /**
     * Get time information for context
     */
    private getTimeInfo(timestamp: number): string {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);

        if (minutes < 1) return ' (just now)';
        if (minutes < 60) return ` (${minutes}m ago)`;
        if (minutes < 1440) return ` (${Math.floor(minutes / 60)}h ago)`;
        return '';
    }

    /**
     * Update conversation memory for context
     */
    private updateConversationMemory(chatId: string, prompt: string, response: string): void {
        if (!this.conversationMemory.has(chatId)) {
            this.conversationMemory.set(chatId, []);
        }

        const memory = this.conversationMemory.get(chatId)!;
        const timestamp = Date.now();

        memory.push(
            { role: 'user', content: prompt, timestamp },
            { role: 'assistant', content: response, timestamp }
        );

        // Keep only last 20 interactions per chat
        if (memory.length > 40) {
            memory.splice(0, memory.length - 40);
        }
    }

    /**
     * Get conversation memory for a chat
     */
    public getConversationMemory(chatId: string): Array<{role: string, content: string, timestamp: number}> {
        return this.conversationMemory.get(chatId) || [];
    }

    /**
     * Clear conversation memory for a chat
     */
    public clearConversationMemory(chatId: string): void {
        this.conversationMemory.delete(chatId);
    }
}