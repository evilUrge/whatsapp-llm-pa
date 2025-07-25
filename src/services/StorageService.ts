import { Database } from 'sqlite3';
import { StorageData, ConversationContext, TimerState, AppSettings, WhatsAppMessage, MessageType } from '../types';
import { config } from '../config/environment';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Comprehensive SQLite-based storage service for WhatsApp LLM Personal Assistant
 * Handles conversation state, message history, participants, cooldowns, and timers
 */
export class StorageService {
    private db: Database;
    private dbPath: string;
    private isInitialized: boolean = false;

    constructor() {
        this.dbPath = config.database.path;
        this.ensureDirectoryExists();
        this.db = new Database(this.dbPath);
        this.initializeDatabase();
    }

    /**
     * Initialize database with comprehensive schema
     */
    private async initializeDatabase(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                // Enable foreign keys
                this.db.run('PRAGMA foreign_keys = ON');

                // Participants table
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS participants (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        whatsapp_id TEXT UNIQUE NOT NULL,
                        name TEXT,
                        is_gilad BOOLEAN DEFAULT 0,
                        created_at INTEGER DEFAULT (strftime('%s', 'now')),
                        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
                    )
                `);

                // Conversations table
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS conversations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        chat_id TEXT UNIQUE NOT NULL,
                        created_at INTEGER DEFAULT (strftime('%s', 'now')),
                        last_activity INTEGER DEFAULT (strftime('%s', 'now')),
                        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
                        participant_count INTEGER DEFAULT 0,
                        is_group BOOLEAN DEFAULT 0,
                        group_name TEXT
                    )
                `);

