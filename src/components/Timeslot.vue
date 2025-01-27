<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import vFocus from '@/directives/v-focus.js';
import * as utils from '../utils.js';

// Props
const props = defineProps({
  timeslot: {
    type: Object,
    required: true,
  },
  task: {
    type: Object,
    default: null,
  },
});

// Emits
const emit = defineEmits(['change-timeslot-begin', 'change-timeslot-end', 'timeslot-to-new-task', 'remove-timeslot-confirmation']);

// Reactive state
const begin = ref(null);
const end = ref(null);
const dragging = ref(false);
const el = ref(null);

// Methods
const formatTimestamp = utils.formatTimestamp;
const formatDuration = utils.formatDuration;

const changeTimeslotBegin = (time) => {
  const timeslotId = props.timeslot.id;
  const timestamp = utils.timeToTimestamp(time);
  emit('change-timeslot-begin', { timeslotId, timestamp });
  begin.value = null;
};

const changeTimeslotEnd = (time) => {
  const timeslotId = props.timeslot.id;
  const timestamp = utils.timeToTimestamp(time);
  emit('change-timeslot-end', { timeslotId, timestamp });
  end.value = null;
};

const onDragStart = (ev) => {
  ev.stopPropagation();
  ev.dataTransfer.effectAllowed = 'move';
  ev.dataTransfer.dropEffect = 'move';
  ev.dataTransfer.setData('timeslotId', props.timeslot.id);
  ev.dataTransfer.setData('taskId', props.timeslot.taskId);
  setTimeout(() => (dragging.value = true));
};

const onDragEnd = (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  dragging.value = false;
};

const onClick = (ev) => {
  if (ev.target == null || ev.target.parentNode == null) {
    return;
  }
  const timeslot = ev.target.closest('.timeslot');
  if (timeslot !== ev.currentTarget) {
    begin.value = null;
    end.value = null;
  }
};

// Lifecycle hooks
onMounted(() => {
  el.value.addEventListener('dragstart', onDragStart);
  el.value.addEventListener('dragend', onDragEnd);
  document.addEventListener('click', onClick);
});

onBeforeUnmount(() => {
  el.value.removeEventListener('dragstart', onDragStart);
  el.value.removeEventListener('dragend', onDragEnd);
  document.removeEventListener('click', onClick);
});
</script>

<template>
  <div class="timeslot" draggable="true" ref="el" :class="{ active: timeslot.isActive, dragging: dragging }">
    <span class="timeslot-controls">
      <span class="timeslot-control" title="Move to new subtask" @click="$emit('timeslot-to-new-task', timeslot.id)">
        <i class="far fa-window-maximize"></i>
      </span>
      <span class="timeslot-control timeslot-remove" title="Remove"
        @click="$emit('remove-timeslot-confirmation', { timeslotId: timeslot.id, posY: $event.clientY })">
        <i class="fas fa-trash-alt"></i>
      </span>
    </span>

    <span class="timeslot-period">
      <span class="timeslot-begin">
        <span v-if="begin == null" v-text="formatTimestamp(timeslot.begin, '???')"
          @click="begin = formatTimestamp(timeslot.begin, '???')">
        </span>

        <input class="edit-time" type="text" v-if="begin != null" v-model="begin" v-focus
          @keyup.enter="changeTimeslotBegin(begin)" @keyup.escape="begin = null" />
      </span>

      <span class="timeslot-separator">&ndash;</span>

      <span class="timeslot-end">
        <span v-if="end == null" v-text="formatTimestamp(timeslot.end, '???')"
          @click="end = formatTimestamp(timeslot.end, '???')"></span>
        <input type="text" class="edit-time" v-if="end != null" v-model="end" v-focus
          @keyup.enter="changeTimeslotEnd(end)" @keyup.escape="end = null" />
      </span>
    </span>

    <span class="timeslot-right">
      <span class="timeslot-duration" v-text="formatDuration(timeslot.duration, { showZero: false })"></span>
    </span>
  </div>
</template>

<style scoped>
/* TODO */
</style>
