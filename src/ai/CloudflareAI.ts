import { AIResponse, ConversationContext } from '../types';

/**
 * Cloudflare AI API response interface
 */
interface CloudflareAIResponse {
    result: {
        response?: string;
        generated_text?: string;
        confidence?: number;
        tokens_used?: number;
    };
    success: boolean;
    errors?: Array<{ code: number; message: string }>;
    messages?: Array<{ code: number; message: string }>;
}

/**
 * Model information interface
 */
interface ModelInfo {
    name: string;
    description?: string;
    task?: string;
    tags?: string[];
}

/**
 * Request retry configuration
 */
interface RetryConfig {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
}

/**
 * Cloudflare AI service for generating responses with comprehensive error handling
 */
export class CloudflareAI {
    private apiToken: string;
    private accountId: string;
    private baseUrl: string;
    private currentModel: string;
    private retryConfig: RetryConfig;
    private gatewayUrl?: string;

    constructor(
        apiToken: string,
        accountId: string,
        gatewayUrl?: string,
        initialModel: string = '@cf/meta/llama-3.2-1b-instruct'
    ) {
        this.apiToken = apiToken;
        this.accountId = accountId;
        this.currentModel = initialModel;
        this.gatewayUrl = gatewayUrl;
        this.baseUrl = gatewayUrl || `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run`;
        this.retryConfig = {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 10000
        };
    }

    /**
     * Generate AI response using Cloudflare Workers AI with context support
     */
    public async generateResponse(
        prompt: string,
        context?: ConversationContext,
        model?: string,
        maxTokens: number = 500
    ): Promise<AIResponse> {
        const targetModel = model || this.currentModel;

        try {
            const messages = this.buildMessages(prompt, context);
            const response = await this.makeRequest(targetModel, {
                messages,
                max_tokens: maxTokens,
                temperature: 0.7,
                stream: false
            });

            return this.parseResponse(response, targetModel);

        } catch (error) {
            console.error('Error generating response:', error);
            throw new Error(`Failed to generate AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Check if the service is healthy and the model is available
     */
    public async isHealthy(): Promise<boolean> {
        try {
            // First check if we can access the models endpoint
            const modelsResponse = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/models`,
                {
                    method: 'GET',
                    headers: this.getHeaders()
                }
            );

            if (!modelsResponse.ok) {
                return false;
            }

            // Then test with a simple generation request
            const testResponse = await this.generateResponse(
                'Hello',
                undefined,
                this.currentModel,
                10
            );

            return testResponse.content.length > 0;

        } catch (error) {
            console.error('Health check failed:', error);
            return false;
        }
    }

    /**
     * Get information about the current model
     */
    public async getModelInfo(): Promise<ModelInfo | null> {
        try {
            const response = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/models`,
                {
                    method: 'GET',
                    headers: this.getHeaders()
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to get model info: ${response.status}`);
            }

            const data = await response.json() as any;
            const models = data.result || [];

            const currentModelInfo = models.find((model: any) =>
                model.name === this.currentModel
            );

            if (currentModelInfo) {
                return {
                    name: currentModelInfo.name,
                    description: currentModelInfo.description,
                    task: currentModelInfo.task,
                    tags: currentModelInfo.tags
                };
            }

