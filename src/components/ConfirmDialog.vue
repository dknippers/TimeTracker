<template>
  <div class="confirm-dialog-wrapper">
    <div class="confirm-dialog">
      <div class="text" v-text="config.text"></div>
      <div class="buttons">
        <button class="cancel" type="button" @click="cancel()" v-text="config.cancelText"></button>
        <button class="ok" type="button" @click="ok()" v-text="config.okText"></button>
      </div>
    </div>
  </div>
</template>

<script>
import * as utils from "../utils.js";

export default {
  name: "confirm-dialog",
  props: {
    config: Object,
  },

  mounted: function() {
    this.$el.addEventListener("click", this.onClick);
    document.addEventListener("keyup", this.onKeyup);

    if (this.config.posY != null) {
      const dialog = this.$el.querySelector(".confirm-dialog");
      if (dialog != null) {
        dialog.style.position = "absolute";
        dialog.style.top = this.config.posY - dialog.clientHeight / 2 + "px";
      }
    }
  },

  beforeDestroy: function() {
    this.$el.removeEventListener("click", this.onClick);
    document.removeEventListener("keyup", this.onKeyup);
  },

  methods: {
    ok: function() {
      utils.runIfFn(this.config.ok);
      utils.runIfFn(this.config.always);
    },

    cancel: function() {
      utils.runIfFn(this.config.cancel);
      utils.runIfFn(this.config.always);
    },

    onClick: function(ev) {
      ev.preventDefault();
      ev.stopPropagation();

      if (ev.target === this.$el) {
        this.cancel();
      }
    },

    onKeyup: function(ev) {
      if (ev.keyCode === 27) {
        // Cancel on escape
        this.cancel();
      }
    },
  },
};
</script>

<style scoped></style>
