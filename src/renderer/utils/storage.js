/**
 * Storage Utility Module
 * Provides a convenient API for managing localStorage data with typed access.
 */

(function(global) {
    'use strict';
    
    const STORAGE_KEYS = {
        CLASSES: 'yolo_classes',
        SELECTED_CLASS: 'yolo_selected_class',
        LANGUAGE: 'yolo_language',
        THREE_STEP_ENABLED: 'yolo_three_step_enabled',
        THREE_STEP_STAGE: 'yolo_three_step_stage',
        THREE_STEP_CLASS_NAME: 'yolo_three_step_class_name',
        THREE_STEP_BASE_PATH: 'yolo_three_step_base_path',
        THREE_STEP_MODEL_PATH: 'yolo_three_step_model_path',
        STAT_DATASETS: 'yolo_stat_datasets',
        STAT_IMAGES: 'yolo_stat_images',
        STAT_MODELS: 'yolo_stat_models'
    };
    
    const Storage = {
        // --- Classes Management ---
        
        /**
         * Gets the saved classes list.
         * @returns {string[]} Array of class names.
         */
        getClasses() {
            const saved = localStorage.getItem(STORAGE_KEYS.CLASSES);
            return saved ? JSON.parse(saved) : [];
        },
        
        /**
         * Saves the classes list.
         * @param {string[]} classes - Array of class names.
         */
        setClasses(classes) {
            localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(classes));
        },
        
        /**
         * Gets the currently selected class.
         * @returns {string|null} Selected class name or null.
         */
        getSelectedClass() {
            return localStorage.getItem(STORAGE_KEYS.SELECTED_CLASS);
        },
        
        /**
         * Sets the currently selected class.
         * @param {string} className - Class name to select.
         */
        setSelectedClass(className) {
            localStorage.setItem(STORAGE_KEYS.SELECTED_CLASS, className);
        },
        
        /**
         * Clears all classes data.
         */
        clearClasses() {
            localStorage.removeItem(STORAGE_KEYS.CLASSES);
            localStorage.removeItem(STORAGE_KEYS.SELECTED_CLASS);
        },
        
        // --- Language Management ---
        
        /**
         * Gets the current language setting.
         * @returns {string} Language code ('en' or 'ru').
         */
        getLanguage() {
            return localStorage.getItem(STORAGE_KEYS.LANGUAGE) || 'en';
        },
        
        /**
         * Sets the current language.
         * @param {string} lang - Language code ('en' or 'ru').
         */
        setLanguage(lang) {
            localStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
        },
        
        // --- Three-Step System Management ---
        
        /**
         * Gets the three-step system state.
         * @returns {Object} Three-step system state.
         * @returns {boolean} returns.enabled - Whether three-step system is enabled.
         * @returns {number} returns.stage - Current stage (1, 2, 3, or 3.5).
         * @returns {string} returns.className - Class name.
         * @returns {string} returns.basePath - Base path.
         * @returns {string} returns.modelPath - Model path.
         */
        getThreeStepState() {
            return {
                enabled: localStorage.getItem(STORAGE_KEYS.THREE_STEP_ENABLED) === 'true',
                stage: parseFloat(localStorage.getItem(STORAGE_KEYS.THREE_STEP_STAGE) || '1'),
                className: localStorage.getItem(STORAGE_KEYS.THREE_STEP_CLASS_NAME) || '',
                basePath: localStorage.getItem(STORAGE_KEYS.THREE_STEP_BASE_PATH) || '',
                modelPath: localStorage.getItem(STORAGE_KEYS.THREE_STEP_MODEL_PATH) || ''
            };
        },
        
        /**
         * Sets the three-step system enabled state.
         * @param {boolean} enabled - Whether three-step system is enabled.
         */
        setThreeStepEnabled(enabled) {
            localStorage.setItem(STORAGE_KEYS.THREE_STEP_ENABLED, enabled.toString());
        },
        
        /**
         * Sets the three-step system stage.
         * @param {number} stage - Stage number (1, 2, 3, or 3.5).
         */
        setThreeStepStage(stage) {
            localStorage.setItem(STORAGE_KEYS.THREE_STEP_STAGE, stage.toString());
        },
        
        /**
         * Sets the three-step system class name.
         * @param {string} className - Class name.
         */
        setThreeStepClassName(className) {
            localStorage.setItem(STORAGE_KEYS.THREE_STEP_CLASS_NAME, className);
        },
        
        /**
         * Sets the three-step system base path.
         * @param {string} basePath - Base path.
         */
        setThreeStepBasePath(basePath) {
            localStorage.setItem(STORAGE_KEYS.THREE_STEP_BASE_PATH, basePath);
        },
        
        /**
         * Sets the three-step system model path.
         * @param {string} modelPath - Model path.
         */
        setThreeStepModelPath(modelPath) {
            localStorage.setItem(STORAGE_KEYS.THREE_STEP_MODEL_PATH, modelPath);
        },
        
        /**
         * Clears all three-step system data.
         */
        clearThreeStepData() {
            localStorage.removeItem(STORAGE_KEYS.THREE_STEP_ENABLED);
            localStorage.removeItem(STORAGE_KEYS.THREE_STEP_STAGE);
            localStorage.removeItem(STORAGE_KEYS.THREE_STEP_CLASS_NAME);
            localStorage.removeItem(STORAGE_KEYS.THREE_STEP_BASE_PATH);
            localStorage.removeItem(STORAGE_KEYS.THREE_STEP_MODEL_PATH);
        },
        
        // --- Statistics Management ---
        
        /**
         * Gets all statistics data.
         * @returns {Object} Statistics object.
         * @returns {number} returns.datasets - Number of datasets.
         * @returns {number} returns.images - Number of images.
         * @returns {number} returns.models - Number of models.
         */
        getStatistics() {
            return {
                datasets: parseInt(localStorage.getItem(STORAGE_KEYS.STAT_DATASETS) || '0'),
                images: parseInt(localStorage.getItem(STORAGE_KEYS.STAT_IMAGES) || '0'),
                models: parseInt(localStorage.getItem(STORAGE_KEYS.STAT_MODELS) || '0')
            };
        },
        
        /**
         * Increments the datasets counter.
         * @param {number} [amount=1] - Amount to increment by.
         * @returns {number} New datasets count.
         */
        incrementDatasets(amount = 1) {
            const current = parseInt(localStorage.getItem(STORAGE_KEYS.STAT_DATASETS) || '0');
            const newValue = current + amount;
            localStorage.setItem(STORAGE_KEYS.STAT_DATASETS, newValue.toString());
            return newValue;
        },
        
        /**
         * Increments the images counter.
         * @param {number} [amount=1] - Amount to increment by.
         * @returns {number} New images count.
         */
        incrementImages(amount = 1) {
            const current = parseInt(localStorage.getItem(STORAGE_KEYS.STAT_IMAGES) || '0');
            const newValue = current + amount;
            localStorage.setItem(STORAGE_KEYS.STAT_IMAGES, newValue.toString());
            return newValue;
        },
        
        /**
         * Increments the models counter.
         * @param {number} [amount=1] - Amount to increment by.
         * @returns {number} New models count.
         */
        incrementModels(amount = 1) {
            const current = parseInt(localStorage.getItem(STORAGE_KEYS.STAT_MODELS) || '0');
            const newValue = current + amount;
            localStorage.setItem(STORAGE_KEYS.STAT_MODELS, newValue.toString());
            return newValue;
        },
        
        /**
         * Sets the datasets count.
         * @param {number} count - New datasets count.
         */
        setDatasets(count) {
            localStorage.setItem(STORAGE_KEYS.STAT_DATASETS, count.toString());
        },
        
        /**
         * Sets the images count.
         * @param {number} count - New images count.
         */
        setImages(count) {
            localStorage.setItem(STORAGE_KEYS.STAT_IMAGES, count.toString());
        },
        
        /**
         * Sets the models count.
         * @param {number} count - New models count.
         */
        setModels(count) {
            localStorage.setItem(STORAGE_KEYS.STAT_MODELS, count.toString());
        },
        
        /**
         * Clears all statistics.
         */
        clearStatistics() {
            localStorage.removeItem(STORAGE_KEYS.STAT_DATASETS);
            localStorage.removeItem(STORAGE_KEYS.STAT_IMAGES);
            localStorage.removeItem(STORAGE_KEYS.STAT_MODELS);
        },
        
        // --- Generic Methods ---
        
        /**
         * Gets a value from localStorage.
         * @param {string} key - Storage key.
         * @param {*} [defaultValue=null] - Default value if key doesn't exist.
         * @returns {*} Stored value or default.
         */
        get(key, defaultValue = null) {
            const value = localStorage.getItem(key);
            return value !== null ? value : defaultValue;
        },
        
        /**
         * Sets a value in localStorage.
         * @param {string} key - Storage key.
         * @param {*} value - Value to store (will be converted to string).
         */
        set(key, value) {
            localStorage.setItem(key, String(value));
        },
        
        /**
         * Removes a value from localStorage.
         * @param {string} key - Storage key.
         */
        remove(key) {
            localStorage.removeItem(key);
        },
        
        /**
         * Clears all YOLO Trainer data from localStorage.
         */
        clearAll() {
            Object.values(STORAGE_KEYS).forEach(key => {
                localStorage.removeItem(key);
            });
        },
        
        /**
         * Gets all YOLO Trainer storage keys.
         * @returns {Object} Object with all storage key names.
         */
        getKeys() {
            return {...STORAGE_KEYS};
        }
    };

    // Export to global scope
    global.Storage = Storage;
    
})(typeof window !== 'undefined' ? window : global);
