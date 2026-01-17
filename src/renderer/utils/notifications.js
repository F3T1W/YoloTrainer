/**
 * Notifications Utility Module
 * Handles toast notifications with translation support and queue management.
 */

(function(global) {
    'use strict';
    
    // Toast notification queue management
    let activeToasts = [];
    const MAX_TOASTS = 3;
    
    const Notifications = {
        /**
         * Translates a message key using the current language setting.
         * @param {string} key - Translation key.
         * @param {...any} args - Arguments to replace placeholders {0}, {1}, etc.
         * @returns {string} Translated message or key if translation not found.
         */
        translateMessage(key, ...args) {
            const currentLang = localStorage.getItem('yolo_language') || 'en';
            
            if (!window.translations || !window.translations[currentLang]) {
                return key; // Fallback to key if translations not available
            }
            
            let message = window.translations[currentLang][key] || window.translations.en[key] || key;
            
            // Replace placeholders {0}, {1}, etc. with arguments
            args.forEach((arg, index) => {
                message = message.replace(`{${index}}`, String(arg));
            });
            
            return message;
        },

        /**
         * Creates and appends a toast container to the document body.
         * @returns {HTMLElement} The created toast container element.
         */
        createToastContainer() {
            const container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container position-fixed top-0 end-0 p-3';
            container.style.zIndex = '9999';
            document.body.appendChild(container);
            return container;
        },

        /**
         * Displays a toast notification message.
         * Supports translation keys (starting with 'msg-') and manages a queue of max 3 toasts.
         * @param {string} message - Message text or translation key (starts with 'msg-').
         * @param {string} [type='info'] - Toast type ('info', 'success', 'warning', 'danger').
         */
        showMessage(message, type = 'info') {
            let displayMessage = message;
            if (message.startsWith('msg-')) {
                const parts = message.split(':');
                const key = parts[0];
                const args = parts.slice(1);
                displayMessage = this.translateMessage(key, ...args);
            }
            
            const toastContainer = document.getElementById('toastContainer') || this.createToastContainer();
            
            // Remove oldest toast if we have reached the limit
            if (activeToasts.length >= MAX_TOASTS) {
                const oldestToast = activeToasts.shift();
                if (oldestToast && typeof bootstrap !== 'undefined') {
                    const bsToast = bootstrap.Toast.getInstance(oldestToast);
                    if (bsToast) {
                        bsToast.hide();
                    }
                } else if (oldestToast) {
                    oldestToast.classList.remove('show');
                    setTimeout(() => oldestToast.remove(), 300);
                }
            }
            
            const toast = document.createElement('div');
            toast.className = `toast align-items-center text-white bg-${type} border-0`;
            toast.setAttribute('role', 'alert');
            toast.innerHTML = `
                <div class="d-flex">
                    <div class="toast-body">${displayMessage}</div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
                </div>
            `;
            
            toastContainer.appendChild(toast);
            activeToasts.push(toast);
            
            if (typeof bootstrap !== 'undefined') {
                const bsToast = new bootstrap.Toast(toast);
                bsToast.show();
            } else {
                // Fallback if bootstrap object is not available directly
                toast.classList.add('show');
                setTimeout(() => {
                    toast.classList.remove('show');
                    setTimeout(() => {
                        toast.remove();
                        const index = activeToasts.indexOf(toast);
                        if (index > -1) {
                            activeToasts.splice(index, 1);
                        }
                    }, 300);
                }, 3000);
                return;
            }
            
            toast.addEventListener('hidden.bs.toast', () => {
                toast.remove();
                const index = activeToasts.indexOf(toast);
                if (index > -1) {
                    activeToasts.splice(index, 1);
                }
            });
        },

        /**
         * Displays a success toast notification.
         * @param {string} message - Message text or translation key.
         */
        showSuccess(message) {
            this.showMessage(message, 'success');
        },

        /**
         * Displays an error toast notification.
         * @param {string} message - Message text or translation key.
         */
        showError(message) {
            this.showMessage(message, 'danger');
        },

        /**
         * Displays a warning toast notification.
         * @param {string} message - Message text or translation key.
         */
        showWarning(message) {
            this.showMessage(message, 'warning');
        },

        /**
         * Displays an info toast notification.
         * @param {string} message - Message text or translation key.
         */
        showInfo(message) {
            this.showMessage(message, 'info');
        },

        /**
         * Gets the current active toasts count.
         * @returns {number} Number of currently active toasts.
         */
        getActiveToastsCount() {
            return activeToasts.length;
        },

        /**
         * Clears all active toasts.
         */
        clearAll() {
            activeToasts.forEach(toast => {
                if (typeof bootstrap !== 'undefined') {
                    const bsToast = bootstrap.Toast.getInstance(toast);
                    if (bsToast) {
                        bsToast.hide();
                    }
                } else {
                    toast.classList.remove('show');
                    setTimeout(() => toast.remove(), 300);
                }
            });
            activeToasts = [];
        }
    };

    // Export to global scope
    global.Notifications = Notifications;
    
})(typeof window !== 'undefined' ? window : global);
