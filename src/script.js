(function() {
    var state = {
        nextTaskId: 1,
        nextTaskName: null,
        tasksById: {},

        ui: {
            task: {
                // task id => true/false
                showDetails: {}
            }
        }
    };

    var computed = {
        tasks: function() {
            return Object.keys(this.tasksById)
                .sort()
                .map(id => this.tasksById[id]);
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

        return {
            secondsToHms: secondsToHms,
            saveToStorage: saveToStorage,
            getFromStorage: getFromStorage
        };
    })();

    var fn = {
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

        toggleDetails: function(taskId) {
            Vue.set(
                this.ui.task.showDetails,
                taskId,
                !this.ui.task.showDetails[taskId]
            );
        },

        inputTask: function() {
            this.addTask(this.nextTaskName);
            this.nextTaskName = null;
        },

        addTask: function(name) {
            const newTask = this.createTask(name);

            this.updateTask(
                newTask.id,
                () => newTask,
                () => this.startTask(newTask.id)
            );
        },

        createTask: function(name) {
            const id = this.nextTaskId++;

            return {
                id,
                name: name || `task #${id}`,
                active: false,
                begin: null,
                end: null,
                chunks: []
            };
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
                if (lastChunk.end == null) {
                    lastChunk.end = Date.now();
                }

                return task;
            });
        },

        removeTask: function(id) {
            Vue.delete(this.tasksById, id);
        },

        clearAll: function() {
            this.nextTaskId = 1;
            for (var id in this.tasksById) {
                Vue.delete(this.tasksById, id);
                Vue.delete(this.ui.task.showDetails, id);
            }
        },

        resetTask: function(id) {
            this.updateTask(id, task =>
                Object.assign({}, task, { chunks: [], active: false })
            );
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
            return task.chunks.reduce(
                (sum, chunk) => sum + this.getChunkElapsedSeconds(chunk),
                0
            );
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
