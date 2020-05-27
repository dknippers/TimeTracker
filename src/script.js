(function () {
    const initialId = 1;

    var state = {
        nextId: initialId,
        tasksById: {},
        timeslotsById: {},

        now: Date.now(),

        ui: {
            confirm: {
                ok: null,
                okText: "Yes",
                cancel: null,
                cancelText: "No",
                text: null,
                always: null,
            },
        },
    };

    var computed = {
        taskList: function () {
            return utils.keyedObjectToArray(this.tasksById, t => t.id);
        },

        timeslots: function () {
            return utils.keyedObjectToArray(this.timeslotsById, ts => ts.begin);
        },

        timeslotsByTask: function () {
            const timeslotsByTask = {};

            for (const timeslot of this.timeslots) {
                if (timeslot.taskId != null) {
                    if (timeslotsByTask[timeslot.taskId] == null) {
                        timeslotsByTask[timeslot.taskId] = [];
                    }

                    timeslotsByTask[timeslot.taskId].push(timeslot);
                }
            }

            return timeslotsByTask;
        },

        tasks: function () {
            return this.taskList.map(this.getComputedTask);
        },

        rootTasks: function () {
            return this.tasks.filter(task => task.parentId == null);
        },

        subTasks: function () {
            const subTasks = {};

            for (const task of this.taskList) {
                if (task.parentId != null) {
                    if (subTasks[task.parentId] == null) {
                        subTasks[task.parentId] = [];
                    }

                    subTasks[task.parentId].push(task);
                }
            }

            return subTasks;
        },

        activeTask: function () {
            return this.tasks.find(task => task.isActive);
        },

        ancestors: function () {
            const ancestors = {};

            const cache = {};

            for (const task of this.taskList) {
                ancestors[task.id] = this.getAncestors(task, cache);
            }

            return ancestors;
        },

        totalDuration: function () {
            return this.rootTasks.reduce((sum, task) => sum + this.getTaskDuration(task), 0);
        },

        absoluteTotalDuration: function () {
            return Math.abs(this.totalDuration);
        },
    };

    var utils = (function () {
        /**
         * Converts the given amount of total seconds to a display format (e.g. 2d5h6m1s)
         * For example, input 100950 would yield 1d4h2m30s
         * @param {number} totalSeconds The seconds to convert to XhYmZs format
         * @param {{showDays: boolean, showHours: boolean, showMinutes: boolean, showSeconds: boolean}} parts Specify which parts to show in the output
         */
        function secondsToDisplayDuration(
            totalSeconds,
            { showDays = true, showHours = true, showMinutes = true, showSeconds = true } = {}
        ) {
            const isNegative = totalSeconds < 0;

            let seconds = Math.abs(totalSeconds);

            const components = [
                { label: "d", sec: 24 * 60 * 60, show: showDays },
                { label: "h", sec: 60 * 60, show: showHours },
                { label: "m", sec: 60, show: showMinutes },
                { label: "s", sec: 1, show: showSeconds },
            ].filter(v => v.show);

            let output = "";
            const last = components[components.length - 1];
            for (const component of components) {
                const value = Math.floor(seconds / component.sec);
                seconds %= component.sec;

                if (value > 0 || (!output && component === last)) {
                    output += value + component.label;
                }
            }

            return (isNegative ? "-" : "") + output;
        }

        function saveToStorage(key, value) {
            if (!window.localStorage) {
                return;
            }

            window.localStorage.setItem(key, JSON.stringify(value));
        }

        function getFromStorage(key) {
            if (!window.localStorage) {
                return null;
            }

            try {
                var value = window.localStorage.getItem(key);
                return JSON.parse(value);
            } catch (err) {
                console.error(err);
            }
        }

        function runIfFn(fn, thisArg) {
            if (typeof fn === "function") {
                var args = [].slice.apply(arguments).slice(2);
                fn.apply(thisArg, args);
            }
        }

        /**
         * Zeropads the given number (or string).
         * @param {string|number} nr Number to zeropad
         * @param {number} length Length to pad to
         */
        function zeropad(nr, length) {
            return pad(nr, "0", length);
        }

        /**
         * Pads the given input string from the left with the given character until the input string reaches the specified length
         * @param {number|string} input String to pad
         * @param {string} char Pad character
         * @param {number} length Length to pad input to
         * @returns {string} Padded string
         */
        function pad(input, char, length) {
            // Force to string
            let str = `${input}`;
            while (str.length < length) {
                str = char + str;
            }
            return str;
        }

        /**
         * Converts the given time string to a timestamp. Only supports HH:mm and interprets it as a time of the current day in the local timezone.
         * @param {string} time Time string to convert to a timestamp.
         */
        function timeToTimestamp(time) {
            const timeRe = /^([012]?[0-9]):?([0-5][0-9])$/;
            const matches = timeRe.exec(time);

            if (matches == null || matches.length !== 3) {
                if (time) {
                    console.warn(`Invalid time string, should match RegExp ${timeRe} but got "${time}"`);
                }

                return null;
            }

            const hr = parseInt(matches[1], 10);
            const min = parseInt(matches[2], 10);

            const dt = new Date();
            dt.setHours(hr);
            dt.setMinutes(min);
            dt.setSeconds(0, 0);

            return dt.getTime();
        }

        function keyedObjectToArray(obj, sortOn) {
            const array = Object.keys(obj).map(key => obj[key]);
            if (typeof sortOn === "function") {
                return sort(array, sortOn);
            } else {
                return array;
            }
        }

        function formatDuration(
            duration,
            { showZero = true, showSeconds = true, showMinutes = true, showHours = true, showDays = true } = {}
        ) {
            const rounded = Math.round(duration);
            const format = utils.secondsToDisplayDuration(rounded, {
                showDays,
                showSeconds,
                showMinutes,
                showHours,
            });

            if (!showZero && /^-?0[dhms]$/.test(format)) {
                return null;
            } else {
                return format;
            }
        }

        function formatTimestamp(timestamp, outputIfInvalid) {
            if (typeof timestamp !== "number") {
                if (timestamp != null) {
                    // User did pass in something so warn about wrong input here.
                    console.warn(`Timestamp should be a number, but got a ${typeof timestamp}`);
                }

                return outputIfInvalid;
            }

            const date = new Date(timestamp);

            var hours = date.getHours();
            var minutes = date.getMinutes();

            return utils.zeropad(hours, 2) + ":" + utils.zeropad(minutes, 2);
        }

        function sort(array, selector) {
            return array.sort((a, b) => {
                const vA = selector(a);
                const vB = selector(b);
                return vA > vB ? 1 : vB > vA ? -1 : 0;
            });
        }

        return {
            secondsToDisplayDuration,
            saveToStorage,
            getFromStorage,
            timeToTimestamp,
            sort,
            zeropad,
            pad,
            keyedObjectToArray,
            formatDuration,
            formatTimestamp,
            runIfFn,
        };
    })();

    var methods = {
        getComputedTask: function (task) {
            const timeslots = this.timeslotsByTask[task.id] || [];

            return Object.assign({}, task, {
                duration: this.getTaskDuration(task),
                timeslots: timeslots.map(this.getComputedTimeslot),
                subTasks: this.getSubTasks(task).map(this.getComputedTask),
                isActive: timeslots.some(timeslot => timeslot.begin != null && timeslot.end == null),

                // Reference to source object
                _source: task,
            });
        },

        getSubTasks: function (parentTask) {
            const subTasks = [];

            for (const task of this.taskList) {
                if (task.parentId === parentTask.id) {
                    subTasks.push(task);
                }
            }

            return subTasks;
        },

        getComputedTimeslot: function (timeslot) {
            return Object.assign({}, timeslot, {
                isActive: timeslot.begin != null && timeslot.end == null,
                end: timeslot.end || this.now,
                duration: this.getTimeslotDuration(timeslot),

                // Reference to source object
                _source: timeslot,
            });
        },

        getAncestors: function (task, cache) {
            const parent = this.tasksById[task.parentId];
            if (parent == null) {
                return [];
            }

            if (cache[task.id] != null) {
                return cache[task.id];
            }

            if (parent != null) {
                const ancestors = [parent, ...this.getAncestors(parent, cache)];
                cache[task.id] = ancestors;
                return ancestors;
            }
        },

        /**
         * @returns {boolean} true if taskA is an ancestor of taskB
         */
        isAncestor: function (taskA, taskB) {
            return this.ancestors[taskB.id].indexOf(taskA) > -1;
        },

        save: function () {
            var toSave = {};
            for (var key in state) {
                if (key.indexOf("_") === 0 || key.indexOf("$") === 0 || key === "now" || key === "ui") {
                    // Skip internal (_ / $) values and this.now
                    continue;
                }

                toSave[key] = state[key];
            }

            utils.saveToStorage("time-tracker", toSave);
        },

        inputTask: function (inputElement) {
            this.addTask({ name: inputElement.value });
            inputElement.value = "";
        },

        addTask: function (opts) {
            const name = opts.name;
            const parentId = opts.parentId;

            const newTask = this.createTask(name, parentId);

            this.updateTask(
                newTask.id,
                () => newTask,
                () => this.startTask(newTask.id)
            );
        },

        createTask: function (name, parentId) {
            const id = this.nextId++;

            const task = {
                id,
                parentId,
                name: name,
            };

            Vue.set(this.tasksById, id, task);

            return task;
        },

        moveTask: function (opts) {
            var taskId = opts.taskId;
            var parentId = opts.parentId;

            if (taskId != null && parentId != null && taskId !== parentId) {
                const task = this.tasksById[taskId];
                const parent = this.tasksById[parentId];

                if (task == null || parent == null || task.parentId === parent.id) {
                    return;
                }

                if (this.isAncestor(task, parent)) {
                    // A task cannot be moved to it's descendant,
                    // that can create a cycle
                    return;
                }

                this.updateTask(taskId, task => {
                    Vue.set(task, "parentId", parentId);
                    return task;
                });
            }
        },

        changeTimeslotBegin: function (args) {
            this.changeTimeslotTimestamp(args, "begin");
        },

        changeTimeslotEnd: function (args) {
            this.changeTimeslotTimestamp(args, "end");
        },

        changeTimeslotTimestamp: function (args, property) {
            const timeslotId = args.timeslotId;
            const timestamp = args.timestamp;

            this.updateTimeslot(timeslotId, timeslot => {
                Vue.set(timeslot, property, timestamp);
                return timeslot;
            });
        },

        onDrop: function (ev) {
            const taskId = ev.dataTransfer.getData("taskId");
            if (!taskId) {
                return;
            }

            this.updateTask(taskId, task => {
                Vue.delete(task, "parentId");
                return task;
            });
        },

        onDragOver: function (ev) {
            ev.preventDefault();
        },

        updateTask: function (id, updateFn, doneFn) {
            const currentTask = this.tasksById[id];
            updateFn(currentTask);
            if (typeof doneFn === "function") {
                doneFn();
            }
        },

        updateTimeslot: function (id, updateFn, doneFn) {
            const currentTimeslot = this.timeslotsById[id];
            if (currentTimeslot == null) {
                console.warn(`No timeslot found with id ${id}`);
                return;
            }

            const newTimeslot = updateFn(currentTimeslot);
            Vue.set(this.timeslotsById, newTimeslot.id, newTimeslot);
            if (typeof doneFn === "function") {
                doneFn();
            }
        },

        startTask: function (id) {
            const oldTask = this.activeTask;
            if (oldTask && oldTask.id !== id) {
                this.stopTask(oldTask.id);
            }

            this.updateTask(id, task => {
                this.createTimeslot(id);
                return task;
            });
        },

        stopTask: function (id) {
            this.updateTask(id, task => {
                if (task == null) {
                    return;
                }

                const timeslots = this.timeslotsByTask[id] || [];
                const activeSlots = timeslots.filter(slot => slot.begin != null && slot.end == null);

                const now = Date.now();

                for (const activeSlot of activeSlots) {
                    Vue.set(activeSlot, "end", now);
                }

                return task;
            });
        },

        removeTask: function (id) {
            Vue.delete(this.tasksById, id);

            const subTasks = this.subTasks[id];
            if (Array.isArray(subTasks)) {
                for (const subTask of subTasks) {
                    this.removeTask(subTask.id);
                }
            }

            const timeslots = this.timeslotsByTask[id];
            if (Array.isArray(timeslots)) {
                for (const timeslot of timeslots) {
                    this.removeTimeslot(timeslot.id);
                }
            }

            if (this.tasks.length === 0) {
                this.nextId = initialId;
            }
        },

        askToRemoveTask: function (id) {
            const task = this.tasksById[id];
            if (task == null) {
                return;
            }

            const taskName = task.name || "<no name>";

            this.showConfirmation(`Delete ${taskName}?`, () => this.removeTask(id), this.clearConfirmation);
        },

        showConfirmation: function (text, ok, always, cancel, okText, cancelText) {
            Vue.set(state.ui.confirm, "text", text);
            Vue.set(state.ui.confirm, "ok", ok);
            Vue.set(state.ui.confirm, "always", always);
            Vue.set(state.ui.confirm, "cancel", cancel);

            if (okText) {
                Vue.set(state.ui.confirm, "okText", okText);
            }

            if (cancelText) {
                Vue.set(state.ui.confirm, "cancelText", cancelText);
            }
        },

        clearConfirmation: function () {
            state.ui.confirm.ok = null;
            state.ui.confirm.cancel = null;
            state.ui.confirm.always = null;
            state.ui.confirm.text = null;
        },

        createTimeslot: function (taskId) {
            const id = this.nextId++;

            this.setNow();

            const timeslot = {
                id,
                taskId,
                begin: this.now,
            };

            Vue.set(this.timeslotsById, id, timeslot);

            return timeslot;
        },

        removeTimeslot: function (id) {
            Vue.delete(this.timeslotsById, id);
        },

        askToRemoveTimeslot: function (id) {
            const timeslot = this.timeslotsById[id];
            if (timeslot == null) {
                return;
            }

            const task = this.tasksById[timeslot.taskId];
            const taskName = (task && task.name) || "<no task>";

            const computed = this.getComputedTimeslot(timeslot);
            const begin = utils.formatTimestamp(computed.begin, "???");
            const end = utils.formatTimestamp(computed.end, "???");

            this.showConfirmation(
                `Remove ${begin} - ${end} of ${taskName}?`,
                () => this.removeTimeslot(id),
                this.clearConfirmation
            );
        },

        timeslotToNewTask: function (id) {
            const timeslot = this.timeslotsById[id];

            if (timeslot == null) {
                return;
            }

            const newTask = this.createTask(null, timeslot.taskId);
            this.timeslotToTask({ id, taskId: newTask.id });
        },

        timeslotToTask: function (opts) {
            const id = opts.id;
            const taskId = opts.taskId;

            if (this.tasksById[taskId] == null) {
                return;
            }

            this.updateTimeslot(id, timeslot => {
                Vue.set(timeslot, "taskId", taskId);
                return timeslot;
            });
        },

        clearAll: function () {
            const remove = () => {
                this.nextId = initialId;
                for (var taskId in this.tasksById) {
                    Vue.delete(this.tasksById, taskId);
                }
                for (var tsId in this.timeslotsById) {
                    Vue.delete(this.timeslotsById, tsId);
                }
            };

            this.showConfirmation("Remove all tasks?", remove, this.clearConfirmation);
        },

        resetTask: function (id) {
            this.updateTask(id, task => {
                this.clearTimeslots(id);
                return task;
            });
        },

        clearTimeslots: function (taskId) {
            const timeslots = this.timeslotsByTask[taskId];
            if (Array.isArray(timeslots)) {
                for (const timeslot of timeslots) {
                    Vue.delete(this.timeslotsById, timeslot.id);
                }
            }
        },

        getTimeslotDuration: function (ts) {
            if (ts == null || ts.begin == null) {
                return 0;
            }

            const end = ts.end || this.now;

            return Math.round((end - ts.begin) / 1000);
        },

        getTaskDuration: function (task) {
            const timeslots = this.timeslotsByTask[task.id] || [];
            const taskSeconds = timeslots.reduce((sum, ts) => sum + this.getTimeslotDuration(ts), 0);

            const subTasks = this.subTasks[task.id];
            let subTasksSeconds = 0;
            if (Array.isArray(subTasks)) {
                subTasksSeconds = subTasks.reduce((sum, subTask) => sum + this.getTaskDuration(subTask), 0);
            }

            return taskSeconds + subTasksSeconds;
        },

        updateDocumentTitle: function () {
            if (this.activeTask == null || this.activeTask.duration == null) {
                if (document.title !== this.documentTitle) {
                    document.title = this.documentTitle;
                }
            } else {
                const duration = utils.formatDuration(this.activeTask.duration, {
                    showZero: false,
                    showSeconds: Math.abs(this.activeTask.duration) < 60,
                });

                if (duration != null) {
                    const name = this.activeTask.name || "";
                    document.title = `${duration} - ${name}`;
                }
            }
        },

        formatDuration: utils.formatDuration,

        setNow: function () {
            this.now = Date.now();
        },

        skipSave: function (fn) {
            this.dontSave = 1;
            fn();
            Vue.nextTick(() => delete this.dontSave);
        },

        mainLoop: function (timeout) {
            this.skipSave(this.setNow);

            this.updateDocumentTitle();

            setTimeout(() => this.mainLoop(timeout), timeout);
        },
    };

    Vue.directive("focus", {
        inserted: function (el) {
            el.focus();
        },
    });

    Vue.component("task", {
        props: ["task"],
        template: "#task",

        mounted: function () {
            const el = this.$el;

            el.addEventListener("dragstart", this.onDragStart);
            el.addEventListener("dragend", this.onDragEnd);
            el.addEventListener("dragover", this.onDragOver);
            el.addEventListener("dragleave", this.onDragLeave);
            el.addEventListener("drop", this.onDrop);

            document.addEventListener("click", this.onClick);

            if (!this.task.name) {
                this.editName = true;
            }
        },

        beforeDestroy: function () {
            this.$el.removeEventListener("dragstart", this.onDragStart);
            this.$el.removeEventListener("dragend", this.onDragEnd);
            this.$el.removeEventListener("dragover", this.onDragOver);
            this.$el.removeEventListener("drop", this.onDrop);
            this.$el.removeEventListener("dragleave", this.onDragLeave);

            document.removeEventListener("click", this.onClick);
        },

        data: function () {
            return {
                dropzone: false,
                dragging: false,
                editName: false,
                collapsed: false,
            };
        },

        methods: {
            formatTimestamp: utils.formatTimestamp,
            formatDuration: utils.formatDuration,

            onDragStart: function (ev) {
                ev.stopPropagation();

                ev.dataTransfer.effectAllowed = "move";
                ev.dataTransfer.dropEffect = "move";
                ev.dataTransfer.setData("taskId", this.task.id);
                this.dragging = true;
            },

            onDragEnd: function (ev) {
                ev.preventDefault();
                this.dragging = false;
                this.$el.setAttribute("draggable", "false");
            },

            onDragOver: function (ev) {
                ev.preventDefault();
                ev.stopPropagation();

                this.dropzone = true;
            },

            onDragLeave: function (ev) {
                ev.preventDefault();
                this.dropzone = false;
            },

            onDrop: function (ev) {
                ev.preventDefault();
                ev.stopPropagation();

                this.dropzone = false;

                const taskId = parseInt(ev.dataTransfer.getData("taskId"), 10);
                const timeslotId = parseInt(ev.dataTransfer.getData("timeslotId"), 10);

                if (isNaN(taskId)) {
                    // Nothing to do
                    return;
                }

                if (!isNaN(timeslotId)) {
                    this.onDropTimeslot(timeslotId);
                } else {
                    this.onDropTask(taskId);
                }
            },

            onDropTask: function (taskId) {
                this.$emit("move-task", {
                    taskId: taskId,
                    parentId: this.task.id,
                });
            },

            onDropTimeslot: function (timeslotId) {
                this.$emit("timeslot-to-task", {
                    id: timeslotId,
                    taskId: this.task.id,
                });
            },

            onClick: function (ev) {
                if (ev.target == null || ev.target.parentNode == null) {
                    // Ignore
                    return;
                }

                const task = ev.target.closest(".task");
                if (task !== this.$el) {
                    if (this.task.name) {
                        this.editName = false;
                    }
                }
            },

            toggleEdit: function () {
                if (this.task.name) {
                    this.editName = !this.editName;
                }
            },
        },
    });

    Vue.component("timeslot", {
        props: ["timeslot", "task"],
        template: "#timeslot",

        mounted: function () {
            this.$el.addEventListener("dragstart", this.onDragStart);
            this.$el.addEventListener("dragend", this.onDragEnd);
            document.addEventListener("click", this.onClick);
        },

        beforeDestroy: function () {
            this.$el.removeEventListener("dragstart", this.onDragStart);
            this.$el.removeEventListener("dragend", this.onDragEnd);
            document.removeEventListener("click", this.onClick);
        },

        data: function () {
            return {
                // when editing begin or end,
                // the models for the inputs will be begin/end.
                begin: null,
                end: null,
                dragging: false,
            };
        },

        methods: {
            formatTimestamp: utils.formatTimestamp,
            formatDuration: utils.formatDuration,

            changeTimeslotBegin: function (time) {
                const timeslotId = this.timeslot.id;
                const timestamp = utils.timeToTimestamp(time);
                this.$emit("change-timeslot-begin", { timeslotId, timestamp });
                this.begin = null;
            },

            changeTimeslotEnd: function (time) {
                const timeslotId = this.timeslot.id;
                const timestamp = utils.timeToTimestamp(time);
                this.$emit("change-timeslot-end", { timeslotId, timestamp });
                this.end = null;
            },

            onDragStart: function (ev) {
                console.log("dragStart");
                ev.stopPropagation();

                ev.dataTransfer.dropEffect = "move";
                ev.dataTransfer.setData("timeslotId", this.timeslot.id);
                ev.dataTransfer.setData("taskId", this.timeslot.taskId);
                this.dragging = true;
            },

            onDragEnd: function (ev) {
                console.log("dragEnd");
                ev.preventDefault();
                this.dragging = false;
            },

            onClick: function (ev) {
                if (ev.target == null || ev.target.parentNode == null) {
                    // Ignore
                    return;
                }

                const timeslot = ev.target.closest(".timeslot");
                if (timeslot !== this.$el) {
                    this.begin = null;
                    this.end = null;
                }
            },
        },
    });

    Vue.component("confirm-dialog", {
        template: "#confirm-dialog",
        props: ["config"],
        methods: {
            ok: function () {
                utils.runIfFn(this.config.ok);
                utils.runIfFn(this.config.always);
            },

            cancel: function () {
                utils.runIfFn(this.config.cancel);
                utils.runIfFn(this.config.always);
            },

            onClick: function (ev) {
                ev.preventDefault();
                ev.stopPropagation();

                if (ev.target === this.$el) {
                    this.cancel();
                }
            },

            onKeyup: function (ev) {
                if (ev.keyCode === 27) {
                    // Cancel on escape
                    this.cancel();
                }
            },
        },

        mounted: function () {
            this.$el.addEventListener("click", this.onClick);
            document.addEventListener("keyup", this.onKeyup);
        },

        beforeDestroy: function () {
            this.$el.removeEventListener("click", this.onClick);
            document.removeEventListener("keyup", this.onKeyup);
        },
    });

    const app = new Vue({
        el: "#time-tracker",
        data: state,
        methods: methods,
        computed: computed,

        beforeCreate: function () {
            var oldState = utils.getFromStorage("time-tracker");
            if (oldState != null) {
                Object.assign(state, oldState);
            }
        },

        mounted: function () {
            this.documentTitle = document.title;

            Vue.nextTick(() => this.mainLoop(1000));

            this.$el.addEventListener("drop", this.onDrop);
            this.$el.addEventListener("dragover", this.onDragOver);
        },

        beforeDestroy: function () {
            this.$el.removeEventListener("drop", this.onDrop);
            this.$el.removeEventListener("dragover", this.onDragOver);
        },

        updated: function () {
            if (!this.dontSave) {
                this.save();
            }
        },
    });
})();
