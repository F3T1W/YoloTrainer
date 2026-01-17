/**
 * Structured logging utility for renderer process.
 * Supports different log levels and can be configured for dev/prod environments.
 * @module logger
 */
(function (global) {
    'use strict';

    const LogLevel = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        NONE: 4
    };

    const LogLevelNames = {
        [LogLevel.DEBUG]: 'DEBUG',
        [LogLevel.INFO]: 'INFO',
        [LogLevel.WARN]: 'WARN',
        [LogLevel.ERROR]: 'ERROR'
    };

    class Logger {
        constructor(context = 'Renderer') {
            this.context = context;
            // In production, only show INFO and above. In dev, show all.
            const isDev = window.location && !window.location.href.includes('file://') || 
                         localStorage.getItem('yolo_debug_mode') === 'true';
            this.minLevel = isDev ? LogLevel.DEBUG : LogLevel.INFO;
        }

        /**
         * Sets the minimum log level.
         * @param {number} level - Minimum log level (LogLevel.DEBUG, LogLevel.INFO, etc.).
         */
        setLevel(level) {
            this.minLevel = level;
        }

        /**
         * Formats a log message with timestamp, level, context, and message.
         * @param {number} level - Log level.
         * @param {string} message - Log message.
         * @param {any} [data] - Additional data to log.
         * @returns {string} Formatted log message.
         */
        formatMessage(level, message, data) {
            const timestamp = new Date().toISOString();
            const levelName = LogLevelNames[level] || 'UNKNOWN';
            const contextStr = this.context ? `[${this.context}]` : '';
            
            let formatted = `${timestamp} ${levelName} ${contextStr} ${message}`;
            
            if (data !== undefined) {
                if (typeof data === 'object') {
                    try {
                        formatted += ' ' + JSON.stringify(data, null, 2);
                    } catch (e) {
                        formatted += ' [Object]';
                    }
                } else {
                    formatted += ' ' + String(data);
                }
            }
            
            return formatted;
        }

        /**
         * Logs a message if the level is >= minimum level.
         * @param {number} level - Log level.
         * @param {string} message - Log message.
         * @param {any} [data] - Additional data to log.
         */
        log(level, message, data) {
            if (level >= this.minLevel) {
                const formatted = this.formatMessage(level, message, data);
                
                switch (level) {
                    case LogLevel.DEBUG:
                    case LogLevel.INFO:
                        console.log(formatted);
                        break;
                    case LogLevel.WARN:
                        console.warn(formatted);
                        break;
                    case LogLevel.ERROR:
                        console.error(formatted);
                        break;
                }
            }
        }

        /**
         * Logs a debug message.
         * @param {string} message - Log message.
         * @param {any} [data] - Additional data to log.
         */
        debug(message, data) {
            this.log(LogLevel.DEBUG, message, data);
        }

        /**
         * Logs an info message.
         * @param {string} message - Log message.
         * @param {any} [data] - Additional data to log.
         */
        info(message, data) {
            this.log(LogLevel.INFO, message, data);
        }

        /**
         * Logs a warning message.
         * @param {string} message - Log message.
         * @param {any} [data] - Additional data to log.
         */
        warn(message, data) {
            this.log(LogLevel.WARN, message, data);
        }

        /**
         * Logs an error message.
         * @param {string} message - Log message.
         * @param {Error|any} [error] - Error object or additional data.
         */
        error(message, error) {
            if (error instanceof Error) {
                this.log(LogLevel.ERROR, message, {
                    message: error.message,
                    stack: error.stack
                });
            } else {
                this.log(LogLevel.ERROR, message, error);
            }
        }

        /**
         * Creates a child logger with a specific context.
         * @param {string} context - Context name for the child logger.
         * @returns {Logger} New logger instance with the specified context.
         */
        child(context) {
            const childLogger = new Logger(`${this.context}:${context}`);
            childLogger.setLevel(this.minLevel);
            return childLogger;
        }
    }

    // Create default logger instance
    const defaultLogger = new Logger('App');

    /**
     * Helper function to safely log errors with fallback to console.
     * @param {string} message - Error message.
     * @param {Error|any} error - Error object or additional data.
     */
    function safeError(message, error) {
        if (defaultLogger) {
            defaultLogger.error(message, error);
        } else {
            console.error(message, error);
        }
    }

    /**
     * Helper function to safely log debug messages.
     * @param {string} message - Debug message.
     * @param {any} data - Additional data.
     */
    function safeDebug(message, data) {
        if (defaultLogger) {
            defaultLogger.debug(message, data);
        } else {
            console.log(message, data);
        }
    }

    global.Logger = Logger;
    global.LogLevel = LogLevel;
    global.logger = defaultLogger;
    global.createLogger = (context) => new Logger(context);
    global.safeError = safeError;
    global.safeDebug = safeDebug;
})(typeof window !== 'undefined' ? window : this);
