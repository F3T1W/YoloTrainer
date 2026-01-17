// Three-Step System state
let threeStepSystemEnabled = false;
let threeStepStage = 1; // 1, 2, or 3
let threeStepClassName = '';
let threeStepBasePath = '';
let threeStepModelPath = '';

// Admin mode state
let adminModeEnabled = false;
let logoClickTimes = [];
const LOGO_CLICK_TIMEOUT = 1000; // 1 second window for 3 clicks

// Make functions available globally for onclick handlers
window.showPage = showPage;
window.handleDownload = handleDownload;
window.handleSelectDownloadPath = handleSelectDownloadPath;
window.addClass = addClass;
window.handleLoadDataset = handleLoadDataset;
window.saveAnnotation = saveAnnotation;
window.clearAnnotations = clearAnnotations;
window.undoAnnotation = undoAnnotation;
window.handleAutoLabel = handleAutoLabel;
window.toggleAutoLabel = toggleAutoLabel;
window.toggleThreeStepSystem = toggleThreeStepSystem;
window.toggleAdminMode = toggleAdminMode;
window.handleFinishAnnotate = handleFinishAnnotate;

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

function init() {
    console.log('Annotation script initialized');
    
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
            undoAnnotation();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            undoAnnotation(); 
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
    
    // Load admin mode state first (before three-step system, so it can affect its UI)
    loadAdminModeState();
    
    // Load three-step system state (this will also update UI with admin mode settings)
    loadThreeStepSystemState();
    
    setupAdminModeToggle();
    
    const savedClasses = localStorage.getItem('yolo_classes');
    if (savedClasses) {
        try {
            classes = JSON.parse(savedClasses);
        } catch (e) {
            console.error('Failed to parse saved classes', e);
            classes = [];
        }
    } else {
        classes = [];
    }
    
    const savedSelectedClass = localStorage.getItem('yolo_selected_class');
    if (savedSelectedClass && classes.includes(savedSelectedClass)) {
        selectedClass = savedSelectedClass;
    } else {
        selectedClass = classes[0] || null;
    }
    
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            if (page) showPage(page);
        });
    });
    
    ipcRenderer.on('training-progress', (event, data) => {
        const trainingOutput = document.getElementById('training-log');
        const trainingStatus = document.getElementById('training-status-badge');
        
        if (trainingOutput) {
            // Append line
            const div = document.createElement('div');
            div.textContent = data;
            // Colorize specific logs
            if (data.includes('Epoch')) div.style.color = '#0dcaf0'; // Cyan
            if (data.includes('Class')) div.style.color = '#ffc107'; // Yellow
            if (data.includes('Training complete')) div.style.color = '#198754'; // Green
            
            trainingOutput.appendChild(div);
            trainingOutput.scrollTop = trainingOutput.scrollHeight;
        }
        
        if (trainingStatus) {
            if (data.includes('Epoch')) {
                trainingStatus.textContent = 'Training...';
                trainingStatus.className = 'badge bg-primary pulse-animation';
            }
            if (data.includes('Training complete')) {
                incrementModels();
            }
        }
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
        addClassBtn.addEventListener('click', addClass);
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
        clearBtn.addEventListener('click', clearAnnotations);
    }
    
    // Train page
    const trainBtn = document.getElementById('btn-start-training');
    const selectTrainDatasetBtn = document.getElementById('btn-select-train-dataset');
    
    if (trainBtn) {
        trainBtn.addEventListener('click', startTraining);
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
    
    // Canvas events (only if canvas exists)
    if (canvas) {
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseleave', stopDrawing);
    }
    
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
            
            console.log('Progress:', { current, total, percent });
            
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
    renderClasses();
    updateStats();
    checkWorkflowStatus();
}

async function handleSelectDownloadPath() {
    try {
        const result = await ipcRenderer.invoke('select-dataset-folder');
        if (result) {
            const outputInput = document.getElementById('download-path');
            if (outputInput) outputInput.value = result;
        }
    } catch (err) {
        console.error('Failed to select folder:', err);
        showMessage('Failed to open folder selection: ' + err.message, 'danger');
    }
}

const { ipcRenderer } = require('electron');
const path = require('path');

// State
let currentDatasetPath = null;
let images = [];
// Test page variables
let testImages = [];
let testCurrentImageIndex = 0;
let testDatasetPath = null;
let testCurrentImage = null;
let testCanvas = null;
let testCtx = null;
let currentImageIndex = 0;
let classes = [];
let currentAnnotations = [];
let isDrawing = false;
let startX = 0, startY = 0;
let currentBox = null;
let selectedClass = null;

// Canvas setup
const canvas = document.getElementById('annotation-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let currentImage = null;
let imageScale = 1;

// Status tracking
let workflowStatus = {
    download: false,
    classes: false,
    annotate: false,
    train: false
};

// Navigation
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
    if (pageName === 'train' && !threeStepSystemEnabled) {
        setTimeout(() => {
            setupThreeStepTraining();
        }, 100);
    }
}

function updateStepStatus(step, isReady) {
    workflowStatus[step] = isReady;
    
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

async function checkWorkflowStatus() {
    const hasImages = images.length > 0;
    updateStepStatus('download', hasImages);
    
    const hasClasses = classes.length > 0;
    updateStepStatus('classes', hasClasses);
    
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
            console.error('Error checking annotations:', e);
        }
    }
    
    const canTrain = hasDataset && hasClasses && hasAnnotations;
    updateStepStatus('train', canTrain);
}

function renderClasses() {
    // Classes page
    const classesList = document.getElementById('classesList');
    if (classesList) {
        classesList.innerHTML = '';
        if (classes.length === 0) {
            classesList.innerHTML = '<p class="text-muted text-center text-white-50">No classes yet. Add your first class above.</p>';
        } else {
            classes.forEach((cls, idx) => {
                const badge = document.createElement('span');
                // Use Bootstrap badge classes for better look
                badge.className = 'badge rounded-pill text-bg-dark border border-secondary m-1 p-2 fs-6 cursor-pointer user-select-none d-inline-flex align-items-center gap-2';
                
                if (cls === selectedClass) {
                    badge.classList.remove('text-bg-dark', 'border-secondary');
                    badge.classList.add('text-bg-danger', 'border-danger');
                }
                
                badge.innerHTML = `
                    <span>${cls}</span>
                    <i class="bi bi-x-circle-fill text-white-50 hover-text-white" onclick="event.stopPropagation(); removeClass('${cls}')" title="Remove class" style="cursor: pointer;"></i>
                `;
                
                badge.onclick = () => {
                    selectedClass = cls;
                    saveClasses(); // Save selected class
                    renderClasses(); // Re-render to update active state
                };
                
                classesList.appendChild(badge);
            });
        }
    }
    
    // Annotate page class selector
    const classSelector = document.getElementById('annotation-class-select');
    if (classSelector) {
        classSelector.innerHTML = '<option disabled>Select Class...</option>';
        classes.forEach((cls) => {
            const option = document.createElement('option');
            option.value = cls;
            option.textContent = cls;
            if (cls === selectedClass) option.selected = true;
            classSelector.appendChild(option);
        });
        
        // Add event listener if not already added (or just update on change)
        classSelector.onchange = (e) => {
            selectedClass = e.target.value;
            saveClasses(); // Save selected class
        };
    }
}

