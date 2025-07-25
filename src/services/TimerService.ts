import { EventEmitter } from 'events';
import * as cron from 'node-cron';
import { TimerState } from '../types';
import { config } from '../config/environment';
import { StorageService } from './StorageService';

/**
 * Event-driven timer service for WhatsApp LLM personal assistant
 * Manages 2-minute response timers and 5-hour cooldown periods
 */
export class TimerService extends EventEmitter {
    private timers: Map<string, TimerState> = new Map();
    private storage: StorageService;
    private cleanupCron?: cron.ScheduledTask;
    private isInitialized: boolean = false;

    // Event constants
    static readonly EVENTS = {
        RESPONSE_TIMER_EXPIRED: 'response_timer_expired',
        COOLDOWN_STARTED: 'cooldown_started',
        COOLDOWN_ENDED: 'cooldown_ended',
        TIMER_CANCELLED: 'timer_cancelled',
        GILAD_RESPONDED: 'gilad_responded'
    } as const;

    constructor(storage: StorageService) {
        super();
        this.storage = storage;
        this.initializeService();
    }

    /**
     * Initialize the timer service
     */
    private async initializeService(): Promise<void> {
        try {
            console.log('Initializing TimerService...');

            // Restore timers from database
            await this.restoreTimersFromDatabase();

            // Set up periodic cleanup (every 10 minutes)
            this.cleanupCron = cron.schedule('*/10 * * * *', () => {
                this.cleanup().catch(error => {
                    console.error('Scheduled cleanup failed:', error);
                });
            });

            this.isInitialized = true;
            console.log('TimerService initialized successfully');
        } catch (error) {
            console.error('Failed to initialize TimerService:', error);
            throw error;
        }
    }

    /**
     * Start a 2-minute response timer for new conversations
     */
    public startResponseTimer(chatId: string, callback: () => Promise<void>): void {
        try {
            console.log(`Starting 2-minute response timer for chat ${chatId}`);

            // Clear any existing timer
            this.cancelTimer(chatId);

            const timerState: TimerState = {
                chatId,
                isInCooldown: false,
                responseTimer: setTimeout(async () => {
                    try {
                        console.log(`Response timer expired for chat ${chatId} - activating secretary mode`);

                        // Remove the timer reference
                        const state = this.timers.get(chatId);
                        if (state) {
                            state.responseTimer = undefined;
                        }

                        // Execute callback (activate secretary mode)
                        await callback();

                        // Emit event
                        this.emit(TimerService.EVENTS.RESPONSE_TIMER_EXPIRED, { chatId });

                    } catch (error) {
                        console.error(`Error in response timer callback for chat ${chatId}:`, error);
                    }
                }, config.app.responseDelayMs)
            };

            this.timers.set(chatId, timerState);

            // Store timer in database for persistence
            this.storage.startTimer(chatId, 'response', config.app.responseDelayMs)
                .catch(error => console.error('Failed to persist response timer:', error));

        } catch (error) {
            console.error(`Failed to start response timer for chat ${chatId}:`, error);
        }
    }

    /**
     * Start a cooldown period (default 5 hours)
     */
    public startCooldown(chatId: string, duration: number = config.app.cooldownPeriodMs): void {
        try {
            console.log(`Starting cooldown for chat ${chatId} (${duration}ms)`);

            const timerState = this.timers.get(chatId) || {
                chatId,
                isInCooldown: false
            };

            // Clear any existing cooldown
            if (timerState.cooldownTimer) {
                clearTimeout(timerState.cooldownTimer);
            }

            // Clear any response timer as well
            if (timerState.responseTimer) {
                clearTimeout(timerState.responseTimer);
                timerState.responseTimer = undefined;
            }

            timerState.isInCooldown = true;
            timerState.lastResponseTime = Date.now();
            timerState.cooldownTimer = setTimeout(() => {
                timerState.isInCooldown = false;
                timerState.cooldownTimer = undefined;

                console.log(`Cooldown ended for chat ${chatId}`);
                this.emit(TimerService.EVENTS.COOLDOWN_ENDED, { chatId });
            }, duration);

            this.timers.set(chatId, timerState);

            // Store cooldown in database
            this.storage.startCooldown(chatId, duration)
                .catch(error => console.error('Failed to persist cooldown:', error));

            // Emit event
            this.emit(TimerService.EVENTS.COOLDOWN_STARTED, { chatId, duration });

        } catch (error) {
            console.error(`Failed to start cooldown for chat ${chatId}:`, error);
        }
    }

