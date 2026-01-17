/**
 * Centralized error handling utility.
 * Provides consistent error messages and logging.
 * @module error-handler
 */
(function (global) {
    'use strict';

    /**
     * Error types for classification.
     */
    const ErrorType = {
        NETWORK: 'network',
        FILE_SYSTEM: 'file_system',
        PYTHON: 'python',
        VALIDATION: 'validation',
        PERMISSION: 'permission',
        UNKNOWN: 'unknown'
    };

/**
 * Classifies an error based on its message or properties.
 * @param {Error|string} error - The error to classify.
 * @returns {string} Error type.
 */
function classifyError(error) {
    const errorMessage = typeof error === 'string' ? error : (error.message || String(error));
    const lowerMessage = errorMessage.toLowerCase();

    if (lowerMessage.includes('network') || 
        lowerMessage.includes('connection') || 
        lowerMessage.includes('timeout') ||
        lowerMessage.includes('dns') ||
        lowerMessage.includes('econnrefused') ||
        lowerMessage.includes('enotfound')) {
        return ErrorType.NETWORK;
    }

    if (lowerMessage.includes('enoent') ||
        lowerMessage.includes('file not found') ||
        lowerMessage.includes('directory') ||
        lowerMessage.includes('path') ||
        lowerMessage.includes('cannot find')) {
        return ErrorType.FILE_SYSTEM;
    }

    if (lowerMessage.includes('permission') ||
        lowerMessage.includes('eacces') ||
        lowerMessage.includes('access denied') ||
        lowerMessage.includes('unauthorized')) {
        return ErrorType.PERMISSION;
    }

    if (lowerMessage.includes('python') ||
        lowerMessage.includes('module') ||
        lowerMessage.includes('import') ||
        lowerMessage.includes('syntax error') ||
        lowerMessage.includes('process exited')) {
        return ErrorType.PYTHON;
    }

    if (lowerMessage.includes('invalid') ||
        lowerMessage.includes('validation') ||
        lowerMessage.includes('required') ||
        lowerMessage.includes('missing')) {
        return ErrorType.VALIDATION;
    }

    return ErrorType.UNKNOWN;
}

/**
 * Gets a user-friendly error message based on error type.
 * @param {Error|string} error - The error to process.
 * @param {string} [context] - Additional context about where the error occurred.
 * @returns {string} User-friendly error message.
 */
function getUserFriendlyMessage(error, context = '') {
    const errorMessage = typeof error === 'string' ? error : (error.message || String(error));
    const errorType = classifyError(error);
    const contextPrefix = context ? `${context}: ` : '';

    switch (errorType) {
        case ErrorType.NETWORK:
            return `${contextPrefix}Network error. Please check your internet connection and try again.`;
        
        case ErrorType.FILE_SYSTEM:
            if (errorMessage.includes('not found') || errorMessage.includes('enoent')) {
                return `${contextPrefix}File or folder not found. Please check the path and try again.`;
            }
            return `${contextPrefix}File system error. Please check file permissions and try again.`;
        
        case ErrorType.PERMISSION:
            return `${contextPrefix}Permission denied. Please check file permissions and try again.`;
        
        case ErrorType.PYTHON:
            if (errorMessage.includes('not found') || errorMessage.includes('command')) {
                return `${contextPrefix}Python not found. Please install Python 3.8+ and try again.`;
            }
            if (errorMessage.includes('module') || errorMessage.includes('import')) {
                return `${contextPrefix}Python package missing. Please install required packages.`;
            }
            if (errorMessage.includes('process exited')) {
                return `${contextPrefix}Python script failed. Check the logs for details.`;
            }
            return `${contextPrefix}Python error: ${errorMessage}`;
        
        case ErrorType.VALIDATION:
            return `${contextPrefix}${errorMessage}`;
        
        default:
            // For unknown errors, try to extract meaningful part
            const shortMessage = errorMessage.length > 100 
                ? errorMessage.substring(0, 100) + '...' 
                : errorMessage;
            return `${contextPrefix}${shortMessage}`;
    }
}

/**
 * Logs an error with context information.
 * @param {Error|string} error - The error to log.
 * @param {string} [context] - Context where the error occurred.
 * @param {Object} [additionalInfo] - Additional information to log.
 */
function logError(error, context = '', additionalInfo = {}) {
    const errorMessage = typeof error === 'string' ? error : (error.message || String(error));
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorType = classifyError(error);

    const logData = {
        timestamp: new Date().toISOString(),
        type: errorType,
        message: errorMessage,
        context: context || 'Unknown',
        ...additionalInfo
    };

    if (errorStack) {
        logData.stack = errorStack;
    }

    if (typeof window !== 'undefined' && window.logger) {
        window.logger.error('[Error Handler]', logData);
    } else {
        console.error('[Error Handler]', logData);
    }
}

    /**
     * Handles an error: logs it and returns a user-friendly message.
     * @param {Error|string} error - The error to handle.
     * @param {string} [context] - Context where the error occurred.
     * @param {Object} [additionalInfo] - Additional information to log.
     * @returns {string} User-friendly error message.
     */
    function handleError(error, context = '', additionalInfo = {}) {
        logError(error, context, additionalInfo);
        return getUserFriendlyMessage(error, context);
    }

    /**
     * Wraps an async function with error handling.
     * @param {Function} asyncFn - The async function to wrap.
     * @param {string} [context] - Context for error messages.
     * @returns {Function} Wrapped function that handles errors.
     */
    function withErrorHandling(asyncFn, context = '') {
        return async (...args) => {
            try {
                return await asyncFn(...args);
            } catch (error) {
                const friendlyMessage = handleError(error, context, { args });
                throw new Error(friendlyMessage);
            }
        };
    }

    /**
     * Creates a safe async handler that catches errors and shows messages.
     * @param {Function} asyncFn - The async function to wrap.
     * @param {Function} showMessage - Function to show error messages to user.
     * @param {string} [context] - Context for error messages.
     * @returns {Function} Safe async function.
     */
    function createSafeHandler(asyncFn, showMessage, context = '') {
        return async (...args) => {
            try {
                return await asyncFn(...args);
            } catch (error) {
                const friendlyMessage = handleError(error, context);
                if (showMessage) {
                    showMessage(friendlyMessage, 'danger');
                }
                return { success: false, error: friendlyMessage };
            }
        };
    }

    global.ErrorHandler = {
        ErrorType: ErrorType,
        handleError: handleError,
        withErrorHandling: withErrorHandling,
        createSafeHandler: createSafeHandler,
        classifyError: classifyError,
        getUserFriendlyMessage: getUserFriendlyMessage,
        logError: logError
    };
})(typeof window !== 'undefined' ? window : this);
