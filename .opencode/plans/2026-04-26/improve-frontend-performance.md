# Plan: Improve Front-End Performance

**User Prompt:** Analyze the code base and create a comprehensive plan to improve front-end performance.

## 1. Current State Analysis

This is a Vue 3 + Vite single-page time-tracking application with the following architecture:

- **Build output (before):** Single JS chunk of **154.49 KB** (57.14 KB gzipped) + 7.60 KB CSS
- **Build output (after):** App chunk **20.90 KB** (7.28 KB gzipped) + Vendor chunk **62.17 KB** (24.58 KB gzipped) + 7.73 KB CSS
- **Dependencies (before):** `vue`, `lodash` (full bundle pulled by `import { min } from "lodash"`)
- **Dependencies (after):** `vue` only
- **Assets (before):** FontAwesome served from `public/fa/` (~223 KB CSS + WOFF2 fonts, including unused `fa-brands-400.woff2`)
- **Assets (after):** Inline SVG icons via `Icon.vue` component (~3 KB, 9 icons total)
- **State:** All state lives in `App.vue` as plain reactive refs (`tasksById`, `timeslotsById`, `now`)
- **Rendering:** Recursive `Task.vue` renders nested sub-tasks; `Timeslot.vue` renders time entries

---

## 2. Issues Found (Prioritized)

### P0 — Cascade Recomputation Every Second
`App.vue` runs `mainLoop(1000)` which updates `now.value = Date.now()` every second. `now` is a dependency of the `timeslots` computed property, which cascades to `timeslotsByTask` -> `tasks` -> `mainTasks` -> `activeTask` -> `totalDuration`, and the entire recursive `<Task>` component tree. **Every second the entire UI recomputes and re-renders.**

### P0 — Full Lodash Bundle Included
`import { min } from "lodash"` in `App.vue` pulls the **entire lodash library** into the bundle because `lodash` is CommonJS and not tree-shakeable under Vite/ESM. Only `min` and `debounce` were used.

### P0 — FontAwesome Blocks First Paint
`index.html` synchronously loads three FontAwesome CSS files in `<head>`, blocking render. The `public/fa/` folder is ~223 KB and includes unused `fa-brands-400.woff2` (75 KB).

### P1 — DevTools Plugin Ships to Production
`vite-plugin-vue-devtools` is unconditionally included in `vite.config.js` plugins array, adding ~50 KB to production builds.

### P1 — Deep Watchers on Large Objects
`App.vue` watches `tasksById` and `timeslotsById` with two separate `{ deep: true }` watchers. Every mutation traverses the entire object graph twice.

### P2 — Single Chunk, No Code Splitting
All application code is bundled into one JS file. No `manualChunks` configured.

### P2 — No Build Target Set
`vite.config.js` has no `build.target`, missing opportunity for smaller `esnext` output.

### P3 — DOM Queries in Lifecycle Hooks
`ConfirmDialog.vue` uses `document.querySelector(".confirm-dialog-wrapper")` inside `onMounted` and `onBeforeUnmount`. This is inefficient and fragile (relies on global class selectors).

### P3 — Missing Resource Hints
`index.html` has no `modulepreload` hints.

### P3 — Potential Memory Leak
`Task.vue` registers a `document` click listener via `setTimeout(() => document.addEventListener("click", onClick))`. If the component unmounts before the timeout fires, the listener is never removed.

---

## 3. Execution Plan

### Phase 1: Critical Runtime Fixes

1. **Decouple `now` from the full data pipeline**
   - Stop `now` from being a dependency of the `timeslots` computed property.
   - Use Vue `provide("now", now)` in `App.vue` and `inject("now")` in `Task.vue` and `Timeslot.vue`.
   - Move duration computation to leaf components: add `duration` computed in `Task.vue` using `utils.computeTaskDuration(task, now.value)`.
   - Add `displayEnd` computed in `Timeslot.vue` returning `timeslot.end || now.value`.
   - Update `totalDuration` computed in `App.vue` to call `utils.computeTaskDuration(task, now.value)` per task.
   - Update `updateDocumentTitle` to compute duration dynamically instead of relying on `task.duration`.
   - Refactor `stopTask` to iterate `Object.values(timeslotsById.value)` directly instead of going through `timeslotsByTask` computed.
   - Refactor `clearTimeslots` to iterate entries directly.

2. **Remove lodash dependency entirely**
   - Replace `import { min } from "lodash"` with native `Math.min(...array)`.
   - Add a lightweight `debounce(fn, delay)` utility to `utils.js` (~10 lines).
   - Add `computeTaskDuration(task, now)` utility to `utils.js` for shared duration calculation.
   - Remove `lodash` from `package.json` dependencies.

### Phase 2: Build & Bundle Optimizations

3. **Remove `vite-plugin-vue-devtools` from production**
   - Change `vite.config.js` to use function config form `defineConfig(({ command }) => ({...}))`.
   - Conditionally include `vueDevTools()` only when `command === "serve"`.

