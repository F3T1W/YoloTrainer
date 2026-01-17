// Admin mode state - now managed by AppState

// Make functions available globally for onclick handlers
window.showPage = showPage;
window.handleLoadDataset = handleLoadDataset;
window.saveAnnotation = saveAnnotation;
window.clearAnnotations = AnnotationCore.clearAnnotations;
window.undoAnnotation = AnnotationCore.undoAnnotation;
window.handleAutoLabel = handleAutoLabel;
window.toggleAutoLabel = toggleAutoLabel;
window.toggleThreeStepSystem = ThreeStep.toggleThreeStepSystem;
window.toggleAdminMode = toggleAdminMode;
window.handleFinishAnnotate = ThreeStep.handleFinishAnnotate;

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

/**
 * Initializes the annotation application.
 * Sets up keyboard shortcuts, event listeners, and loads initial state.
 */
function init() {
    if (window.logger) {
        window.logger.info('Annotation script initialized');
    } else {
        if (window.logger) {
            window.logger.info('Annotation script initialized');
        }
    }
    
    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ignore if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        // Annotation page shortcuts
        const annotatePage = document.getElementById('page-annotate');
        if (annotatePage && annotatePage.classList.contains('active')) {
        if (e.key === 'Enter' || e.key === 'ArrowRight' || e.code === 'Space') {
                e.preventDefault();
            saveAnnotation();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateImage(-1);
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            AnnotationCore.undoAnnotation();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            AnnotationCore.undoAnnotation(); 
            }
            return;
        }
        
        // Test page shortcuts
        const testPage = document.getElementById('page-test');
        if (testPage && testPage.classList.contains('active')) {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                navigateTestImage(-1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                navigateTestImage(1);
            }
            return;
        }
    });
    
    // Add event listener for confidence threshold change on test page
    const testConfInput = document.getElementById('test-conf-threshold');
    if (testConfInput) {
        testConfInput.addEventListener('input', async () => {
            // If we have a loaded image and model, re-run prediction
            const testCurrentImageIndex = AppState.getTestCurrentImageIndex();
            const testImages = AppState.getTestImages();
            const testDatasetPath = AppState.getTestDatasetPath();
            if (testCurrentImageIndex >= 0 && testImages.length > 0) {
                const modelPath = document.getElementById('test-model-path')?.value;
                if (modelPath) {
                    const hasImagesSubdir = await ipcRenderer.invoke('file-exists', path.join(testDatasetPath, 'images'));
                    let imagePath;
                    if (hasImagesSubdir) {
                        imagePath = path.join(testDatasetPath, 'images', testImages[testCurrentImageIndex]);
                        const existsInSub = await ipcRenderer.invoke('file-exists', imagePath);
                        if (!existsInSub) {
                            imagePath = path.join(testDatasetPath, testImages[testCurrentImageIndex]);
                        }
                    } else {
                        imagePath = path.join(testDatasetPath, testImages[testCurrentImageIndex]);
                    }
                    await runTestPrediction(imagePath);
                }
            }
        });
    }
    
    updateStats();
    
    // Make resetStats function globally available
    window.resetStats = function() {
        if (confirm('Reset all statistics (datasets, images, models) to zero?')) {
            localStorage.setItem('yolo_stat_datasets', '0');
            localStorage.setItem('yolo_stat_images', '0');
            localStorage.setItem('yolo_stat_models', '0');
            updateStats();
            if (showMessage) showMessage('msg-stats-reset', 'info');
        }
    };
    
    // Load admin mode state first (before three-step system, so it can affect its UI)
    loadAdminModeState();
    
    Classes.init({ showMessage, checkWorkflowStatus });
    window.addClass = function() { Classes.addClass(); };
    window.removeClass = Classes.removeClass;
    
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            if (page) showPage(page);
        });
    });
    
    ThreeStep.init({
        ipcRenderer: ipcRenderer,
        showMessage: showMessage,
        showPage: showPage,
        loadDataset: loadDataset,
        getClasses: () => Classes.getClasses(),
        setSelectedClass: (c) => Classes.setSelectedClass(c),
        renderClasses: () => Classes.renderClasses(),
        startTraining: Training.startTraining,
        getAdminModeEnabled: () => AppState.getAdminModeEnabled()
    });
    
    // Load three-step system state AFTER init (so getAdminModeEnabled is available)
    ThreeStep.loadThreeStepSystemState();
    
    setupAdminModeToggle();

    Training.init({
        ipcRenderer: ipcRenderer,
        getThreeStepStage: () => ThreeStep.getThreeStepStage(),
        getThreeStepBasePath: () => ThreeStep.getThreeStepBasePath(),
        getThreeStepClassName: () => ThreeStep.getThreeStepClassName(),
        getThreeStepSystemEnabled: () => ThreeStep.getThreeStepSystemEnabled(),
        getClasses: () => Classes.getClasses(),
        getSelectedClass: () => Classes.getSelectedClass(),
        getCurrentDatasetPath: () => AppState.getCurrentDatasetPath(),
        showMessage: showMessage,
        incrementModels: incrementModels,
        proceedToNextThreeStepStage: () => ThreeStep.proceedToNextThreeStepStage(),
        setThreeStepModelPath: (p) => ThreeStep.setThreeStepModelPath(p),
        onThreeStepComplete: () => {
            ThreeStep.toggleThreeStepSystem(false);
            localStorage.removeItem('yolo_three_step_enabled');
            localStorage.removeItem('yolo_three_step_stage');
            localStorage.removeItem('yolo_three_step_class_name');
            localStorage.removeItem('yolo_three_step_base_path');
            const cb = document.getElementById('three-step-system');
            if (cb) cb.checked = false;
        }
    });

    Download.init({
        ipcRenderer: ipcRenderer,
        getThreeStepSystemEnabled: () => ThreeStep.getThreeStepSystemEnabled(),
        getAdminModeEnabled: () => AppState.getAdminModeEnabled(),
        showMessage: showMessage,
        checkWorkflowStatus: checkWorkflowStatus,
        incrementDatasets: incrementDatasets,
        incrementImages: incrementImages,
        setThreeStepClassName: (c) => ThreeStep.setThreeStepClassName(c),
        setThreeStepBasePath: (b) => ThreeStep.setThreeStepBasePath(b),
        setThreeStepStage: (s) => ThreeStep.setThreeStepStage(s),
        addClassByName: (n) => Classes.addClassByName(n),
        setupThreeStepAnnotation: () => ThreeStep.setupThreeStepAnnotation(),
        showPage: showPage
    });

    // Mobile sidebar toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebarMenu');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    
    function toggleSidebar() {
        if (window.innerWidth < 768) {
            if (sidebar) {
                sidebar.classList.toggle('show');
            }
            if (sidebarOverlay) {
                sidebarOverlay.classList.toggle('show');
            }
        }
    }
    
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', toggleSidebar);
    }
    
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', toggleSidebar);
    }
    
    // Classes page
    const addClassBtn = document.getElementById('addClassBtn');
    if (addClassBtn) {
        addClassBtn.addEventListener('click', () => Classes.addClass());
    }
    
    // Annotate page
    const loadDatasetBtn = document.getElementById('loadDatasetBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const saveBtn = document.getElementById('saveBtn');
    const clearBtn = document.getElementById('clearBtn');
    
    if (loadDatasetBtn) {
        loadDatasetBtn.addEventListener('click', handleLoadDataset);
    }
    if (prevBtn) {
        prevBtn.addEventListener('click', () => navigateImage(-1));
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => navigateImage(1));
    }
    if (saveBtn) {
        saveBtn.addEventListener('click', saveAnnotation);
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', AnnotationCore.clearAnnotations);
    }
    
    // Train page
    const trainBtn = document.getElementById('btn-start-training');
    const selectTrainDatasetBtn = document.getElementById('btn-select-train-dataset');
    
    if (trainBtn) {
        trainBtn.addEventListener('click', Training.startTraining);
    }
    
    if (selectTrainDatasetBtn) {
        selectTrainDatasetBtn.addEventListener('click', async () => {
            const result = await ipcRenderer.invoke('select-dataset-folder');
            if (result) {
                document.getElementById('train-dataset-path').value = result;
                // If we select a new path here, update global currentDatasetPath too?
                // Probably better not to overwrite if user wants to train on different dataset than annotation
            }
        });
    }
    
    AnnotationCore.init({
        canvasEl: document.getElementById('annotation-canvas'),
        getSelectedClass: () => Classes.getSelectedClass(),
        getClasses: () => Classes.getClasses(),
        ipcRenderer: ipcRenderer,
        getDatasetPath: () => AppState.getCurrentDatasetPath(),
        getImages: () => AppState.getImages(),
        getCurrentIndex: () => AppState.getCurrentImageIndex()
    });

    // Continue buttons - update statuses when navigating
    const continueFromDownloadBtn = document.getElementById('continueFromDownloadBtn');
    const continueFromClassesBtn = document.getElementById('continueFromClassesBtn');
    const continueFromAnnotateBtn = document.getElementById('continueFromAnnotateBtn');
    
    if (continueFromDownloadBtn) {
        continueFromDownloadBtn.addEventListener('click', () => {
            updateStepStatus('download', true);
            checkWorkflowStatus();
            showPage('classes');
        });
    }
    
    if (continueFromClassesBtn) {
        continueFromClassesBtn.addEventListener('click', () => {
            updateStepStatus('classes', true);
            checkWorkflowStatus();
            showPage('annotate');
        });
    }
    
    if (continueFromAnnotateBtn) {
        continueFromAnnotateBtn.addEventListener('click', () => {
            updateStepStatus('annotate', true);
            checkWorkflowStatus();
            showPage('train');
        });
    }
    
    showPage('home');
    
    ipcRenderer.on('download-progress', (event, data) => {
        const downloadLog = document.getElementById('download-log');
        const downloadProgress = document.getElementById('download-progress-container');
        const downloadProgressBar = document.getElementById('download-progress-bar');
        
        if (downloadLog) {
            downloadLog.innerText += data + '\n';
            downloadLog.scrollTop = downloadLog.scrollHeight;
        }
        
        if (downloadProgress) {
            downloadProgress.style.display = 'block';
        }
        
        const progressMatch = data.match(/(\d+)\/(\d+)/);
        if (progressMatch && downloadProgressBar) {
            const current = parseInt(progressMatch[1]);
            const total = parseInt(progressMatch[2]);
            const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
            
            if (window.logger) {
                window.logger.debug('Download progress', { current, total, percent });
            }
            
            downloadProgressBar.style.width = percent + '%';
            downloadProgressBar.setAttribute('aria-valuenow', percent);
            const downloadStatusText = document.getElementById('download-status-text');
            if (downloadStatusText) {
                downloadStatusText.innerText = percent + '%';
            }
        }
    });
    
    ipcRenderer.on('training-progress', (event, data) => {
        const trainingStatus = document.getElementById('trainingStatus');
        const trainingOutput = document.getElementById('trainingOutput');
        
        if (trainingStatus) {
            trainingStatus.innerText += data;
            trainingStatus.scrollTop = trainingStatus.scrollHeight;
        }
        
        if (trainingOutput) {
            trainingOutput.style.display = 'block';
        }
    });
    
    // Initial render
    Classes.renderClasses();
    updateStats();
    checkWorkflowStatus();
}

