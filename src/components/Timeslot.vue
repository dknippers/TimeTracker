<template>
  <div class="timeslot" draggable="true" :class="{ active: timeslot.isActive, dragging: dragging }">
    <span class="timeslot-controls">
      <span class="timeslot-control" title="Move to new subtask" @click="$emit('timeslot-to-new-task', timeslot.id)">
        <i class="far fa-window-maximize"></i>
      </span>
      <span
        class="timeslot-control timeslot-remove"
        title="Remove"
        @click="$emit('remove-timeslot-confirmation', { timeslotId: timeslot.id, posY: $event.clientY })"
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

      setTimeout(() => (this.dragging = true));
    },

    onDragEnd: function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
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

<style lang="less">
@import "../styles/extends.less";
@import "../styles/variables.less";

#time-tracker {
  .timeslot {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0.25em 0;

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

      &:hover > .timeslot-control {
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

    &.dragging {
      &:extend(._dragging all);
    }
  }
}
</style>