4. **Set `build.target: 'esnext'`**
   - Add `target: "esnext"` to `build` config for smaller, faster JS output.

5. **Configure Vite manual chunks**
   - Split Vue vendor into separate chunk via `manualChunks` function:
     ```js
     manualChunks(id) {
       if (id.includes("node_modules") && (id.includes("vue") || id.includes("@vue"))) {
         return "vendor";
       }
     }
     ```

6. **Inline small assets**
   - Set `assetsInlineLimit: 8192` to inline favicons as base64.

7. **Add bundle analyzer**
   - Install `rollup-plugin-visualizer`.
   - Add to plugins with `filename: "./dist/stats.html"`, `open: false`, `gzipSize: true`.
   - Add `pnpm analyze` script to open stats after build.

### Phase 3: Replace FontAwesome with Inline SVGs

8. **Create `Icon.vue` component**
   - Define a component that maps icon names to exact SVG `path` and `viewBox` from Font Awesome 5.15.4 source.
   - Icons needed: `fa-play`, `fa-stop`, `fa-plus-circle`, `fa-caret-down`, `fa-caret-up`, `fa-trash-alt-solid`, `fa-trash-alt-regular`, `fa-clock`, `fa-window-maximize`.
   - Use `fill="currentColor"` on `<path>` so icons inherit parent CSS color (white on active tasks, purple on hover, etc.).
   - Style `.icon` with `display: inline-block`, `height: 1em`, `width: 1em`, `vertical-align: -0.125em`.

9. **Replace all `<i>` tags in templates**
   - `App.vue`: replace `far fa-trash-alt` with `<Icon name="fa-trash-alt-regular" />`, `far fa-clock` with `<Icon name="fa-clock" />`.
   - `Task.vue`: replace all 6 `fas` icons with `<Icon>` equivalents.
   - `Timeslot.vue`: replace `far fa-window-maximize` and `fas fa-trash-alt` with `<Icon>` equivalents.
   - Add `import Icon from "./Icon.vue"` to all three components.

10. **Remove FontAwesome assets and CSS links**
    - Delete entire `public/fa/` directory (CSS + WOFF2 fonts).
    - Remove all FontAwesome `<link>` tags from `index.html`.

### Phase 4: Rendering & Code Quality Fixes

11. **Add `v-memo` to Timeslot list only**
    - Add `v-memo="[timeslot.id, timeslot.begin, timeslot.end, timeslot.taskId]"` to `<Timeslot>` in `Task.vue`.
    - **Do NOT add `v-memo` to `<Task>`** — it contains recursive subtask rendering inside its template, so memoizing the parent would block all nested child updates.

12. **Fix ConfirmDialog DOM queries**
    - Add `wrapperRef` and `dialogRef` template refs.
    - Replace `document.querySelector(".confirm-dialog-wrapper")` with `wrapperRef.value`.
    - Replace `dialogWrapper.querySelector(".confirm-dialog")` with `dialogRef.value`.

13. **Fix Task.vue memory leak**
    - Store `setTimeout` ID in `clickTimeout` variable.
    - Call `clearTimeout(clickTimeout)` in `onBeforeUnmount`.

14. **Consolidate deep watchers**
    - Replace two separate `watch()` calls with one combined watcher:
      ```js
      watch(
        () => ({ tasksById: tasksById.value, timeslotsById: timeslotsById.value }),
        debouncedSave,
        { deep: true }
      );
      ```

15. **Add resource hints to `index.html`**
    - Add `<link rel="modulepreload" href="/src/main.js" />`.

---

## 4. Success Metrics

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Total JS (gzip) | ~57 KB | ~32 KB | -44% |
| App JS (gzip) | 57 KB | 7.3 KB | -87% |
| CSS blocking resources | 3 sync FA CSS | 0 | eliminated |
| Static assets (FA) | ~223 KB | 0 | -223 KB |
| Re-renders per second | Entire tree | Leaf timers only | massive reduction |
| Dependencies (prod) | vue + lodash | vue only | -1 |
| Lighthouse Performance | N/A | > 90 | target |

---

## 5. Rollback Strategy

- All Phase 1 changes (reactivity, lodash removal) are low-risk and easily revertible via `git revert`.
- FontAwesome replacement is the highest-risk change due to CSS color inheritance; verify all hover/active states render correctly.
- If `v-memo` on Timeslot causes stale UI, remove it immediately.
- `build.target: esnext` requires no legacy browser support; if needed, revert to default.

## 6. Notes

- Node.js v24.12.0 and Vite 8 are modern; all proposed optimizations are fully supported.
- No existing test suite exists, so changes must be verified manually via `pnpm build` and `pnpm dev` smoke tests.
- The `stopTask` and `clearTimeslots` refactor avoids computed property dependencies, improving reactivity performance.
