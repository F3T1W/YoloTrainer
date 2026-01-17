/**
 * Annotation logic module: canvas, bounding boxes, loading/saving annotations.
 */
(function (global) {
    'use strict';

    const path = require('path');

    let canvas = null;
    let ctx = null;
    let currentImage = null;
    let currentAnnotations = [];
    let isDrawing = false;
    let startX = 0, startY = 0;
    let currentBox = null;

    let getSelectedClass = function () { return 'Default'; };
    let getClasses = function () { return []; };
    let ipcRenderer = null;
    let getDatasetPath = function () { return null; };
    let getImages = function () { return []; };
    let getCurrentIndex = function () { return 0; };

    /**
     * @param {Object} opts
     * @param {HTMLCanvasElement} opts.canvasEl
     * @param {Function} opts.getSelectedClass
     * @param {Function} opts.getClasses
     * @param {Object} opts.ipcRenderer
     * @param {Function} opts.getDatasetPath
     * @param {Function} opts.getImages
     * @param {Function} opts.getCurrentIndex
     */
    function init(opts) {
        if (opts.getSelectedClass) getSelectedClass = opts.getSelectedClass;
        if (opts.getClasses) getClasses = opts.getClasses;
        if (opts.ipcRenderer) ipcRenderer = opts.ipcRenderer;
        if (opts.getDatasetPath) getDatasetPath = opts.getDatasetPath;
        if (opts.getImages) getImages = opts.getImages;
        if (opts.getCurrentIndex) getCurrentIndex = opts.getCurrentIndex;

        canvas = opts.canvasEl || document.getElementById('annotation-canvas');
        ctx = canvas ? canvas.getContext('2d') : null;

        if (canvas) {
            canvas.addEventListener('mousedown', startDrawing);
            canvas.addEventListener('mousemove', draw);
            canvas.addEventListener('mouseup', stopDrawing);
            canvas.addEventListener('mouseleave', stopDrawing);
        }
    }

    function setImage(img) {
        currentImage = img;
    }

    function setCanvasSize(w, h) {
        if (canvas) {
            canvas.width = w;
            canvas.height = h;
        }
    }

    function getAnnotations() {
        return currentAnnotations;
    }

    function setAnnotations(ann) {
        currentAnnotations = Array.isArray(ann) ? ann : [];
    }

    function hasImage() {
        return !!currentImage;
    }

    function getCurrentImageSrc() {
        return currentImage ? currentImage.src : null;
    }

    function drawImage() {
        if (!ctx || !currentImage) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
        drawAnnotations();
    }

    function drawAnnotations() {
        if (!ctx) return;
        currentAnnotations.forEach(function (ann) {
            var x = ann.x * canvas.width;
            var y = ann.y * canvas.height;
            var w = ann.w * canvas.width;
            var h = ann.h * canvas.height;
            ctx.strokeStyle = '#d00000';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = 'rgba(208, 0, 0, 0.8)';
            ctx.font = '14px Arial';
            var tw = ctx.measureText(ann.className).width;
            ctx.fillRect(x, y - 20, tw + 8, 18);
            ctx.fillStyle = '#fff';
            ctx.fillText(ann.className, x + 4, y - 5);
        });
        if (currentBox) {
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.strokeRect(currentBox.x, currentBox.y, currentBox.w, currentBox.h);
        }
    }

    function updateAnnotationCount() {
        var el = document.getElementById('annotationCount');
        if (el) el.textContent = currentAnnotations.length + ' annotation' + (currentAnnotations.length !== 1 ? 's' : '');
    }

    function startDrawing(e) {
        if (!canvas) return;
        isDrawing = true;
        var rect = canvas.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
    }

    function draw(e) {
        if (!isDrawing || !canvas) return;
        var rect = canvas.getBoundingClientRect();
        var cx = e.clientX - rect.left;
        var cy = e.clientY - rect.top;
        currentBox = { x: Math.min(startX, cx), y: Math.min(startY, cy), w: Math.abs(cx - startX), h: Math.abs(cy - startY) };
        drawImage();
    }

    function stopDrawing() {
        if (!isDrawing) return;
        isDrawing = false;
        if (currentBox && currentBox.w > 10 && currentBox.h > 10) {
            currentAnnotations.push({
                x: currentBox.x / canvas.width,
                y: currentBox.y / canvas.height,
                w: currentBox.w / canvas.width,
                h: currentBox.h / canvas.height,
                centerX: (currentBox.x + currentBox.w / 2) / canvas.width,
                centerY: (currentBox.y + currentBox.h / 2) / canvas.height,
                width: currentBox.w / canvas.width,
                height: currentBox.h / canvas.height,
                className: getSelectedClass()
            });
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

    async function loadAnnotations() {
        currentAnnotations = [];
        var datasetPath = getDatasetPath();
        var imgs = getImages();
        var idx = getCurrentIndex();
        if (!datasetPath || !imgs || imgs.length === 0 || !ipcRenderer) {
            drawAnnotations();
            updateAnnotationCount();
            return;
        }
        try {
            var hasImagesSubdir = await ipcRenderer.invoke('file-exists', path.join(datasetPath, 'images'));
            var imagePath = hasImagesSubdir ? path.join(datasetPath, 'images', imgs[idx]) : path.join(datasetPath, imgs[idx]);
            var datasetDir = hasImagesSubdir ? path.dirname(path.dirname(imagePath)) : path.dirname(imagePath);
            var labelsDir = path.join(datasetDir, 'labels');
            var imageName = path.basename(imagePath, path.extname(imagePath));
            var labelPath = path.join(labelsDir, imageName + '.txt');
            var labelExists = await ipcRenderer.invoke('file-exists', labelPath);
            if (labelExists) {
                var labelContent = await ipcRenderer.invoke('read-file', labelPath);
                var lines = labelContent.trim().split('\n').filter(function (l) { return l.trim(); });
                var classList = getClasses();
                lines.forEach(function (line) {
                    var parts = line.trim().split(' ');
                    if (parts.length >= 5) {
                        var classId = parseInt(parts[0], 10);
                        var cx = parseFloat(parts[1]);
                        var cy = parseFloat(parts[2]);
                        var w = parseFloat(parts[3]);
                        var h = parseFloat(parts[4]);
                        currentAnnotations.push({
                            x: cx - w / 2, y: cy - h / 2, w: w, h: h,
                            centerX: cx, centerY: cy, width: w, height: h,
                            className: (classList[classId] || 'Class_' + classId)
                        });
                    }
                });
            }
        } catch (e) {
            if (window.logger) {
                window.logger.error('Error loading annotations', e);
            } else {
                console.error('Error loading annotations:', e);
            }
        }
        drawAnnotations();
        updateAnnotationCount();
    }

    global.AnnotationCore = {
        init: init,
        setImage: setImage,
        setCanvasSize: setCanvasSize,
        hasImage: hasImage,
        getCurrentImageSrc: getCurrentImageSrc,
        getAnnotations: getAnnotations,
        setAnnotations: setAnnotations,
        drawImage: drawImage,
        drawAnnotations: drawAnnotations,
        updateAnnotationCount: updateAnnotationCount,
        loadAnnotations: loadAnnotations,
        startDrawing: startDrawing,
        draw: draw,
        stopDrawing: stopDrawing,
        clearAnnotations: clearAnnotations,
        undoAnnotation: undoAnnotation
    };
})(typeof window !== 'undefined' ? window : this);