    /**
     * Handle when Gilad responds to a conversation
     */
    public handleGiladResponse(chatId: string): void {
        try {
            console.log(`Gilad responded to chat ${chatId}`);

            // Cancel any active response timer
            this.cancelTimer(chatId);

            // Start 5-hour cooldown
            this.startCooldown(chatId);

            // Emit event
            this.emit(TimerService.EVENTS.GILAD_RESPONDED, { chatId });

        } catch (error) {
            console.error(`Failed to handle Gilad response for chat ${chatId}:`, error);
        }
    }

    /**
     * Cancel any active timer for a chat
     */
    public cancelTimer(chatId: string): void {
        try {
            const timerState = this.timers.get(chatId);
            if (!timerState) {
                return;
            }

            let cancelled = false;

            // Clear response timer
            if (timerState.responseTimer) {
                clearTimeout(timerState.responseTimer);
                timerState.responseTimer = undefined;
                cancelled = true;
            }

            if (cancelled) {
                console.log(`Cancelled timer for chat ${chatId}`);
                this.emit(TimerService.EVENTS.TIMER_CANCELLED, { chatId });
            }
        } catch (error) {
            console.error(`Failed to cancel timer for chat ${chatId}:`, error);
        }
    }

    /**
     * Check if a chat is in cooldown
     */
    public isInCooldown(chatId: string): boolean {
        const timerState = this.timers.get(chatId);
        if (timerState?.isInCooldown) {
            return true;
        }

        // Also check database for persistence
        this.storage.isInCooldown(chatId)
            .then(isInCooldown => {
                if (isInCooldown && timerState) {
                    timerState.isInCooldown = true;
                }
            })
            .catch(error => console.error('Failed to check cooldown status:', error));

        return timerState?.isInCooldown ?? false;
    }

    /**
     * Get remaining time for timer or cooldown
     */
    public getRemainingTime(chatId: string): number {
        const timerState = this.timers.get(chatId);

        if (!timerState) {
            return 0;
        }

        // If in cooldown, calculate remaining cooldown time
        if (timerState.isInCooldown && timerState.lastResponseTime) {
            const elapsed = Date.now() - timerState.lastResponseTime;
            const remaining = config.app.cooldownPeriodMs - elapsed;
            return Math.max(0, remaining);
        }

        // If has response timer, we can't easily calculate remaining time from setTimeout
        // Return approximate time based on when it was started
        if (timerState.responseTimer) {
            return config.app.responseDelayMs; // Approximate
        }

        return 0;
    }

    /**
     * Get all active timers
     */
    public getActiveTimers(): TimerState[] {
        return Array.from(this.timers.values()).filter(timer =>
            timer.responseTimer || timer.cooldownTimer || timer.isInCooldown
        );
    }

    /**
     * Get timer statistics
     */
    public getTimerStats(): {
        totalTimers: number;
        activeResponseTimers: number;
        chatsInCooldown: number;
        activeTimers: number;
    } {
        const timers = Array.from(this.timers.values());

        return {
            totalTimers: timers.length,
            activeResponseTimers: timers.filter(t => t.responseTimer).length,
            chatsInCooldown: timers.filter(t => t.isInCooldown).length,
            activeTimers: timers.filter(t => t.responseTimer || t.cooldownTimer || t.isInCooldown).length
        };
    }

