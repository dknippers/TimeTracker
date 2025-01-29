<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import * as utils from './utils.js';
import Task from './components/Task.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import debounce from 'lodash/debounce';

const initialId = 1;

// Reactive state
const el = ref(null);
const nextId = ref(initialId);
const tasksById = ref({});
const timeslotsById = ref({});
const now = ref(Date.now());
const dropzone = ref(false);
const documentTitle = ref(null);
const confirmation = ref({
  ok: null,
  okText: null,
  cancel: null,
  cancelText: null,
  text: null,
  always: null,
  posY: null,
});

// Load persisted state
const savedState = utils.getFromStorage('time-tracker');
if (savedState != null) {
  nextId.value = savedState.nextId;
  tasksById.value = savedState.tasksById;
  timeslotsById.value = savedState.timeslotsById;
}

// Computed properties
const tasksByParentId = computed(() => {
  const tasksByParentId = {};
  for (const task of Object.values(tasksById.value)) {
    if (task.parentId != null) {
      if (tasksByParentId[task.parentId] == null) {
        tasksByParentId[task.parentId] = [];
      }
      tasksByParentId[task.parentId].push(task);
    }
  }
  return tasksByParentId;
});

const timeslots = computed(() => {
  return Object.values(timeslotsById.value).map(timeslot => {
    const end = timeslot.end || now.value;
    const isActive = timeslot.begin != null && timeslot.end == null;
    const duration = timeslot.begin == null ? 0 : Math.round((end - timeslot.begin) / 1000);
    return { ...timeslot, end, isActive, duration, _source: timeslot };
  });
});

const timeslotsByTask = computed(() => {
  const timeslotsByTask = {};
  for (const timeslot of timeslots.value) {
    if (timeslot.taskId != null) {
      if (timeslotsByTask[timeslot.taskId] == null) {
        timeslotsByTask[timeslot.taskId] = [];
      }
      timeslotsByTask[timeslot.taskId].push(timeslot);
    }
  }
  return timeslotsByTask;
});

const tasks = computed(() => {
  const computedTasks = {};
  const compute = task => {
    if (computedTasks[task.id] != null) {
      return computedTasks[task.id];
    }
    const timeslots = timeslotsByTask.value[task.id] || [];
    const subTasks = (tasksByParentId.value[task.id] || []).map(compute);
    return (computedTasks[task.id] = {
      ...task,
      duration: getTaskDuration(task),
      timeslots,
      subTasks,
      isActive: timeslots.some(timeslot => timeslot.isActive),
      isActiveAncestor: subTasks.some(subTask => subTask.isActive || subTask.isActiveAncestor),
      _source: task,
    });
  };
  return Object.values(tasksById.value).map(compute);
});

const mainTasks = computed(() => tasks.value.filter(task => task.parentId == null));
const activeTask = computed(() => tasks.value.find(task => task.isActive));
const totalDuration = computed(() => mainTasks.value.reduce((sum, task) => sum + task.duration, 0));
const absoluteTotalDuration = computed(() => Math.abs(totalDuration.value));

// Methods
const getAncestors = (task, cache = {}) => {
  const parent = tasksById.value[task.parentId];
  if (parent == null) {
    return [];
  }
  if (cache[task.id] != null) {
    return cache[task.id];
  }
  if (parent != null) {
    const ancestors = [parent, ...getAncestors(parent, cache)];
    cache[task.id] = ancestors;
    return ancestors;
  }
};

const isAncestor = (taskA, taskB) => getAncestors(taskB).indexOf(taskA) > -1;

const save = () => {
  const toSave = { nextId: nextId.value, tasksById: tasksById.value, timeslotsById: timeslotsById.value };
  utils.saveToStorage('time-tracker', toSave);
};

const inputTask = (inputElement) => {
  addTask({ name: inputElement.value });
  inputElement.value = '';
};

const addTask = ({ name, parentId }) => {
  const newTask = createTask(name, parentId);
  startTask(newTask.id);
};

const createTask = (name, parentId) => {
  const id = nextId.value++;
  const task = { id, parentId, name };
  tasksById.value[id] = task;
  return task;
};

const moveTask = ({ taskId, parentId }) => {
  if (taskId != null && parentId != null && taskId !== parentId) {
    const task = tasksById.value[taskId];
    const parent = tasksById.value[parentId];
    if (task == null || parent == null || task.parentId === parent.id) {
      return;
    }
    if (isAncestor(task, parent)) {
      return;
    }
    task.parentId = parentId;
  }
};

const changeTimeslotBegin = (args) => changeTimeslotTimestamp(args, 'begin');
const changeTimeslotEnd = (args) => changeTimeslotTimestamp(args, 'end');

