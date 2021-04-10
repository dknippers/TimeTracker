<template>
  <div id="time-tracker" :class="{ loaded: 1, dropzone: dropzone }">
    <main>
      <div class="top-container">
        <div class="left">
          <button v-if="rootTasks.length > 0" type="button" @click="clearAll($event.clientY)" class="remove-all">
            <i class="far fa-trash-alt"></i>
            <span class="text">remove all</span>
          </button>
        </div>
        <div class="center">
          <input class="new-task" type="text" placeholder="New task" @keyup.enter="inputTask($event.target)" />
        </div>
        <div class="right">
          <div class="total-duration" :class="{ visible: absoluteTotalDuration > 0 }">
            <i class="far fa-clock"></i>
            <span
              class="clock"
              v-text="formatDuration(totalDuration, { showSeconds: absoluteTotalDuration < 60 })"
            ></span>
          </div>
        </div>
      </div>

      <Task
        v-for="task in rootTasks"
        :key="task.id"
        :task="task"
        @add-task="addTask($event)"
        @remove-task-confirmation="removeTaskConfirmation($event)"
        @reset-task="resetTask($event)"
        @start-task="startTask($event)"
        @stop-task="stopTask($event)"
        @move-task="moveTask($event)"
        @change-timeslot-begin="changeTimeslotBegin($event)"
        @change-timeslot-end="changeTimeslotEnd($event)"
        @remove-timeslot-confirmation="removeTimeslotConfirmation($event)"
        @timeslot-to-new-task="timeslotToNewTask($event)"
        @timeslot-to-task="timeslotToTask($event)"
      />
    </main>

    <ConfirmDialog v-if="confirmation.ok" :config="confirmation" />
  </div>
</template>

<script>
import Vue from "vue";
import * as utils from "./utils.js";
import Task from "./components/Task.vue";
import ConfirmDialog from "./components/ConfirmDialog.vue";
import debounce from "lodash/debounce";

const initialId = 1;

Vue.directive("focus", {
  inserted: el => el.focus(),
});

