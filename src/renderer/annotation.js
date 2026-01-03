// Make functions available globally for onclick handlers
window.showPage = showPage;
window.handleDownload = handleDownload;
window.handleSelectDownloadPath = handleSelectDownloadPath;

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

function init() {
    console.log('Annotation script initialized');
    
    // Load default classes
    classes = ['AltGirl', 'Bimbo', 'Nerdy', 'ARMPITS'];
    selectedClass = classes[0];
    
    // Navigation - menu items
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            if (page) showPage(page);
        });
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
    const trainBtn = document.getElementById('trainBtn');
    const selectTrainDatasetBtn = document.getElementById('selectTrainDatasetBtn');
    
    if (trainBtn) {
        trainBtn.addEventListener('click', startTraining);
    }
    
    if (selectTrainDatasetBtn) {
        selectTrainDatasetBtn.addEventListener('click', async () => {
            const result = await ipcRenderer.invoke('select-dataset-folder');
            if (result) {
                document.getElementById('trainDatasetPath').value = result;
                currentDatasetPath = result;
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
    
    // Set initial active page
    showPage('home');
    
    // Listen for progress updates
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
        
        // Try to parse progress from output
        const progressMatch = data.match(/(\d+)\/(\d+)/);
        if (progressMatch && downloadProgressBar) {
            const current = parseInt(progressMatch[1]);
            const total = parseInt(progressMatch[2]);
            // Ensure we don't divide by zero
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
    // Check Download status - if we have images loaded or downloaded
    const hasImages = images.length > 0;
    updateStepStatus('download', hasImages);
    
    // Check Classes status - if we have at least one class defined
    const hasClasses = classes.length > 0;
    updateStepStatus('classes', hasClasses);
    
    // Check Annotate status - if we have dataset loaded and classes defined
    const hasDataset = currentDatasetPath !== null && images.length > 0;
    updateStepStatus('annotate', hasDataset && hasClasses);
    
    // Check Train status - if we have annotated images (labels exist)
    let hasAnnotations = false;
    if (hasDataset && currentDatasetPath) {
        try {
            const labelsDir = path.join(currentDatasetPath, 'labels');
            const labelsExist = await ipcRenderer.invoke('file-exists', labelsDir);
            if (labelsExist) {
                // Check if there are any label files
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
            classesList.innerHTML = '<p class="text-muted text-center">No classes yet. Add your first class above.</p>';
        } else {
            classes.forEach((cls, idx) => {
                const badge = document.createElement('span');
                badge.className = 'class-badge';
                badge.textContent = cls;
                badge.dataset.class = cls;
                badge.addEventListener('click', () => {
                    document.querySelectorAll('.class-badge').forEach(b => b.classList.remove('active'));
                    badge.classList.add('active');
                    selectedClass = cls;
                });
                if (idx === 0) badge.classList.add('active');
                classesList.appendChild(badge);
            });
        }
    }
    
    // Annotate page class selector
    const classSelector = document.getElementById('classSelector');
    if (classSelector) {
        classSelector.innerHTML = '';
        classes.forEach((cls, idx) => {
            const div = document.createElement('div');
            div.className = 'form-check';
            div.innerHTML = `
                <input class="form-check-input" type="radio" name="classRadio" id="class${idx}" value="${cls}" ${idx === 0 ? 'checked' : ''}>
                <label class="form-check-label" for="class${idx}">${cls}</label>
            `;
            classSelector.appendChild(div);
        });
        
        // Add event listeners
        document.querySelectorAll('input[name="classRadio"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    selectedClass = e.target.value;
                }
            });
        });
    }
}

function addClass() {
    const newClassInput = document.getElementById('newClassInput');
    if (!newClassInput) return;
    
    const newClass = newClassInput.value.trim();
    if (newClass && !classes.includes(newClass)) {
        classes.push(newClass);
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
            classesList.parentElement.insertBefore(alert, classesList.nextSibling);
            setTimeout(() => alert.remove(), 3000);
        }
    }
}

function getSelectedClass() {
    if (selectedClass) return selectedClass;
    
    const selected = document.querySelector('input[name="classRadio"]:checked');
    return selected ? selected.value : (classes[0] || 'Default');
}

async function handleDownload(e) {
    if (e) e.preventDefault();
    console.log('handleDownload called');
    
    const subredditInput = document.getElementById('subreddit-input');
    const classNameInput = document.getElementById('class-name-input');
    const limitInput = document.getElementById('image-limit');
    const outputDirInput = document.getElementById('download-path');
    const downloadBtn = document.getElementById('btn-start-download');
    
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
    const limit = parseInt(limitInput.value) || 100;
    const outputDir = outputDirInput ? outputDirInput.value.trim() : '';
    
    if (!subreddit) {
        showMessage('Please enter subreddit name', 'warning');
        return;
    }
    
    downloadBtn.disabled = true;
    downloadBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Downloading...';
    
    const downloadProgress = document.getElementById('download-progress-container');
    if (downloadProgress) {
        downloadProgress.style.display = 'block';
    }
    
    try {
        const result = await ipcRenderer.invoke('download-reddit-images', {
            subreddit,
            limit,
            class_name: className,
            output_dir: outputDir
        });
        
        showMessage('Download complete! You can now load the dataset to start annotating.', 'success');
        downloadBtn.innerHTML = '<i class="bi bi-download me-2"></i>Start Download';
        checkWorkflowStatus();
    } catch (e) {
        showMessage('Error: ' + e.message, 'danger');
        downloadBtn.innerHTML = '<i class="bi bi-download me-2"></i>Start Download';
    } finally {
        downloadBtn.disabled = false;
    }
}