            return null;

        } catch (error) {
            console.error('Error getting model info:', error);
            return null;
        }
    }

    /**
     * Switch to a different AI model
     */
    public async setModel(modelName: string): Promise<boolean> {
        try {
            // Verify the model exists and is available
            const availableModels = await this.listModels();

            if (!availableModels.includes(modelName)) {
                throw new Error(`Model ${modelName} is not available`);
            }

            // Test the model with a simple request
            await this.generateResponse('Test', undefined, modelName, 10);

            this.currentModel = modelName;
            return true;

        } catch (error) {
            console.error(`Error setting model to ${modelName}:`, error);
            return false;
        }
    }

    /**
     * List available models
     */
    public async listModels(): Promise<string[]> {
        try {
            const response = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/models`,
                {
                    method: 'GET',
                    headers: this.getHeaders()
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to list models: ${response.status}`);
            }

            const data = await response.json() as any;
            return data.result?.map((model: any) => model.name) || [];

        } catch (error) {
            console.error('Error listing models:', error);
            return [];
        }
    }

    /**
     * Get current model name
     */
    public getCurrentModel(): string {
        return this.currentModel;
    }

    /**
     * Validate configuration
     */
    public validateConfig(): boolean {
        return !!(this.apiToken && this.accountId);
    }

    /**
     * Build messages array for the AI request
     */
    private buildMessages(prompt: string, context?: ConversationContext): Array<{role: string, content: string}> {
        const messages = [
            {
                role: 'system',
                content: this.getSystemPrompt(context)
            }
        ];

        // Add context messages if available
        if (context?.recentMessages) {
            const contextMessages = context.recentMessages
                .slice(-5) // Last 5 messages for context
                .filter(msg => msg.from !== 'bot')
                .map(msg => ({
                    role: 'user',
                    content: `${this.getSenderName(msg)}: ${msg.body}`
                }));

            messages.push(...contextMessages);
        }

        // Add the current prompt
        messages.push({
            role: 'user',
            content: prompt
        });

        return messages;
    }

    /**
     * Get system prompt based on context
     */
    private getSystemPrompt(context?: ConversationContext): string {
        const basePrompt = `You are Gilad's professional personal assistant. You respond to WhatsApp messages in a helpful, concise, and contextually appropriate manner.

Key characteristics:
- Professional yet friendly tone
- Concise responses (keep under 200 words)
- Context-aware based on conversation flow
- Represent Gilad professionally
- Avoid mentioning you're an AI unless directly asked
- Use natural, conversational language

Response guidelines:
- For business inquiries: Be professional and helpful
- For personal conversations: Be friendly but maintain boundaries
- For group chats: Be mindful of the group dynamic
- Always prioritize being helpful while staying appropriate`;

        if (context?.participantCount && context.participantCount > 2) {
            return basePrompt + '\n- This is a group chat, be mindful of multiple participants';
        }

        return basePrompt;
    }

    /**
     * Get sender name from message (simplified version)
     */
    private getSenderName(message: any): string {
        if (message.author) {
            return message.author.split('@')[0] || 'User';
        }
        return message.from?.split('@')[0] || 'User';
    }

    /**
     * Make request to Cloudflare AI with retry logic
     */
    private async makeRequest(model: string, payload: any): Promise<CloudflareAIResponse> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
            try {
                const response = await fetch(`${this.baseUrl}/${model}`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Cloudflare AI API error: ${response.status} ${response.statusText} - ${errorText}`);
                }

                const data = await response.json() as CloudflareAIResponse;

                if (!data.success && data.errors) {
                    throw new Error(`API error: ${data.errors.map(e => e.message).join(', ')}`);
                }

                return data;

            } catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');

                if (attempt < this.retryConfig.maxRetries) {
                    const delay = Math.min(
                        this.retryConfig.baseDelay * Math.pow(2, attempt),
                        this.retryConfig.maxDelay
                    );

                    console.warn(`Request attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error);
                    await this.sleep(delay);
                } else {
                    console.error(`All ${this.retryConfig.maxRetries + 1} attempts failed`);
                }
            }
        }

        throw lastError || new Error('Request failed after all retries');
    }

    /**
     * Parse Cloudflare AI response
     */
    private parseResponse(data: CloudflareAIResponse, model: string): AIResponse {
        const content = data.result?.response ||
                      data.result?.generated_text ||
                      'Sorry, I could not generate a response.';

        return {
            content: content.trim(),
            confidence: data.result?.confidence || 0.7,
            tokens_used: data.result?.tokens_used || 0,
            model: model
        };
    }

    /**
     * Get request headers
     */
    private getHeaders(): Record<string, string> {
        return {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'WhatsApp-LLM-PA/1.0.0'
        };
    }

    /**
     * Sleep utility for retries
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Check rate limiting status
     */
    public async checkRateLimit(): Promise<{ remaining: number; resetTime: number } | null> {
        try {
            const response = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/models`,
                {
                    method: 'HEAD',
                    headers: this.getHeaders()
                }
            );

            const remaining = response.headers.get('x-ratelimit-remaining');
            const resetTime = response.headers.get('x-ratelimit-reset');

            if (remaining && resetTime) {
                return {
                    remaining: parseInt(remaining, 10),
                    resetTime: parseInt(resetTime, 10)
                };
            }

            return null;

        } catch (error) {
            console.error('Error checking rate limit:', error);
            return null;
        }
    }
}