const { ipcRenderer } = require('electron');
const path = require('path');

// State - now managed by AppState module

/**
 * Shows a specific page and updates navigation menu.
 * @param {string} pageName - Name of the page to show ('home', 'download', 'classes', 'annotate', 'train', 'test', 'settings').
 */
function showPage(pageName) {
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
    if (pageName === 'train' && !ThreeStep.getThreeStepSystemEnabled()) {
        setTimeout(() => {
            ThreeStep.setupThreeStepTraining();
        }, 100);
    }
}

/**
 * Updates the visual status of a workflow step.
 * @param {string} step - Step name ('download', 'classes', 'annotate', 'train').
 * @param {boolean} isReady - Whether the step is ready to proceed.
 */
function updateStepStatus(step, isReady) {
    AppState.updateWorkflowStatus(step, isReady);
    
    const menuItem = document.getElementById(`menu-${step}`);
    const statusIcon = document.getElementById(`status-${step}`);
    
    if (menuItem && statusIcon) {
        if (isReady) {
            menuItem.classList.remove('status-not-ready');
            menuItem.classList.add('status-ready');
            statusIcon.innerHTML = '<i class="bi bi-check-circle-fill"></i>';
        } else {
            menuItem.classList.remove('status-ready');
            menuItem.classList.add('status-not-ready');
            statusIcon.innerHTML = '<i class="bi bi-x-circle"></i>';
        }
    }
}

