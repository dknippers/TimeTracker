<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import * as utils from '../utils.js';
import vFocus from '@/directives/v-focus.js';
import Timeslot from './Timeslot.vue';

// Props
const props = defineProps({
  task: {
    type: Object,
    required: true,
  },
  parentId: {
    type: Number,
    default: null,
  },
});

// Emits
const emit = defineEmits([
  'add-task', 'move-task', 'start-task', 'stop-task', 'reset-task',
  'remove-task-confirmation', 'timeslot-to-task', 'timeslot-to-new-task',
  'change-timeslot-begin', 'change-timeslot-end'
]);

// Reactive state
const dropzone = ref(false);
const dragging = ref(false);
const editName = ref(false);
const collapsed = ref(false);
const el = ref(null);

// Methods
const formatDuration = utils.formatDuration;

const addSubTask = () => {
  if (collapsed.value) {
    collapsed.value = false;
  }
  emit('add-task', { parentId: props.task.id });
};

const onDragStart = (ev) => {
  ev.stopPropagation();
  ev.dataTransfer.effectAllowed = 'move';
  ev.dataTransfer.dropEffect = 'move';
  ev.dataTransfer.setData('taskId', props.task.id);
  setTimeout(() => (dragging.value = true));
};

const onDragEnd = (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  dragging.value = false;
};

const onDragOver = (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  if (dragging.value) {
    ev.dataTransfer.dropEffect = 'none';
  } else {
    dropzone.value = true;
  }
};

const onDragLeave = (ev) => {
  ev.preventDefault();
  dropzone.value = false;
};

const onDrop = (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  dropzone.value = false;

  const taskId = parseInt(ev.dataTransfer.getData('taskId'), 10);
  const timeslotId = parseInt(ev.dataTransfer.getData('timeslotId'), 10);

  if (!isNaN(taskId)) {
    if (!isNaN(timeslotId)) {
      onDropTimeslot(timeslotId);
    } else {
      onDropTask(taskId);
    }
  }
};

const onDropTask = (taskId) => {
  emit('move-task', {
    taskId: taskId,
    parentId: props.task.id,
  });
};

const onDropTimeslot = (timeslotId) => {
  emit('timeslot-to-task', {
    id: timeslotId,
    taskId: props.task.id,
  });
};

const onClick = (ev) => {
  if (ev.target == null || ev.target.parentNode == null) {
    return;
  }
  const task = ev.target.closest('.task');
  if (task !== ev.currentTarget) {
    cancelEdit();
  }
};

const toggleEdit = () => {
  editName.value = !editName.value;
};

const cancelEdit = () => {
  editName.value = false;
};

// Lifecycle hooks
onMounted(() => {
  el.value.addEventListener('dragstart', onDragStart);
  el.value.addEventListener('dragend', onDragEnd);
  el.value.addEventListener('dragover', onDragOver);
  el.value.addEventListener('dragleave', onDragLeave);
  el.value.addEventListener('drop', onDrop);

  if (!props.task.name) {
    editName.value = true;
  }

  setTimeout(() => document.addEventListener('click', onClick));
});

onBeforeUnmount(() => {
  el.value.removeEventListener('dragstart', onDragStart);
  el.value.removeEventListener('dragend', onDragEnd);
  el.value.removeEventListener('dragover', onDragOver);
  el.value.removeEventListener('dragleave', onDragLeave);
  el.value.removeEventListener('drop', onDrop);

  document.removeEventListener('click', onClick);
});
</script>