const changeTimeslotTimestamp = ({ timeslotId, timestamp }, property) => {
  const timeslot = timeslotsById.value[timeslotId];
  if (timeslot) {
    timeslot[property] = timestamp;
  }
};

const onDrop = (ev) => {
  dropzone.value = false;
  const taskId = ev.dataTransfer.getData('taskId');
  if (!taskId) {
    return;
  }
  const task = tasksById.value[taskId];
  if (task) {
    delete task.parentId;
  }
};

const onDragOver = (ev) => {
  ev.preventDefault();
  const isTimeslot = ev.dataTransfer.types.indexOf('timeslotid') > -1;
  if (!isTimeslot) {
    dropzone.value = true;
  }
};

const onDragLeave = (ev) => {
  ev.preventDefault();
  dropzone.value = false;
};

const startTask = (id) => {
  const oldTask = activeTask.value;
  if (oldTask && oldTask.id !== id) {
    stopTask(oldTask.id);
  }
  createTimeslot(id);
};

const stopTask = (id) => {
  const task = tasksById.value[id];
  if (task == null) {
    return;
  }
  const timeslots = timeslotsByTask.value[id] || [];
  const activeSlots = timeslots.filter(slot => slot.isActive).map(slot => timeslotsById.value[slot.id]);
  const currentTime = Date.now();
  for (const activeSlot of activeSlots) {
    activeSlot.end = currentTime;
  }
};

const removeTask = (id) => {
  if (!tasksById.value[id]) {
    return;
  }
  delete tasksById.value[id];
  const subTasks = tasksByParentId.value[id];
  if (Array.isArray(subTasks)) {
    for (const subTask of subTasks) {
      removeTask(subTask.id);
    }
  }
  const timeslots = timeslotsByTask.value[id];
  if (Array.isArray(timeslots)) {
    for (const timeslot of timeslots) {
      removeTimeslot(timeslot.id);
    }
  }
  if (tasks.value.length === 0) {
    nextId.value = initialId;
  }
};

const removeTaskConfirmation = (evt) => {
  const taskId = evt.taskId;
  const task = tasksById.value[taskId];
  if (task == null) {
    return;
  }
  const taskName = task.name || '<no name>';
  showConfirmation({
    text: `Remove ${taskName}?`,
    ok: () => removeTask(taskId),
    always: clearConfirmation,
    posY: evt.posY,
  });
};

const showConfirmation = ({ text, ok, always, cancel, posY, okText = 'Yes', cancelText = 'No' }) => {
  confirmation.value = { text, ok, always, cancel, posY, okText, cancelText };
};

const clearConfirmation = () => {
  Object.keys(confirmation.value).forEach(key => (confirmation.value[key] = null));
};

const createTimeslot = (taskId) => {
  const id = nextId.value++;
  const timeslot = { id, taskId, begin: now.value };
  timeslotsById.value[id] = timeslot;
  return timeslot;
};

const removeTimeslot = (id) => {
  delete timeslotsById.value[id];
};

const removeTimeslotConfirmation = (evt) => {
  const timeslotId = evt.timeslotId;
  const timeslot = timeslotsById.value[timeslotId];
  if (timeslot == null) {
    return;
  }
  const task = tasksById.value[timeslot.taskId];
  const taskName = (task && task.name) || '<no task>';
  const begin = utils.formatTimestamp(timeslot.begin, '???');
  const end = utils.formatTimestamp(timeslot.end || now.value, '???');
  showConfirmation({
    text: `Remove ${begin} - ${end} of ${taskName}?`,
    ok: () => removeTimeslot(timeslotId),
    always: clearConfirmation,
    posY: evt.posY,
  });
};

const timeslotToNewTask = (id) => {
  const timeslot = timeslotsById.value[id];
  if (timeslot == null) {
    return;
  }
  const newTask = createTask(null, timeslot.taskId);
  timeslotToTask({ id, taskId: newTask.id });
};

const timeslotToTask = ({ id, taskId }) => {
  if (tasksById.value[taskId] == null) {
    return;
  }
  const timeslot = timeslotsById.value[id];
  if (timeslot) {
    timeslot.taskId = taskId;
  }
};

const clearAll = (posY) => {
  const remove = () => {
    nextId.value = initialId;
    tasksById.value = {};
    timeslotsById.value = {};
  };
  showConfirmation({
    text: 'Remove all tasks?',
    ok: remove,
    always: clearConfirmation,
    posY: posY,
  });
};

const resetTask = (id) => {
  clearTimeslots(id);
};