/**
 * Checks the readiness status of all workflow steps.
 * Updates UI indicators based on current state (images loaded, classes defined, annotations saved).
 */
async function checkWorkflowStatus() {
    const images = AppState.getImages();
    const hasImages = images.length > 0;
    updateStepStatus('download', hasImages);
    
    const hasClasses = Classes.getClasses().length > 0;
    updateStepStatus('classes', hasClasses);
    
    const currentDatasetPath = AppState.getCurrentDatasetPath();
    const hasDataset = currentDatasetPath !== null && images.length > 0;
    updateStepStatus('annotate', hasDataset && hasClasses);
    
    let hasAnnotations = false;
    if (hasDataset && currentDatasetPath) {
        try {
            const labelsDir = path.join(currentDatasetPath, 'labels');
            const labelsExist = await ipcRenderer.invoke('file-exists', labelsDir);
            if (labelsExist) {
                const labelFiles = await ipcRenderer.invoke('list-files', labelsDir);
                hasAnnotations = labelFiles && labelFiles.length > 0;
            }
        } catch (e) {
            if (window.logger) {
                window.logger.error('Error checking annotations', e);
            } else {
                console.error('Error checking annotations:', e);
            }
        }
    }
    
    const canTrain = hasDataset && hasClasses && hasAnnotations;
    updateStepStatus('train', canTrain);
}

/**
 * Opens the models history folder in the system file manager.
 */
async function openModelsFolder() {
    try {
        const result = await ipcRenderer.invoke('open-models-folder');
        if (!result.success) {
            if (window.logger) {
                window.logger.error('Error opening models folder', result.error);
            } else {
                console.error('Error opening models folder:', result.error);
            }
            showMessage(`msg-error-opening-folder:${result.error}`, 'danger');
        }
    } catch (e) {
        if (window.logger) {
            window.logger.error('Error opening models folder', e);
        } else {
            console.error('Error opening models folder:', e);
        }
        showMessage(`msg-error-opening-folder:${e.message}`, 'danger');
    }
}

window.openModelsFolder = openModelsFolder;

/**
 * Translates a message key to the current language.
 * @param {string} key - Translation key (e.g., 'msg-download-complete').
 * @param {...string} args - Arguments to replace placeholders {0}, {1}, etc.
 * @returns {string} Translated message with replaced placeholders.
 */
function translateMessage(key, ...args) {
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
}

// Toast notification queue management
let activeToasts = [];
const MAX_TOASTS = 3;

/**
 * Shows a toast notification message.
 * Limits the number of simultaneous toasts to MAX_TOASTS (3).
 * @param {string} message - Message text or translation key (starts with 'msg-').
 * @param {string} [type='info'] - Toast type ('info', 'success', 'warning', 'danger').
 */
function showMessage(message, type = 'info') {
    let displayMessage = message;
    if (message.startsWith('msg-')) {
        const parts = message.split(':');
        const key = parts[0];
        const args = parts.slice(1);
        displayMessage = translateMessage(key, ...args);
    }
    
    const toastContainer = document.getElementById('toastContainer') || createToastContainer();
    
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
        // Just show it manually
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
                // Remove from active toasts array
                const index = activeToasts.indexOf(toast);
                if (index > -1) {
                    activeToasts.splice(index, 1);
                }
            }, 300);
        }, 3000);
        return; // Skip the event listener part for bootstrap
    }
    
    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
        // Remove from active toasts array
        const index = activeToasts.indexOf(toast);
        if (index > -1) {
            activeToasts.splice(index, 1);
        }
    });
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container position-fixed top-0 end-0 p-3';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
    return container;
}

/**
 * Opens a dialog to select and load a dataset folder.
 * Loads images from the selected folder and updates the annotation interface.
 */
async function handleLoadDataset() {
    try {
        const selectedPath = await ipcRenderer.invoke('select-dataset-folder');
        if (selectedPath) {
            await loadDataset(selectedPath);
        }
    } catch (error) {
        const message = window.ErrorHandler ? 
            window.ErrorHandler.handleError(error, 'Loading dataset') : 
            error.message;
        showMessage(message, 'danger');
    }
}

/**
 * Loads images from a dataset folder.
 * @param {string} datasetPath - Path to the dataset folder.
 * @param {boolean} [showNotification=true] - Whether to show a success notification.
 */
