/**
 * Navigation Module
 * Handles page navigation and image navigation in annotation and test modes.
 */

(function(global) {
    'use strict';
    
    const Navigation = {
        /**
         * Switches between different pages in the application.
         * @param {string} pageName - Name of the page to display ('home', 'download', 'classes', 'annotate', 'train', 'test', 'settings').
         * @param {Object} [options] - Optional configuration.
         * @param {boolean} [options.threeStepSystemEnabled] - Whether three-step system is enabled.
         * @param {Function} [options.setupThreeStepTraining] - Callback to setup three-step training.
         */
        showPage(pageName, options = {}) {
            // Hide all pages
            document.querySelectorAll('.page-container').forEach(page => {
                page.classList.remove('active');
            });
            
            // Show selected page
            const targetPage = document.getElementById(`page-${pageName}`);
            if (targetPage) {
                targetPage.classList.add('active');
            }
            
            // Update menu items
            document.querySelectorAll('.menu-item').forEach(item => {
                item.classList.remove('active');
                if (item.dataset.page === pageName) {
                    item.classList.add('active');
                }
            });
            
            // Close sidebar on mobile after selection
            if (window.innerWidth < 768) {
                const sidebar = document.getElementById('sidebarMenu');
                const sidebarOverlay = document.getElementById('sidebarOverlay');
                if (sidebar) {
                    sidebar.classList.remove('show');
                }
                if (sidebarOverlay) {
                    sidebarOverlay.classList.remove('show');
                }
            }
            
            // If navigating to train page, check if we need to unlock fields
            if (pageName === 'train' && !options.threeStepSystemEnabled) {
                if (options.setupThreeStepTraining) {
                    setTimeout(() => {
                        options.setupThreeStepTraining();
                    }, 100);
                }
            }
        },

        /**
         * Navigates to the previous or next image in annotation mode.
         * @param {number} direction - Navigation direction (-1 for previous, 1 for next).
         * @param {Object} state - Current annotation state.
         * @param {number} state.currentImageIndex - Current image index.
         * @param {Array} state.images - Array of image filenames.
         * @param {Function} state.loadImage - Function to load an image by index.
         * @param {Function} state.clearAnnotations - Function to clear current annotations.
         */
        navigateImage(direction, state) {
            // Clear current annotations before navigating to prevent them from being carried over
            if (state.clearAnnotations) {
                state.clearAnnotations();
            }
            
            const newIndex = state.currentImageIndex + direction;
            if (newIndex >= 0 && newIndex < state.images.length) {
                if (state.loadImage) {
                    state.loadImage(newIndex);
                }
            }
        },

        /**
         * Navigates to the previous or next image in test mode.
         * @param {number} direction - Navigation direction (-1 for previous, 1 for next).
         * @param {Object} state - Current test state.
         * @param {number} state.currentImageIndex - Current image index.
         * @param {Array} state.images - Array of image filenames.
         * @param {Function} state.loadImage - Function to load a test image by index.
         */
        async navigateTestImage(direction, state) {
            const newIndex = state.currentImageIndex + direction;
            if (newIndex >= 0 && newIndex < state.images.length) {
                if (state.loadImage) {
                    await state.loadImage(newIndex);
                }
            }
        },

        /**
         * Updates the visual status of a workflow step.
         * @param {string} step - Step name ('download', 'classes', 'annotate', 'train').
         * @param {boolean} isReady - Whether the step is ready to proceed.
         * @param {Object} workflowStatus - Workflow status object to update.
         */
        updateStepStatus(step, isReady, workflowStatus) {
            workflowStatus[step] = isReady;
            
            const menuItem = document.getElementById(`menu-${step}`);
            const statusIcon = document.getElementById(`status-${step}`);
            
            if (statusIcon) {
                if (isReady) {
                    statusIcon.innerHTML = '<i class="bi bi-check-circle-fill text-success"></i>';
                } else {
                    statusIcon.innerHTML = '<i class="bi bi-circle text-muted"></i>';
                }
            }
            
            // Enable/disable menu item
            if (menuItem) {
                if (isReady) {
                    menuItem.classList.remove('disabled');
                } else {
                    menuItem.classList.add('disabled');
                }
            }
        }
    };

    // Export to global scope
    global.Navigation = Navigation;
    
})(typeof window !== 'undefined' ? window : global);