const clearTimeslots = (taskId) => {
  const timeslots = timeslotsByTask.value[taskId];
  if (Array.isArray(timeslots)) {
    for (const timeslot of timeslots) {
      delete timeslotsById.value[timeslot.id];
    }
  }
};

const getTaskDuration = (task) => {
  const timeslots = timeslotsByTask.value[task.id] || [];
  const taskSeconds = timeslots.reduce((sum, ts) => sum + ts.duration, 0);
  const subTasks = tasksByParentId.value[task.id] || [];
  const subTasksSeconds = subTasks.reduce((sum, subTask) => sum + getTaskDuration(subTask), 0);
  return taskSeconds + subTasksSeconds;
};

const updateDocumentTitle = () => {
  if (activeTask.value == null || activeTask.value.duration === 0) {
    document.title = documentTitle.value;
  } else {
    const duration = utils.formatDuration(activeTask.value.duration, {
      showZero: false,
      showSeconds: Math.abs(activeTask.value.duration) < 60,
    });
    const name = activeTask.value.name;
    document.title = name ? `${duration} - ${name}` : duration;
  }
};

const setNow = () => {
  now.value = Date.now();
};

const mainLoop = (timeout) => {
  setNow();
  updateDocumentTitle();
  setTimeout(() => mainLoop(timeout), timeout);
};

// Lifecycle hooks
onMounted(() => {
  documentTitle.value = document.title;
  mainLoop(1000);

  el.value.addEventListener('drop', onDrop);
  el.value.addEventListener('dragover', onDragOver);
  el.value.addEventListener('dragleave', onDragLeave);

  const debouncedSave = debounce(save, 250);
  watch(tasksById, debouncedSave, { deep: true });
  watch(timeslotsById, debouncedSave, { deep: true });
});

onBeforeUnmount(() => {
  el.value.removeEventListener('drop', onDrop);
  el.value.removeEventListener('dragover', onDragOver);
  el.value.removeEventListener('dragleave', onDragLeave);
});
</script>

<template>
  <div id="time-tracker" ref="el" :class="{ loaded: 1, dropzone: dropzone }">
    <main>
      <div class="top-container">
        <div class="left">
          <button v-if="mainTasks.length > 0" type="button" @click="clearAll($event.clientY)" class="remove-all">
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
            <span class="clock"
              v-text="utils.formatDuration(totalDuration, { showSeconds: absoluteTotalDuration < 60 })"></span>
          </div>
        </div>
      </div>

      <Task v-for="task in mainTasks" :key="task.id" :task="task" @add-task="addTask($event)"
        @remove-task-confirmation="removeTaskConfirmation($event)" @reset-task="resetTask($event)"
        @start-task="startTask($event)" @stop-task="stopTask($event)" @move-task="moveTask($event)"
        @change-timeslot-begin="changeTimeslotBegin($event)" @change-timeslot-end="changeTimeslotEnd($event)"
        @remove-timeslot-confirmation="removeTimeslotConfirmation($event)"
        @timeslot-to-new-task="timeslotToNewTask($event)" @timeslot-to-task="timeslotToTask($event)" />
    </main>

    <ConfirmDialog v-if="confirmation.ok" :config="confirmation" />
  </div>
</template>

<style lang="less">
#time-tracker {
  padding: 2rem;
  margin: 0 auto;
  display: none;
  max-width: 600px;
  color: var(--dark);
  background-color: white;

  @media screen and (min-width: 600px) {
    margin: 1rem auto;
    border-radius: 0.5rem;
  }

  &.loaded {
    display: flex;
    justify-content: center;
  }

  .top-container {
    position: relative;
    justify-content: center;
    display: flex;
    align-items: center;

    >.left,
    >.right {
      flex: 1;
    }

    @media screen and (max-width: 320px) {
      >.left {
        flex: 0;
      }
    }

    >.center {
      flex: 2;
    }

    .new-task {
      box-shadow: 0 0 1px 0 lightgrey, 1px 1px 2px grey;
      font-size: 1em;
      padding: 0.8em 1.2em;
      border: 1px solid var(--light);
      width: 100%;

      &:focus {
        box-shadow: var(--focus-box-shadow);
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

      >.clock {
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
      box-shadow: var(--focus-box-shadow);

      .text {
        display: inline;
      }
    }

    &:active {
      box-shadow: none;
    }
  }

  /* Component global styles */
  *[draggable="true"] {
    cursor: move;
  }

  ul {
    list-style-type: none;
    padding: 0 0 0 1em;
    margin: 0;
  }

  input {
    outline: none;
  }

  &.dropzone {
    outline: var(--dropzone-outline);
    border-radius: 0;
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
}
</style>