async function loadDataset(datasetPath, showNotification = true) {
    try {
        AppState.setCurrentDatasetPath(datasetPath);
        const datasetPathDisplay = document.getElementById('datasetPath');
        if (datasetPathDisplay) {
            datasetPathDisplay.innerText = path.basename(datasetPath);
        }
        
        const loadedImages = await ipcRenderer.invoke('load-dataset', datasetPath);
        AppState.setImages(loadedImages);
        AppState.setCurrentImageIndex(0);
        
        const totalImagesEl = document.getElementById('totalImages');
        if (totalImagesEl) {
            totalImagesEl.textContent = loadedImages.length;
        }
        
        if (loadedImages.length > 0) {
            await loadImage(0);
            if (showNotification) {
                showMessage(`msg-images-loaded:${loadedImages.length}`, 'success');
            }
        } else {
            if (showNotification) {
                showMessage('msg-no-images-found', 'warning');
            }
        }
        
        updateProgress();
        checkWorkflowStatus();
    } catch (error) {
        const message = window.ErrorHandler ? 
            window.ErrorHandler.handleError(error, 'Loading dataset') : 
            error.message;
        showMessage(message, 'danger');
    }
}

window.navigateImage = navigateImage; // Make global

/**
 * Loads an image from the current dataset at the specified index.
 * Scales the image to fit the canvas and loads existing annotations.
 * @param {number} index - Index of the image to load (0-based).
 */
async function loadImage(index) {
    const images = AppState.getImages();
    if (index < 0 || index >= images.length) return;
    
    AppState.setCurrentImageIndex(index);
    
    const imageCounter = document.getElementById('image-counter');
    const currentFileName = document.getElementById('current-file-name');
    
    if (imageCounter) {
        imageCounter.textContent = `${index + 1} / ${images.length}`;
    }
    
    updateNavigationButtons();
    
    const currentDatasetPath = AppState.getCurrentDatasetPath();
    const hasImagesSubdir = await ipcRenderer.invoke('file-exists', path.join(currentDatasetPath, 'images'));
    
    let imagePath;
    if (hasImagesSubdir) {
         imagePath = path.join(currentDatasetPath, 'images', images[index]);
         const existsInSub = await ipcRenderer.invoke('file-exists', imagePath);
         if (!existsInSub) {
             imagePath = path.join(currentDatasetPath, images[index]);
         }
    } else {
        imagePath = path.join(currentDatasetPath, images[index]);
    }

    if (currentFileName) {
        currentFileName.textContent = images[index];
    }
    
    const img = new Image();
    const fileUrl = 'file://' + imagePath.replace(/\\/g, '/');
    img.src = fileUrl;
    if (window.logger) {
        window.logger.debug('Loading image', { fileUrl });
    }
    img.onload = () => {
        const placeholderText = document.getElementById('placeholder-text');
        if (placeholderText) placeholderText.style.display = 'none';
        const container = document.getElementById('annotation-container');
        const containerWidth = container ? container.clientWidth : 0;
        const containerHeight = container ? container.clientHeight : 0;
        let scale = Math.min(containerWidth / img.width, containerHeight / img.height) * 0.95;
        AnnotationCore.setCanvasSize(img.width * scale, img.height * scale);
        AnnotationCore.setImage(img);
        AnnotationCore.drawImage();
        AnnotationCore.loadAnnotations().then(() => {
            updateProgress();
            
            const autoLabelBtn = document.getElementById('btn-auto-label');
            if (autoLabelBtn && autoLabelBtn.classList.contains('active')) {
                setTimeout(() => {
                    handleAutoLabel(true);
                    
                    if (ThreeStep.getThreeStepSystemEnabled() && ThreeStep.getThreeStepStage() === 3) {
                        setTimeout(() => {
                            const currentImageIndex = AppState.getCurrentImageIndex();
                            const images = AppState.getImages();
                            if (currentImageIndex < images.length - 1) {
                                navigateImage(1);
                            }
                        }, 1000);
                    }
                }, 300);
            }
        });
    };
}

/**
 * Updates the visibility and state of navigation buttons (prev/next).
 * Disables buttons at the start/end of the image list.
 */
function updateNavigationButtons() {
    const currentImageIndex = AppState.getCurrentImageIndex();
    const images = AppState.getImages();
    const isFirst = currentImageIndex === 0;
    const isLast = currentImageIndex === images.length - 1;
    
    // Bottom buttons
    const prevBtn = document.getElementById('btn-prev-image'); // This button is removed from HTML now
    const nextBtn = document.getElementById('btn-save-next'); // This button is removed from HTML now
    
    // Floating buttons
    const floatingPrev = document.getElementById('btn-floating-prev');
    const floatingNext = document.getElementById('btn-floating-next');
    
    // Logic for Floating Previous
    if (floatingPrev) {
        floatingPrev.style.display = isFirst ? 'none' : 'block';
    }
    
    // Logic for Floating Next
    if (floatingNext) {
        floatingNext.style.display = isLast ? 'none' : 'block';
    }
    
    // Highlight Finish button if last
    const finishBtn = document.getElementById('btn-finish-train');
    if (finishBtn) {
        if (isLast) {
            finishBtn.classList.remove('btn-outline-success');
            finishBtn.classList.add('btn-success');
            finishBtn.classList.add('pulse-animation'); // Add visual cue
        } else {
            finishBtn.classList.remove('btn-success');
            finishBtn.classList.remove('pulse-animation');
            finishBtn.classList.add('btn-outline-success');
        }
    }
}

/**
 * Updates the annotation progress indicator.
 * Shows the number of annotated images vs total images.
 */
function updateProgress() {
    const progressBar = document.getElementById('progressBar');
    const images = AppState.getImages();
    const currentImageIndex = AppState.getCurrentImageIndex();
    if (progressBar && images.length > 0) {
        const percent = Math.round(((currentImageIndex + 1) / images.length) * 100);
        progressBar.style.width = percent + '%';
    }
}

/**
 * Saves current annotations to a YOLO format label file.
 * Automatically advances to the next image after saving.
 * In three-step system stage 3, auto-advances if auto-label is enabled.
 * @returns {Promise<void>}
 */
