/**
 * Three-step system module: progressive annotation and training (15% → 35% → 50% → 100%).
 */
(function (global) {
    'use strict';

    var ipcRenderer = null;
    var showMessage = function () {};
    var showPage = function () {};
    var loadDataset = function () {};
    var getClasses = function () { return []; };
    var setSelectedClass = function () {};
    var renderClasses = function () {};
    var startTraining = function () {};
    var getAdminModeEnabled = function () { return false; };

    var threeStepSystemEnabled = false;
    var threeStepStage = 1;
    var threeStepClassName = '';
    var threeStepBasePath = '';
    var threeStepModelPath = '';

    function init(opts) {
        if (opts.ipcRenderer) ipcRenderer = opts.ipcRenderer;
        if (opts.showMessage) showMessage = opts.showMessage;
        if (opts.showPage) showPage = opts.showPage;
        if (opts.loadDataset) loadDataset = opts.loadDataset;
        if (opts.getClasses) getClasses = opts.getClasses;
        if (opts.setSelectedClass) setSelectedClass = opts.setSelectedClass;
        if (opts.renderClasses) renderClasses = opts.renderClasses;
        if (opts.startTraining) startTraining = opts.startTraining;
        if (opts.getAdminModeEnabled) getAdminModeEnabled = opts.getAdminModeEnabled;
    }

    function setThreeStepSystemEnabled(enabled) {
        threeStepSystemEnabled = enabled;
        localStorage.setItem('yolo_three_step_enabled', enabled ? 'true' : 'false');
        updateThreeStepSystemUI();
    }

    function getThreeStepSystemEnabled() {
        return threeStepSystemEnabled;
    }

    function updateThreeStepSystemUI() {
        var limitInput = document.getElementById('image-limit');
        if (limitInput) {
            if (threeStepSystemEnabled) {
                limitInput.value = getAdminModeEnabled() ? 10 : 1000;
                limitInput.disabled = true;
                limitInput.style.opacity = '0.6';
            } else {
                limitInput.disabled = false;
                limitInput.style.opacity = '1';
            }
        }
        if (!threeStepSystemEnabled) {
            var datasetPathInput = document.getElementById('train-dataset-path');
            var selectBtn = document.getElementById('btn-select-train-dataset');
            var batchSizeInput = document.getElementById('batch-size');
            var imageSizeInput = document.getElementById('image-size');
            if (datasetPathInput) {
                datasetPathInput.readOnly = false;
                datasetPathInput.value = '';
            }
            if (selectBtn) selectBtn.disabled = false;
            if (batchSizeInput) batchSizeInput.disabled = false;
            if (imageSizeInput) imageSizeInput.disabled = false;
        }
    }

    function getThreeStepStage() {
        var stageStr = localStorage.getItem('yolo_three_step_stage') || '1';
        var stage = parseFloat(stageStr);
        return isNaN(stage) ? 1 : stage;
    }

    function setThreeStepStage(stage) {
        threeStepStage = stage;
        localStorage.setItem('yolo_three_step_stage', stage.toString());
        if (window.logger) {
            window.logger.debug('Three-step stage set', { stage });
        }
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

    function getThreeStepModelPath() {
        return threeStepModelPath;
    }

    function setThreeStepModelPath(path) {
        threeStepModelPath = path;
    }

    async function loadThreeStepSystemState() {
        threeStepSystemEnabled = localStorage.getItem('yolo_three_step_enabled') === 'true';
        threeStepStage = getThreeStepStage();
        threeStepClassName = getThreeStepClassName();
        threeStepBasePath = getThreeStepBasePath();
        var checkbox = document.getElementById('three-step-system');
        if (checkbox) checkbox.checked = threeStepSystemEnabled;
        // Update UI - getAdminModeEnabled should be initialized by now
        updateThreeStepSystemUI();
        if (threeStepSystemEnabled && threeStepBasePath && threeStepClassName) {
            if (window.logger) {
                window.logger.info('Restoring three-step system state', { stage: threeStepStage, className: threeStepClassName, basePath: threeStepBasePath });
            }
            var stageNum = parseFloat(threeStepStage);
            if (stageNum === 1 || stageNum === 2 || stageNum === 3) {
                showPage('annotate');
                setTimeout(async function () { await setupThreeStepAnnotation(); }, 300);
            } else if (stageNum === 1.5 || stageNum === 2.5 || stageNum === 3.5) {
                showPage('train');
                setTimeout(async function () { await setupThreeStepTraining(); }, 300);
            }
        } else if (threeStepSystemEnabled && threeStepBasePath) {
            var annotatePage = document.getElementById('page-annotate');
            if (annotatePage && annotatePage.classList.contains('active')) {
                await setupThreeStepAnnotation();
            }
        }
    }

    async function setupThreeStepAnnotation() {
        if (!threeStepSystemEnabled) return;
        threeStepBasePath = getThreeStepBasePath();
        threeStepClassName = getThreeStepClassName();
        if (!threeStepBasePath || !threeStepClassName) {
            showMessage('msg-three-step-state-missing', 'warning');
            return;
        }
        var stage = getThreeStepStage();
        var folderName = threeStepClassName + '_' + (stage === 1 ? '15' : stage === 2 ? '35' : '50');
        var stagePath = await ipcRenderer.invoke('join-path', [threeStepBasePath, folderName]);
        var folderExists = await ipcRenderer.invoke('file-exists', stagePath);
        if (!folderExists) {
            showMessage('msg-folder-not-found:' + folderName, 'danger');
            return;
        }
        var loadDatasetBtn = document.getElementById('btn-load-dataset');
        if (loadDatasetBtn) {
            loadDatasetBtn.disabled = true;
            loadDatasetBtn.style.opacity = '0.6';
        }
        try {
            await loadDataset(stagePath, false);
        } catch (error) {
            if (window.logger) {
                window.logger.error('Error loading dataset', error);
            } else {
                console.error('Error loading dataset:', error);
            }
            showMessage('msg-load-error:' + error.message, 'danger');
        }
        var classSelect = document.getElementById('annotation-class-select');
        if (classSelect) {
            classSelect.disabled = true;
            classSelect.style.opacity = '0.6';
            if (getClasses().includes(threeStepClassName)) {
                setSelectedClass(threeStepClassName);
                renderClasses();
            }
        }
        var confInput = document.getElementById('auto-label-conf');
        if (confInput) {
            confInput.value = '0.10';
            confInput.disabled = true;
            confInput.style.opacity = '0.6';
        }
        var autoBtn = document.getElementById('btn-auto-label');
        if (autoBtn) {
            if (stage === 1) {
                autoBtn.classList.remove('active', 'btn-warning');
                autoBtn.classList.add('btn-outline-warning');
            } else {
                autoBtn.classList.add('active', 'btn-warning');
                autoBtn.classList.remove('btn-outline-warning');
            }
        }
    }

    async function checkThreeStepAnnotationComplete() {
        if (!threeStepSystemEnabled || !threeStepBasePath) return false;
        return true;
    }

    async function proceedToNextThreeStepStage() {
        if (!threeStepSystemEnabled) return;
        var currentStage = getThreeStepStage();
        if (window.logger) {
            window.logger.info('Proceeding to next three-step stage', { currentStage });
        }
        if (currentStage === 1) {
            setThreeStepStage(1.5);
            showPage('train');
            setTimeout(function () { setupThreeStepTraining(); }, 300);
        } else if (currentStage === 1.5) {
            setThreeStepStage(2);
            showPage('annotate');
            setTimeout(function () { setupThreeStepAnnotation(); }, 300);
        } else if (currentStage === 2) {
            setThreeStepStage(2.5);
            showPage('train');
            setTimeout(function () { setupThreeStepTraining(); }, 300);
        } else if (currentStage === 2.5) {
            setThreeStepStage(3);
            showPage('annotate');
            setTimeout(function () { setupThreeStepAnnotation(); }, 300);
        } else if (currentStage === 3) {
            await finalizeThreeStepSystem();
        }
    }

    async function setupThreeStepTraining() {
        if (!threeStepSystemEnabled) {
            var datasetPathInput = document.getElementById('train-dataset-path');
            var selectBtn = document.getElementById('btn-select-train-dataset');
            var batchSizeInput = document.getElementById('batch-size');
            var imageSizeInput = document.getElementById('img-size');
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
        threeStepBasePath = getThreeStepBasePath();
        threeStepClassName = getThreeStepClassName();
        var stage = getThreeStepStage();
        var isFinalTraining = stage === 3.5;
        var datasetPathInput = document.getElementById('train-dataset-path');
        var selectBtn = document.getElementById('btn-select-train-dataset');
        if (datasetPathInput) {
            if (isFinalTraining) {
                var folder100 = await ipcRenderer.invoke('join-path', [threeStepBasePath, threeStepClassName + '_100']);
                datasetPathInput.value = folder100;
            } else {
                var stageNum = (stage === 1.5 || stage === '1.5') ? 1 : 2;
                var folderName = threeStepClassName + '_' + (stageNum === 1 ? '15' : '35');
                var stagePath = await ipcRenderer.invoke('join-path', [threeStepBasePath, folderName]);
                datasetPathInput.value = stagePath;
            }
            datasetPathInput.disabled = true;
            datasetPathInput.style.opacity = '0.6';
        }
        if (selectBtn) {
            selectBtn.disabled = true;
            selectBtn.style.opacity = '0.6';
        }
        var batchInput = document.getElementById('batch-size');
        var imgSizeInput = document.getElementById('img-size');
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
        var epochsInput = document.getElementById('epochs');
        if (epochsInput) {
            if (isFinalTraining) {
                epochsInput.value = '100';
                epochsInput.disabled = true;
                epochsInput.style.opacity = '0.6';
            } else {
                epochsInput.min = '1';
                epochsInput.max = '100';
            }
        }
    }

    function handleFinishAnnotate() {
        if (threeStepSystemEnabled) {
            proceedToNextThreeStepStage();
        } else {
            showPage('train');
        }
    }

    async function finalizeThreeStepSystem() {
        var folder100 = await ipcRenderer.invoke('join-path', [threeStepBasePath, threeStepClassName + '_100']);
        var result = await ipcRenderer.invoke('merge-three-step-annotations', {
            basePath: threeStepBasePath,
            className: threeStepClassName,
            outputFolder: folder100
        });
        if (result.success) {
            setThreeStepStage(3.5);
            showPage('train');
            setupThreeStepTraining();
            setTimeout(function () { startTraining(); }, 500);
        }
    }

    global.ThreeStep = {
        init: init,
        toggleThreeStepSystem: setThreeStepSystemEnabled,
        updateThreeStepSystemUI: updateThreeStepSystemUI,
        getThreeStepStage: getThreeStepStage,
        setThreeStepStage: setThreeStepStage,
        getThreeStepClassName: getThreeStepClassName,
        setThreeStepClassName: setThreeStepClassName,
        getThreeStepBasePath: getThreeStepBasePath,
        setThreeStepBasePath: setThreeStepBasePath,
        getThreeStepModelPath: getThreeStepModelPath,
        setThreeStepModelPath: setThreeStepModelPath,
        getThreeStepSystemEnabled: getThreeStepSystemEnabled,
        loadThreeStepSystemState: loadThreeStepSystemState,
        setupThreeStepAnnotation: setupThreeStepAnnotation,
        checkThreeStepAnnotationComplete: checkThreeStepAnnotationComplete,
        proceedToNextThreeStepStage: proceedToNextThreeStepStage,
        setupThreeStepTraining: setupThreeStepTraining,
        handleFinishAnnotate: handleFinishAnnotate,
        finalizeThreeStepSystem: finalizeThreeStepSystem
    };
})(typeof window !== 'undefined' ? window : this);
