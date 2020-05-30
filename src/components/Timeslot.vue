<template>
  <div class="timeslot" draggable="true" :class="{ active: timeslot.isActive, dragging: dragging }">
    <span class="timeslot-controls">
      <span class="timeslot-control" title="Move to new subtask" @click="$emit('timeslot-to-new-task', timeslot.id)">
        <i class="far fa-window-maximize"></i>
      </span>
      <span
        class="timeslot-control timeslot-remove"
        title="Remove"
        @click="$emit('remove-timeslot', { timeslotId: timeslot.id, posY: $event.clientY })"
      >
        <i class="fas fa-trash-alt"></i>
      </span>
    </span>

    <span class="timeslot-period">
      <span class="timeslot-begin">
        <span
          v-if="begin == null"
          v-text="formatTimestamp(timeslot.begin, '???')"
          @click="begin = formatTimestamp(timeslot.begin, '???')"
        >
        </span>

        <input
          class="edit-time"
          type="text"
          v-if="begin != null"
          v-model="begin"
          v-focus
          @keyup.enter="changeTimeslotBegin(begin)"
          @keyup.escape="begin = null"
        />
      </span>

      <span class="timeslot-separator">&ndash;</span>

      <span class="timeslot-end">
        <span
          v-if="end == null"
          v-text="formatTimestamp(timeslot.end, '???')"
          @click="end = formatTimestamp(timeslot.end, '???')"
        ></span>
        <input
          type="text"
          class="edit-time"
          v-if="end != null"
          v-model="end"
          v-focus
          @keyup.enter="changeTimeslotEnd(end)"
          @keyup.escape="end = null"
        />
      </span>
    </span>

    <span class="timeslot-right">
      <span class="timeslot-duration" v-text="formatDuration(timeslot.duration, { showZero: false })"></span>
    </span>
  </div>
</template>

<script>
import * as utils from "../utils.js";

export default {
  name: "Timeslot",
  props: {
    timeslot: Object,
    task: Object,
  },
  mounted: function() {
    this.$el.addEventListener("dragstart", this.onDragStart);
    this.$el.addEventListener("dragend", this.onDragEnd);
    document.addEventListener("click", this.onClick);
  },

  beforeDestroy: function() {
    this.$el.removeEventListener("dragstart", this.onDragStart);
    this.$el.removeEventListener("dragend", this.onDragEnd);
    document.removeEventListener("click", this.onClick);
  },

  data: function() {
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

    changeTimeslotBegin: function(time) {
      const timeslotId = this.timeslot.id;
      const timestamp = utils.timeToTimestamp(time);
      this.$emit("change-timeslot-begin", { timeslotId, timestamp });
      this.begin = null;
    },

    changeTimeslotEnd: function(time) {
      const timeslotId = this.timeslot.id;
      const timestamp = utils.timeToTimestamp(time);
      this.$emit("change-timeslot-end", { timeslotId, timestamp });
      this.end = null;
    },

    onDragStart: function(ev) {
      ev.stopPropagation();

      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.dropEffect = "move";
      ev.dataTransfer.setData("timeslotId", this.timeslot.id);
      ev.dataTransfer.setData("taskId", this.timeslot.taskId);
      this.dragging = true;
    },

    onDragEnd: function(ev) {
      ev.preventDefault();
      this.dragging = false;
    },

    onClick: function(ev) {
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
};
</script>