async function saveAnnotation() {
    const images = AppState.getImages();
    if (images.length === 0) {
        showMessage('msg-no-images-loaded', 'warning');
        return;
    }
    
    // Allow saving even with no annotations (to skip images or mark as empty background)
    // if (currentAnnotations.length === 0) {
    //     showMessage('No annotations to save', 'info');
    //     return;
    // }
    
    const currentDatasetPath = AppState.getCurrentDatasetPath();
    const currentImageIndex = AppState.getCurrentImageIndex();
    const imagePath = path.join(currentDatasetPath, 'images', images[currentImageIndex]);
    let targetPath;
    if (currentDatasetPath) {
         // Re-construct the path used in loadImage - ideally we should store it
         const hasImagesSubdir = await ipcRenderer.invoke('file-exists', path.join(currentDatasetPath, 'images'));
         if (hasImagesSubdir) {
             targetPath = path.join(currentDatasetPath, 'images', images[currentImageIndex]);
             const exists = await ipcRenderer.invoke('file-exists', targetPath);
             if (!exists) targetPath = path.join(currentDatasetPath, images[currentImageIndex]);
         } else {
             targetPath = path.join(currentDatasetPath, images[currentImageIndex]);
         }
    }
    
    try {
        await ipcRenderer.invoke('save-annotation', {
            imagePath: targetPath,
            annotations: AnnotationCore.getAnnotations(),
            classNames: Classes.getClasses()
        });
        
        showMessage('msg-annotation-saved', 'success');
        
        checkWorkflowStatus();
        
        AnnotationCore.setAnnotations([]);
        
        if (ThreeStep.getThreeStepSystemEnabled() && ThreeStep.getThreeStepStage() === 3) {
            const autoBtn = document.getElementById('btn-auto-label');
            if (autoBtn && autoBtn.classList.contains('active')) {
                setTimeout(() => {
                    navigateImage(1);
                }, 500);
            } else {
                navigateImage(1);
            }
        } else {
        navigateImage(1);
        }
    } catch (e) {
        const message = window.ErrorHandler ? 
            window.ErrorHandler.handleError(e, 'Saving annotation') : 
            `msg-save-error:${e.message}`;
        showMessage(message, 'danger');
    }
}

/**
 * Toggles the auto-label feature on/off.
 * When enabled, automatically runs prediction on the current image.
 */
function toggleAutoLabel() {
    const btn = document.getElementById('btn-auto-label');
    if (!btn) return;
    
    const isActive = btn.classList.contains('active');
    
    if (isActive) {
        btn.classList.remove('active');
        btn.classList.remove('btn-warning');
        btn.classList.add('btn-outline-warning');
    } else {
        btn.classList.add('active');
        btn.classList.remove('btn-outline-warning');
        btn.classList.add('btn-warning');
        if (AnnotationCore.hasImage()) {
            handleAutoLabel(true);
        }
    }
}

/**
 * Runs automatic object detection and labeling on the current image.
 * Uses the trained model to predict bounding boxes and adds them as annotations.
 * @param {boolean} [autoTriggered=false] - Whether this was triggered automatically (suppresses error messages).
 * @returns {Promise<void>}
 */
async function handleAutoLabel(autoTriggered = false) {
    if (images.length === 0 || !AnnotationCore.hasImage()) {
        if (!autoTriggered) {
            showMessage('msg-no-image-loaded', 'warning');
        }
        return;
    }

    const btn = document.getElementById('btn-auto-label');
    if (!btn) return;
    
    // Only show spinner if manually triggered
    if (!autoTriggered) {
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    }

    try {
        // Three-step system: use saved model path if available
        let modelPath;
        if (ThreeStep.getThreeStepSystemEnabled() && ThreeStep.getThreeStepModelPath()) {
            modelPath = ThreeStep.getThreeStepModelPath();
        } else {
            modelPath = await ipcRenderer.invoke('get-trained-model-path');
        }
        
        if (!modelPath) {
             if (!autoTriggered) {
                 showMessage('msg-no-model-found', 'warning');
                 if (btn) {
             btn.disabled = false;
                     btn.innerHTML = '<i class="bi bi-magic"></i> Auto';
                 }
             }
             return;
        }

        let imagePath = AnnotationCore.getCurrentImageSrc();
        if (imagePath && imagePath.startsWith('file://')) {
            imagePath = decodeURIComponent(imagePath.slice(7));
        }
        if (!imagePath) return;

        const confInput = document.getElementById('auto-label-conf');
        const confidence = confInput ? parseFloat(confInput.value) : 0.25;
        
        const result = await ipcRenderer.invoke('predict-image', {
            modelPath: modelPath,
            imagePath: imagePath,
            conf: confidence
        });

        if (result.success && result.detections) {
            const newAnnotations = result.detections.map(d => {
                if (!Classes.getClasses().includes(d.class_name)) {
                }

                return {
                    x: d.x_center - d.width / 2,
                    y: d.y_center - d.height / 2,
                    w: d.width,
                    h: d.height,
                    centerX: d.x_center,
                    centerY: d.y_center,
                    width: d.width,
                    height: d.height,
                    className: d.class_name
                };
            });

            if (newAnnotations.length > 0) {
                // If auto-triggered, always replace without asking
                if (AnnotationCore.getAnnotations().length > 0 && !autoTriggered) {
                    if (!confirm(`Found ${newAnnotations.length} objects. Replace existing annotations?`)) {
                        if (btn && !autoTriggered) {
                        btn.disabled = false;
                            btn.innerHTML = '<i class="bi bi-magic"></i> Auto';
                        }
                        return;
                    }
                }
                
                AnnotationCore.setAnnotations(newAnnotations);
                AnnotationCore.drawAnnotations();
                AnnotationCore.updateAnnotationCount();
                if (!autoTriggered) {
                    showMessage(`msg-auto-labeled:${newAnnotations.length}`, 'success');
                }
            } else {
                if (!autoTriggered) {
                    showMessage('msg-no-objects', 'info');
                }
            }
        } else {
             throw new Error('Prediction failed or no output.');
        }

    } catch (e) {
        console.error(e);
        if (!autoTriggered) {
            showMessage(`msg-auto-label-error:${e.message}`, 'danger');
        }
    } finally {
        if (btn && !autoTriggered) {
        btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-magic"></i> Auto';
        }
    }
}

