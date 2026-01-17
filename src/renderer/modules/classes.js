/**
 * Модуль управления классами аннотаций.
 * Хранит список классов, выбранный класс, синхронизирует с localStorage и DOM.
 */
(function (global) {
    'use strict';

    let classes = [];
    let selectedClass = null;
    let showMessage = function () {};
    let checkWorkflowStatus = function () {};

    /**
     * Инициализация: загрузка из localStorage и сохранение колбэков.
     * @param {Object} opts
     * @param {Function} opts.showMessage - Функция показа уведомления.
     * @param {Function} opts.checkWorkflowStatus - Функция проверки статуса воркфлоу.
     */
    function init(opts) {
        if (opts && opts.showMessage) showMessage = opts.showMessage;
        if (opts && opts.checkWorkflowStatus) checkWorkflowStatus = opts.checkWorkflowStatus;

        try {
            const saved = localStorage.getItem('yolo_classes');
            classes = saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error('Ошибка разбора сохранённых классов', e);
            classes = [];
        }

        const savedSel = localStorage.getItem('yolo_selected_class');
        selectedClass = (savedSel && classes.includes(savedSel)) ? savedSel : (classes[0] || null);
    }

    /**
     * Возвращает копию списка классов.
     * @returns {string[]}
     */
    function getClasses() {
        return classes.slice();
    }

    /**
     * Возвращает выбранный класс или fallback.
     * @returns {string|null}
     */
    function getSelectedClass() {
        if (selectedClass) return selectedClass;
        const radio = document.querySelector('input[name="classRadio"]:checked');
        return radio ? radio.value : (classes[0] || 'Default');
    }

    /**
     * Устанавливает выбранный класс.
     * @param {string|null} name
     */
    function setSelectedClass(name) {
        selectedClass = name;
    }

    /**
     * Сохраняет классы и выбранный класс в localStorage.
     */
    function saveClasses() {
        localStorage.setItem('yolo_classes', JSON.stringify(classes));
        if (selectedClass) {
            localStorage.setItem('yolo_selected_class', selectedClass);
        }
    }

    /**
     * Отрисовывает список классов на странице Classes и селектор на странице Annotate.
     */
    function renderClasses() {
        const classesList = document.getElementById('classesList');
        if (classesList) {
            classesList.innerHTML = '';
            if (classes.length === 0) {
                classesList.innerHTML = '<p class="text-muted text-center text-white-50">No classes yet. Add your first class above.</p>';
            } else {
                classes.forEach(function (cls) {
                    const badge = document.createElement('span');
                    badge.className = 'badge rounded-pill text-bg-dark border border-secondary m-1 p-2 fs-6 cursor-pointer user-select-none d-inline-flex align-items-center gap-2';
                    if (cls === selectedClass) {
                        badge.classList.remove('text-bg-dark', 'border-secondary');
                        badge.classList.add('text-bg-danger', 'border-danger');
                    }
                    var escaped = JSON.stringify(cls).replace(/"/g, '&quot;');
                    badge.innerHTML = '<span>' + cls + '</span><i class="bi bi-x-circle-fill text-white-50 hover-text-white" onclick="event.stopPropagation(); window.removeClass(' + escaped + ')" title="Remove class" style="cursor: pointer;"></i>';
                    badge.onclick = function () {
                        selectedClass = cls;
                        saveClasses();
                        renderClasses();
                    };
                    classesList.appendChild(badge);
                });
            }
        }

        const classSelector = document.getElementById('annotation-class-select');
        if (classSelector) {
            classSelector.innerHTML = '<option disabled>Select Class...</option>';
            classes.forEach(function (cls) {
                const option = document.createElement('option');
                option.value = cls;
                option.textContent = cls;
                if (cls === selectedClass) option.selected = true;
                classSelector.appendChild(option);
            });
            classSelector.onchange = function (e) {
                selectedClass = e.target.value;
                saveClasses();
            };
        }
    }

    /**
     * Добавляет класс из поля #new-class-input.
     */
    function addClass() {
        const input = document.getElementById('new-class-input');
        if (!input) return;

        const name = input.value.trim();
        if (!name) return;

        if (classes.includes(name)) {
            showMessage('msg-class-exists:' + name, 'warning');
            return;
        }

        classes.push(name);
        selectedClass = name;
        saveClasses();
        renderClasses();
        input.value = '';
        if (typeof checkWorkflowStatus === 'function') checkWorkflowStatus();
        showMessage('msg-class-added:' + name, 'success');
    }

    /**
     * Удаляет класс по имени.
     * @param {string} cls
     */
    function removeClass(cls) {
        if (!confirm('Delete class "' + cls + '"?')) return;

        classes = classes.filter(function (c) { return c !== cls; });
        if (selectedClass === cls) {
            selectedClass = classes[0] || null;
        }
        saveClasses();
        renderClasses();
        if (typeof checkWorkflowStatus === 'function') checkWorkflowStatus();
    }

    /**
     * Добавляет класс по имени (без поля ввода). Используется при загрузке и three-step.
     * @param {string} name
     */
    function addClassByName(name) {
        if (classes.includes(name)) return;
        classes.push(name);
        selectedClass = name;
        saveClasses();
        renderClasses();
    }

    var Classes = {
        init: init,
        getClasses: getClasses,
        getSelectedClass: getSelectedClass,
        setSelectedClass: setSelectedClass,
        saveClasses: saveClasses,
        renderClasses: renderClasses,
        addClass: addClass,
        removeClass: removeClass,
        addClassByName: addClassByName
    };

    global.Classes = Classes;
})(typeof window !== 'undefined' ? window : this);
