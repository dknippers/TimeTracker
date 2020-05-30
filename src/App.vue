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
        @remove-task="askToRemoveTask($event)"
        @reset-task="resetTask($event)"
        @start-task="startTask($event)"
        @stop-task="stopTask($event)"
        @move-task="moveTask($event)"
        @change-timeslot-begin="changeTimeslotBegin($event)"
        @change-timeslot-end="changeTimeslotEnd($event)"
        @remove-timeslot="askToRemoveTimeslot($event)"
        @timeslot-to-new-task="timeslotToNewTask($event)"
        @timeslot-to-task="timeslotToTask($event)"
      />
    </main>

    <ConfirmDialog v-if="ui.confirm.ok" :config="ui.confirm" />
  </div>
</template>

<script>
import Vue from "vue";
import * as utils from "./utils.js";
import Task from "./components/Task.vue";
import ConfirmDialog from "./components/ConfirmDialog.vue";

const initialId = 1;

var state = {
  nextId: initialId,
  tasksById: {},
  timeslotsById: {},

  now: Date.now(),
  dropzone: false,

  ui: {
    confirm: {
      ok: null,
      okText: null,
      cancel: null,
      cancelText: null,
      text: null,
      always: null,
      posY: null,
    },
  },
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
  },

  ancestors: function() {
    const ancestors = {};

    const cache = {};

    for (const task of this.taskList) {
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
};

var methods = {
  getComputedTask: function(task) {
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

    const task = {
      id,
      parentId,
      name: name,
    };

    Vue.set(this.tasksById, id, task);

    return task;
  },

  moveTask: function(opts) {
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
    }

    this.dropzone = true;
  },

  onDragLeave: function(ev) {
    ev.preventDefault();

    this.dropzone = false;
  },

  updateTask: function(id, updateFn, doneFn) {
    const currentTask = this.tasksById[id];
    updateFn(currentTask);
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
      const activeSlots = timeslots.filter(slot => slot.begin != null && slot.end == null);

      const now = Date.now();

      for (const activeSlot of activeSlots) {
        Vue.set(activeSlot, "end", now);
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
        this.removeTimeslot(timeslot.id);
      }
    }

    if (this.tasks.length === 0) {
      this.nextId = initialId;
    }
  },

  askToRemoveTask: function(evt) {
    const taskId = evt.taskId;

    const task = this.tasksById[taskId];
    if (task == null) {
      return;
    }

    const taskName = task.name || "<no name>";

    this.showConfirmation({
      text: `Delete ${taskName}?`,
      ok: () => this.removeTask(taskId),
      always: this.clearConfirmation,
      posY: evt.posY,
    });
  },

  showConfirmation: function(opts) {
    Vue.set(state.ui.confirm, "text", opts.text);
    Vue.set(state.ui.confirm, "ok", opts.ok);
    Vue.set(state.ui.confirm, "always", opts.always);
    Vue.set(state.ui.confirm, "cancel", opts.cancel);
    Vue.set(state.ui.confirm, "posY", opts.posY);
    Vue.set(state.ui.confirm, "okText", opts.okText || "Yes");
    Vue.set(state.ui.confirm, "cancelText", opts.cancelText || "No");
  },

  clearConfirmation: function() {
    state.ui.confirm.ok = null;
    state.ui.confirm.cancel = null;
    state.ui.confirm.always = null;
    state.ui.confirm.text = null;
    state.ui.confirm.posY = null;
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

  askToRemoveTimeslot: function(evt) {
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

  timeslotToTask: function(opts) {
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

  skipSave: function(fn) {
    this.dontSave = 1;
    fn();
    Vue.nextTick(() => delete this.dontSave);
  },

  mainLoop: function(timeout) {
    this.skipSave(this.setNow);

    this.updateDocumentTitle();

    setTimeout(() => this.mainLoop(timeout), timeout);
  },
};

Vue.directive("focus", {
  inserted: el => el.focus(),
});

export default {
  name: "app",
  components: {
    Task,
    ConfirmDialog,
  },

  data: () => state,

  methods: methods,
  computed: computed,

  beforeCreate: function() {
    var oldState = utils.getFromStorage("time-tracker");
    if (oldState != null) {
      Object.assign(state, oldState);
    }
  },

  mounted: function() {
    this.documentTitle = document.title;

    Vue.nextTick(() => this.mainLoop(1000));

    this.$el.addEventListener("drop", this.onDrop);
    this.$el.addEventListener("dragover", this.onDragOver);
    this.$el.addEventListener("dragleave", this.onDragLeave);
  },

  beforeDestroy: function() {
    this.$el.removeEventListener("drop", this.onDrop);
    this.$el.removeEventListener("dragover", this.onDragOver);
    this.$el.removeEventListener("dragleave", this.onDragLeave);
  },

  updated: function() {
    if (!this.dontSave) {
      this.save();
    }
  },
};
</script>

<style lang="less">
@dark: #2e3436;
@purple: #333399;
@light: #ededed;
@red: #cc0000;

* {
  box-sizing: border-box;
  font-family: Calibri, sans-serif;
}

html {
  // Minimum font-size (usually 12px)
  font-size: 75%;
}

@media screen and (min-width: 300px) {
  html {
    // Between 300px and 600px: dynamically scale from 12px to 16px
    font-size: ~"calc(12px + 4 * ((100vw - 300px) / (600 - 300)))";
  }
}

@media screen and (min-width: 600px) {
  html {
    // Maximum font-size (usually 16px)
    font-size: 100%;
  }
}

._focus {
  box-shadow: 1px 1px 3px 0 @purple;
}

._shadow {
  box-shadow: 0 0 1px 0 lightgrey, 1px 1px 2px grey;
}

._active {
  box-shadow: none;
}

body {
  padding: 0;
  margin: 0;
  background-color: @dark;
}

#time-tracker {
  padding: 2rem;
  margin: 1rem auto 0 auto;
  display: none;
  max-width: 600px;
  color: @dark;
  background-color: white;
  border-radius: 5px;

  *[draggable="true"] {
    cursor: grab;

    &:active {
      cursor: grabbing;
    }
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

  .task {
    margin: 2em 0 0 0;
    background-color: white;
    box-shadow: 0 0 1px 0 lightgrey, 1px 1px 2px grey;

    ~ .task {
      margin-top: 1em;
    }

    &.subtask {
      margin-top: 0.5em;
      margin-bottom: 0.5em;

      ~ .subtask {
        margin-top: 1em;
      }
    }

    &.dropzone {
      box-shadow: 0 0 2px 2px @purple;
    }

    &.dragging {
      border: 2px dashed @purple;
    }

    > .task-head {
      padding: 0;
      background-color: @dark;
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;

      > .left,
      > .right {
        flex: 2;
      }

      > .left {
        display: flex;

        > button {
          flex: 1;
          visibility: hidden;
          padding: 0.5em;
          border: none;
          box-shadow: none;
          color: @light;
          max-width: 2.5em;

          &.toggle-collapse,
          &.add-subtask {
            > i {
              font-size: 1em;
            }
          }

          &:hover {
            background-color: white;
            color: @purple;
          }
        }

        > span {
          visibility: hidden;
        }

        &:hover {
          > span {
            visibility: visible;
          }

          cursor: pointer;
        }
      }

      &:hover > .left > button {
        visibility: visible;
      }

      > .center {
        flex: 3;

        .task-name {
          padding: 0.5em 0;
          text-align: center;

          &:hover {
            cursor: text;
          }

          &.edit {
            width: 100%;
            border: none;
            font-size: 1em;

            &:focus {
              &:extend(._focus);
              border: none;
            }
          }
        }
      }

      > .right {
        display: flex;
        justify-content: flex-end;

        .task-duration-wrapper {
          padding: 0.5em 1em;

          .task-duration {
            font-size: 0.9em;
            font-weight: bold;
            text-align: right;
          }
        }
      }
    }

    &.subtask > .task-head {
      background-color: #ddd;
      color: @dark;

      > .left > button {
        color: @dark;

        &:hover {
          background-color: white;
          color: @purple;
        }
      }
    }

    &.active {
      > .task-head {
        background-color: @purple;
        color: white;

        > .left > button {
          color: white;

          &:hover {
            color: @purple;
          }
        }
      }
    }

    > .task-controls {
      display: flex;

      > button {
        flex: 1;
      }
    }

    > .task-body {
      padding: 0.5em 1em;

      .timeslots {
        .timeslot {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 0.25em 0;

          &.dragging {
            border: 2px dashed @purple;
          }

          > .timeslot-controls {
            flex: 1;

            > .timeslot-control {
              visibility: hidden;
              color: @dark;
              padding: 0.35em;

              > i {
                display: inline-block;
              }

              &.timeslot-to-task {
                > i {
                  transform: rotate(-90deg);
                }
              }

              &:hover {
                cursor: pointer;
                color: @purple;

                &.timeslot-remove {
                  color: @red;
                }
              }
            }
          }

          &:hover {
            > .timeslot-controls > .timeslot-control {
              visibility: visible;
            }
          }

          .timeslot-period {
            flex: 1;
            text-align: center;
            display: flex;

            .timeslot-begin {
              flex: 4;
              text-align: right;

              > .edit-time {
                text-align: right;
              }

              &:hover {
                cursor: text;
              }
            }

            .timeslot-separator {
              flex: 1;
            }

            .timeslot-end {
              flex: 4;
              text-align: left;

              &:hover {
                cursor: text;
              }
            }

            .edit-time {
              width: 3em;
              border: none;
              font-size: 1em;
              outline: none;
              padding: 0;
              font-weight: bold;
            }
          }

          &.active .timeslot-end {
            font-weight: bold;
            color: @purple;
          }

          .timeslot-right {
            flex: 1;
            text-align: right;

            .timeslot-duration {
              font-size: 0.9em;
              text-align: right;
            }
          }
        }
      }

      .subtasks {
        font-size: 0.95em;
      }
    }

    &.collapsed {
      > .task-body {
        display: none;
      }
    }
  }

  .confirm-dialog-wrapper {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: rgba(0, 0, 0, 0.8);

    > .confirm-dialog {
      background-color: white;
      padding: 2em;
      min-width: 15em;
      border-radius: 0.2em;

      > .text {
        display: block;
        margin-bottom: 1.5em;
        font-weight: bold;
        text-align: center;
      }

      > .buttons {
        display: flex;

        > button {
          flex: 1;

          &:focus,
          &:hover {
            &:extend(._focus);
          }

          &:active {
            &:extend(._active);
          }
        }

        > .ok {
          margin-left: 1em;
        }
      }
    }
  }

  main {
    flex: 1;
  }
}
</style>
