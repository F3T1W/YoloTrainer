/**
 * Centralized application state management.
 * Replaces global variables with a structured API.
 */
(function (global) {
    'use strict';

    // Admin mode state
    var adminModeEnabled = false;
    var logoClickTimes = [];
    var LOGO_CLICK_TIMEOUT = 1000;

    // Dataset state
    var currentDatasetPath = null;
    var images = [];
    var currentImageIndex = 0;

    // Test page state
    var testImages = [];
    var testCurrentImageIndex = 0;
    var testDatasetPath = null;
    var testCurrentImage = null;
    var testCanvas = null;
    var testCtx = null;

    // Workflow status
    var workflowStatus = {
        download: false,
        classes: false,
        annotate: false,
        train: false
    };

    global.AppState = {
        // Admin mode
        getAdminModeEnabled: function () { return adminModeEnabled; },
        setAdminModeEnabled: function (enabled) { adminModeEnabled = enabled; },
        getLogoClickTimes: function () { return logoClickTimes; },
        setLogoClickTimes: function (times) { logoClickTimes = times; },
        addLogoClick: function (time) { logoClickTimes.push(time); },
        clearLogoClickTimes: function () { logoClickTimes = []; },
        getLogoClickTimeout: function () { return LOGO_CLICK_TIMEOUT; },

        // Dataset
        getCurrentDatasetPath: function () { return currentDatasetPath; },
        setCurrentDatasetPath: function (path) { currentDatasetPath = path; },
        getImages: function () { return images; },
        setImages: function (imgs) { images = imgs; },
        getCurrentImageIndex: function () { return currentImageIndex; },
        setCurrentImageIndex: function (index) { currentImageIndex = index; },

        // Test page
        getTestImages: function () { return testImages; },
        setTestImages: function (imgs) { testImages = imgs; },
        getTestCurrentImageIndex: function () { return testCurrentImageIndex; },
        setTestCurrentImageIndex: function (index) { testCurrentImageIndex = index; },
        getTestDatasetPath: function () { return testDatasetPath; },
        setTestDatasetPath: function (path) { testDatasetPath = path; },
        getTestCurrentImage: function () { return testCurrentImage; },
        setTestCurrentImage: function (img) { testCurrentImage = img; },
        getTestCanvas: function () { return testCanvas; },
        setTestCanvas: function (canvas) { testCanvas = canvas; },
        getTestCtx: function () { return testCtx; },
        setTestCtx: function (ctx) { testCtx = ctx; },

        // Workflow status
        getWorkflowStatus: function () { return Object.assign({}, workflowStatus); },
        setWorkflowStatus: function (status) { workflowStatus = Object.assign({}, status); },
        updateWorkflowStatus: function (step, isReady) {
            if (workflowStatus.hasOwnProperty(step)) {
                workflowStatus[step] = isReady;
            }
        },
        getWorkflowStepStatus: function (step) {
            return workflowStatus[step] || false;
        }
    };
})(typeof window !== 'undefined' ? window : this);