// Helper to save classes
function saveClasses() {
    localStorage.setItem('yolo_classes', JSON.stringify(classes));
    if (selectedClass) {
        localStorage.setItem('yolo_selected_class', selectedClass);
    }
}

// Make removeClass global so it can be called from onclick
window.removeClass = function(cls) {
    if (confirm(`Delete class "${cls}"?`)) {
        classes = classes.filter(c => c !== cls);
        saveClasses(); // Save to storage
        if (selectedClass === cls) {
            selectedClass = classes[0] || null;
        }
        renderClasses();
        checkWorkflowStatus();
    }
};

function addClass() {
    const newClassInput = document.getElementById('new-class-input');
    if (!newClassInput) return;
    
    const newClass = newClassInput.value.trim();
    if (newClass && !classes.includes(newClass)) {
        classes.push(newClass);
        selectedClass = newClass; // Automatically select the newly added class
        saveClasses(); // Save to storage
        renderClasses();
        newClassInput.value = '';
        checkWorkflowStatus();
        
        // Show success message
        const classesList = document.getElementById('classesList');
        if (classesList) {
            const alert = document.createElement('div');
            alert.className = 'alert alert-success alert-dismissible fade show mt-2';
            alert.innerHTML = `
                <i class="bi bi-check-circle me-2"></i>Class "${newClass}" added successfully!
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            `;
            // Insert alert after the card body, or append to a specific container
            // For now, let's use showMessage toast which is more consistent
            showMessage(`msg-class-added:${newClass}`, 'success');
        }
    } else if (classes.includes(newClass)) {
        showMessage(`msg-class-exists:${newClass}`, 'warning');
    }
}

function getSelectedClass() {
    if (selectedClass) return selectedClass;
    
    const selected = document.querySelector('input[name="classRadio"]:checked');
    return selected ? selected.value : (classes[0] || 'Default');
}

let downloadInProgress = false;

async function handleDownload(e) {
    if (e) e.preventDefault();
    console.log('handleDownload called');
    
    const subredditInput = document.getElementById('subreddit-input');
    const classNameInput = document.getElementById('class-name-input');
    const limitInput = document.getElementById('image-limit');
    const outputDirInput = document.getElementById('download-path');
    const downloadBtn = document.getElementById('btn-start-download');
    const pauseBtn = document.getElementById('btn-pause-download');
    const resumeBtn = document.getElementById('btn-resume-download');
    const stopBtn = document.getElementById('btn-stop-download');
    
    console.log('Inputs found:', {
        subreddit: !!subredditInput,
        class: !!classNameInput,
        limit: !!limitInput,
        path: !!outputDirInput,
        btn: !!downloadBtn
    });
    
    if (!subredditInput || !downloadBtn) {
        console.error('Missing required elements');
        return;
    }
    
    const subreddit = subredditInput.value.trim();
    const className = classNameInput.value.trim() || 'Default';
    let limit = parseInt(limitInput.value) || 100;
    let outputDir = outputDirInput ? outputDirInput.value.trim() : '';
    
    // Three-step system: force limit to 1000 (or 100 if admin mode)
    if (threeStepSystemEnabled) {
        limit = adminModeEnabled ? 100 : 1000;
        if (!className) {
            showMessage('msg-enter-class-name', 'warning');
            return;
        }
    }
    
    if (!subreddit) {
        showMessage('msg-enter-subreddit', 'warning');
        return;
    }
    
    downloadInProgress = true;
    downloadBtn.style.display = 'none';
    if (pauseBtn) pauseBtn.style.display = 'inline-block';
    if (stopBtn) stopBtn.style.display = 'inline-block';
    if (resumeBtn) resumeBtn.style.display = 'none';
    
    const downloadProgress = document.getElementById('download-progress-container');
    if (downloadProgress) {
        downloadProgress.style.display = 'block';
    }
    
    try {
        let result;
        
        if (threeStepSystemEnabled) {
            // Three-step system: download to temp location first, then distribute
            // Use user-selected path or default temp path for initial download
            const tempOutputDir = await ipcRenderer.invoke('get-default-temp-path');
            result = await ipcRenderer.invoke('download-reddit-images', {
                subreddit,
                limit,
                class_name: className,
                output_dir: tempOutputDir,
                three_step_mode: true
            });
            
            // Check if download was stopped
            if (result?.stopped) {
                // Already handled by handleStopDownload, just return
                return;
            }
            
            const downloadedCount = result?.downloaded || result || limit;
            const testDownloadedCount = result?.test_downloaded || 0;
            
            const basePath = outputDir || await ipcRenderer.invoke('get-default-datasets-path');
            const sourcePath = await ipcRenderer.invoke('join-path', [tempOutputDir, className]);
            
            console.log('Distributing images:', {
                sourcePath: sourcePath,
                basePath: basePath,
                className: className,
                totalCount: downloadedCount,
                userSelectedPath: outputDir
            });
            
            const sourceExists = await ipcRenderer.invoke('file-exists', sourcePath);
            if (!sourceExists) {
                console.error('Source path does not exist:', sourcePath);
                showMessage('msg-download-error:Source folder not found after download', 'danger');
                downloadBtn.innerHTML = '<i class="bi bi-download me-2"></i>Start Download';
                downloadBtn.disabled = false;
                return;
            }
            
            try {
                const distributionResult = await ipcRenderer.invoke('distribute-three-step-images', {
                    sourcePath: sourcePath,
                    basePath: basePath,
                    className: className,
                    totalCount: downloadedCount
                });
                
                console.log('Distribution result:', distributionResult);
                
                // FOR_TESTS should be inside class folder: tempOutputDir/CLASSNAME/FOR_TESTS
                const tempTestPath = await ipcRenderer.invoke('join-path', [tempOutputDir, className, 'FOR_TESTS']);
                const testPathExists = await ipcRenderer.invoke('file-exists', tempTestPath);
                
                if (testPathExists && distributionResult && distributionResult.basePath) {
                    // FOR_TESTS should be inside class folder: basePath/CLASSNAME/FOR_TESTS
                    const classFolderPath = await ipcRenderer.invoke('join-path', [distributionResult.basePath, className]);
                    const targetTestPath = await ipcRenderer.invoke('join-path', [classFolderPath, 'FOR_TESTS']);
                    console.log('Copying FOR_TESTS folder from', tempTestPath, 'to', targetTestPath);
                    
                    try {
                        await ipcRenderer.invoke('copy-folder', {
                            source: tempTestPath,
                            destination: targetTestPath
                        });
                        console.log('FOR_TESTS folder copied successfully');
                    } catch (error) {
                        console.error('Error copying FOR_TESTS folder:', error);
                        // Don't fail the whole process if test folder copy fails
                    }
                } else {
                    if (!testPathExists) {
                        console.log('FOR_TESTS folder not found in temp directory:', tempTestPath);
                    }
                    if (!distributionResult || !distributionResult.basePath) {
                        console.log('Distribution failed or basePath not returned');
                    }
                }
                
                if (testPathExists) {
                    try {
                        await ipcRenderer.invoke('remove-folder', tempTestPath);
                        console.log('Temp FOR_TESTS folder cleaned up');
                    } catch (error) {
                        console.error('Error cleaning up temp FOR_TESTS folder:', error);
                        // Don't fail if cleanup fails
                    }
                }
                
                if (distributionResult && distributionResult.basePath) {
                    const classFolderExists = await ipcRenderer.invoke('file-exists', distributionResult.basePath);
                    console.log('Class folder exists:', classFolderExists, 'at:', distributionResult.basePath);
                    
                    const folder15 = await ipcRenderer.invoke('join-path', [distributionResult.basePath, `${className}_15`]);
                    const folder15Exists = await ipcRenderer.invoke('file-exists', folder15);
                    console.log('Folder 15 exists:', folder15Exists, 'at:', folder15);
                    
                    if (!folder15Exists) {
                        console.error('Folder 15 was not created!');
                        showMessage('msg-download-error:Failed to create folder structure', 'danger');
                        downloadBtn.innerHTML = '<i class="bi bi-download me-2"></i>Start Download';
                        downloadBtn.disabled = false;
                        return;
                    }
                }
                
                setThreeStepClassName(className);
                if (distributionResult && distributionResult.basePath) {
                    setThreeStepBasePath(distributionResult.basePath);
                    console.log('Three-step base path saved:', distributionResult.basePath);
                } else {
                    console.error('Distribution result missing basePath:', distributionResult);
                    showMessage('msg-download-error:Failed to create folder structure', 'danger');
                    downloadBtn.innerHTML = '<i class="bi bi-download me-2"></i>Start Download';
                    downloadBtn.disabled = false;
                    return;
                }
                
                setThreeStepStage(1);
                
                if (!classes.includes(className)) {
                    classes.push(className);
                    selectedClass = className;
                    saveClasses();
                    renderClasses();
                }
                
                incrementDatasets();
                incrementImages(downloadedCount);
                
                showMessage('msg-download-complete', 'success');
                setTimeout(() => {
                    showPage('annotate');
                    // Wait a bit more for page to be ready
                    setTimeout(() => {
                        setupThreeStepAnnotation();
                    }, 500);
                }, 1000);
            } catch (error) {
                console.error('Error during distribution:', error);
                showMessage(`msg-download-error:${error.message}`, 'danger');
                downloadBtn.innerHTML = '<i class="bi bi-download me-2"></i>Start Download';
                downloadBtn.disabled = false;
                return;
            }
        } else {
            // Normal download (without three-step distribution)
            result = await ipcRenderer.invoke('download-reddit-images', {
            subreddit,
            limit,
            class_name: className,
            output_dir: outputDir,
            three_step_mode: false
        });
        
            // Check if download was stopped
            if (result?.stopped) {
                // Already handled by handleStopDownload, just return
                return;
            }
        
            incrementDatasets();
            const downloadedCount = result?.downloaded || result || limit;
            const testDownloadedCount = result?.test_downloaded || 0;
            incrementImages(downloadedCount);
            
            showMessage('msg-download-complete', 'success');
        }
        
        downloadBtn.innerHTML = '<i class="bi bi-download me-2"></i>Start Download';
        downloadBtn.style.display = 'inline-block';
        if (pauseBtn) pauseBtn.style.display = 'none';
        if (resumeBtn) resumeBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'none';
        downloadInProgress = false;
        checkWorkflowStatus();
    } catch (e) {
        showMessage(`msg-download-error:${e.message}`, 'danger');
        downloadBtn.innerHTML = '<i class="bi bi-download me-2"></i>Start Download';
        downloadBtn.style.display = 'inline-block';
        const pauseBtn = document.getElementById('btn-pause-download');
        const resumeBtn = document.getElementById('btn-resume-download');
        const stopBtn = document.getElementById('btn-stop-download');
        if (pauseBtn) pauseBtn.style.display = 'none';
        if (resumeBtn) resumeBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'none';
        downloadInProgress = false;
    }
}

