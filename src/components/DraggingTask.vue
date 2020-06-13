<template>
  <Task
    v-if="initialized"
    :task="task"
    :dragging="true"
    :style="{ left: x + 'px', top: y + 'px', width: width + 'px', position: 'fixed', marginTop: 0 }"
  ></Task>
</template>
<script>
import Task from "./Task.vue";

export default {
  name: "DraggingTask",
  components: { Task },
  props: {
    task: Object,
    element: HTMLElement,
    mouseX: Number,
    mouseY: Number,
  },
  data: () => ({
    x: null,
    y: null,
    width: null,
    initialized: false,
  }),

  mounted: function() {
    // Copy position from the passed element
    const bcr = this.element.getBoundingClientRect();

    this.x = bcr.left;
    this.y = bcr.top;
    this.width = bcr.width;

    this.initialized = true;

    document.addEventListener("mousemove", e => {
      this.x = e.clientX - this.mouseX;
      this.y = e.clientY - this.mouseY;
    });
  },
};
</script>

<style></style>
