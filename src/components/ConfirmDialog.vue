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

<style lang="less">
@import "../styles/extends.less";

#time-tracker {
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
}
</style>