export default {
  name: "app",
  components: {
    Task,
    ConfirmDialog,
  },

  data: () => {
    const state = {
      // Persisted state
      nextId: initialId,
      tasksById: {},
      timeslotsById: {},

      // Transient state
      now: Date.now(),
      dropzone: false,

      confirmation: {
        ok: null,
        okText: null,
        cancel: null,
        cancelText: null,
        text: null,
        always: null,
        posY: null,
      },
    };

    const savedState = utils.getFromStorage("time-tracker");
    if (savedState != null) {
      Object.assign(state, savedState);
    }

    return state;
  },

  computed: {
    tasks: function() {
      return Object.values(this.tasksById);
    },

    timeslots: function() {
      return Object.values(this.timeslotsById);
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

    computedTasks: function() {
      return this.tasks.map(this.getComputedTask);
    },

    rootTasks: function() {
      return this.computedTasks.filter(task => task.parentId == null);
    },

    subTasks: function() {
      const subTasks = {};

      for (const task of this.tasks) {
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
      return this.computedTasks.find(task => task.isActive);
    },

    ancestors: function() {
      const ancestors = {};

      const cache = {};

      for (const task of this.tasks) {
        ancestors[task.id] = this.getAncestors(task, cache);
      }

      return ancestors;
    },

    totalDuration: function() {
      return this.rootTasks.reduce((sum, task) => sum + this.getTaskDuration(task), 0);
    },

    absoluteTotalDuration: function() {
      return Math.abs(this.totalDuration);
    },
  },

  methods: {
    getComputedTask: function(task) {
      const timeslots = this.timeslotsByTask[task.id] || [];

      const subTasks = this.getSubTasks(task).map(this.getComputedTask);

      return Object.assign({}, task, {
        duration: this.getTaskDuration(task),
        timeslots: timeslots.map(this.getComputedTimeslot),
        subTasks,
        isActive: timeslots.some(timeslot => timeslot.begin != null && timeslot.end == null),
        isActiveAncestor: subTasks.some(subTask => subTask.isActive || subTask.isActiveAncestor),

        // Reference to source object
        _source: task,
      });
    },

    getSubTasks: function(parentTask) {
      const subTasks = [];

      for (const task of this.tasks) {
        if (task.parentId === parentTask.id) {
          subTasks.push(task);
        }
      }

      return subTasks;
    },

    getComputedTimeslot: function(timeslot) {
      return Object.assign({}, timeslot, {
        isActive: timeslot.begin != null && timeslot.end == null,
        end: timeslot.end || this.now,
        duration: this.getTimeslotDuration(timeslot),

        // Reference to source object
        _source: timeslot,
      });
    },

    getAncestors: function(task, cache) {
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
    isAncestor: function(taskA, taskB) {
      return this.ancestors[taskB.id].indexOf(taskA) > -1;
    },

    save: function() {
      // Persist subset of state
      const { nextId, tasksById, timeslotsById } = this;
      const toSave = { nextId, tasksById, timeslotsById };
      utils.saveToStorage("time-tracker", toSave);
    },

    inputTask: function(inputElement) {
      this.addTask({ name: inputElement.value });
      inputElement.value = "";
    },

    addTask: function({ name, parentId }) {
      const newTask = this.createTask(name, parentId);
      this.startTask(newTask.id);
    },

    createTask: function(name, parentId) {
      const id = this.nextId++;

      const task = {
        id,
        parentId,
        name: name,
      };

      Vue.set(this.tasksById, id, task);

      return task;
    },

    moveTask: function({ taskId, parentId }) {
      if (taskId != null && parentId != null && taskId !== parentId) {
        const task = this.tasksById[taskId];
        const parent = this.tasksById[parentId];

        if (task == null || parent == null || task.parentId === parent.id) {
          return;
        }

        if (this.isAncestor(task, parent)) {
          // A task cannot be moved to its descendant,
          // that can create a cycle
          return;
        }

        this.updateTask(taskId, task => {
          Vue.set(task, "parentId", parentId);
          return task;
        });
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
      this.dropzone = false;

      const taskId = ev.dataTransfer.getData("taskId");
      if (!taskId) {
        return;
      }

      this.updateTask(taskId, task => {
        Vue.delete(task, "parentId");
        return task;
      });
    },

    onDragOver: function(ev) {
      ev.preventDefault();

      const isTimeslot = ev.dataTransfer.types.indexOf("timeslotid") > -1;
      if (isTimeslot) {
        ev.dataTransfer.dropEffect = "none";
      } else {
        this.dropzone = true;
      }
    },

    onDragLeave: function(ev) {
      ev.preventDefault();

      this.dropzone = false;
    },

    updateTask: function(id, updateFn) {
      const task = this.tasksById[id];
      if (task == null) {
        return;
      }

      updateFn(task);
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
        const activeSlots = timeslots.filter(slot => slot.begin != null && slot.end == null);

        const now = Date.now();

        for (const activeSlot of activeSlots) {
          Vue.set(activeSlot, "end", now);
        }

        return task;
      });
    },

    removeTask: function(id) {
      if (!this.tasksById[id]) {
        // Does not exist
        return;
      }

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

    removeTaskConfirmation: function(evt) {
      const taskId = evt.taskId;

      const task = this.tasksById[taskId];
      if (task == null) {
        return;
      }

      const taskName = task.name || "<no name>";

      this.showConfirmation({
        text: `Remove ${taskName}?`,
        ok: () => this.removeTask(taskId),
        always: this.clearConfirmation,
        posY: evt.posY,
      });
    },

    showConfirmation: function({ text, ok, always, cancel, posY, okText = "Yes", cancelText = "No" }) {
      Object.assign(this.confirmation, { text, ok, always, cancel, posY, okText, cancelText });
    },

    clearConfirmation: function() {
      Object.keys(this.confirmation).forEach(key => (this.confirmation[key] = null));
    },

    createTimeslot: function(taskId) {
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

    removeTimeslot: function(id) {
      Vue.delete(this.timeslotsById, id);
    },

    removeTimeslotConfirmation: function(evt) {
      const timeslotId = evt.timeslotId;
      const timeslot = this.timeslotsById[timeslotId];
      if (timeslot == null) {
        return;
      }

      const task = this.tasksById[timeslot.taskId];
      const taskName = (task && task.name) || "<no task>";

      const computed = this.getComputedTimeslot(timeslot);
      const begin = utils.formatTimestamp(computed.begin, "???");
      const end = utils.formatTimestamp(computed.end, "???");

      this.showConfirmation({
        text: `Remove ${begin} - ${end} of ${taskName}?`,
        ok: () => this.removeTimeslot(timeslotId),
        always: this.clearConfirmation,
        posY: evt.posY,
      });
    },

    timeslotToNewTask: function(id) {
      const timeslot = this.timeslotsById[id];

      if (timeslot == null) {
        return;
      }

      const newTask = this.createTask(null, timeslot.taskId);
      this.timeslotToTask({ id, taskId: newTask.id });
    },

    timeslotToTask: function({ id, taskId }) {
      if (this.tasksById[taskId] == null) {
        return;
      }

      this.updateTimeslot(id, timeslot => {
        Vue.set(timeslot, "taskId", taskId);
        return timeslot;
      });
    },

    clearAll: function(posY) {
      const remove = () => {
        this.nextId = initialId;
        for (const taskId in this.tasksById) {
          Vue.delete(this.tasksById, taskId);
        }
        for (const tsId in this.timeslotsById) {
          Vue.delete(this.timeslotsById, tsId);
        }
      };

      this.showConfirmation({
        text: "Remove all tasks?",
        ok: remove,
        always: this.clearConfirmation,
        posY: posY,
      });
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

      return Math.round((end - ts.begin) / 1000);
    },

    getTaskDuration: function(task) {
      const timeslots = this.timeslotsByTask[task.id] || [];
      const taskSeconds = timeslots.reduce((sum, ts) => sum + this.getTimeslotDuration(ts), 0);

      const subTasks = this.subTasks[task.id];
      let subTasksSeconds = 0;
      if (Array.isArray(subTasks)) {
        subTasksSeconds = subTasks.reduce((sum, subTask) => sum + this.getTaskDuration(subTask), 0);
      }

      return taskSeconds + subTasksSeconds;
    },

    updateDocumentTitle: function() {
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

    setNow: function() {
      this.now = Date.now();
    },

    mainLoop: function(timeout) {
      this.setNow();
      this.updateDocumentTitle();
      setTimeout(() => this.mainLoop(timeout), timeout);
    },
  },

  mounted: function() {
    this.documentTitle = document.title;

    Vue.nextTick(() => this.mainLoop(1000));

    this.$el.addEventListener("drop", this.onDrop);
    this.$el.addEventListener("dragover", this.onDragOver);
    this.$el.addEventListener("dragleave", this.onDragLeave);

    const debouncedSave = debounce(this.save, 250);
    this.$watch("tasksById", debouncedSave, { deep: true });
    this.$watch("timeslotsById", debouncedSave, { deep: true });
  },

  beforeDestroy: function() {
    this.$el.removeEventListener("drop", this.onDrop);
    this.$el.removeEventListener("dragover", this.onDragOver);
    this.$el.removeEventListener("dragleave", this.onDragLeave);
  },
};
</script>

<style lang="less">
@import "styles/extends.less";
@import "styles/variables.less";

* {
  box-sizing: border-box;
  font-family: Calibri, Ubuntu, sans-serif;
}

html {
  // Minimum font-size (usually 12px)
  font-size: 75%;
}

@media screen and (min-width: 300px) {
  html {
    // Dynamic font size: scale between 12px and 16px
    font-size: @dynamicFontSize;
  }
}

@media screen and (min-width: 600px) {
  html {
    // Maximum font-size (usually 16px)
    font-size: 100%;
  }
}

body {
  padding: 0;
  margin: 0;
  background-color: @dark;
}

main {
  flex: 1;
}

#time-tracker {
  padding: 2rem;
  margin: 0 auto;
  display: none;
  max-width: 600px;
  color: @dark;
  background-color: white;

  @media screen and (min-width: 600px) {
    margin: 1rem auto;
    border-radius: 0.5rem;
  }

  *[draggable="true"] {
    cursor: move;
  }

  &.loaded {
    display: flex;
    justify-content: center;
  }

  ul {
    list-style-type: none;
    padding: 0 0 0 1em;
    margin: 0;
  }

  button {
    font-size: 1em;
    padding: 0.4em 0.8em;
    background: 0 0;
    border: 1px solid lightgray;
    box-shadow: 1px 1px 1px 0 lightgray;
    outline: 0;

    &:hover {
      cursor: pointer;
    }
  }

  input {
    outline: none;
  }

  .top-container {
    position: relative;
    justify-content: center;
    display: flex;
    align-items: center;

    > .left,
    > .right {
      flex: 1;
    }

    @media screen and (max-width: 320px) {
      > .left {
        flex: 0;
      }
    }

    > .center {
      flex: 2;
    }

    .new-task {
      &:extend(._shadow);

      font-size: 1em;
      padding: 0.8em 1.2em;
      border: 1px solid @light;
      width: 100%;

      &:focus {
        &:extend(._focus);
      }
    }

    .total-duration {
      color: #888a85;
      text-align: right;
      font-size: 1em;
      margin-left: 0.5em;
      visibility: hidden;

      &.visible {
        visibility: visible;
      }

      > .clock {
        margin-left: 0.25em;
      }
    }
  }

  .remove-all {
    background-color: white;
    padding: 0.5rem 0.8rem;

    .text {
      font-size: 0.9rem;
      margin-left: 0.4rem;
      display: none;
    }
    &:hover,
    &:focus {
      &:extend(._focus);

      .text {
        display: inline;
      }
    }
    &:active {
      &:extend(._active);
    }
  }

  &.dropzone {
    &:extend(._dropzone);
    border-radius: 0;
  }
}
</style>