/**
 * Navigates to the previous or next image in the dataset.
 * @param {number} direction - Navigation direction (-1 for previous, 1 for next).
 */
function navigateImage(direction) {
    AnnotationCore.setAnnotations([]);
    const currentImageIndex = AppState.getCurrentImageIndex();
    const images = AppState.getImages();
    const newIndex = currentImageIndex + direction;
    if (newIndex >= 0 && newIndex < images.length) {
        loadImage(newIndex);
    }
}

/**
 * Updates statistics display on the home page.
 * Loads data from localStorage and displays dataset, image, and model counts.
 */
function updateStats() {
    const statDatasets = document.getElementById('stat-datasets');
    const statImages = document.getElementById('stat-images');
    const statModels = document.getElementById('stat-models');
    
    const datasets = parseInt(localStorage.getItem('yolo_stat_datasets') || '0');
    const images = parseInt(localStorage.getItem('yolo_stat_images') || '0');
    const models = parseInt(localStorage.getItem('yolo_stat_models') || '0');
    
    if (statDatasets) statDatasets.textContent = datasets;
    if (statImages) statImages.textContent = images;
    if (statModels) statModels.textContent = models;
}

/**
 * Increments the datasets counter in statistics.
 */
function incrementDatasets() {
    const current = parseInt(localStorage.getItem('yolo_stat_datasets') || '0');
    const newValue = current + 1;
    localStorage.setItem('yolo_stat_datasets', newValue.toString());
    updateStats();
}

/**
 * Increments the images counter in statistics.
 * @param {number} count - Number of images to add.
 */
function incrementImages(count) {
    const current = parseInt(localStorage.getItem('yolo_stat_images') || '0');
    const newValue = current + count;
    localStorage.setItem('yolo_stat_images', newValue.toString());
    updateStats();
}

/**
 * Increments the models counter in statistics.
 */
function incrementModels() {
    const current = parseInt(localStorage.getItem('yolo_stat_models') || '0');
    const newValue = current + 1;
    localStorage.setItem('yolo_stat_models', newValue.toString());
    updateStats();
}

// Test Model Functions
window.selectModelFile = async function() {
    const path = await ipcRenderer.invoke('select-file', [
        { name: 'YOLO Model', extensions: ['pt'] }
    ]);
    if (path) {
        document.getElementById('test-model-path').value = path;
    }
};

window.useBaseModel = async function() {
    const path = await ipcRenderer.invoke('get-base-model-path');
    if (path) {
        document.getElementById('test-model-path').value = path;
        showMessage('msg-base-model-selected', 'info');
    }
};

// Test Model Functions - New Interface
/**
 * Opens a dialog to select a test dataset folder.
 * Loads images from the selected folder for model testing.
 */
async function handleLoadTestFolder() {
    try {
        const selectedPath = await ipcRenderer.invoke('select-dataset-folder');
        if (selectedPath) {
            await loadTestDataset(selectedPath);
        }
    } catch (error) {
        const message = window.ErrorHandler ? 
            window.ErrorHandler.handleError(error, 'Loading test dataset') : 
            error.message;
        showMessage(message, 'danger');
    }
}

/**
 * Loads images from a test dataset folder.
 * @param {string} datasetPath - Path to the test dataset folder.
 */
async function loadTestDataset(datasetPath) {
    try {
        AppState.setTestDatasetPath(datasetPath);
        
        // Load images from folder
        const loadedTestImages = await ipcRenderer.invoke('load-dataset', datasetPath);
        AppState.setTestImages(loadedTestImages);
        AppState.setTestCurrentImageIndex(0);
        
        const testImageCounter = document.getElementById('test-image-counter');
        if (testImageCounter) {
            testImageCounter.textContent = `0 / ${loadedTestImages.length}`;
        }
        
        if (loadedTestImages.length > 0) {
            await loadTestImage(0);
            showMessage(`msg-images-loaded:${loadedTestImages.length}`, 'success');
        } else {
            showMessage('msg-no-images-found', 'warning');
        }
        
        updateTestNavigationButtons();
    } catch (error) {
        const message = window.ErrorHandler ? 
            window.ErrorHandler.handleError(error, 'Loading test dataset') : 
            error.message;
        showMessage(message, 'danger');
    }
}

/**
 * Loads a test image at the specified index.
 * Scales the image to fit the canvas.
 * @param {number} index - Index of the image to load (0-based).
 */