function showMessage(message, type = 'info') {
    // Create toast notification
    const toastContainer = document.getElementById('toastContainer') || createToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type} border-0`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    // Check if bootstrap is defined globally
    if (typeof bootstrap !== 'undefined') {
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();
    } else {
        // Fallback if bootstrap object is not available directly
        // Just show it manually
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
        return; // Skip the event listener part for bootstrap
    }
    
    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
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

async function loadDataset(datasetPath) {
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
        showMessage(`Loaded ${images.length} images`, 'success');
    } else {
        showMessage('No images found in dataset folder. Make sure "images" folder exists.', 'warning');
    }
    
    updateProgress();
    checkWorkflowStatus();
}

async function loadImage(index) {
    if (index < 0 || index >= images.length) return;
    
    currentImageIndex = index;
    
    const currentIndexEl = document.getElementById('currentIndex');
    const totalImagesEl = document.getElementById('totalImages');
    const currentImageName = document.getElementById('currentImageName');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (currentIndexEl) {
        currentIndexEl.textContent = index + 1;
    }
    if (totalImagesEl) {
        totalImagesEl.textContent = images.length;
    }
    if (prevBtn) {
        prevBtn.disabled = index === 0;
    }
    if (nextBtn) {
        nextBtn.disabled = index === images.length - 1;
    }
    
    const imagePath = path.join(currentDatasetPath, 'images', images[index]);
    if (currentImageName) {
        currentImageName.textContent = images[index];
    }
    
    // Load image
    currentImage = new Image();
    currentImage.src = imagePath;
    
    currentImage.onload = () => {
        // Resize canvas to fit image (max 1200px width)
        const maxWidth = 1200;
        const maxHeight = 800;
        
        let width = currentImage.width;
        let height = currentImage.height;
        
        if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
        }
        if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
        }
        
        canvas.width = width;
        canvas.height = height;
        imageScale = width / currentImage.width;
        
        drawImage();
        loadAnnotations().then(() => {
            updateProgress();
        });
    };
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
    ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
    drawAnnotations();
}

async function loadAnnotations() {
    // Load existing annotations from label file
    currentAnnotations = [];
    
    if (currentDatasetPath && images.length > 0) {
        try {
            const imagePath = path.join(currentDatasetPath, 'images', images[currentImageIndex]);
            const datasetDir = path.dirname(path.dirname(imagePath));
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
    currentAnnotations = [];
    drawImage();
    updateAnnotationCount();
}

async function saveAnnotation() {
    if (images.length === 0) {
        showMessage('No images loaded', 'warning');
        return;
    }
    
    if (currentAnnotations.length === 0) {
        showMessage('No annotations to save', 'info');
        return;
    }
    
    const imagePath = path.join(currentDatasetPath, 'images', images[currentImageIndex]);
    
    try {
        await ipcRenderer.invoke('save-annotation', {
            imagePath,
            annotations: currentAnnotations,
            classNames: classes
        });
        
        showMessage('Annotation saved!', 'success');
        
        // Update workflow status
        checkWorkflowStatus();
        
        // Move to next
        navigateImage(1);
    } catch (e) {
        showMessage('Error saving annotation: ' + e.message, 'danger');
    }
}

function navigateImage(direction) {
    const newIndex = currentImageIndex + direction;
    if (newIndex >= 0 && newIndex < images.length) {
        loadImage(newIndex);
    }
}

async function startTraining() {
    const trainDatasetPath = document.getElementById('trainDatasetPath');
    const trainBtn = document.getElementById('trainBtn');
    
    if (!trainBtn) return;
    
    const datasetPath = trainDatasetPath ? trainDatasetPath.value.trim() : currentDatasetPath;
    
    if (!datasetPath) {
        showMessage('Please select a dataset first', 'warning');
        return;
    }
    
    const epochsInput = document.getElementById('epochsInput');
    const batchInput = document.getElementById('batchInput');
    const imgSizeInput = document.getElementById('imgSizeInput');
    const trainingStatus = document.getElementById('trainingStatus');
    const trainingOutput = document.getElementById('trainingOutput');
    
    const epochs = parseInt(epochsInput ? epochsInput.value : 50) || 50;
    const batchSize = parseInt(batchInput ? batchInput.value : 16) || 16;
    const imgSize = parseInt(imgSizeInput ? imgSizeInput.value : 640) || 640;
    
    trainBtn.disabled = true;
    trainBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Training...';
    
    if (trainingStatus) {
        trainingStatus.innerText = 'Starting training...\n';
    }
    if (trainingOutput) {
        trainingOutput.style.display = 'block';
    }
    
    try {
        await ipcRenderer.invoke('train-model', {
            datasetPath: datasetPath,
            epochs,
            batchSize,
            imgSize
        });
        
        showMessage('Training complete!', 'success');
        trainBtn.innerHTML = '<i class="bi bi-play-circle me-2"></i>Start Training';
    } catch (e) {
        showMessage('Training failed: ' + e.message, 'danger');
        trainBtn.innerHTML = '<i class="bi bi-play-circle me-2"></i>Start Training';
    } finally {
        trainBtn.disabled = false;
    }
}

function updateStats() {
    // Update home page statistics
    // This would ideally fetch real data, but for now we'll use placeholder
    const statDatasets = document.getElementById('stat-datasets');
    const statImages = document.getElementById('stat-images');
    const statModels = document.getElementById('stat-models');
    
    if (statDatasets) statDatasets.textContent = '0';
    if (statImages) statImages.textContent = images.length || '0';
    if (statModels) statModels.textContent = '0';
}