<template>
  <div class="task" ref="el" :class="{
    active: task.isActive,
    'active-ancestor': task.isActiveAncestor,
    dropzone: dropzone,
    dragging: dragging,
    subtask: task.parentId != null,
    collapsed: collapsed,
  }">
    <div class="task-head" draggable="true">
      <div class="left">
        <button type="button" title="Start" v-if="!task.isActive" @click="$emit('start-task', task.id)">
          <i class="fas fa-play"></i>
        </button>
        <button type="button" title="Stop" v-if="task.isActive" @click="$emit('stop-task', task.id)">
          <i class="fas fa-stop"></i>
        </button>
        <button type="button" class="add-subtask" title="Add subtask" @click="addSubTask()">
          <i class="fas fa-plus-circle"></i>
        </button>
        <button type="button" class="toggle-collapse" v-if="task.timeslots.length || task.subTasks.length"
          :title="collapsed ? 'Expand' : 'Collapse'" @click="collapsed = !collapsed">
          <i v-if="collapsed" class="fas fa-caret-down"></i>
          <i v-if="!collapsed" class="fas fa-caret-up"></i>
        </button>
        <button type="button" title="Remove"
          @click="$emit('remove-task-confirmation', { taskId: task.id, posY: $event.clientY })">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>

      <div class="center">
        <div v-if="!editName" class="task-name" @click="toggleEdit()" v-text="task.name"></div>
        <input type="text" class="task-name edit" placeholder="Task name" v-focus v-if="editName"
          v-model="task._source.name" @keyup.enter="cancelEdit()" @keyup.escape="cancelEdit()" />
      </div>

      <div class="right">
        <div class="task-duration-wrapper" v-show="task.duration > 0">
          <span class="task-duration"
            v-text="formatDuration(task.duration, { showZero: false, showSeconds: task.duration < 60 })"></span>
        </div>
      </div>
    </div>

    <div class="task-body" v-if="task.timeslots.length || task.subTasks.length">
      <div class="timeslots" v-if="task.timeslots.length">
        <Timeslot v-for="timeslot in task.timeslots" :key="timeslot.id" :timeslot="timeslot" :task="task"
          @change-timeslot-begin="$emit('change-timeslot-begin', $event)"
          @change-timeslot-end="$emit('change-timeslot-end', $event)"
          @remove-timeslot-confirmation="$emit('remove-timeslot-confirmation', $event)"
          @timeslot-to-new-task="$emit('timeslot-to-new-task', $event)"
          @timeslot-to-task="$emit('timeslot-to-task', $event)" />
      </div>

      <div class="subtasks" v-if="task.subTasks.length">
        <Task v-for="subTask in task.subTasks" :key="subTask.id" :task="subTask" @add-task="$emit('add-task', $event)"
          @remove-task-confirmation="$emit('remove-task-confirmation', $event)"
          @reset-task="$emit('reset-task', $event)" @start-task="$emit('start-task', $event)"
          @stop-task="$emit('stop-task', $event)" @move-task="$emit('move-task', $event)"
          @change-timeslot-begin="$emit('change-timeslot-begin', $event)"
          @change-timeslot-end="$emit('change-timeslot-end', $event)"
          @remove-timeslot-confirmation="$emit('remove-timeslot-confirmation', $event)"
          @timeslot-to-new-task="$emit('timeslot-to-new-task', $event)"
          @timeslot-to-task="$emit('timeslot-to-task', $event)" />
      </div>
    </div>
  </div>
</template>

<style lang="less">
#time-tracker {
  .task {
    margin: 2em 0 0 0;
    background-color: white;
    box-shadow: 0 0 1px 0 lightgrey, 1px 1px 2px grey;

    ~.task {
      margin-top: 1em;
    }

    &.subtask {
      margin-top: 0.5em;
      margin-bottom: 0.5em;

      ~.subtask {
        margin-top: 1em;
      }
    }

    >.task-head {
      padding: 0;
      background-color: var(--dark);
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;

      >.left,
      >.right {
        flex: 2;
      }

      >.left {
        display: flex;

        >button {
          flex: 1;
          visibility: hidden;
          padding: 0.5em;
          border: none;
          box-shadow: none;
          color: var(--light);
          max-width: 2.5em;

          &.toggle-collapse,
          &.add-subtask {
            >i {
              font-size: 1em;
            }
          }

          &:hover {
            background-color: white;
            color: var(--purple);
          }
        }

        &:hover>button {
          visibility: visible;
        }

        >span {
          visibility: hidden;
        }

        &:hover {
          >span {
            visibility: visible;
          }

          cursor: pointer;
        }
      }

      >.center {
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
              box-shadow: var(--focus-box-shadow);
              border: none;
            }
          }
        }
      }

      >.right {
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

    &.subtask>.task-head {
      background-color: #ddd;
      color: var(--dark);

      >.left>button {
        color: var(--dark);

        &:hover {
          background-color: white;
          color: var(--purple);
        }
      }
    }

    >.task-controls {
      display: flex;

      >button {
        flex: 1;
      }
    }

    >.task-body {
      padding: 0.5em 1em;

      .subtasks {
        font-size: 0.95em;
      }
    }

    &.active {
      >.task-head {
        background-color: var(--purple);
        color: white;

        >.left>button {
          color: white;

          &:hover {
            color: var(--purple);
          }
        }
      }
    }

    &.active-ancestor {
      >.task-head>.right>.task-duration-wrapper {
        background-color: var(--purple);
        color: white;
      }
    }

    &.dropzone {
      outline: var(--dropzone-outline);
      box-shadow: none;
    }

    &.dragging {
      outline: var(--dragging-outline);

      * {
        opacity: 0.8;
      }

      box-shadow: none;
    }

    &.collapsed {
      >.task-body {
        display: none;
      }
    }
  }
}
</style>