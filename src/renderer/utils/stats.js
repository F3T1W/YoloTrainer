/**
 * Statistics Utility Module
 * Handles application statistics (datasets, images, models) with UI updates.
 * Requires: Storage module
 */

(function(global) {
    'use strict';
    
    const Stats = {
        /**
         * Updates the statistics display in the UI.
         * Fetches current values from Storage and updates DOM elements.
         */
        update() {
            if (!global.Storage) {
                console.warn('Storage module not loaded, stats update skipped');
                return;
            }
            
            const stats = global.Storage.getStatistics();
            
            const statDatasets = document.getElementById('stat-datasets');
            const statImages = document.getElementById('stat-images');
            const statModels = document.getElementById('stat-models');
            
            if (statDatasets) statDatasets.textContent = stats.datasets;
            if (statImages) statImages.textContent = stats.images;
            if (statModels) statModels.textContent = stats.models;
        },
        
        /**
         * Gets current statistics values.
         * @returns {Object} Statistics object.
         * @returns {number} returns.datasets - Number of datasets.
         * @returns {number} returns.images - Number of images.
         * @returns {number} returns.models - Number of models.
         */
        get() {
            if (!global.Storage) {
                return { datasets: 0, images: 0, models: 0 };
            }
            return global.Storage.getStatistics();
        },
        
        /**
         * Increments the datasets counter and updates UI.
         * @param {number} [amount=1] - Amount to increment by.
         */
        incrementDatasets(amount = 1) {
            if (!global.Storage) {
                console.warn('Storage module not loaded');
                return;
            }
            global.Storage.incrementDatasets(amount);
            this.update();
        },
        
        /**
         * Increments the images counter and updates UI.
         * @param {number} [count=1] - Number of images to add.
         */
        incrementImages(count = 1) {
            if (!global.Storage) {
                console.warn('Storage module not loaded');
                return;
            }
            global.Storage.incrementImages(count);
            this.update();
        },
        
        /**
         * Increments the models counter and updates UI.
         * @param {number} [amount=1] - Amount to increment by.
         */
        incrementModels(amount = 1) {
            if (!global.Storage) {
                console.warn('Storage module not loaded');
                return;
            }
            global.Storage.incrementModels(amount);
            this.update();
        },
        
        /**
         * Sets the datasets count and updates UI.
         * @param {number} count - New datasets count.
         */
        setDatasets(count) {
            if (!global.Storage) {
                console.warn('Storage module not loaded');
                return;
            }
            global.Storage.setDatasets(count);
            this.update();
        },
        
        /**
         * Sets the images count and updates UI.
         * @param {number} count - New images count.
         */
        setImages(count) {
            if (!global.Storage) {
                console.warn('Storage module not loaded');
                return;
            }
            global.Storage.setImages(count);
            this.update();
        },
        
        /**
         * Sets the models count and updates UI.
         * @param {number} count - New models count.
         */
        setModels(count) {
            if (!global.Storage) {
                console.warn('Storage module not loaded');
                return;
            }
            global.Storage.setModels(count);
            this.update();
        },
        
        /**
         * Resets all statistics to zero and updates UI.
         */
        reset() {
            if (!global.Storage) {
                console.warn('Storage module not loaded');
                return;
            }
            global.Storage.clearStatistics();
            this.update();
        },
        
        /**
         * Formats a number with thousand separators.
         * @param {number} num - Number to format.
         * @returns {string} Formatted number (e.g., "1,234").
         */
        formatNumber(num) {
            return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        },
        
        /**
         * Updates statistics display with formatted numbers.
         */
        updateFormatted() {
            if (!global.Storage) {
                console.warn('Storage module not loaded');
                return;
            }
            
            const stats = global.Storage.getStatistics();
            
            const statDatasets = document.getElementById('stat-datasets');
            const statImages = document.getElementById('stat-images');
            const statModels = document.getElementById('stat-models');
            
            if (statDatasets) statDatasets.textContent = this.formatNumber(stats.datasets);
            if (statImages) statImages.textContent = this.formatNumber(stats.images);
            if (statModels) statModels.textContent = this.formatNumber(stats.models);
        }
    };

    // Export to global scope
    global.Stats = Stats;
    
})(typeof window !== 'undefined' ? window : global);