async function loadTestImage(index) {
    const testImages = AppState.getTestImages();
    if (index < 0 || index >= testImages.length) return;
    
    AppState.setTestCurrentImageIndex(index);
    
    const testImageCounter = document.getElementById('test-image-counter');
    const testCurrentFileName = document.getElementById('test-current-file-name');
    
    if (testImageCounter) {
        testImageCounter.textContent = `${index + 1} / ${testImages.length}`;
    }
    
    updateTestNavigationButtons();
    
    const testDatasetPath = AppState.getTestDatasetPath();
    const hasImagesSubdir = await ipcRenderer.invoke('file-exists', path.join(testDatasetPath, 'images'));
    
    let imagePath;
    if (hasImagesSubdir) {
        imagePath = path.join(testDatasetPath, 'images', testImages[index]);
        const existsInSub = await ipcRenderer.invoke('file-exists', imagePath);
        if (!existsInSub) {
            imagePath = path.join(testDatasetPath, testImages[index]);
        }
    } else {
        imagePath = path.join(testDatasetPath, testImages[index]);
    }
    
    if (testCurrentFileName) {
        testCurrentFileName.textContent = testImages[index];
    }
    
    const testCurrentImage = new Image();
    AppState.setTestCurrentImage(testCurrentImage);
    const fileUrl = 'file://' + imagePath.replace(/\\/g, '/');
    testCurrentImage.src = fileUrl;
    
    testCurrentImage.onload = async () => {
        const placeholderText = document.getElementById('test-placeholder-text');
        if (placeholderText) {
            placeholderText.style.display = 'none';
        }
        
        let testCanvas = AppState.getTestCanvas();
        let testCtx = AppState.getTestCtx();
        if (!testCanvas) {
            testCanvas = document.getElementById('test-canvas');
            testCtx = testCanvas.getContext('2d');
            AppState.setTestCanvas(testCanvas);
            AppState.setTestCtx(testCtx);
        }
        
        const container = document.getElementById('test-container');
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        const testCurrentImage = AppState.getTestCurrentImage();
        let scale = Math.min(containerWidth / testCurrentImage.width, containerHeight / testCurrentImage.height);
        scale = scale * 0.95;
        
        const displayWidth = testCurrentImage.width * scale;
        const displayHeight = testCurrentImage.height * scale;
        
        testCanvas.width = displayWidth;
        testCanvas.height = displayHeight;
        
        testCtx.clearRect(0, 0, testCanvas.width, testCanvas.height);
        testCtx.drawImage(testCurrentImage, 0, 0, displayWidth, displayHeight);
        
        const modelPath = document.getElementById('test-model-path')?.value;
        if (modelPath) {
            await runTestPrediction(imagePath);
        }
    };
    
    testCurrentImage.onerror = () => {
        if (window.logger) {
            window.logger.error('Failed to load test image', { fileUrl });
        } else {
            console.error('Failed to load test image:', fileUrl);
        }
        showMessage('msg-image-load-error', 'danger');
    };
}

/**
 * Updates the visibility of test page navigation buttons.
 */
function updateTestNavigationButtons() {
    const prevBtn = document.getElementById('btn-test-prev');
    const nextBtn = document.getElementById('btn-test-next');
    const testCurrentImageIndex = AppState.getTestCurrentImageIndex();
    const testImages = AppState.getTestImages();
    
    if (prevBtn) {
        prevBtn.style.display = testCurrentImageIndex > 0 ? 'block' : 'none';
    }
    if (nextBtn) {
        nextBtn.style.display = testCurrentImageIndex < testImages.length - 1 ? 'block' : 'none';
    }
}

/**
 * Navigates to the previous or next test image.
 * @param {number} direction - Navigation direction (-1 for previous, 1 for next).
 */
window.navigateTestImage = async function(direction) {
    const testCurrentImageIndex = AppState.getTestCurrentImageIndex();
    const testImages = AppState.getTestImages();
    const newIndex = testCurrentImageIndex + direction;
    if (newIndex >= 0 && newIndex < testImages.length) {
        await loadTestImage(newIndex);
    }
};

/**
 * Runs object detection on a test image and displays results.
 * Shows bounding boxes, confidence scores, and detection count.
 * @param {string} imagePath - Path to the image file.
 * @returns {Promise<void>}
 */
async function runTestPrediction(imagePath) {
    const modelPath = document.getElementById('test-model-path')?.value;
    if (!modelPath) {
        return; // No model selected, just show image
    }
    
    const confThreshold = document.getElementById('test-conf-threshold')?.value || 0.25;
    const spinner = document.getElementById('test-prediction-spinner');
    const logsDiv = document.getElementById('test-prediction-logs');
    const infoDiv = document.getElementById('test-prediction-info');
    
    // Show spinner
    if (spinner) spinner.style.display = 'block';
    if (logsDiv) logsDiv.style.display = 'none';
    if (infoDiv) infoDiv.style.display = 'none';
    
    try {
        const result = await ipcRenderer.invoke('predict-image', { 
            modelPath, 
            imagePath,
            conf: parseFloat(confThreshold)
        });
        
        if (result.success && result.resultPath) {
            // Load result image
            const resultImg = new Image();
            const fileUrl = 'file://' + result.resultPath.replace(/\\/g, '/');
            resultImg.src = fileUrl;
            
            resultImg.onload = () => {
                // Get container dimensions
                const container = document.getElementById('test-container');
                const containerWidth = container.clientWidth;
                const containerHeight = container.clientHeight;
                
                // Calculate scale
                let scale = Math.min(containerWidth / resultImg.width, containerHeight / resultImg.height);
                scale = scale * 0.95;
                
                const displayWidth = resultImg.width * scale;
                const displayHeight = resultImg.height * scale;
                
                // Set canvas size and draw
                const testCanvas = AppState.getTestCanvas();
                const testCtx = AppState.getTestCtx();
                if (testCanvas && testCtx) {
                    testCanvas.width = displayWidth;
                    testCanvas.height = displayHeight;
                    testCtx.clearRect(0, 0, testCanvas.width, testCanvas.height);
                    testCtx.drawImage(resultImg, 0, 0, displayWidth, displayHeight);
                }
                
                if (spinner) spinner.style.display = 'none';
                
                if (result.detections && result.detections.length > 0) {
                    const detectionsCount = document.getElementById('test-detections-count');
                    if (detectionsCount) {
                        detectionsCount.textContent = result.detections.length;
                    }
                    if (infoDiv) {
                        infoDiv.style.display = 'block';
                    }
            
            // Show logs
            if (logsDiv) {
                        const detectionLines = result.detections.map(d => 
                            `${d.class_name} (${(d.confidence * 100).toFixed(1)}%)`
                        ).join('<br>');
                        logsDiv.innerHTML = detectionLines;
                    logsDiv.style.display = 'block';
                        logsDiv.className = 'text-success';
                    }
                } else {
                    if (infoDiv) {
                        const detectionsCount = document.getElementById('test-detections-count');
                        if (detectionsCount) detectionsCount.textContent = '0';
                        infoDiv.style.display = 'block';
                    }
                    if (logsDiv) {
                        logsDiv.innerHTML = 'No detections found';
                    logsDiv.style.display = 'block';
                        logsDiv.className = 'text-warning';
                    }
                }
            };
            
            resultImg.onerror = () => {
                if (window.logger) {
                    window.logger.error('Failed to load prediction result');
                } else {
                    console.error('Failed to load prediction result');
                }
                if (spinner) spinner.style.display = 'none';
            };
        } else {
            throw new Error('No result path returned.');
        }
    } catch (e) {
        const message = window.ErrorHandler ? 
            window.ErrorHandler.handleError(e, 'Running prediction') : 
            e.message;
        if (window.logger) {
            window.logger.error('Prediction error', e);
        } else {
            console.error('Prediction error:', e);
        }
        if (spinner) spinner.style.display = 'none';
        if (logsDiv) {
            logsDiv.innerHTML = `Error: ${message}`;
            logsDiv.style.display = 'block';
            logsDiv.className = 'text-danger';
        }
        showMessage(message, 'danger');
    }
}

