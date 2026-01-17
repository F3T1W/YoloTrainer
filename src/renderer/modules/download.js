/**
 * Reddit image download module: handleDownload, pause/resume/stop, folder selection.
 */
(function (global) {
    'use strict';

    var ipcRenderer = null;
    var getThreeStepSystemEnabled = function () { return false; };
    var getAdminModeEnabled = function () { return false; };
    var showMessage = function () {};
    var checkWorkflowStatus = function () {};
    var incrementDatasets = function () {};
    var incrementImages = function () {};
    var setThreeStepClassName = function () {};
    var setThreeStepBasePath = function () {};
    var setThreeStepStage = function () {};
    var addClassByName = function () {};
    var setupThreeStepAnnotation = function () {};
    var showPage = function () {};

    var downloadInProgress = false;

    function init(opts) {
        if (opts.ipcRenderer) ipcRenderer = opts.ipcRenderer;
        if (opts.getThreeStepSystemEnabled) getThreeStepSystemEnabled = opts.getThreeStepSystemEnabled;
        if (opts.getAdminModeEnabled) getAdminModeEnabled = opts.getAdminModeEnabled;
        if (opts.showMessage) showMessage = opts.showMessage;
        if (opts.checkWorkflowStatus) checkWorkflowStatus = opts.checkWorkflowStatus;
        if (opts.incrementDatasets) incrementDatasets = opts.incrementDatasets;
        if (opts.incrementImages) incrementImages = opts.incrementImages;
        if (opts.setThreeStepClassName) setThreeStepClassName = opts.setThreeStepClassName;
        if (opts.setThreeStepBasePath) setThreeStepBasePath = opts.setThreeStepBasePath;
        if (opts.setThreeStepStage) setThreeStepStage = opts.setThreeStepStage;
        if (opts.addClassByName) addClassByName = opts.addClassByName;
        if (opts.setupThreeStepAnnotation) setupThreeStepAnnotation = opts.setupThreeStepAnnotation;
        if (opts.showPage) showPage = opts.showPage;

        global.handleDownload = handleDownload;
        global.handlePauseDownload = handlePauseDownload;
        global.handleResumeDownload = handleResumeDownload;
        global.handleStopDownload = handleStopDownload;
        global.handleSelectDownloadPath = handleSelectDownloadPath;
    }

    async function handleSelectDownloadPath() {
        try {
            var result = await ipcRenderer.invoke('select-dataset-folder');
            if (result) {
                var outputInput = document.getElementById('download-path');
                if (outputInput) outputInput.value = result;
            }
        } catch (err) {
            if (window.logger) {
                window.logger.error('Failed to select folder', err);
            } else {
                console.error('Failed to select folder:', err);
            }
            showMessage('Failed to open folder selection: ' + err.message, 'danger');
        }
    }

    async function handleDownload(e) {
        if (e) e.preventDefault();
        var subredditInput = document.getElementById('subreddit-input');
        var classNameInput = document.getElementById('class-name-input');
        var limitInput = document.getElementById('image-limit');
        var outputDirInput = document.getElementById('download-path');
        var downloadBtn = document.getElementById('btn-start-download');
        var pauseBtn = document.getElementById('btn-pause-download');
        var resumeBtn = document.getElementById('btn-resume-download');
        var stopBtn = document.getElementById('btn-stop-download');

        if (!subredditInput || !downloadBtn) return;

        var subreddit = subredditInput.value.trim();
        var className = (classNameInput && classNameInput.value.trim()) || 'Default';
        var limit = parseInt(limitInput && limitInput.value || 100, 10) || 100;
        var outputDir = (outputDirInput && outputDirInput.value.trim()) || '';
        var threeStepEnabled = getThreeStepSystemEnabled();
        var adminEnabled = getAdminModeEnabled();

        if (threeStepEnabled) {
            limit = adminEnabled ? 10 : 1000;
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
        var downloadProgress = document.getElementById('download-progress-container');
        if (downloadProgress) downloadProgress.style.display = 'block';

        try {
            var result;
            if (threeStepEnabled) {
                var tempOutputDir = await ipcRenderer.invoke('get-default-temp-path');
                result = await ipcRenderer.invoke('download-reddit-images', {
                    subreddit: subreddit,
                    limit: limit,
                    class_name: className,
                    output_dir: tempOutputDir,
                    three_step_mode: true
                });
                if (result && result.stopped) return;

                var downloadedCount = (result && result.downloaded) || result || limit;
                var basePath = outputDir || await ipcRenderer.invoke('get-default-datasets-path');
                var sourcePath = await ipcRenderer.invoke('join-path', [tempOutputDir, className]);
                var sourceExists = await ipcRenderer.invoke('file-exists', sourcePath);
                if (!sourceExists) {
                    showMessage('msg-download-error:Source folder not found after download', 'danger');
                    downloadBtn.innerHTML = '<i class="bi bi-download me-2"></i>Start Download';
                    downloadBtn.disabled = false;
                    resetDownloadButtons(downloadBtn, pauseBtn, resumeBtn, stopBtn);
                    return;
                }

                try {
                    var distributionResult = await ipcRenderer.invoke('distribute-three-step-images', {
                        sourcePath: sourcePath,
                        basePath: basePath,
                        className: className,
                        totalCount: downloadedCount
                    });

                    var tempTestPath = await ipcRenderer.invoke('join-path', [tempOutputDir, className, 'FOR_TESTS']);
                    var testPathExists = await ipcRenderer.invoke('file-exists', tempTestPath);
                    if (testPathExists && distributionResult && distributionResult.basePath) {
                        var classFolderPath = await ipcRenderer.invoke('join-path', [distributionResult.basePath, className]);
                        var targetTestPath = await ipcRenderer.invoke('join-path', [classFolderPath, 'FOR_TESTS']);
                        try {
                            await ipcRenderer.invoke('copy-folder', { source: tempTestPath, destination: targetTestPath });
                        } catch (err) {
                            if (window.logger) {
                                window.logger.error('Error copying FOR_TESTS', err);
                            } else {
                                console.error('Error copying FOR_TESTS:', err);
                            }
                        }
                    }
                    if (testPathExists) {
                        try {
                        await ipcRenderer.invoke('remove-folder', tempTestPath);
                    } catch (err) {
                        if (window.logger) {
                            window.logger.error('Error cleaning FOR_TESTS', err);
                        } else {
                            console.error('Error cleaning FOR_TESTS:', err);
                        }
                    }
                    }
                    try {
                        await ipcRenderer.invoke('remove-folder', sourcePath);
                    } catch (err) {
                        if (window.logger) {
                            window.logger.error('Error cleaning temp', err);
                        } else {
                            console.error('Error cleaning temp:', err);
                        }
                    }

                    if (distributionResult && distributionResult.basePath) {
                        var folder15 = await ipcRenderer.invoke('join-path', [distributionResult.basePath, className + '_15']);
                        var folder15Exists = await ipcRenderer.invoke('file-exists', folder15);
                        if (!folder15Exists) {
                            showMessage('msg-download-error:Failed to create folder structure', 'danger');
                            downloadBtn.innerHTML = '<i class="bi bi-download me-2"></i>Start Download';
                            downloadBtn.disabled = false;
                            resetDownloadButtons(downloadBtn, pauseBtn, resumeBtn, stopBtn);
                            return;
                        }
                    }

                    setThreeStepClassName(className);
                    if (distributionResult && distributionResult.basePath) {
                        setThreeStepBasePath(distributionResult.basePath);
                    } else {
                        showMessage('msg-download-error:Failed to create folder structure', 'danger');
                        downloadBtn.innerHTML = '<i class="bi bi-download me-2"></i>Start Download';
                        downloadBtn.disabled = false;
                        resetDownloadButtons(downloadBtn, pauseBtn, resumeBtn, stopBtn);
                        return;
                    }
                    setThreeStepStage(1);
                    addClassByName(className);
                    incrementDatasets();
                    incrementImages(downloadedCount);
                    showMessage('msg-download-complete', 'success');
                    setTimeout(function () {
                        showPage('annotate');
                        setTimeout(function () { setupThreeStepAnnotation(); }, 500);
                    }, 1000);
                } catch (error) {
                    if (window.logger) {
                        window.logger.error('Error during distribution', error);
                    } else {
                        console.error('Error during distribution:', error);
                    }
                    const message = (typeof window !== 'undefined' && window.ErrorHandler) ? 
                        window.ErrorHandler.handleError(error, 'Image distribution') : 
                        'msg-download-error:' + error.message;
                    showMessage(message, 'danger');
                    downloadBtn.innerHTML = '<i class="bi bi-download me-2"></i>Start Download';
                    downloadBtn.disabled = false;
                    resetDownloadButtons(downloadBtn, pauseBtn, resumeBtn, stopBtn);
                    return;
                }
            } else {
                result = await ipcRenderer.invoke('download-reddit-images', {
                    subreddit: subreddit,
                    limit: limit,
                    class_name: className,
                    output_dir: outputDir,
                    three_step_mode: false
                });
                if (result && result.stopped) return;
                incrementDatasets();
                var cnt = (result && result.downloaded) || result || limit;
                incrementImages(cnt);
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
            const message = (typeof window !== 'undefined' && window.ErrorHandler) ? 
                window.ErrorHandler.handleError(e, 'Downloading images') : 
                'msg-download-error:' + e.message;
            showMessage(message, 'danger');
            downloadBtn.innerHTML = '<i class="bi bi-download me-2"></i>Start Download';
            downloadBtn.style.display = 'inline-block';
            resetDownloadButtons(downloadBtn, document.getElementById('btn-pause-download'), document.getElementById('btn-resume-download'), document.getElementById('btn-stop-download'));
            downloadInProgress = false;
        }
    }

    function resetDownloadButtons(downloadBtn, pauseBtn, resumeBtn, stopBtn) {
        if (pauseBtn) pauseBtn.style.display = 'none';
        if (resumeBtn) resumeBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'none';
    }

    async function handlePauseDownload(e) {
        if (e) e.preventDefault();
        var pauseBtn = document.getElementById('btn-pause-download');
        var resumeBtn = document.getElementById('btn-resume-download');
        try {
            var r = await ipcRenderer.invoke('pause-download');
            if (r && r.success) {
                if (pauseBtn) pauseBtn.style.display = 'none';
                if (resumeBtn) resumeBtn.style.display = 'inline-block';
                showMessage('msg-download-paused', 'warning');
            }
        } catch (err) {
            if (window.logger) {
                window.logger.error('Error pausing download', err);
            } else {
                console.error('Error pausing download:', err);
            }
        }
    }

    async function handleResumeDownload(e) {
        if (e) e.preventDefault();
        var pauseBtn = document.getElementById('btn-pause-download');
        var resumeBtn = document.getElementById('btn-resume-download');
        try {
            var r = await ipcRenderer.invoke('resume-download');
            if (r && r.success) {
                if (pauseBtn) pauseBtn.style.display = 'inline-block';
                if (resumeBtn) resumeBtn.style.display = 'none';
                showMessage('msg-download-resumed', 'success');
            }
        } catch (err) {
            if (window.logger) {
                window.logger.error('Error resuming download', err);
            } else {
                console.error('Error resuming download:', err);
            }
        }
    }

    async function handleStopDownload(e) {
        if (e) e.preventDefault();
        var downloadBtn = document.getElementById('btn-start-download');
        var pauseBtn = document.getElementById('btn-pause-download');
        var resumeBtn = document.getElementById('btn-resume-download');
        var stopBtn = document.getElementById('btn-stop-download');
        try {
            var r = await ipcRenderer.invoke('stop-download');
            if (r && r.success) {
                downloadInProgress = false;
                downloadBtn.innerHTML = '<i class="bi bi-download me-2"></i>Start Download';
                downloadBtn.style.display = 'inline-block';
                resetDownloadButtons(downloadBtn, pauseBtn, resumeBtn, stopBtn);
                showMessage('msg-download-stopped', 'warning');
            }
        } catch (err) {
            if (window.logger) {
                window.logger.error('Error stopping download', err);
            } else {
                console.error('Error stopping download:', err);
            }
        }
    }

    global.Download = { init: init, handleDownload: handleDownload, handlePauseDownload: handlePauseDownload, handleResumeDownload: handleResumeDownload, handleStopDownload: handleStopDownload, handleSelectDownloadPath: handleSelectDownloadPath };
})(typeof window !== 'undefined' ? window : this);