async function handlePauseDownload(e) {
    if (e) e.preventDefault();
    const pauseBtn = document.getElementById('btn-pause-download');
    const resumeBtn = document.getElementById('btn-resume-download');
    
    try {
        const result = await ipcRenderer.invoke('pause-download');
        if (result.success) {
            if (pauseBtn) pauseBtn.style.display = 'none';
            if (resumeBtn) resumeBtn.style.display = 'inline-block';
            showMessage('msg-download-paused', 'warning');
        }
    } catch (e) {
        console.error('Error pausing download:', e);
    }
}

async function handleResumeDownload(e) {
    if (e) e.preventDefault();
    const pauseBtn = document.getElementById('btn-pause-download');
    const resumeBtn = document.getElementById('btn-resume-download');
    
    try {
        const result = await ipcRenderer.invoke('resume-download');
        if (result.success) {
            if (pauseBtn) pauseBtn.style.display = 'inline-block';
            if (resumeBtn) resumeBtn.style.display = 'none';
            showMessage('msg-download-resumed', 'success');
        }
    } catch (e) {
        console.error('Error resuming download:', e);
    }
}

async function handleStopDownload(e) {
    if (e) e.preventDefault();
    const downloadBtn = document.getElementById('btn-start-download');
    const pauseBtn = document.getElementById('btn-pause-download');
    const resumeBtn = document.getElementById('btn-resume-download');
    const stopBtn = document.getElementById('btn-stop-download');
    
    try {
        const result = await ipcRenderer.invoke('stop-download');
        if (result.success) {
            downloadInProgress = false;
            downloadBtn.innerHTML = '<i class="bi bi-download me-2"></i>Start Download';
            downloadBtn.style.display = 'inline-block';
            if (pauseBtn) pauseBtn.style.display = 'none';
            if (resumeBtn) resumeBtn.style.display = 'none';
            if (stopBtn) stopBtn.style.display = 'none';
            showMessage('msg-download-stopped', 'warning');
        }
    } catch (e) {
        console.error('Error stopping download:', e);
    }
}

window.handlePauseDownload = handlePauseDownload;
window.handleResumeDownload = handleResumeDownload;
window.handleStopDownload = handleStopDownload;

async function openModelsFolder() {
    try {
        const result = await ipcRenderer.invoke('open-models-folder');
        if (!result.success) {
            console.error('Error opening models folder:', result.error);
            showMessage(`msg-error-opening-folder:${result.error}`, 'danger');
        }
    } catch (e) {
        console.error('Error opening models folder:', e);
        showMessage(`msg-error-opening-folder:${e.message}`, 'danger');
    }
}

window.openModelsFolder = openModelsFolder;

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