    /**
     * Restore timers from database after restart
     */
    private async restoreTimersFromDatabase(): Promise<void> {
        try {
            console.log('Restoring timers from database...');

            // Get all active conversations
            const conversations = await this.storage.getActiveConversations();

            for (const conv of conversations) {
                const chatId = conv.chat_id;

                // Check for active cooldowns
                const isInCooldown = await this.storage.isInCooldown(chatId);
                if (isInCooldown) {
                    const remainingTime = await this.storage.getRemainingCooldownTime(chatId);

                    if (remainingTime > 0) {
                        console.log(`Restoring cooldown for ${chatId}: ${remainingTime}ms remaining`);

                        const timerState: TimerState = {
                            chatId,
                            isInCooldown: true,
                            lastResponseTime: Date.now() - (config.app.cooldownPeriodMs - remainingTime),
                            cooldownTimer: setTimeout(() => {
                                const state = this.timers.get(chatId);
                                if (state) {
                                    state.isInCooldown = false;
                                    state.cooldownTimer = undefined;
                                }
                                console.log(`Restored cooldown ended for chat ${chatId}`);
                                this.emit(TimerService.EVENTS.COOLDOWN_ENDED, { chatId });
                            }, remainingTime)
                        };

                        this.timers.set(chatId, timerState);
                    }
                }

                // Check for active response timers
                const activeTimers = await this.storage.getActiveTimers(chatId, 'response');
                for (const timer of activeTimers) {
                    if (timer.end_time) {
                        const endTime = timer.end_time * 1000; // Convert to milliseconds
                        const remainingTime = endTime - Date.now();

                        if (remainingTime > 0) {
                            console.log(`Restoring response timer for ${chatId}: ${remainingTime}ms remaining`);

                            const timerState = this.timers.get(chatId) || {
                                chatId,
                                isInCooldown: false
                            } as TimerState;

                            timerState.responseTimer = setTimeout(() => {
                                console.log(`Restored response timer expired for chat ${chatId}`);
                                const state = this.timers.get(chatId);
                                if (state) {
                                    state.responseTimer = undefined;
                                }
                                this.emit(TimerService.EVENTS.RESPONSE_TIMER_EXPIRED, { chatId });
                            }, remainingTime);

                            this.timers.set(chatId, timerState);
                        } else {
                            // Timer already expired, end it in database
                            await this.storage.endTimer(timer.id);
                        }
                    }
                }
            }

            console.log(`Restored ${this.timers.size} timer states from database`);
        } catch (error) {
            console.error('Failed to restore timers from database:', error);
        }
    }

    /**
     * Clean up expired timers and perform maintenance
     */
    public async cleanup(): Promise<void> {
        try {
            console.log('Running timer cleanup...');

            const now = Date.now();
            const toRemove: string[] = [];

            // Clean up in-memory timers
            for (const [chatId, timerState] of this.timers.entries()) {
                let shouldRemove = true;

                // Keep if has active timers
                if (timerState.responseTimer || timerState.cooldownTimer) {
                    shouldRemove = false;
                }

                // Keep if in cooldown
                if (timerState.isInCooldown && timerState.lastResponseTime) {
                    const elapsed = now - timerState.lastResponseTime;
                    if (elapsed < config.app.cooldownPeriodMs) {
                        shouldRemove = false;
                    } else {
                        // Cooldown expired, clean it up
                        timerState.isInCooldown = false;
                        timerState.cooldownTimer = undefined;
                    }
                }

                // Remove if inactive for more than 24 hours
                if (shouldRemove) {
                    const lastActivity = timerState.lastResponseTime || 0;
                    if (now - lastActivity > 24 * 60 * 60 * 1000) {
                        toRemove.push(chatId);
                    }
                }
            }

            // Remove expired timers
            toRemove.forEach(chatId => {
                this.timers.delete(chatId);
                console.log(`Cleaned up expired timer for chat ${chatId}`);
            });

            // Run database cleanup
            const dbCleanupResult = await this.storage.cleanup();
            console.log('Database cleanup completed:', dbCleanupResult);

            // Log cleanup stats
            const stats = this.getTimerStats();
            console.log('Timer cleanup completed:', {
                removedTimers: toRemove.length,
                activeTimers: stats.activeTimers,
                totalTimers: stats.totalTimers
            });

        } catch (error) {
            console.error('Timer cleanup failed:', error);
        }
    }

