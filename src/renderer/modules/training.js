/**
 * YOLO training logic module: startTraining, training-progress handling.
 */
(function (global) {
    'use strict';

    var ipcRenderer = null;
    var getThreeStepStage = function () { return 1; };
    var getThreeStepBasePath = function () { return ''; };
    var getThreeStepClassName = function () { return ''; };
    var getThreeStepSystemEnabled = function () { return false; };
    var getClasses = function () { return []; };
    var getSelectedClass = function () { return null; };
    var getCurrentDatasetPath = function () { return null; };
    var showMessage = function () {};
    var incrementModels = function () {};
    var proceedToNextThreeStepStage = function () {};
    var setThreeStepModelPath = function () {};
    var onThreeStepComplete = function () {};

    /**
     * Initializes the training module with dependencies.
     * @param {Object} opts - Options object with IPC renderer and callback functions.
     */
    function init(opts) {
        if (opts.ipcRenderer) ipcRenderer = opts.ipcRenderer;
        if (opts.getThreeStepStage) getThreeStepStage = opts.getThreeStepStage;
        if (opts.getThreeStepBasePath) getThreeStepBasePath = opts.getThreeStepBasePath;
        if (opts.getThreeStepClassName) getThreeStepClassName = opts.getThreeStepClassName;
        if (opts.getThreeStepSystemEnabled) getThreeStepSystemEnabled = opts.getThreeStepSystemEnabled;
        if (opts.getClasses) getClasses = opts.getClasses;
        if (opts.getSelectedClass) getSelectedClass = opts.getSelectedClass;
        if (opts.getCurrentDatasetPath) getCurrentDatasetPath = opts.getCurrentDatasetPath;
        if (opts.showMessage) showMessage = opts.showMessage;
        if (opts.incrementModels) incrementModels = opts.incrementModels;
        if (opts.proceedToNextThreeStepStage) proceedToNextThreeStepStage = opts.proceedToNextThreeStepStage;
        if (opts.setThreeStepModelPath) setThreeStepModelPath = opts.setThreeStepModelPath;
        if (opts.onThreeStepComplete) onThreeStepComplete = opts.onThreeStepComplete;

        if (ipcRenderer) {
            ipcRenderer.on('training-progress', function (event, data) {
                var trainingOutput = document.getElementById('training-log');
                var trainingStatus = document.getElementById('training-status-badge');
                if (trainingOutput) {
                    var div = document.createElement('div');
                    div.textContent = data;
                    if (data.includes('Epoch')) div.style.color = '#0dcaf0';
                    if (data.includes('Class')) div.style.color = '#ffc107';
                    if (data.includes('Training complete')) div.style.color = '#198754';
                    trainingOutput.appendChild(div);
                    trainingOutput.scrollTop = trainingOutput.scrollHeight;
                }
                if (trainingStatus) {
                    if (data.includes('Epoch')) {
                        trainingStatus.textContent = 'Training...';
                        trainingStatus.className = 'badge bg-primary pulse-animation';
                    }
                    if (data.includes('Training complete')) incrementModels();
                }
            });
        }
    }

    async function startTraining() {
        var trainDatasetPath = document.getElementById('train-dataset-path');
        var trainBtn = document.getElementById('btn-start-training');
        if (!trainBtn) return;

        var datasetPath;
        var epochs, batchSize, imgSize;
        var modelClassName = null;
        var modelLearningPercent = 100;
        var threeStepEnabled = getThreeStepSystemEnabled();

        if (threeStepEnabled) {
            var basePath = getThreeStepBasePath();
            var className = getThreeStepClassName();
            var stage = getThreeStepStage();
            if (logger) logger.info('Start training for three-step system', { stage });
            modelClassName = className;

            if (stage === 3.5) {
                var folder100 = await ipcRenderer.invoke('join-path', [basePath, className + '_100']);
                datasetPath = folder100;
                epochs = 100;
                modelLearningPercent = 100;
                        if (logger) logger.info('Final training path', { folder100 });
            } else {
                var stageNum = (stage === 1.5 || stage === '1.5') ? 1 : 2;
                var folderName = className + '_' + (stageNum === 1 ? '15' : '35');
                var stagePath = await ipcRenderer.invoke('join-path', [basePath, folderName]);
                datasetPath = stagePath;
                modelLearningPercent = stageNum === 1 ? 15 : 35;
                        if (logger) logger.info('Training path for stage', { stage, stagePath, folderName });
                epochs = parseInt(document.getElementById('epochs') && document.getElementById('epochs').value || 50, 10);
                if (epochs < 1) epochs = 1;
                if (epochs > 100) epochs = 100;
            }
            batchSize = 16;
            imgSize = 640;
        } else {
            if (trainDatasetPath && !trainDatasetPath.value && getCurrentDatasetPath()) {
                trainDatasetPath.value = getCurrentDatasetPath();
            }
            datasetPath = (trainDatasetPath && trainDatasetPath.value.trim()) || getCurrentDatasetPath();
            if (!datasetPath) {
                showMessage('msg-select-dataset', 'warning');
                return;
            }
            var epochsInput = document.getElementById('epochs');
            var batchInput = document.getElementById('batch-size');
            var imgSizeInput = document.getElementById('img-size');
            epochs = parseInt(epochsInput && epochsInput.value || 50, 10) || 50;
            batchSize = parseInt(batchInput && batchInput.value || 16, 10) || 16;
            imgSize = parseInt(imgSizeInput && imgSizeInput.value || 640, 10) || 640;
        }

        var trainingStatus = document.getElementById('training-status-badge');
        var trainingOutput = document.getElementById('training-log');
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
            modelClassName = getSelectedClass() || (getClasses().length > 0 ? getClasses()[0] : null);
        }

        try {
            await ipcRenderer.invoke('train-model', {
                datasetPath: datasetPath,
                epochs: epochs,
                batchSize: batchSize,
                imgSize: imgSize,
                classNames: getClasses(),
                className: modelClassName,
                learningPercent: modelLearningPercent
            });
            showMessage('msg-training-complete', 'success');
            trainBtn.innerHTML = '<i class="bi bi-play-circle-fill me-2"></i> Start Training';
            incrementModels();
            if (trainingStatus) {
                trainingStatus.innerText = 'Completed';
                trainingStatus.className = 'badge bg-success';
            }
            if (threeStepEnabled) {
                var s = getThreeStepStage();
                if (s === 1.5 || s === 2.5) {
                    try {
                        var mp = await ipcRenderer.invoke('get-trained-model-path');
                        if (!mp) {
                            mp = await ipcRenderer.invoke('join-path', [
                                await ipcRenderer.invoke('get-default-datasets-path'),
                                '..', 'models', 'custom_model', 'weights', 'best.pt'
                            ]);
                        }
                        setThreeStepModelPath(mp);
                    } catch (e) {
                        if (window.logger) {
                            window.logger.error('Error getting model path', e);
                        } else {
                            console.error('Error getting model path:', e);
                        }
                    }
                    setTimeout(function () { proceedToNextThreeStepStage(); }, 1000);
                } else if (s === 3.5) {
                    showMessage('msg-three-step-complete', 'success');
                    onThreeStepComplete();
                }
            }
        } catch (e) {
            const message = (typeof window !== 'undefined' && window.ErrorHandler) ? 
                window.ErrorHandler.handleError(e, 'Training model') : 
                'msg-training-failed:' + e.message;
            showMessage(message, 'danger');
            trainBtn.innerHTML = '<i class="bi bi-play-circle-fill me-2"></i> Start Training';
            if (trainingStatus) {
                trainingStatus.innerText = 'Failed';
                trainingStatus.className = 'badge bg-danger';
            }
            if (trainingOutput) {
                var errDiv = document.createElement('div');
                errDiv.textContent = 'Error: ' + message;
                errDiv.className = 'text-danger';
                trainingOutput.appendChild(errDiv);
            }
        } finally {
            trainBtn.disabled = false;
        }
    }

    global.Training = { init: init, startTraining: startTraining };
})(typeof window !== 'undefined' ? window : this);