                // Messages table
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        conversation_id INTEGER NOT NULL,
                        sender_id INTEGER NOT NULL,
                        whatsapp_message_id TEXT UNIQUE NOT NULL,
                        content TEXT NOT NULL,
                        timestamp INTEGER NOT NULL,
                        message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact')),
                        is_from_gilad BOOLEAN DEFAULT 0,
                        created_at INTEGER DEFAULT (strftime('%s', 'now')),
                        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                        FOREIGN KEY (sender_id) REFERENCES participants(id) ON DELETE CASCADE
                    )
                `);

                // Cooldowns table
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS cooldowns (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        conversation_id INTEGER NOT NULL,
                        start_time INTEGER NOT NULL,
                        end_time INTEGER NOT NULL,
                        reason TEXT DEFAULT 'gilad_response',
                        is_active BOOLEAN DEFAULT 1,
                        created_at INTEGER DEFAULT (strftime('%s', 'now')),
                        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                    )
                `);

                // Timers table
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS timers (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        conversation_id INTEGER NOT NULL,
                        start_time INTEGER NOT NULL,
                        end_time INTEGER,
                        timer_type TEXT CHECK (timer_type IN ('response', 'cooldown')),
                        is_active BOOLEAN DEFAULT 1,
                        created_at INTEGER DEFAULT (strftime('%s', 'now')),
                        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                    )
                `);

                // Settings table (keeping existing structure)
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS settings (
                        key TEXT PRIMARY KEY,
                        value TEXT,
                        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
                    )
                `);

                // Create indexes for performance
                this.createIndexes(() => {
                    console.log('Database initialized successfully');
                    this.isInitialized = true;
                    resolve();
                });
            });
        });
    }

    /**
     * Create database indexes for optimal performance
     */
    private createIndexes(callback: () => void): void {
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_conversations_chat_id ON conversations(chat_id)',
            'CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status)',
            'CREATE INDEX IF NOT EXISTS idx_conversations_last_activity ON conversations(last_activity)',
            'CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)',
            'CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id)',
            'CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_id ON messages(whatsapp_message_id)',
            'CREATE INDEX IF NOT EXISTS idx_participants_whatsapp_id ON participants(whatsapp_id)',
            'CREATE INDEX IF NOT EXISTS idx_participants_is_gilad ON participants(is_gilad)',
            'CREATE INDEX IF NOT EXISTS idx_cooldowns_conversation_id ON cooldowns(conversation_id)',
            'CREATE INDEX IF NOT EXISTS idx_cooldowns_active ON cooldowns(is_active)',
            'CREATE INDEX IF NOT EXISTS idx_cooldowns_end_time ON cooldowns(end_time)',
            'CREATE INDEX IF NOT EXISTS idx_timers_conversation_id ON timers(conversation_id)',
            'CREATE INDEX IF NOT EXISTS idx_timers_active ON timers(is_active)',
            'CREATE INDEX IF NOT EXISTS idx_timers_type ON timers(timer_type)'
        ];

        let completed = 0;
        indexes.forEach(indexSql => {
            this.db.run(indexSql, (err) => {
                if (err) console.error('Error creating index:', err);
                completed++;
                if (completed === indexes.length) {
                    callback();
                }
            });
        });
    }

    /**
     * PARTICIPANT MANAGEMENT
     */

    /**
     * Create or update a participant
     */
    public async upsertParticipant(whatsappId: string, name?: string, isGilad: boolean = false): Promise<number> {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO participants (whatsapp_id, name, is_gilad, updated_at)
                VALUES (?, ?, ?, strftime('%s', 'now'))
                ON CONFLICT(whatsapp_id)
                DO UPDATE SET
                    name = COALESCE(?, name),
                    is_gilad = ?,
                    updated_at = strftime('%s', 'now')
            `);

            stmt.run(whatsappId, name, isGilad ? 1 : 0, name, isGilad ? 1 : 0, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID || this.changes);
                }
            });

            stmt.finalize();
        });
    }

    /**
     * Get participant by WhatsApp ID
     */
    public async getParticipant(whatsappId: string): Promise<any | null> {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM participants WHERE whatsapp_id = ?',
                [whatsappId],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row || null);
                    }
                }
            );
        });
    }

    /**
     * Get all participants
     */
    public async getAllParticipants(): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM participants ORDER BY name', (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    /**
     * CONVERSATION MANAGEMENT
     */

    /**
     * Create or update a conversation
     */
    public async upsertConversation(chatId: string, isGroup: boolean = false, groupName?: string): Promise<number> {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO conversations (chat_id, is_group, group_name, last_activity)
                VALUES (?, ?, ?, strftime('%s', 'now'))
                ON CONFLICT(chat_id)
                DO UPDATE SET
                    is_group = ?,
                    group_name = COALESCE(?, group_name),
                    last_activity = strftime('%s', 'now')
            `);

            stmt.run(chatId, isGroup ? 1 : 0, groupName, isGroup ? 1 : 0, groupName, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID || this.changes);
                }
            });

            stmt.finalize();
        });
    }

    /**
     * Get conversation by chat ID
     */
    public async getConversation(chatId: string): Promise<any | null> {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM conversations WHERE chat_id = ?',
                [chatId],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row || null);
                    }
                }
            );
        });
    }

    /**
     * Get all active conversations
     */
    public async getActiveConversations(): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.db.all(
                "SELECT * FROM conversations WHERE status = 'active' ORDER BY last_activity DESC",
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    /**
     * Update conversation status
     */
    public async updateConversationStatus(chatId: string, status: 'active' | 'inactive' | 'archived'): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE conversations SET status = ?, last_activity = strftime(\'%s\', \'now\') WHERE chat_id = ?',
                [status, chatId],
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    /**
     * Update conversation participant count
     */
    public async updateParticipantCount(chatId: string, count: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE conversations SET participant_count = ?, last_activity = strftime(\'%s\', \'now\') WHERE chat_id = ?',
                [count, chatId],
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    /**
     * MESSAGE MANAGEMENT
     */

    /**
     * Store a message
     */
    public async storeMessage(message: WhatsAppMessage, isFromGilad: boolean = false): Promise<number> {
        return new Promise(async (resolve, reject) => {
            try {
                // Ensure conversation exists
                await this.upsertConversation(message.chat.id, message.isGroupMsg, message.chat.name);

                // Ensure participant exists
                const senderId = message.author || message.from;
                await this.upsertParticipant(senderId, undefined, isFromGilad);

                // Get conversation and participant IDs
                const conversation = await this.getConversation(message.chat.id);
                const participant = await this.getParticipant(senderId);

                if (!conversation || !participant) {
                    reject(new Error('Failed to get conversation or participant'));
                    return;
                }

                const stmt = this.db.prepare(`
                    INSERT OR IGNORE INTO messages
                    (conversation_id, sender_id, whatsapp_message_id, content, timestamp, message_type, is_from_gilad)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);

                stmt.run(
                    conversation.id,
                    participant.id,
                    message.id,
                    message.body,
                    message.timestamp,
                    MessageType.TEXT, // Default to text, can be extended
                    isFromGilad ? 1 : 0,
                    function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(this.lastID);
                        }
                    }
                );

                stmt.finalize();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Get recent messages for a conversation
     */
    public async getRecentMessages(chatId: string, limit: number = 10): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT
                    m.*,
                    p.whatsapp_id as sender_whatsapp_id,
                    p.name as sender_name,
                    p.is_gilad as sender_is_gilad
                FROM messages m
                JOIN conversations c ON m.conversation_id = c.id
                JOIN participants p ON m.sender_id = p.id
                WHERE c.chat_id = ?
                ORDER BY m.timestamp DESC
                LIMIT ?
            `;

            this.db.all(sql, [chatId, limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve((rows || []).reverse()); // Return in chronological order
                }
            });
        });
    }

    /**
     * Get message count for a conversation
     */
    public async getMessageCount(chatId: string): Promise<number> {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT COUNT(*) as count
                FROM messages m
                JOIN conversations c ON m.conversation_id = c.id
                WHERE c.chat_id = ?
            `;

            this.db.get(sql, [chatId], (err, row: any) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row?.count || 0);
                }
            });
        });
    }

    /**
     * COOLDOWN MANAGEMENT
     */

    /**
     * Start a cooldown period
     */
    public async startCooldown(chatId: string, durationMs: number, reason: string = 'gilad_response'): Promise<number> {
        return new Promise(async (resolve, reject) => {
            try {
                const conversation = await this.getConversation(chatId);
                if (!conversation) {
                    reject(new Error('Conversation not found'));
                    return;
                }

                const now = Math.floor(Date.now() / 1000);
                const endTime = now + Math.floor(durationMs / 1000);

                // Deactivate any existing active cooldowns
                await this.deactivateActiveCooldowns(chatId);

                const stmt = this.db.prepare(`
                    INSERT INTO cooldowns (conversation_id, start_time, end_time, reason, is_active)
                    VALUES (?, ?, ?, ?, 1)
                `);

                stmt.run(conversation.id, now, endTime, reason, function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                });

                stmt.finalize();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Check if conversation is in cooldown
     */
    public async isInCooldown(chatId: string): Promise<boolean> {
        return new Promise(async (resolve, reject) => {
            try {
                const conversation = await this.getConversation(chatId);
                if (!conversation) {
                    resolve(false);
                    return;
                }

                const now = Math.floor(Date.now() / 1000);
                const sql = `
                    SELECT COUNT(*) as count
                    FROM cooldowns
                    WHERE conversation_id = ?
                    AND is_active = 1
                    AND end_time > ?
                `;

                this.db.get(sql, [conversation.id, now], (err, row: any) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve((row?.count || 0) > 0);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Get remaining cooldown time in milliseconds
     */
    public async getRemainingCooldownTime(chatId: string): Promise<number> {
        return new Promise(async (resolve, reject) => {
            try {
                const conversation = await this.getConversation(chatId);
                if (!conversation) {
                    resolve(0);
                    return;
                }

                const now = Math.floor(Date.now() / 1000);
                const sql = `
                    SELECT end_time
                    FROM cooldowns
                    WHERE conversation_id = ?
                    AND is_active = 1
                    AND end_time > ?
                    ORDER BY end_time DESC
                    LIMIT 1
                `;

                this.db.get(sql, [conversation.id, now], (err, row: any) => {
                    if (err) {
                        reject(err);
                    } else {
                        if (row) {
                            const remainingSeconds = row.end_time - now;
                            resolve(Math.max(0, remainingSeconds * 1000));
                        } else {
                            resolve(0);
                        }
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Deactivate active cooldowns for a conversation
     */
    private async deactivateActiveCooldowns(chatId: string): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                const conversation = await this.getConversation(chatId);
                if (!conversation) {
                    resolve();
                    return;
                }

                this.db.run(
                    'UPDATE cooldowns SET is_active = 0 WHERE conversation_id = ? AND is_active = 1',
                    [conversation.id],
                    (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    }
                );
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * TIMER MANAGEMENT
     */

    /**
     * Start a timer
     */
    public async startTimer(chatId: string, timerType: 'response' | 'cooldown', durationMs?: number): Promise<number> {
        return new Promise(async (resolve, reject) => {
            try {
                const conversation = await this.getConversation(chatId);
                if (!conversation) {
                    reject(new Error('Conversation not found'));
                    return;
                }

                const now = Math.floor(Date.now() / 1000);
                const endTime = durationMs ? now + Math.floor(durationMs / 1000) : null;

                const stmt = this.db.prepare(`
                    INSERT INTO timers (conversation_id, start_time, end_time, timer_type, is_active)
                    VALUES (?, ?, ?, ?, 1)
                `);

                stmt.run(conversation.id, now, endTime, timerType, function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                });

                stmt.finalize();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * End a timer
     */
    public async endTimer(timerId: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const now = Math.floor(Date.now() / 1000);
            this.db.run(
                'UPDATE timers SET is_active = 0, end_time = ? WHERE id = ?',
                [now, timerId],
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    /**
     * Get active timers for a conversation
     */
    public async getActiveTimers(chatId: string, timerType?: 'response' | 'cooldown'): Promise<any[]> {
        return new Promise(async (resolve, reject) => {
            try {
                const conversation = await this.getConversation(chatId);
                if (!conversation) {
                    resolve([]);
                    return;
                }

                let sql = `
                    SELECT * FROM timers
                    WHERE conversation_id = ? AND is_active = 1
                `;
                const params: any[] = [conversation.id];

                if (timerType) {
                    sql += ' AND timer_type = ?';
                    params.push(timerType);
                }

                sql += ' ORDER BY start_time DESC';

                this.db.all(sql, params, (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * LEGACY COMPATIBILITY METHODS
     * These maintain compatibility with the existing codebase
     */

    /**
     * Save complete data structure (legacy compatibility)
     */
    public async saveData(data: StorageData): Promise<void> {
        try {
            await this.saveConversations(data.conversations);
            await this.saveTimers(data.timers);
            await this.saveSettings(data.settings);
        } catch (error) {
            console.error('Error saving data:', error);
            throw error;
        }
    }

    /**
     * Load complete data structure (legacy compatibility)
     */
    public async loadData(): Promise<StorageData> {
        try {
            const [conversations, timers, settings] = await Promise.all([
                this.loadConversations(),
                this.loadTimers(),
                this.loadSettings()
            ]);

            return {
                conversations,
                timers,
                settings
            };
        } catch (error) {
            console.error('Error loading data:', error);
            return {
                conversations: {},
                timers: {},
                settings: config.app
            };
        }
    }

    /**
     * Save conversations to database (legacy format)
     */
    private async saveConversations(conversations: Record<string, ConversationContext>): Promise<void> {
        const promises = Object.entries(conversations).map(async ([chatId, context]) => {
            await this.upsertConversation(chatId);
            await this.updateParticipantCount(chatId, context.participantCount);

            // Store recent messages
            for (const message of context.recentMessages) {
                try {
                    await this.storeMessage(message);
                } catch (error: any) {
                    // Ignore duplicate message errors
                    if (!error.message?.includes('UNIQUE constraint failed')) {
                        console.error('Error storing message:', error);
                    }
                }
            }
        });

        await Promise.all(promises);
    }

    /**
     * Load conversations from database (legacy format)
     */
    private async loadConversations(): Promise<Record<string, ConversationContext>> {
        const conversations: Record<string, ConversationContext> = {};
        const dbConversations = await this.getActiveConversations();

        for (const conv of dbConversations) {
            const recentMessages = await this.getRecentMessages(conv.chat_id, config.app.maxContextMessages);

            conversations[conv.chat_id] = {
                chatId: conv.chat_id,
                participantCount: conv.participant_count || 0,
                lastResponseTime: conv.last_activity,
                isActive: conv.status === 'active',
                recentMessages: recentMessages.map(msg => ({
                    id: msg.whatsapp_message_id,
                    body: msg.content,
                    from: msg.sender_whatsapp_id,
                    to: '', // Not stored in new schema
                    timestamp: msg.timestamp,
                    isGroupMsg: conv.is_group === 1,
                    chat: {
                        id: conv.chat_id,
                        name: conv.group_name || ''
                    },
                    author: msg.sender_whatsapp_id
                }))
            };
        }

        return conversations;
    }

    /**
     * Save timer states to database (legacy format)
     */
    private async saveTimers(timers: Record<string, TimerState>): Promise<void> {
        // For legacy compatibility, we'll store basic timer state
        // The new schema handles timers more comprehensively
        const promises = Object.entries(timers).map(async ([chatId, timerState]) => {
            if (timerState.isInCooldown) {
                const isCurrentlyInCooldown = await this.isInCooldown(chatId);
                if (!isCurrentlyInCooldown && timerState.lastResponseTime) {
                    // Start a cooldown if one should be active
                    const cooldownStart = timerState.lastResponseTime;
                    const now = Date.now();
                    const cooldownDuration = config.app.cooldownPeriodMs;

                    if (now - cooldownStart < cooldownDuration) {
                        const remainingTime = cooldownDuration - (now - cooldownStart);
                        await this.startCooldown(chatId, remainingTime);
                    }
                }
            }
        });

        await Promise.all(promises);
    }

    /**
     * Load timer states from database (legacy format)
     */
    private async loadTimers(): Promise<Record<string, TimerState>> {
        const timers: Record<string, TimerState> = {};
        const conversations = await this.getActiveConversations();

        for (const conv of conversations) {
            const isInCooldown = await this.isInCooldown(conv.chat_id);

            timers[conv.chat_id] = {
                chatId: conv.chat_id,
                lastResponseTime: conv.last_activity,
                isInCooldown
                // responseTimer and cooldownTimer are runtime objects, not persisted
            };
        }

        return timers;
    }

    /**
     * Save settings to database
     */
    private async saveSettings(settings: AppSettings): Promise<void> {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO settings (key, value, updated_at)
                VALUES (?, ?, strftime('%s', 'now'))
            `);

            this.db.serialize(() => {
                Object.entries(settings).forEach(([key, value]) => {
                    stmt.run(key, JSON.stringify(value));
                });

                stmt.finalize((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        });
    }

    /**
     * Load settings from database
     */
    private async loadSettings(): Promise<AppSettings> {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM settings',
                (err, rows: any[]) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    const settings: Partial<AppSettings> = {};
                    rows.forEach(row => {
                        try {
                            settings[row.key as keyof AppSettings] = JSON.parse(row.value);
                        } catch (parseError) {
                            console.error(`Error parsing setting ${row.key}:`, parseError);
                        }
                    });

                    // Merge with default settings
                    resolve({ ...config.app, ...settings } as AppSettings);
                }
            );
        });
    }

    /**
     * HEALTH CHECKS AND CLEANUP
     */

    /**
     * Run database health check
     */
    public async healthCheck(): Promise<{
        isHealthy: boolean;
        checks: {
            connection: boolean;
            tables: boolean;
            indexes: boolean;
        };
        stats: any;
    }> {
        const checks = {
            connection: false,
            tables: false,
            indexes: false
        };

        try {
            // Test connection
            await new Promise<void>((resolve, reject) => {
                this.db.get('SELECT 1', (err) => {
                    if (err) reject(err);
                    else {
                        checks.connection = true;
                        resolve();
                    }
                });
            });

            // Check tables exist
            const tableCount = await new Promise<number>((resolve, reject) => {
                this.db.get(
                    "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
                    (err, row: any) => {
                        if (err) reject(err);
                        else resolve(row.count);
                    }
                );
            });
            checks.tables = tableCount >= 6; // We expect 6 tables

            // Check indexes exist
            const indexCount = await new Promise<number>((resolve, reject) => {
                this.db.get(
                    "SELECT COUNT(*) as count FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'",
                    (err, row: any) => {
                        if (err) reject(err);
                        else resolve(row.count);
                    }
                );
            });
            checks.indexes = indexCount > 0;

            const stats = await this.getDetailedStats();

            return {
                isHealthy: checks.connection && checks.tables && checks.indexes,
                checks,
                stats
            };
        } catch (error) {
            console.error('Health check failed:', error);
            return {
                isHealthy: false,
                checks,
                stats: null
            };
        }
    }

    /**
     * Clean up expired cooldowns and inactive timers
     */
    public async cleanup(): Promise<{
        expiredCooldowns: number;
        inactiveTimers: number;
        oldMessages: number;
    }> {
        const now = Math.floor(Date.now() / 1000);
        const results = {
            expiredCooldowns: 0,
            inactiveTimers: 0,
            oldMessages: 0
        };

        try {
            // Clean up expired cooldowns
            const expiredResult = await new Promise<number>((resolve, reject) => {
                this.db.run(
                    'UPDATE cooldowns SET is_active = 0 WHERE is_active = 1 AND end_time <= ?',
                    [now],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.changes);
                    }
                );
            });
            results.expiredCooldowns = expiredResult;

            // Clean up old inactive timers (older than 24 hours)
            const oneDayAgo = now - (24 * 60 * 60);
            const inactiveResult = await new Promise<number>((resolve, reject) => {
                this.db.run(
                    'DELETE FROM timers WHERE is_active = 0 AND created_at < ?',
                    [oneDayAgo],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.changes);
                    }
                );
            });
            results.inactiveTimers = inactiveResult;

            // Clean up old messages (keep only last 1000 per conversation)
            const conversations = await this.getActiveConversations();
            let totalOldMessages = 0;

            for (const conv of conversations) {
                const oldResult = await new Promise<number>((resolve, reject) => {
                    const sql = `
                        DELETE FROM messages
                        WHERE conversation_id = ?
                        AND id NOT IN (
                            SELECT id FROM messages
                            WHERE conversation_id = ?
                            ORDER BY timestamp DESC
                            LIMIT 1000
                        )
                    `;
                    this.db.run(sql, [conv.id, conv.id], function(err) {
                        if (err) reject(err);
                        else resolve(this.changes);
                    });
                });
                totalOldMessages += oldResult;
            }
            results.oldMessages = totalOldMessages;

            // Vacuum database to reclaim space
            await new Promise<void>((resolve, reject) => {
                this.db.run('VACUUM', (err) => {
                    if (err) {
                        console.error('Vacuum failed:', err);
                        resolve(); // Don't fail cleanup for vacuum errors
                    } else {
                        resolve();
                    }
                });
            });

            console.log('Cleanup completed:', results);
            return results;
        } catch (error) {
            console.error('Cleanup failed:', error);
            throw error;
        }
    }

    /**
     * Get detailed database statistics
     */
    public async getDetailedStats(): Promise<{
        conversations: number;
        messages: number;
        participants: number;
        activeCooldowns: number;
        activeTimers: number;
        settings: number;
    }> {
        return new Promise((resolve, reject) => {
            const stats = {
                conversations: 0,
                messages: 0,
                participants: 0,
                activeCooldowns: 0,
                activeTimers: 0,
                settings: 0
            };

            this.db.serialize(() => {
                this.db.get('SELECT COUNT(*) as count FROM conversations', (err, row: any) => {
                    if (!err) stats.conversations = row.count;
                });

                this.db.get('SELECT COUNT(*) as count FROM messages', (err, row: any) => {
                    if (!err) stats.messages = row.count;
                });

                this.db.get('SELECT COUNT(*) as count FROM participants', (err, row: any) => {
                    if (!err) stats.participants = row.count;
                });

                this.db.get('SELECT COUNT(*) as count FROM cooldowns WHERE is_active = 1', (err, row: any) => {
                    if (!err) stats.activeCooldowns = row.count;
                });

                this.db.get('SELECT COUNT(*) as count FROM timers WHERE is_active = 1', (err, row: any) => {
                    if (!err) stats.activeTimers = row.count;
                });

                this.db.get('SELECT COUNT(*) as count FROM settings', (err, row: any) => {
                    if (err) {
                        reject(err);
                    } else {
                        stats.settings = row.count;
                        resolve(stats);
                    }
                });
            });
        });
    }

    /**
     * Ensure database directory exists
     */
    private ensureDirectoryExists(): void {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`Created database directory: ${dir}`);
        }
    }

    /**
     * Close database connection
     */
    public async close(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err);
                    reject(err);
                } else {
                    console.log('Database closed successfully');
                    resolve();
                }
            });
        });
    }
}