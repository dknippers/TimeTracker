<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import * as utils from "../utils.js";

const props = defineProps({
  config: {
    type: Object,
    required: true,
  },
});

const wrapperRef = ref(null);
const dialogRef = ref(null);
const minMarginPercentage = ref(0.02);

const getViewport = () => ({
  top: 0,
  left: 0,
  width: window.innerWidth,
  height: window.innerHeight,
});

const ok = () => {
  utils.runIfFn(props.config.ok);
  utils.runIfFn(props.config.always);
};

const cancel = () => {
  utils.runIfFn(props.config.cancel);
  utils.runIfFn(props.config.always);
};

const onClick = ev => {
  ev.preventDefault();
  ev.stopPropagation();

  if (ev.target === ev.currentTarget) {
    cancel();
  }
};

const onKeyup = ev => {
  if (ev.key === "Escape") {
    cancel();
  }
};

onMounted(() => {
  if (wrapperRef.value) {
    wrapperRef.value.addEventListener("click", onClick);
  }
  document.addEventListener("keyup", onKeyup);

  if (props.config.posY != null && dialogRef.value) {
    const viewport = getViewport();
    const minMargin = minMarginPercentage.value * viewport.height;
    const dialogRect = dialogRef.value.getBoundingClientRect();

    const rearrangeable = dialogRect.height + 2 * minMargin < viewport.height;

    let top;
    if (rearrangeable) {
      top = props.config.posY - dialogRef.value.clientHeight / 2;
      const bottom = top + dialogRect.height;
      if (top < minMargin) {
        top = minMargin;
      } else if (viewport.height - bottom < minMargin) {
        top = viewport.height - minMargin - dialogRect.height;
      }
    } else {
      top = viewport.height / 2 - dialogRef.value.clientHeight / 2;
    }

    dialogRef.value.style.position = "absolute";
    dialogRef.value.style.top = `${top}px`;
  }
});

onBeforeUnmount(() => {
  if (wrapperRef.value) {
    wrapperRef.value.removeEventListener("click", onClick);
  }
  document.removeEventListener("keyup", onKeyup);
});
</script>

<template>
  <div ref="wrapperRef" class="confirm-dialog-wrapper">
    <div ref="dialogRef" class="confirm-dialog">
      <div class="text" v-text="config.text"></div>
      <div class="buttons">
        <button class="cancel" type="button" @click="cancel" v-text="config.cancelText"></button>
        <button class="ok" type="button" @click="ok" v-text="config.okText"></button>
      </div>
    </div>
  </div>
</template>

<style lang="less">
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
            box-shadow: var(--focus-box-shadow);
          }

          &:active {
            box-shadow: none;
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