async function handleLoadDataset() {
    const selectedPath = await ipcRenderer.invoke('select-dataset-folder');
    if (selectedPath) {
        await loadDataset(selectedPath);
    }
}

async function loadDataset(datasetPath, showNotification = true) {
    currentDatasetPath = datasetPath;
    const datasetPathDisplay = document.getElementById('datasetPath');
    if (datasetPathDisplay) {
        datasetPathDisplay.innerText = path.basename(datasetPath);
    }
    
    images = await ipcRenderer.invoke('load-dataset', datasetPath);
    currentImageIndex = 0;
    
    const totalImagesEl = document.getElementById('totalImages');
    if (totalImagesEl) {
        totalImagesEl.textContent = images.length;
    }
    
    if (images.length > 0) {
        await loadImage(0);
        if (showNotification) {
            showMessage(`msg-images-loaded:${images.length}`, 'success');
        }
    } else {
        if (showNotification) {
            showMessage('msg-no-images-found', 'warning');
        }
    }
    
    updateProgress();
    checkWorkflowStatus();
}

window.navigateImage = navigateImage; // Make global

async function loadImage(index) {
    if (index < 0 || index >= images.length) return;
    
    currentImageIndex = index;
    
    const imageCounter = document.getElementById('image-counter');
    const currentFileName = document.getElementById('current-file-name');
    
    if (imageCounter) {
        imageCounter.textContent = `${index + 1} / ${images.length}`;
    }
    
    updateNavigationButtons();
    
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
    
    currentImage = new Image();
    
    // Convert path to file URL to ensure it loads correctly in Electron
    const fileUrl = 'file://' + imagePath.replace(/\\/g, '/');
    currentImage.src = fileUrl;
    
    console.log('Loading image from:', fileUrl);
    
    currentImage.onload = () => {
        const placeholderText = document.getElementById('placeholder-text');
        if (placeholderText) {
            placeholderText.style.display = 'none';
        }

        const container = document.getElementById('annotation-container');
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        let scale = Math.min(containerWidth / currentImage.width, containerHeight / currentImage.height);
        scale = scale * 0.95;

        canvas.width = currentImage.width * scale;
        canvas.height = currentImage.height * scale;
        
        imageScale = scale;
        
        drawImage();
        loadAnnotations().then(() => {
            updateProgress();
            
            const autoLabelBtn = document.getElementById('btn-auto-label');
            if (autoLabelBtn && autoLabelBtn.classList.contains('active')) {
                setTimeout(() => {
                    handleAutoLabel(true);
                    
                    if (threeStepSystemEnabled && getThreeStepStage() === 3) {
                        setTimeout(() => {
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

function updateNavigationButtons() {
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

function updateProgress() {
    const progressBar = document.getElementById('progressBar');
    if (progressBar && images.length > 0) {
        const percent = Math.round(((currentImageIndex + 1) / images.length) * 100);
        progressBar.style.width = percent + '%';
    }
}

function drawImage() {
    if (!ctx || !currentImage) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw image scaled to canvas size
    ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
    drawAnnotations();
}

async function loadAnnotations() {
    currentAnnotations = [];
    
    if (currentDatasetPath && images.length > 0) {
        try {
            const hasImagesSubdir = await ipcRenderer.invoke('file-exists', path.join(currentDatasetPath, 'images'));
            let imagePath;
            if (hasImagesSubdir) {
                imagePath = path.join(currentDatasetPath, 'images', images[currentImageIndex]);
            } else {
                imagePath = path.join(currentDatasetPath, images[currentImageIndex]);
            }
            
            // Labels should be in the same directory as images (or parent if images is subfolder)
            let datasetDir;
            if (hasImagesSubdir) {
                datasetDir = path.dirname(path.dirname(imagePath)); // CLASSNAME/images -> CLASSNAME
            } else {
                datasetDir = path.dirname(imagePath); // CLASSNAME -> CLASSNAME
            }
            const labelsDir = path.join(datasetDir, 'labels');
            const imageName = path.basename(imagePath, path.extname(imagePath));
            const labelPath = path.join(labelsDir, `${imageName}.txt`);
            
            const labelExists = await ipcRenderer.invoke('file-exists', labelPath);
            if (labelExists) {
                const labelContent = await ipcRenderer.invoke('read-file', labelPath);
                const lines = labelContent.trim().split('\n').filter(line => line.trim());
                
                lines.forEach(line => {
                    const parts = line.trim().split(' ');
                    if (parts.length >= 5) {
                        const classId = parseInt(parts[0]);
                        const centerX = parseFloat(parts[1]);
                        const centerY = parseFloat(parts[2]);
                        const width = parseFloat(parts[3]);
                        const height = parseFloat(parts[4]);
                        
                        // Convert from YOLO format (center_x, center_y, width, height) to (x, y, w, h)
                        const x = centerX - width / 2;
                        const y = centerY - height / 2;
                        
                        currentAnnotations.push({
                            x: x,
                            y: y,
                            w: width,
                            h: height,
                            centerX: centerX,
                            centerY: centerY,
                            width: width,
                            height: height,
                            className: classes[classId] || `Class_${classId}`
                        });
                    }
                });
            }
        } catch (e) {
            console.error('Error loading annotations:', e);
        }
    }
    
    drawAnnotations();
    updateAnnotationCount();
}

function updateAnnotationCount() {
    const annotationCount = document.getElementById('annotationCount');
    if (annotationCount) {
        annotationCount.textContent = `${currentAnnotations.length} annotation${currentAnnotations.length !== 1 ? 's' : ''}`;
    }
}

function drawAnnotations() {
    if (!ctx) return;
    
    currentAnnotations.forEach(ann => {
        const x = ann.x * canvas.width;
        const y = ann.y * canvas.height;
        const w = ann.w * canvas.width;
        const h = ann.h * canvas.height;
        
        ctx.strokeStyle = '#d00000';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        
        // Label background
        ctx.fillStyle = 'rgba(208, 0, 0, 0.8)';
        const labelText = ann.className;
        ctx.font = '14px Arial';
        const textMetrics = ctx.measureText(labelText);
        ctx.fillRect(x, y - 20, textMetrics.width + 8, 18);
        
        // Label text
        ctx.fillStyle = '#fff';
        ctx.fillText(labelText, x + 4, y - 5);
    });
    
    // Draw current box if drawing
    if (currentBox) {
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(currentBox.x, currentBox.y, currentBox.w, currentBox.h);
    }
}

function startDrawing(e) {
    if (!canvas) return;
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
}

function draw(e) {
    if (!isDrawing || !canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    currentBox = {
        x: Math.min(startX, currentX),
        y: Math.min(startY, currentY),
        w: Math.abs(currentX - startX),
        h: Math.abs(currentY - startY)
    };
    
    drawImage();
}

function stopDrawing(e) {
    if (!isDrawing) return;
    isDrawing = false;
    
    if (currentBox && currentBox.w > 10 && currentBox.h > 10) {
        // Normalize coordinates
        const ann = {
            x: currentBox.x / canvas.width,
            y: currentBox.y / canvas.height,
            w: currentBox.w / canvas.width,
            h: currentBox.h / canvas.height,
            centerX: (currentBox.x + currentBox.w / 2) / canvas.width,
            centerY: (currentBox.y + currentBox.h / 2) / canvas.height,
            width: currentBox.w / canvas.width,
            height: currentBox.h / canvas.height,
            className: getSelectedClass()
        };
        
        currentAnnotations.push(ann);
        updateAnnotationCount();
    }
    
    currentBox = null;
    drawImage();
}

function clearAnnotations() {
    if (confirm('Clear all annotations for this image?')) {
        currentAnnotations = [];
        drawImage();
        updateAnnotationCount();
    }
}

function undoAnnotation() {
    if (currentAnnotations.length > 0) {
        currentAnnotations.pop();
        drawImage();
        updateAnnotationCount();
    }
}

async function saveAnnotation() {
    if (images.length === 0) {
        showMessage('msg-no-images-loaded', 'warning');
        return;
    }
    
    // Allow saving even with no annotations (to skip images or mark as empty background)
    // if (currentAnnotations.length === 0) {
    //     showMessage('No annotations to save', 'info');
    //     return;
    // }
    
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
            annotations: currentAnnotations,
            classNames: classes
        });
        
        showMessage('msg-annotation-saved', 'success');
        
        checkWorkflowStatus();
        
        currentAnnotations = [];
        
        if (threeStepSystemEnabled && getThreeStepStage() === 3) {
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
        showMessage(`msg-save-error:${e.message}`, 'danger');
    }
}

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
        if (currentImage) {
            handleAutoLabel(true);
        }
    }
}

async function handleAutoLabel(autoTriggered = false) {
    if (images.length === 0 || !currentImage) {
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
        if (threeStepSystemEnabled && threeStepModelPath) {
            modelPath = threeStepModelPath;
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

        // We need the file system path, not the file:// URL
        let imagePath = currentImage.src;
        if (imagePath.startsWith('file://')) {
            imagePath = decodeURIComponent(imagePath.slice(7));
        }

        const confInput = document.getElementById('auto-label-conf');
        const confidence = confInput ? parseFloat(confInput.value) : 0.25;
        
        const result = await ipcRenderer.invoke('predict-image', {
            modelPath: modelPath,
            imagePath: imagePath,
            conf: confidence
        });

        if (result.success && result.detections) {
            const newAnnotations = result.detections.map(d => {
                if (!classes.includes(d.class_name)) {
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
                if (currentAnnotations.length > 0 && !autoTriggered) {
                    if (!confirm(`Found ${newAnnotations.length} objects. Replace existing annotations?`)) {
                        if (btn && !autoTriggered) {
                        btn.disabled = false;
                            btn.innerHTML = '<i class="bi bi-magic"></i> Auto';
                        }
                        return;
                    }
                }
                
                currentAnnotations = newAnnotations;
                drawAnnotations();
                updateAnnotationCount();
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

function navigateImage(direction) {
    // Clear current annotations before navigating to prevent them from being carried over
    currentAnnotations = [];
    
    const newIndex = currentImageIndex + direction;
    if (newIndex >= 0 && newIndex < images.length) {
        loadImage(newIndex);
    }
}

async function startTraining() {
    const trainDatasetPath = document.getElementById('train-dataset-path');
    const trainBtn = document.getElementById('btn-start-training');
    
    if (!trainBtn) return;
    
    let datasetPath;
    let epochs, batchSize, imgSize;
    
    let modelClassName = null;
    let modelLearningPercent = 100;
    
    if (threeStepSystemEnabled) {
        // Three-step system: use configured paths
        // Reload state to ensure we have latest values
        threeStepBasePath = getThreeStepBasePath();
        threeStepClassName = getThreeStepClassName();
        
        const stage = getThreeStepStage();
        console.log('Start training for three-step system, stage:', stage);
        
        modelClassName = threeStepClassName;
        
        if (stage === 3.5) {
            // Final training: use CLASSNAME_100 folder
            const folder100 = await ipcRenderer.invoke('join-path', [threeStepBasePath, `${threeStepClassName}_100`]);
            datasetPath = folder100;
            epochs = 100;
            modelLearningPercent = 100;
            console.log('Final training path:', folder100);
        } else {
            // Stage 1.5 or 2.5: use current stage folder
            // Stage 1.5 = training after stage 1 (15%) -> use folder 15
            // Stage 2.5 = training after stage 2 (35%) -> use folder 35
            // IMPORTANT: stage is a number (1.5 or 2.5), compare as number
            const stageNum = (stage === 1.5 || stage === '1.5') ? 1 : 2;
            const folderName = `${threeStepClassName}_${stageNum === 1 ? '15' : '35'}`;
            const stagePath = await ipcRenderer.invoke('join-path', [threeStepBasePath, folderName]);
            datasetPath = stagePath;
            modelLearningPercent = stageNum === 1 ? 15 : 35;
            console.log('Training path for stage', stage, ':', stagePath, '(folder:', folderName, ')');
            epochs = parseInt(document.getElementById('epochs')?.value || 50);
            if (epochs < 50) epochs = 50;
            if (epochs > 100) epochs = 100;
        }
        batchSize = 16;
        imgSize = 640;
    } else {
    if (trainDatasetPath && !trainDatasetPath.value && currentDatasetPath) {
        trainDatasetPath.value = currentDatasetPath;
    }
    
        datasetPath = trainDatasetPath ? trainDatasetPath.value.trim() : currentDatasetPath;
    
    if (!datasetPath) {
            showMessage('msg-select-dataset', 'warning');
        return;
    }
    
    const epochsInput = document.getElementById('epochs');
    const batchInput = document.getElementById('batch-size');
    const imgSizeInput = document.getElementById('img-size');
        
        epochs = parseInt(epochsInput ? epochsInput.value : 50) || 50;
        batchSize = parseInt(batchInput ? batchInput.value : 16) || 16;
        imgSize = parseInt(imgSizeInput ? imgSizeInput.value : 640) || 640;
    }
    
    const trainingStatus = document.getElementById('training-status-badge');
    const trainingOutput = document.getElementById('training-log');
    
    trainBtn.disabled = true;
    trainBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Training...';
    
    if (trainingStatus) {
        trainingStatus.innerText = 'Initializing...';
        trainingStatus.className = 'badge bg-warning text-dark';
    }
    if (trainingOutput) {
        trainingOutput.innerHTML = '<div class="text-success">> Initializing training sequence...</div>';
    }
    
    if (!modelClassName) {
        modelClassName = selectedClass || (classes.length > 0 ? classes[0] : null);
    }
    
    try {
        await ipcRenderer.invoke('train-model', {
            datasetPath: datasetPath,
            epochs,
            batchSize,
            imgSize,
            classNames: classes,
            className: modelClassName,
            learningPercent: modelLearningPercent
        });
        
        showMessage('msg-training-complete', 'success');
        trainBtn.innerHTML = '<i class="bi bi-play-circle-fill me-2"></i> Start Training';
        
        // Increment models counter
        incrementModels();
        
        if (trainingStatus) {
            trainingStatus.innerText = 'Completed';
            trainingStatus.className = 'badge bg-success';
        }
        
        // Three-step system: proceed to next stage
        if (threeStepSystemEnabled) {
            const stage = getThreeStepStage();
            if (stage === 1.5 || stage === 2.5) {
                // Training complete, save model path and proceed
                try {
                    threeStepModelPath = await ipcRenderer.invoke('get-trained-model-path');
                    if (!threeStepModelPath) {
                        // Fallback to default path
                        threeStepModelPath = await ipcRenderer.invoke('join-path', [
                            await ipcRenderer.invoke('get-default-datasets-path'),
                            '..', 'models', 'custom_model', 'weights', 'best.pt'
                        ]);
        }
    } catch (e) {
                    console.error('Error getting model path:', e);
                }
                setTimeout(() => {
                    proceedToNextThreeStepStage();
                }, 1000);
            } else if (stage === 3.5) {
                // Final training complete
                showMessage('msg-three-step-complete', 'success');
                // Reset three-step system
                threeStepSystemEnabled = false;
                localStorage.removeItem('yolo_three_step_enabled');
                localStorage.removeItem('yolo_three_step_stage');
                localStorage.removeItem('yolo_three_step_class_name');
                localStorage.removeItem('yolo_three_step_base_path');
                // Update checkbox
                const checkbox = document.getElementById('three-step-system');
                if (checkbox) {
                    checkbox.checked = false;
                }
            }
        }
    } catch (e) {
        showMessage(`msg-training-failed:${e.message}`, 'danger');
        trainBtn.innerHTML = '<i class="bi bi-play-circle-fill me-2"></i> Start Training';
        
        if (trainingStatus) {
            trainingStatus.innerText = 'Failed';
            trainingStatus.className = 'badge bg-danger';
        }
        
        if (trainingOutput) {
             const div = document.createElement('div');
             div.textContent = `Error: ${e.message}`;
             div.className = 'text-danger';
             trainingOutput.appendChild(div);
        }
    } finally {
        trainBtn.disabled = false;
    }
}

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

function incrementDatasets() {
    const current = parseInt(localStorage.getItem('yolo_stat_datasets') || '0');
    const newValue = current + 1;
    localStorage.setItem('yolo_stat_datasets', newValue.toString());
    updateStats();
}

function incrementImages(count) {
    const current = parseInt(localStorage.getItem('yolo_stat_images') || '0');
    const newValue = current + count;
    localStorage.setItem('yolo_stat_images', newValue.toString());
    updateStats();
}

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
async function handleLoadTestFolder() {
    const selectedPath = await ipcRenderer.invoke('select-dataset-folder');
    if (selectedPath) {
        await loadTestDataset(selectedPath);
    }
}

async function loadTestDataset(datasetPath) {
    testDatasetPath = datasetPath;
    
    // Load images from folder
    testImages = await ipcRenderer.invoke('load-dataset', datasetPath);
    testCurrentImageIndex = 0;
    
    const testImageCounter = document.getElementById('test-image-counter');
    if (testImageCounter) {
        testImageCounter.textContent = `0 / ${testImages.length}`;
    }
    
    if (testImages.length > 0) {
        await loadTestImage(0);
        showMessage(`msg-images-loaded:${testImages.length}`, 'success');
    } else {
        showMessage('msg-no-images-found', 'warning');
    }
    
    updateTestNavigationButtons();
}

async function loadTestImage(index) {
    if (index < 0 || index >= testImages.length) return;
    
    testCurrentImageIndex = index;
    
    const testImageCounter = document.getElementById('test-image-counter');
    const testCurrentFileName = document.getElementById('test-current-file-name');
    
    if (testImageCounter) {
        testImageCounter.textContent = `${index + 1} / ${testImages.length}`;
    }
    
    updateTestNavigationButtons();
    
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
    
    testCurrentImage = new Image();
    const fileUrl = 'file://' + imagePath.replace(/\\/g, '/');
    testCurrentImage.src = fileUrl;
    
    testCurrentImage.onload = async () => {
        const placeholderText = document.getElementById('test-placeholder-text');
        if (placeholderText) {
            placeholderText.style.display = 'none';
        }
        
        if (!testCanvas) {
            testCanvas = document.getElementById('test-canvas');
            testCtx = testCanvas.getContext('2d');
        }
        
        const container = document.getElementById('test-container');
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
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
        console.error('Failed to load test image:', fileUrl);
        showMessage('msg-image-load-error', 'danger');
    };
}

function updateTestNavigationButtons() {
    const prevBtn = document.getElementById('btn-test-prev');
    const nextBtn = document.getElementById('btn-test-next');
    
    if (prevBtn) {
        prevBtn.style.display = testCurrentImageIndex > 0 ? 'block' : 'none';
    }
    if (nextBtn) {
        nextBtn.style.display = testCurrentImageIndex < testImages.length - 1 ? 'block' : 'none';
    }
}

window.navigateTestImage = async function(direction) {
    const newIndex = testCurrentImageIndex + direction;
    if (newIndex >= 0 && newIndex < testImages.length) {
        await loadTestImage(newIndex);
    }
};

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
                testCanvas.width = displayWidth;
                testCanvas.height = displayHeight;
                testCtx.clearRect(0, 0, testCanvas.width, testCanvas.height);
                testCtx.drawImage(resultImg, 0, 0, displayWidth, displayHeight);
                
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
                console.error('Failed to load prediction result');
                if (spinner) spinner.style.display = 'none';
            };
        } else {
            throw new Error('No result path returned.');
        }
    } catch (e) {
        console.error('Prediction error:', e);
        if (spinner) spinner.style.display = 'none';
        if (logsDiv) {
            logsDiv.innerHTML = `Error: ${e.message}`;
            logsDiv.style.display = 'block';
            logsDiv.className = 'text-danger';
        }
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
        logoClickTimes.push(now);
        
        // Keep only clicks within the timeout window
        logoClickTimes = logoClickTimes.filter(time => now - time < LOGO_CLICK_TIMEOUT);
        
        // If we have 3 clicks within the timeout, show admin checkbox
        if (logoClickTimes.length >= 3) {
            const adminContainer = document.getElementById('admin-check-container');
            if (adminContainer) {
                adminContainer.style.display = 'block';
                logoClickTimes = []; // Reset
            }
        }
    });
}

function toggleAdminMode(enabled) {
    adminModeEnabled = enabled;
    localStorage.setItem('yolo_admin_mode_enabled', enabled ? 'true' : 'false');
    
    // Update three-step system UI if it's enabled
    if (threeStepSystemEnabled) {
        updateThreeStepSystemUI();
    }
}

function loadAdminModeState() {
    adminModeEnabled = localStorage.getItem('yolo_admin_mode_enabled') === 'true';
    
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

// Three-Step System Functions
function toggleThreeStepSystem(enabled) {
    threeStepSystemEnabled = enabled;
    localStorage.setItem('yolo_three_step_enabled', enabled ? 'true' : 'false');
    
    // Update UI based on state
    updateThreeStepSystemUI();
}

function updateThreeStepSystemUI() {
    // Update download page
    const limitInput = document.getElementById('image-limit');
    if (limitInput) {
        if (threeStepSystemEnabled) {
            // Use 100 if admin mode is enabled, otherwise 1000
            limitInput.value = adminModeEnabled ? 100 : 1000;
            limitInput.disabled = true;
            limitInput.style.opacity = '0.6';
        } else {
            limitInput.disabled = false;
            limitInput.style.opacity = '1';
        }
    }
    
    // Update train page - unlock fields if 3-step system is disabled
    if (!threeStepSystemEnabled) {
        const datasetPathInput = document.getElementById('train-dataset-path');
        const selectBtn = document.getElementById('btn-select-train-dataset');
        const batchSizeInput = document.getElementById('batch-size');
        const imageSizeInput = document.getElementById('image-size');
        
        if (datasetPathInput) {
            datasetPathInput.readOnly = false;
            datasetPathInput.value = '';
        }
        if (selectBtn) {
            selectBtn.disabled = false;
        }
        if (batchSizeInput) {
            batchSizeInput.disabled = false;
        }
        if (imageSizeInput) {
            imageSizeInput.disabled = false;
        }
    }
}

function getThreeStepStage() {
    const stageStr = localStorage.getItem('yolo_three_step_stage') || '1';
    // Use parseFloat to handle decimal stages (1.5, 2.5, 3.5)
    const stage = parseFloat(stageStr);
    return isNaN(stage) ? 1 : stage;
}

function setThreeStepStage(stage) {
    threeStepStage = stage;
    localStorage.setItem('yolo_three_step_stage', stage.toString());
    console.log('Three-step stage set to:', stage, '(stored as:', stage.toString(), ')');
}

function getThreeStepClassName() {
    return localStorage.getItem('yolo_three_step_class_name') || '';
}

function setThreeStepClassName(className) {
    threeStepClassName = className;
    localStorage.setItem('yolo_three_step_class_name', className);
}

function getThreeStepBasePath() {
    return localStorage.getItem('yolo_three_step_base_path') || '';
}

function setThreeStepBasePath(basePath) {
    threeStepBasePath = basePath;
    localStorage.setItem('yolo_three_step_base_path', basePath);
}

// Load three-step system state on init
async function loadThreeStepSystemState() {
    threeStepSystemEnabled = localStorage.getItem('yolo_three_step_enabled') === 'true';
    threeStepStage = getThreeStepStage();
    threeStepClassName = getThreeStepClassName();
    threeStepBasePath = getThreeStepBasePath();
    
    // Update checkbox
    const checkbox = document.getElementById('three-step-system');
    if (checkbox) {
        checkbox.checked = threeStepSystemEnabled;
    }
    
    updateThreeStepSystemUI();
    
    // If three-step system is enabled and we have state, restore the workflow
    if (threeStepSystemEnabled && threeStepBasePath && threeStepClassName) {
        console.log('Restoring three-step system state:', {
            stage: threeStepStage,
            className: threeStepClassName,
            basePath: threeStepBasePath
        });
        
        // Restore to appropriate page based on stage
        // Stages 1, 2, 3 = annotation pages
        // Stages 1.5, 2.5, 3.5 = training pages
        const stageNum = parseFloat(threeStepStage);
        if (stageNum === 1 || stageNum === 2 || stageNum === 3) {
            // Annotation stage - go to annotate page
            showPage('annotate');
            // Wait for page to be ready, then setup
            setTimeout(async () => {
                await setupThreeStepAnnotation();
            }, 300);
        } else if (stageNum === 1.5 || stageNum === 2.5 || stageNum === 3.5) {
            // Training stage - go to train page
            showPage('train');
            // Wait for page to be ready, then setup
            setTimeout(async () => {
                await setupThreeStepTraining();
            }, 300);
        }
    } else if (threeStepSystemEnabled && threeStepBasePath) {
        // If on annotate page and three-step is enabled, setup
        const annotatePage = document.getElementById('page-annotate');
        if (annotatePage && annotatePage.classList.contains('active')) {
            await setupThreeStepAnnotation();
        }
    }
}

async function setupThreeStepAnnotation() {
    if (!threeStepSystemEnabled) {
        console.log('Three-step system not enabled');
        return;
    }
    
    // Reload state from localStorage
    threeStepBasePath = getThreeStepBasePath();
    threeStepClassName = getThreeStepClassName();
    
    if (!threeStepBasePath || !threeStepClassName) {
        console.error('Three-step system state missing:', {
            basePath: threeStepBasePath,
            className: threeStepClassName
        });
        showMessage('msg-three-step-state-missing', 'warning');
        return;
    }
    
    console.log('Setting up three-step annotation:', {
        basePath: threeStepBasePath,
        className: threeStepClassName,
        stage: getThreeStepStage()
    });
    
    const stage = getThreeStepStage();
    const folderName = `${threeStepClassName}_${stage === 1 ? '15' : stage === 2 ? '35' : '50'}`;
    const stagePath = await ipcRenderer.invoke('join-path', [threeStepBasePath, folderName]);
    
    console.log('Loading dataset from:', stagePath);
    
    // Check if folder exists
    const folderExists = await ipcRenderer.invoke('file-exists', stagePath);
    if (!folderExists) {
        console.error('Stage folder does not exist:', stagePath);
        showMessage(`msg-folder-not-found:${folderName}`, 'danger');
        return;
    }
    
    // Block folder selection button
    const loadDatasetBtn = document.getElementById('btn-load-dataset');
    if (loadDatasetBtn) {
        loadDatasetBtn.disabled = true;
        loadDatasetBtn.style.opacity = '0.6';
    }
    
    // Auto-load dataset (without notification on startup)
    try {
        await loadDataset(stagePath, false);
    } catch (error) {
        console.error('Error loading dataset:', error);
        showMessage(`msg-load-error:${error.message}`, 'danger');
    }
    
    // Block class selection
    const classSelect = document.getElementById('annotation-class-select');
    if (classSelect) {
        classSelect.disabled = true;
        classSelect.style.opacity = '0.6';
        // Set class
        if (classes.includes(threeStepClassName)) {
            classSelect.value = threeStepClassName;
            selectedClass = threeStepClassName;
        }
    }
    
    // Set confidence to 10%
    const confInput = document.getElementById('auto-label-conf');
    if (confInput) {
        confInput.value = '0.10';
        confInput.disabled = true;
        confInput.style.opacity = '0.6';
    }
    
    // Auto mode based on stage
    const autoBtn = document.getElementById('btn-auto-label');
    if (autoBtn) {
        if (stage === 1) {
            // Stage 1: Auto off
            autoBtn.classList.remove('active', 'btn-warning');
            autoBtn.classList.add('btn-outline-warning');
        } else {
            // Stage 2 and 3: Auto on
            autoBtn.classList.add('active', 'btn-warning');
            autoBtn.classList.remove('btn-outline-warning');
        }
    }
}

async function checkThreeStepAnnotationComplete() {
    if (!threeStepSystemEnabled || !threeStepBasePath) return false;
    
    const stage = getThreeStepStage();
    const folderName = `${threeStepClassName}_${stage === 1 ? '15' : stage === 2 ? '35' : '50'}`;
    const stagePath = await ipcRenderer.invoke('join-path', [threeStepBasePath, folderName]);
    
    // Check if all images in current stage are annotated
    // This would require checking annotation files
    // For now, we'll use a simpler approach: check on "Finish & Train" button click
    return true;
}

async function proceedToNextThreeStepStage() {
    if (!threeStepSystemEnabled) return;
    
    const currentStage = getThreeStepStage();
    
    console.log('Proceeding to next three-step stage. Current stage:', currentStage);
    
    if (currentStage === 1) {
        // Stage 1 complete, go to training
        console.log('Stage 1 complete, moving to training (stage 1.5) - should use folder 15');
        setThreeStepStage(1.5); // Training stage 1 - should use folder 15
        showPage('train');
        // Wait a bit for page to be ready
        setTimeout(() => {
            setupThreeStepTraining();
        }, 300);
    } else if (currentStage === 1.5) {
        // Training stage 1 complete, go to stage 2 annotation
        console.log('Training stage 1.5 complete, moving to annotation stage 2');
        setThreeStepStage(2);
        showPage('annotate');
        setTimeout(() => {
            setupThreeStepAnnotation();
        }, 300);
    } else if (currentStage === 2) {
        // Stage 2 complete, go to training
        console.log('Stage 2 complete, moving to training (stage 2.5) - should use folder 35');
        setThreeStepStage(2.5); // Training stage 2 - should use folder 35
        showPage('train');
        setTimeout(() => {
            setupThreeStepTraining();
        }, 300);
    } else if (currentStage === 2.5) {
        // Training stage 2 complete, go to stage 3 annotation
        console.log('Training stage 2.5 complete, moving to annotation stage 3');
        setThreeStepStage(3);
        showPage('annotate');
        setTimeout(() => {
            setupThreeStepAnnotation();
        }, 300);
    } else if (currentStage === 3) {
        // Stage 3 complete, finalize
        console.log('Stage 3 complete, finalizing');
        await finalizeThreeStepSystem();
    }
}

async function setupThreeStepTraining() {
    if (!threeStepSystemEnabled) {
        // If 3-step system is disabled, unlock all fields
        const datasetPathInput = document.getElementById('train-dataset-path');
        const selectBtn = document.getElementById('btn-select-train-dataset');
        const batchSizeInput = document.getElementById('batch-size');
        const imageSizeInput = document.getElementById('img-size');
        
        if (datasetPathInput) {
            datasetPathInput.readOnly = false;
            datasetPathInput.disabled = false;
            datasetPathInput.style.opacity = '1';
        }
        if (selectBtn) {
            selectBtn.disabled = false;
            selectBtn.style.opacity = '1';
        }
        if (batchSizeInput) {
            batchSizeInput.disabled = false;
            batchSizeInput.style.opacity = '1';
        }
        if (imageSizeInput) {
            imageSizeInput.disabled = false;
            imageSizeInput.style.opacity = '1';
        }
        return;
    }
    
    // Reload state from localStorage to ensure we have latest values
    threeStepBasePath = getThreeStepBasePath();
    threeStepClassName = getThreeStepClassName();
    
    const stage = getThreeStepStage();
    const isFinalTraining = stage === 3.5;
    
    console.log('Setting up three-step training:', {
        stage,
        stageType: typeof stage,
        stageValue: stage,
        basePath: threeStepBasePath,
        className: threeStepClassName,
        isFinalTraining
    });
    
    // Block dataset path selection
    const datasetPathInput = document.getElementById('train-dataset-path');
    const selectBtn = document.getElementById('btn-select-train-dataset');
    
    if (datasetPathInput) {
        if (isFinalTraining) {
            // Final training: use CLASSNAME_100 folder
            const folder100 = await ipcRenderer.invoke('join-path', [threeStepBasePath, `${threeStepClassName}_100`]);
            datasetPathInput.value = folder100;
            console.log('Final training path:', folder100);
        } else {
            // Stage 1.5 or 2.5: use current stage folder
            // Stage 1.5 = training after stage 1 (15%) -> use folder 15
            // Stage 2.5 = training after stage 2 (35%) -> use folder 35
            // IMPORTANT: stage is stored as string in localStorage, so we need to compare properly
            const stageNum = (stage === 1.5 || stage === '1.5') ? 1 : 2;
            const folderName = `${threeStepClassName}_${stageNum === 1 ? '15' : '35'}`;
            const stagePath = await ipcRenderer.invoke('join-path', [threeStepBasePath, folderName]);
            datasetPathInput.value = stagePath;
            console.log('Training path calculation:', {
                stage,
                stageNum,
                folderName,
                stagePath,
                basePath: threeStepBasePath
            });
        }
        datasetPathInput.disabled = true;
        datasetPathInput.style.opacity = '0.6';
    }
    
    if (selectBtn) {
        selectBtn.disabled = true;
        selectBtn.style.opacity = '0.6';
    }
    
    // Block batch size and image size
    const batchInput = document.getElementById('batch-size');
    const imgSizeInput = document.getElementById('img-size');
    
    if (batchInput) {
        batchInput.value = '16';
        batchInput.disabled = true;
        batchInput.style.opacity = '0.6';
    }
    
    if (imgSizeInput) {
        imgSizeInput.value = '640';
        imgSizeInput.disabled = true;
        imgSizeInput.style.opacity = '0.6';
    }
    
    // Limit epochs to 50-100
    const epochsInput = document.getElementById('epochs');
    if (epochsInput) {
        if (isFinalTraining) {
            epochsInput.value = '100';
            epochsInput.disabled = true;
            epochsInput.style.opacity = '0.6';
        } else {
            epochsInput.value = '50';
            epochsInput.min = '50';
            epochsInput.max = '100';
        }
    }
}

function handleFinishAnnotate() {
    if (threeStepSystemEnabled) {
        // Check if all images are annotated
        proceedToNextThreeStepStage();
    } else {
        // Normal flow
        showPage('train');
    }
}

async function finalizeThreeStepSystem() {
    // Collect all annotations from 3 folders into CLASSNAME_100
    const folder100 = await ipcRenderer.invoke('join-path', [threeStepBasePath, `${threeStepClassName}_100`]);
    
    const result = await ipcRenderer.invoke('merge-three-step-annotations', {
        basePath: threeStepBasePath,
        className: threeStepClassName,
        outputFolder: folder100
    });
    
    if (result.success) {
        // Start final training on all 1000 images, 100 epochs
        setThreeStepStage(3.5);
        showPage('train');
        setupThreeStepTraining();
        
        // Auto-start training
        setTimeout(() => {
            startTraining();
        }, 500);
    }
}
