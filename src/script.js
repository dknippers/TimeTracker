(function() {
    var state = {
        nextTaskId: 1,
        nextTaskName: null,
        tasksById: {}
    };

    var computed = {
        taskList: function() {
            return Object.keys(this.tasksById)
                .sort()
                .map(id => this.tasksById[id]);
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
            return this.tasks.find(task => task.active);
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
            if (includeSeconds || totalSeconds < 60)
                mappings.push([seconds, "s"]);

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

        function formatTimestamp(ts) {
            if (typeof ts !== "number") {
                return null;
            }

            const date = new Date(ts);

            var hours = date.getHours();
            var minutes = date.getMinutes();

            return zeropad(hours, 2) + ":" + zeropad(minutes, 2);
        }

        return {
            secondsToHms: secondsToHms,
            saveToStorage: saveToStorage,
            getFromStorage: getFromStorage,
            formatTimestamp: formatTimestamp
        };
    })();

    var fn = {
        getComputedTask: function(task) {
            const duration = this.getTaskDuration(task);
            const timeslots = task.chunks.map(this.getComputedChunk);

            return Object.assign({}, task, {
                duration: duration,
                timeslots: timeslots
            });
        },

        getComputedChunk: function(chunk) {
            return Object.assign({}, chunk, {
                beginTime: utils.formatTimestamp(chunk.begin),
                endTime: utils.formatTimestamp(chunk.end),
                duration: fn.getChunkDuration(chunk)
            });
        },

        save: function() {
            var toSave = {};
            for (var key in state) {
                if (key.indexOf("__") === 0) {
                    continue;
                }

                toSave[key] = state[key];
            }

            utils.saveToStorage("time-tracker", toSave);
        },

        inputTask: function() {
            this.addTask({ name: this.nextTaskName });
            this.nextTaskName = null;
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
            const id = this.nextTaskId++;

            return {
                id,
                parentId,
                name: name || `task #${id}`,
                active: false,
                chunks: []
            };
        },

        renameTask: function(id, newName) {
            this.updateTask(id, task => {
                task.name = newName;
                return task;
            });
        },

        updateTask: function(id, updateFn, doneFn) {
            const currentTask = this.tasksById[id];
            const newTask = updateFn(currentTask);
            Vue.set(this.tasksById, newTask.id, newTask);
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
                task.active = true;
                task.chunks.push({ begin: Date.now() });
                return task;
            });
        },

        stopTask: function(id) {
            this.updateTask(id, task => {
                if (task == null || task.active === false) {
                    return;
                }

                task.active = false;

                const lastChunk = task.chunks[task.chunks.length - 1];
                if (lastChunk != null) {
                    Vue.set(lastChunk, "end", Date.now());
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
        },

        clearAll: function() {
            this.nextTaskId = 1;
            for (var id in this.tasksById) {
                Vue.delete(this.tasksById, id);
                Vue.delete(this.ui.task.showDetails, id);
            }
        },

        resetTask: function(id) {
            this.updateTask(id, task => {
                task.active = false;
                Vue.set(task, "chunks", []);
                return task;
            });
        },

        getChunkDuration: function(chunk) {
            const elapsedSeconds = this.getChunkElapsedSeconds(chunk);
            return utils.secondsToHms(Math.round(elapsedSeconds));
        },

        getChunkElapsedSeconds: function(chunk) {
            if (chunk == null || chunk.begin == null || chunk.end == null) {
                return 0;
            }

            return (chunk.end - chunk.begin) / 1000;
        },

        getTaskTotalSeconds: function(task) {
            const taskSeconds = task.chunks.reduce(
                (sum, chunk) => sum + this.getChunkElapsedSeconds(chunk),
                0
            );

            const subTasks = this.subTasks[task.id];
            let subTasksSeconds = 0;

            if (Array.isArray(subTasks)) {
                subTasksSeconds = subTasks.reduce(
                    (sum, subTask) => sum + this.getTaskTotalSeconds(subTask),
                    0
                );
            }

            return taskSeconds + subTasksSeconds;
        },

        getTaskDuration: function(task) {
            const elapsedSeconds = this.getTaskTotalSeconds(task);
            return utils.secondsToHms(Math.round(elapsedSeconds));
        },

        getTaskClass: function(task) {
            const classNames = ["task"];

            if (task.active) {
                classNames.push("active");
            }

            return classNames.join(" ");
        }
    };

    Vue.component("task", {
        props: ["task", "parentId", "subTasks"],
        template: "#task"
    });

    Vue.component("task-summary", {
        props: ["task", "subTasks"],
        template: "#task-summary",

        data: function() {
            return {
                toggled: {}
            };
        },

        methods: {
            toggle: function(id) {
                Vue.set(this.toggled, id, !this.toggled[id]);
            }
        }
    });

    var app = new Vue({
        el: "#time-tracker",
        data: state,
        methods: fn,
        computed: computed,

        beforeCreate: function() {
            var oldState = utils.getFromStorage("time-tracker");
            if (oldState != null) {
                Object.assign(state, oldState);
            }
        },

        updated: function() {
            this.save();
        }
    });
})();