    /**
     * Force clear cooldown (for admin/testing purposes)
     */
    public clearCooldown(chatId: string): void {
        try {
            const timerState = this.timers.get(chatId);
            if (timerState?.cooldownTimer) {
                clearTimeout(timerState.cooldownTimer);
                timerState.cooldownTimer = undefined;
                timerState.isInCooldown = false;
                console.log(`Manually cleared cooldown for chat ${chatId}`);
            }

            // Also clear in database
            this.storage.getActiveTimers(chatId, 'cooldown')
                .then(timers => {
                    return Promise.all(timers.map(timer => this.storage.endTimer(timer.id)));
                })
                .catch(error => console.error('Failed to clear cooldown in database:', error));

        } catch (error) {
            console.error(`Failed to clear cooldown for chat ${chatId}:`, error);
        }
    }

    /**
     * Check if service is initialized
     */
    public isReady(): boolean {
        return this.isInitialized;
    }

    /**
     * Get service health status
     */
    public async getHealthStatus(): Promise<{
        isHealthy: boolean;
        timersCount: number;
        activeTimers: number;
        lastCleanup: string;
        storage: any;
    }> {
        try {
            const stats = this.getTimerStats();
            const storageHealth = await this.storage.healthCheck();

            return {
                isHealthy: this.isInitialized && storageHealth.isHealthy,
                timersCount: stats.totalTimers,
                activeTimers: stats.activeTimers,
                lastCleanup: new Date().toISOString(),
                storage: storageHealth
            };
        } catch (error) {
            console.error('Health check failed:', error);
            return {
                isHealthy: false,
                timersCount: 0,
                activeTimers: 0,
                lastCleanup: 'Error',
                storage: null
            };
        }
    }

    /**
     * Destroy the service and clean up resources
     */
    public destroy(): void {
        try {
            console.log('Destroying TimerService...');

            // Cancel cleanup cron job
            if (this.cleanupCron) {
                this.cleanupCron.destroy();
            }

            // Clear all timers
            for (const timerState of this.timers.values()) {
                if (timerState.responseTimer) {
                    clearTimeout(timerState.responseTimer);
                }
                if (timerState.cooldownTimer) {
                    clearTimeout(timerState.cooldownTimer);
                }
            }

            // Clear timers map
            this.timers.clear();

            // Remove all event listeners
            this.removeAllListeners();

            this.isInitialized = false;
            console.log('TimerService destroyed');

        } catch (error) {
            console.error('Error destroying TimerService:', error);
        }
    }

    // Legacy compatibility methods

    /**
     * Schedule a response (legacy compatibility)
     */
    public scheduleResponse(chatId: string, callback: () => Promise<void>): void {
        this.startResponseTimer(chatId, callback);
    }

    /**
     * Cancel pending response (legacy compatibility)
     */
    public cancelResponse(chatId: string): void {
        this.cancelTimer(chatId);
    }

    /**
     * Get remaining cooldown time (legacy compatibility)
     */
    public getRemainingCooldownTime(chatId: string): number {
        return this.getRemainingTime(chatId);
    }

    /**
     * Clean up expired timers (legacy compatibility)
     */
    public cleanupExpiredTimers(): void {
        this.cleanup().catch(error => {
            console.error('Legacy cleanup failed:', error);
        });
    }
}