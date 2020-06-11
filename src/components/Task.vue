<template>
  <div
    class="task"
    :class="{
      active: task.isActive,
      dropzone: dropzone,
      dragging: dragging,
      subtask: task.parentId != null,
      collapsed: collapsed || collapse,
    }"
  >
    <div class="task-head" draggable="true">
      <div class="left">
        <button type="button" title="Start" v-if="!task.isActive" @click="$emit('start-task', task.id)">
          <i class="fas fa-play"></i>
        </button>
        <button type="button" title="Stop" v-if="task.isActive" @click="$emit('stop-task', task.id)">
          <i class="fas fa-stop"></i>
        </button>
        <button type="button" class="add-subtask" title="Add subtask" @click="$emit('add-task', { parentId: task.id })">
          <i class="fas fa-plus-circle"></i>
        </button>
        <button
          type="button"
          class="toggle-collapse"
          v-if="task.timeslots.length || task.subTasks.length"
          :title="collapsed ? 'Expand' : 'Collapse'"
          @click="collapsed = !collapsed"
        >
          <i v-if="collapsed" class="fas fa-caret-down"></i>
          <i v-if="!collapsed" class="fas fa-caret-up"></i>
        </button>
        <button type="button" title="Remove" @click="$emit('remove-task', { taskId: task.id, posY: $event.clientY })">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>

      <div class="center">
        <div v-if="!editName" class="task-name" @click="toggleEdit()" v-text="task.name"></div>
        <input
          type="text"
          class="task-name edit"
          placeholder="Task name"
          v-focus
          v-if="editName"
          v-model="task._source.name"
          @keyup.enter="cancelEdit()"
          @keyup.escape="cancelEdit()"
        />
      </div>

      <div class="right">
        <div class="task-duration-wrapper">
          <span
            class="task-duration"
            v-text="formatDuration(task.duration, { showZero: false, showSeconds: task.duration < 60 })"
          ></span>
        </div>
      </div>
    </div>

    <div class="task-body" v-if="task.timeslots.length || task.subTasks.length">
      <div class="timeslots" v-if="task.timeslots.length">
        <Timeslot
          v-for="timeslot in task.timeslots"
          :key="timeslot.id"
          :timeslot="timeslot"
          :task="task"
          @change-timeslot-begin="$emit('change-timeslot-begin', $event)"
          @change-timeslot-end="$emit('change-timeslot-end', $event)"
          @remove-timeslot="$emit('remove-timeslot', $event)"
          @timeslot-to-new-task="$emit('timeslot-to-new-task', $event)"
          @timeslot-to-task="$emit('timeslot-to-task', $event)"
        />
      </div>

      <div class="subtasks" v-if="task.subTasks.length">
        <Task
          v-for="subTask in task.subTasks"
          :key="subTask.id"
          :task="subTask"
          :collapse="dragging"
          @add-task="$emit('add-task', $event)"
          @remove-task="$emit('remove-task', $event)"
          @reset-task="$emit('reset-task', $event)"
          @start-task="$emit('start-task', $event)"
          @stop-task="$emit('stop-task', $event)"
          @move-task="$emit('move-task', $event)"
          @change-timeslot-begin="$emit('change-timeslot-begin', $event)"
          @change-timeslot-end="$emit('change-timeslot-end', $event)"
          @remove-timeslot="$emit('remove-timeslot', $event)"
          @timeslot-to-new-task="$emit('timeslot-to-new-task', $event)"
          @timeslot-to-task="$emit('timeslot-to-task', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script>
import * as utils from "../utils.js";
import Timeslot from "./Timeslot.vue";

export default {
  name: "Task",
  components: { Timeslot },
  props: {
    task: Object,
    parentId: Number,
    collapse: Boolean,
  },

  mounted: function() {
    const el = this.$el;

    el.addEventListener("dragstart", this.onDragStart);
    el.addEventListener("dragend", this.onDragEnd);
    el.addEventListener("dragover", this.onDragOver);
    el.addEventListener("dragleave", this.onDragLeave);
    el.addEventListener("drop", this.onDrop);

    if (!this.task.name) {
      this.editName = true;
    }

    // When a task is created through a click we do not want to
    // execute the onClick handler for that one.
    // So add event listener on next loop.
    setTimeout(() => document.addEventListener("click", this.onClick));
  },

  beforeDestroy: function() {
    this.$el.removeEventListener("dragstart", this.onDragStart);
    this.$el.removeEventListener("dragend", this.onDragEnd);
    this.$el.removeEventListener("dragover", this.onDragOver);
    this.$el.removeEventListener("drop", this.onDrop);
    this.$el.removeEventListener("dragleave", this.onDragLeave);

    document.removeEventListener("click", this.onClick);
  },

  data: function() {
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

    onDragStart: function(ev) {
      ev.stopPropagation();

      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.dropEffect = "move";
      ev.dataTransfer.setData("taskId", this.task.id);
      this.dragging = true;
    },

    onDragEnd: function(ev) {
      ev.preventDefault();
      this.dragging = false;
    },

    onDragOver: function(ev) {
      ev.preventDefault();
      ev.stopPropagation();

      if (this.dragging) {
        // Cannot be their own dropzone
        ev.dataTransfer.dropEffect = "none";
      } else {
        this.dropzone = true;
      }
    },

    onDragEnter: function(ev) {
      ev.preventDefault();
    },

    onDragLeave: function(ev) {
      ev.preventDefault();

      this.dropzone = false;
    },

    onDrop: function(ev) {
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

    onDropTask: function(taskId) {
      this.$emit("move-task", {
        taskId: taskId,
        parentId: this.task.id,
      });
    },

    onDropTimeslot: function(timeslotId) {
      this.$emit("timeslot-to-task", {
        id: timeslotId,
        taskId: this.task.id,
      });
    },

    onClick: function(ev) {
      if (ev.target == null || ev.target.parentNode == null) {
        // Ignore
        return;
      }

      const task = ev.target.closest(".task");
      if (task !== this.$el) {
        this.cancelEdit();
      }
    },

    toggleEdit: function() {
      this.editName = !this.editName;
    },

    cancelEdit: function() {
      this.editName = false;
    },
  },
};
</script>

<style lang="less">
@import "../styles/extends.less";
@import "../styles/variables.less";

#time-tracker {
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

    > .task-controls {
      display: flex;

      > button {
        flex: 1;
      }
    }

    > .task-body {
      padding: 0.5em 1em;

      .subtasks {
        font-size: 0.95em;
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

    &.dropzone {
      &:extend(._dropzone);
      box-shadow: none;
    }

    &.dragging {
      &:extend(._dragging all);
      box-shadow: none;
    }

    &.collapsed {
      > .task-body {
        display: none;
      }
    }
  }
}
</style>
