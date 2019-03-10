(function() {
    const initialId = 1;

    var state = {
        nextId: initialId,
        tasksById: {},
        timeslotsById: {},

        now: Date.now()
    };

    var computed = {
        taskList: function() {
            return utils.keyedObjectToArray(this.tasksById, t => t.id);
        },

        timeslots: function() {
            return utils.keyedObjectToArray(this.timeslotsById, ts => ts.begin);
        },

        timeslotsByTask: function() {
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

        tasks: function() {
            return this.taskList.map(this.getComputedTask);
        },

        rootTasks: function() {
            return this.tasks.filter(task => task.parentId == null);
        },

        subTasks: function() {
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

        activeTask: function() {
            return this.tasks.find(task => task.isActive);
        }
    };

    var utils = (function() {
        /**
         * Converts the given amount of seconds to the XhYmZs format.
         * For example, input 3750 would yield 1h2m30s
         * @param {number} totalSeconds The seconds to convert to XhYmZs format
         * @param {{includeHours: boolean, includeMinutes: boolean, includeSeconds: boolean}} parts Specify which parts to include in the output
         */
        function secondsToHms(
            totalSeconds,
            {
                includeHours = true,
                includeMinutes = true,
                includeSeconds = true
            } = {}
        ) {
            let seconds = totalSeconds;

            const hours = Math.floor(seconds / 3600);
            seconds %= 3600;

            const minutes = Math.floor(seconds / 60);
            seconds %= 60;

            const mappings = [];

            if (includeHours) mappings.push([hours, "h"]);
            if (includeMinutes) mappings.push([minutes, "m"]);
            if (includeSeconds) mappings.push([seconds, "s"]);

            let hms = "";
            let empty = true;
            for (let i = 0; i < mappings.length; i++) {
                const pair = mappings[i];
                const value = pair[0];
                const label = pair[1];

                if (value > 0 || (empty && i === mappings.length - 1)) {
                    hms += value + label;
                    empty = false;
                }
            }

            return hms;
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
            const timeRe = /^[012]?[0-9]:[0-5][0-9]$/;
            if (!timeRe.test(time)) {
                console.warn(
                    `Invalid time string, should match RegExp ${timeRe}`
                );
                return null;
            }

            var hrMin = time.split(":").map(v => parseInt(v));
            const hr = hrMin[0];
            const min = hrMin[1];

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

        function sort(array, selector) {
            return array.sort((a, b) => {
                const vA = selector(a);
                const vB = selector(b);
                return vA > vB ? 1 : vB > vA ? -1 : 0;
            });
        }

        return {
            secondsToHms,
            saveToStorage,
            getFromStorage,
            timeToTimestamp,
            sort,
            zeropad,
            pad,
            keyedObjectToArray
        };
    })();

    var methods = {
        getComputedTask: function(task) {
            const timeslots = this.timeslotsByTask[task.id] || [];

            return Object.assign({}, task, {
                duration: this.getTaskDuration(task),
                timeslots: timeslots.map(this.getComputedTimeslot),
                subTasks: this.getSubTasks(task).map(this.getComputedTask),
                isActive: timeslots.some(
                    timeslot => timeslot.begin != null && timeslot.end == null
                ),

                // Reference to source object
                _source: task
            });
        },

        getSubTasks: function(parentTask) {
            const subTasks = [];

            for (const task of this.taskList) {
                if (task.parentId === parentTask.id) {
                    subTasks.push(task);
                }
            }

            return subTasks;
        },

        getComputedTimeslot: function(timeslot) {
            return Object.assign({}, timeslot, {
                duration: this.getTimeslotDuration(timeslot),

                // Reference to source object
                _source: timeslot
            });
        },

        save: function() {
            var toSave = {};
            for (var key in state) {
                if (key.indexOf("__") === 0 || key === "now") {
                    continue;
                }

                toSave[key] = state[key];
            }

            utils.saveToStorage("time-tracker", toSave);
        },

        inputTask: function(inputElement) {
            this.addTask({ name: inputElement.value });
            inputElement.value = "";
        },

        addTask: function(opts) {
            const name = opts.name;
            const parentId = opts.parentId;

            const newTask = this.createTask(name, parentId);

            this.updateTask(
                newTask.id,
                () => newTask,
                () => this.startTask(newTask.id)
            );
        },

        createTask: function(name, parentId) {
            const id = this.nextId++;

            return {
                id,
                parentId,
                name: name
            };
        },

        setParentId: function(opts) {
            var taskId = opts.taskId;
            var parentId = opts.parentId;

            if (taskId != null && parentId != null && taskId !== parentId) {
                const task = this.tasksById[taskId];
                const parent = this.tasksById[parentId];

                if (
                    task != null &&
                    parent != null &&
                    task.parentId !== parent.id
                ) {
                    if (parent.parentId === task.id) {
                        this.updateTask(parentId, task => {
                            Vue.delete(task, "parentId");
                            return task;
                        });
                    }

                    this.updateTask(taskId, task => {
                        Vue.set(task, "parentId", parentId);
                        return task;
                    });
                }
            }
        },

        changeTimeslotBegin: function(args) {
            this.changeTimeslotTimestamp(args, "begin");
        },

        changeTimeslotEnd: function(args) {
            this.changeTimeslotTimestamp(args, "end");
        },

        changeTimeslotTimestamp: function(args, property) {
            const timeslotId = args.timeslotId;
            const timestamp = args.timestamp;

            this.updateTimeslot(timeslotId, timeslot => {
                Vue.set(timeslot, property, timestamp);
                return timeslot;
            });
        },

        onDrop: function(ev) {
            const taskId = ev.dataTransfer.getData("taskId");

            this.updateTask(taskId, task => {
                Vue.delete(task, "parentId");
                return task;
            });
        },

        onDragOver: function(ev) {
            ev.preventDefault();
        },

        updateTask: function(id, updateFn, doneFn) {
            const currentTask = this.tasksById[id];

            const newTask = updateFn(currentTask);
            Vue.set(this.tasksById, newTask.id, newTask);
            if (typeof doneFn === "function") {
                doneFn();
            }
        },

        updateTimeslot: function(id, updateFn, doneFn) {
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

        startTask: function(id) {
            const oldTask = this.activeTask;
            if (oldTask && oldTask.id !== id) {
                this.stopTask(oldTask.id);
            }

            this.updateTask(id, task => {
                this.createTimeslot(id);
                return task;
            });
        },

        stopTask: function(id) {
            this.updateTask(id, task => {
                if (task == null) {
                    return;
                }

                const timeslots = this.timeslotsByTask[id] || [];
                const lastSlot = timeslots[timeslots.length - 1];
                if (lastSlot != null && lastSlot.end == null) {
                    Vue.set(lastSlot, "end", Date.now());
                }

                return task;
            });
        },

        removeTask: function(id) {
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
                    Vue.delete(this.timeslotsById, timeslot.id);
                }
            }

            if (this.tasks.length === 0) {
                this.nextId = initialId;
            }
        },

        createTimeslot: function(taskId) {
            const id = this.nextId++;

            this.now = Date.now();

            const timeslot = {
                id,
                taskId,
                begin: this.now
            };

            Vue.set(this.timeslotsById, id, timeslot);

            return timeslot;
        },

        removeTimeslot: function(id) {
            Vue.delete(this.timeslotsById, id);
        },

        clearAll: function() {
            this.nextId = initialId;
            for (var taskId in this.tasksById) {
                Vue.delete(this.tasksById, taskId);
            }
            for (var tsId in this.timeslotsById) {
                Vue.delete(this.timeslotsById, tsId);
            }
        },

        resetTask: function(id) {
            this.updateTask(id, task => {
                this.clearTimeslots(id);
                return task;
            });
        },

        clearTimeslots: function(taskId) {
            const timeslots = this.timeslotsByTask[taskId];
            if (Array.isArray(timeslots)) {
                for (const timeslot of timeslots) {
                    Vue.delete(this.timeslotsById, timeslot.id);
                }
            }
        },

        getTimeslotDuration: function(ts) {
            if (ts == null || ts.begin == null) {
                return 0;
            }

            const end = ts.end || this.now;

            return (end - ts.begin) / 1000;
        },

        getTaskDuration: function(task) {
            const timeslots = this.timeslotsByTask[task.id] || [];
            const taskSeconds = timeslots.reduce(
                (sum, ts) => sum + this.getTimeslotDuration(ts),
                0
            );

            const subTasks = this.subTasks[task.id];
            let subTasksSeconds = 0;
            if (Array.isArray(subTasks)) {
                subTasksSeconds = subTasks.reduce(
                    (sum, subTask) => sum + this.getTaskDuration(subTask),
                    0
                );
            }

            return taskSeconds + subTasksSeconds;
        }
    };

    Vue.component("task", {
        props: ["task", "parentId"],
        data: function() {
            return {
                dropzone: false,
                dragging: false,
                editName: false,

                // Timeslot id -> true/false
                editBegin: {},
                editEnd: {}
            };
        },
        template: "#task",
        methods: {
            formatDuration: function(
                duration,
                {
                    showZero = true,
                    includeSeconds = true,
                    includeMinutes = true,
                    includeHours = true
                } = {}
            ) {
                const rounded = Math.round(duration);
                const format = utils.secondsToHms(rounded, {
                    includeSeconds,
                    includeMinutes,
                    includeHours
                });

                if (!showZero && /^0[hms]$/.test(format)) {
                    return null;
                } else {
                    return format;
                }
            },

            formatTimestamp: function(timestamp) {
                if (typeof timestamp !== "number") {
                    if (timestamp != null) {
                        // User did pass in something so warn about wrong input here.
                        console.warn(
                            `Timestamp should be a number, but got a ${typeof timestamp}`
                        );
                    }

                    return null;
                }

                const date = new Date(timestamp);

                var hours = date.getHours();
                var minutes = date.getMinutes();

                return (
                    utils.zeropad(hours, 2) + ":" + utils.zeropad(minutes, 2)
                );
            },

            doEditBegin: function(timeslotId) {
                Vue.set(this.editBegin, timeslotId, true);
            },

            doEditEnd: function(timeslotId) {
                Vue.set(this.editEnd, timeslotId, true);
            },

            changeTimeslotBegin: function(timeslotId, time) {
                const timestamp = utils.timeToTimestamp(time);
                this.$emit("change-timeslot-begin", { timeslotId, timestamp });
                Vue.delete(this.editBegin, timeslotId);
            },

            changeTimeslotEnd: function(timeslotId, time) {
                const timestamp = utils.timeToTimestamp(time);
                this.$emit("change-timeslot-end", { timeslotId, timestamp });
                Vue.delete(this.editEnd, timeslotId);
            },

            onDragStart: function(ev) {
                ev.stopPropagation();

                ev.dataTransfer.dropEffect = "move";
                ev.dataTransfer.setData("taskId", this.task.id);
                ev.dataTransfer.setData("parentId", this.task.parentId);
                this.dragging = true;
            },

            onDragEnd: function(ev) {
                ev.preventDefault();
                this.dragging = false;
            },

            onDragOver: function(ev) {
                ev.preventDefault();
                ev.stopPropagation();

                this.dropzone = true;
            },

            onDragLeave: function(ev) {
                ev.preventDefault();
                this.dropzone = false;
            },

            onDrop: function(ev) {
                ev.preventDefault();
                ev.stopPropagation();

                this.dropzone = false;

                const droppedTaskId = parseInt(
                    ev.dataTransfer.getData("taskId"),
                    10
                );

                if (!isNaN(droppedTaskId)) {
                    this.$emit("set-parent-id", {
                        taskId: droppedTaskId,
                        parentId: this.task.id
                    });
                }
            }
        },

        mounted: function() {
            this.$el.addEventListener("dragstart", this.onDragStart);
            this.$el.addEventListener("dragend", this.onDragEnd);
            this.$el.addEventListener("dragover", this.onDragOver);
            this.$el.addEventListener("dragleave", this.onDragLeave);
            this.$el.addEventListener("drop", this.onDrop);

            if (this.task.name == null || this.task.name.length === 0) {
                this.editName = true;
            }
        },

        beforeDestroy: function() {
            this.$el.removeEventListener("dragstart", this.onDragStart);
            this.$el.removeEventListener("dragend", this.onDragEnd);
            this.$el.removeEventListener("dragover", this.onDragOver);
            this.$el.removeEventListener("drop", this.onDrop);
            this.$el.removeEventListener("dragleave", this.onDragLeave);
        }
    });

    var app = new Vue({
        el: "#time-tracker",
        data: state,
        methods: methods,
        computed: computed,

        beforeCreate: function() {
            var oldState = utils.getFromStorage("time-tracker");
            if (oldState != null) {
                Object.assign(state, oldState);
            }
        },

        mounted: function() {
            this.$el.addEventListener("drop", this.onDrop);
            this.$el.addEventListener("dragover", this.onDragOver);

            setInterval(() => {
                this._$dontSave = 1;
                this.now = Date.now();
                Vue.nextTick(() => delete this._$dontSave);
            }, 1000);
        },

        beforeDestroy: function() {
            this.$el.removeEventListener("drop", this.onDrop);
            this.$el.removeEventListener("dragover", this.onDragOver);
        },

        updated: function() {
            if (!this._$dontSave) {
                this.save();
            }
        }
    });
})();
