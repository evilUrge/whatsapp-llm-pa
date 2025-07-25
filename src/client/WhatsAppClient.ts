import { Client, LocalAuth, Chat, Contact, Message } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';
import { MessageHandler } from './MessageHandler';
import { config } from '../config/environment';
import { EventEmitter } from 'events';

/**
 * Enhanced WhatsApp client wrapper that handles connection, authentication, and message routing
 */
export class WhatsAppClient extends EventEmitter {
    private client!: Client; // Using definite assignment assertion
    private messageHandler: MessageHandler;
    private isClientReady: boolean = false;
    private isInitializing: boolean = false;
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;
    private reconnectDelay: number = 30000; // 30 seconds
    private reconnectTimer?: NodeJS.Timeout;

    constructor(messageHandler: MessageHandler) {
        super();
        this.messageHandler = messageHandler;
        this.setupClient();
    }

    /**
     * Set up the WhatsApp client with enhanced configuration
     */
    private setupClient(): void {
        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: config.whatsapp.sessionPath,
                clientId: 'whatsapp-llm-pa'
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor'
                ],
                executablePath: undefined, // Use system Chrome/Chromium
                timeout: 60000 // Increase timeout for slow systems
            },
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
            }
        });

        this.setupEventHandlers();
    }

    /**
     * Initialize the WhatsApp client with retry logic
     */
    public async initialize(): Promise<void> {
        if (this.isInitializing) {
            console.log('Client is already initializing...');
            return;
        }

        console.log('Initializing WhatsApp client...');
        this.isInitializing = true;

        try {
            await this.client.initialize();
            this.isInitializing = false;
            this.reconnectAttempts = 0; // Reset on successful connection
        } catch (error) {
            this.isInitializing = false;
            console.error('Failed to initialize WhatsApp client:', error);

            // Attempt reconnection if not at max attempts
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                console.log(`Attempting reconnection in ${this.reconnectDelay / 1000} seconds... (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
                this.scheduleReconnect();
            } else {
                console.error('Max reconnection attempts reached. Manual intervention required.');
                this.emit('error', new Error('Failed to initialize after maximum retry attempts'));
            }
            throw error;
        }
    }

    /**
     * Send a message to a specific chat with retry logic
     */
    public async sendMessage(chatId: String, message: string): Promise<void> {
        if (!this.isReady()) {
            throw new Error('WhatsApp client is not ready');
        }

        const maxRetries = 3;
        let retryCount = 0;

        while (retryCount < maxRetries) {
            try {
                await this.client.sendMessage(chatId.toString(), message);
                console.log(`✅ Message sent to ${chatId}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
                return;
            } catch (error) {
                retryCount++;
                console.error(`❌ Failed to send message (attempt ${retryCount}/${maxRetries}):`, error);

                if (retryCount < maxRetries) {
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
                } else {
                    throw error;
                }
            }
        }
    }

    /**
     * Check if client is ready
     */
    public isReady(): boolean {
        return this.isClientReady && this.client && !this.isInitializing;
    }

    /**
     * Get all chats
     */
    public async getChats(): Promise<Chat[]> {
        if (!this.isReady()) {
            throw new Error('WhatsApp client is not ready');
        }

        try {
            return await this.client.getChats();
        } catch (error) {
            console.error('Failed to get chats:', error);
            throw error;
        }
    }

    /**
     * Get all contacts
     */
    public async getContacts(): Promise<Contact[]> {
        if (!this.isReady()) {
            throw new Error('WhatsApp client is not ready');
        }

        try {
            return await this.client.getContacts();
        } catch (error) {
            console.error('Failed to get contacts:', error);
            throw error;
        }
    }

    /**
     * Get contact by ID
     */
    public async getContactById(contactId: string): Promise<Contact | null> {
        if (!this.isReady()) {
            throw new Error('WhatsApp client is not ready');
        }

        try {
            return await this.client.getContactById(contactId);
        } catch (error) {
            console.error('Failed to get contact:', error);
            return null;
        }
    }

    /**
     * Get chat by ID
     */
    public async getChatById(chatId: string): Promise<Chat | null> {
        if (!this.isReady()) {
            throw new Error('WhatsApp client is not ready');
        }

        try {
            return await this.client.getChatById(chatId);
        } catch (error) {
            console.error('Failed to get chat:', error);
            return null;
        }
    }

    /**
     * Get client information
     */
    public async getClientInfo(): Promise<any> {
        if (!this.isReady()) {
            return null;
        }

        try {
            return await this.client.info;
        } catch (error) {
            console.error('Failed to get client info:', error);
            return null;
        }
    }

    /**
     * Get client state
     */
    public getState(): string {
        if (!this.client) return 'DESTROYED';
        return this.client.pupPage ? 'CONNECTED' : 'DISCONNECTED';
    }

    /**
     * Disconnect gracefully
     */
    public async disconnect(): Promise<void> {
        console.log('🔌 Disconnecting WhatsApp client...');

        // Clear reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }

        this.isClientReady = false;

        try {
            if (this.client) {
                await this.client.destroy();
            }
        } catch (error) {
            console.error('Error during disconnect:', error);
        }

        console.log('✅ WhatsApp client disconnected');
    }

    /**
     * Destroy the client completely
     */
    public async destroy(): Promise<void> {
        await this.disconnect();
        this.removeAllListeners();
    }

    /**
     * Schedule reconnection attempt
     */
    private scheduleReconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        this.reconnectTimer = setTimeout(() => {
            this.reconnectAttempts++;
            console.log(`🔄 Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

            // Recreate client for fresh connection
            this.setupClient();
            this.initialize().catch((error) => {
                console.error('Reconnection failed:', error);
            });
        }, this.reconnectDelay);
    }

    /**
     * Set up comprehensive event handlers for the WhatsApp client
     */
    private setupEventHandlers(): void {
        // QR Code for authentication
        this.client.on('qr', (qr: string) => {
            console.log('\n📱 QR Code received! Scan with your WhatsApp:');
            console.log('═'.repeat(50));
            qrcode.generate(qr, { small: true });
            console.log('═'.repeat(50));
            console.log('💡 Tip: Make sure WhatsApp Web is not open in another browser');
            this.emit('qr', qr);
        });

        // Authentication events
        this.client.on('authenticated', () => {
            console.log('✅ WhatsApp client authenticated successfully');
            this.emit('authenticated');
        });

        this.client.on('auth_failure', (message: string) => {
            console.error('❌ Authentication failed:', message);
            this.isClientReady = false;
            this.emit('auth_failure', message);

            // Schedule reconnection on auth failure
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.scheduleReconnect();
            }
        });

        // Ready state
        this.client.on('ready', async () => {
            console.log('🚀 WhatsApp client is ready!');
            this.isClientReady = true;
            this.reconnectAttempts = 0; // Reset on successful connection

            try {
                const info = await this.client.info;
                console.log(`📞 Logged in as: ${info.pushname} (${info.wid.user})`);
                console.log(`📱 WhatsApp version: ${info.phone.wa_version}`);
            } catch (error) {
                console.error('Failed to get client info on ready:', error);
            }

            this.emit('ready');
        });

        // Connection events
        this.client.on('disconnected', (reason: string) => {
            console.log(`🔌 WhatsApp client disconnected: ${reason}`);
            this.isClientReady = false;
            this.emit('disconnected', reason);

            // Auto reconnect unless it's a logout
            if (reason !== 'LOGOUT' && this.reconnectAttempts < this.maxReconnectAttempts) {
                console.log('🔄 Attempting to reconnect...');
                this.scheduleReconnect();
            }
        });

        // Message events
        this.client.on('message', async (message: Message) => {
            try {
                await this.messageHandler.handleMessage(message);
            } catch (error) {
                console.error('❌ Error handling incoming message:', error);
            }
        });

        this.client.on('message_create', async (message: Message) => {
            // Handle messages created by this client (sent messages)
            if (message.fromMe) {
                console.log(`📤 Message sent: ${message.body?.substring(0, 50)}${message.body && message.body.length > 50 ? '...' : ''}`);
            }
        });

        // Error handling
        this.client.on('error', (error: Error) => {
            console.error('❌ WhatsApp client error:', error);
            this.emit('error', error);
        });

        // Group events (for future enhancement)
        this.client.on('group_join', (notification: any) => {
            console.log('👥 Someone joined a group:', notification);
        });

        this.client.on('group_leave', (notification: any) => {
            console.log('👋 Someone left a group:', notification);
        });

        // Contact and chat events
        this.client.on('contact_changed', (message: any, oldId: string, newId: string, isContact: boolean) => {
            console.log(`📇 Contact changed: ${oldId} -> ${newId}`);
        });

        // Loading screen events
        this.client.on('loading_screen', (percent: number, message: string) => {
            console.log(`⏳ Loading: ${percent}% - ${message}`);
        });
    }

    /**
     * Get health status of the client
     */
    public getHealthStatus(): {
        isReady: boolean;
        isInitializing: boolean;
        reconnectAttempts: number;
        state: string;
        hasReconnectTimer: boolean;
    } {
        return {
            isReady: this.isReady(),
            isInitializing: this.isInitializing,
            reconnectAttempts: this.reconnectAttempts,
            state: this.getState(),
            hasReconnectTimer: !!this.reconnectTimer
        };
    }

    /**
     * Manual reconnect (for testing/debugging)
     */
    public async forceReconnect(): Promise<void> {
        console.log('🔄 Force reconnecting WhatsApp client...');
        await this.disconnect();
        this.reconnectAttempts = 0;
        this.setupClient();
        await this.initialize();
    }
}