window.selectModelFile = async function() {
    const filePath = await ipcRenderer.invoke('select-file', [
        { name: 'YOLO Model', extensions: ['pt'] }
    ]);
    if (filePath) {
        const modelPathInput = document.getElementById('test-model-path');
        if (modelPathInput) {
            modelPathInput.value = filePath;
            const testCurrentImageIndex = AppState.getTestCurrentImageIndex();
            const testImages = AppState.getTestImages();
            const testDatasetPath = AppState.getTestDatasetPath();
            if (testCurrentImageIndex >= 0 && testImages.length > 0) {
                const hasImagesSubdir = await ipcRenderer.invoke('file-exists', path.join(testDatasetPath, 'images'));
                let imagePath;
                if (hasImagesSubdir) {
                    imagePath = path.join(testDatasetPath, 'images', testImages[testCurrentImageIndex]);
                    const existsInSub = await ipcRenderer.invoke('file-exists', imagePath);
                    if (!existsInSub) {
                        imagePath = path.join(testDatasetPath, testImages[testCurrentImageIndex]);
                    }
                } else {
                    imagePath = path.join(testDatasetPath, testImages[testCurrentImageIndex]);
                }
                await runTestPrediction(imagePath);
            }
        }
    }
};

window.useBaseModel = async function() {
    const basePath = await ipcRenderer.invoke('get-base-model-path');
    if (basePath) {
        const modelPathInput = document.getElementById('test-model-path');
        if (modelPathInput) {
            modelPathInput.value = basePath;
            showMessage('msg-base-model-selected', 'info');
            const testCurrentImageIndex = AppState.getTestCurrentImageIndex();
            const testImages = AppState.getTestImages();
            const testDatasetPath = AppState.getTestDatasetPath();
            if (testCurrentImageIndex >= 0 && testImages.length > 0) {
                const hasImagesSubdir = await ipcRenderer.invoke('file-exists', path.join(testDatasetPath, 'images'));
                let imagePath;
                if (hasImagesSubdir) {
                    imagePath = path.join(testDatasetPath, 'images', testImages[testCurrentImageIndex]);
                    const existsInSub = await ipcRenderer.invoke('file-exists', imagePath);
                    if (!existsInSub) {
                        imagePath = path.join(testDatasetPath, testImages[testCurrentImageIndex]);
                    }
                } else {
                    imagePath = path.join(testDatasetPath, testImages[testCurrentImageIndex]);
                }
                await runTestPrediction(imagePath);
            }
        }
    }
};

// Make handleLoadTestFolder global
window.handleLoadTestFolder = handleLoadTestFolder;

// Admin Mode Functions
function setupAdminModeToggle() {
    const logoHeader = document.getElementById('logo-header');
    if (!logoHeader) return;
    
    logoHeader.addEventListener('click', () => {
        const now = Date.now();
        AppState.addLogoClick(now);
        
        // Keep only clicks within the timeout window
        const logoClickTimes = AppState.getLogoClickTimes();
        const filtered = logoClickTimes.filter(time => now - time < AppState.getLogoClickTimeout());
        AppState.setLogoClickTimes(filtered);
        
        // If we have 3 clicks within the timeout, show admin checkbox
        if (filtered.length >= 3) {
            const adminContainer = document.getElementById('admin-check-container');
            if (adminContainer) {
                adminContainer.style.display = 'block';
                AppState.clearLogoClickTimes(); // Reset
            }
        }
    });
}

/**
 * Toggles admin mode on/off.
 * Admin mode enables advanced features like higher download limits.
 * @param {boolean} enabled - Whether to enable admin mode.
 */
function toggleAdminMode(enabled) {
    AppState.setAdminModeEnabled(enabled);
    localStorage.setItem('yolo_admin_mode_enabled', enabled ? 'true' : 'false');
    
    // Update three-step system UI if it's enabled
    if (ThreeStep.getThreeStepSystemEnabled()) {
        ThreeStep.updateThreeStepSystemUI();
    }
}

function loadAdminModeState() {
    const adminModeEnabled = localStorage.getItem('yolo_admin_mode_enabled') === 'true';
    AppState.setAdminModeEnabled(adminModeEnabled);
    
    // Update checkbox
    const checkbox = document.getElementById('admin-check');
    if (checkbox) {
        checkbox.checked = adminModeEnabled;
    }
    
    // Show admin container if admin mode was enabled
    if (adminModeEnabled) {
        const adminContainer = document.getElementById('admin-check-container');
        if (adminContainer) {
            adminContainer.style.display = 'block';
        }
    }
    
    // Note: updateThreeStepSystemUI() will be called after loadThreeStepSystemState()
    // to ensure both states are loaded before updating UI
}
