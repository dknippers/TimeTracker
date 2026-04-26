# Plan: Update All Dependencies to Latest Versions

**User Prompt:** Update all dependencies to their latest versions.

## 1. Current State

This is a Vue.js 3 + Vite project using pnpm (v10.33.2) on Node.js v24.12.0.

Root `package.json` dependencies:

| Package | Current | Latest | Type |
|---------|---------|--------|------|
| `vue` | `^3.5.13` | `3.5.33` | prod |
| `lodash` | `^4.17.21` | `4.18.1` | prod |
| `@vitejs/plugin-vue` | `^5.2.1` | `6.0.6` | dev |
| `less` | `^4.2.2` | `4.6.4` | dev |
| `vite` | `^6.0.11` | `8.0.10` | dev |
| `vite-plugin-vue-devtools` | `^7.7.0` | `8.1.1` | dev |

## 2. Risk Assessment

Three packages have **major version** bumps:
- `vite`: 6 &rarr; 8 (two major versions)
- `@vitejs/plugin-vue`: 5 &rarr; 6
- `vite-plugin-vue-devtools`: 7 &rarr; 8

The `vite` 6 &rarr; 8 jump is the highest risk. Vite 7 introduced breaking changes (e.g., removed CJS Node API, changed default dev port behavior, CSS changes), and Vite 8 may introduce further ones. `@vitejs/plugin-vue` v6 typically requires Vite 6+. `vite-plugin-vue-devtools` v8 likely requires Vite 6+ and Vue 3.5+.

## 3. Execution Steps

1. **Update `package.json`**
   - Update all dependency version ranges to the latest versions:
     - `vue`: `^3.5.33`
     - `lodash`: `^4.18.1`
     - `@vitejs/plugin-vue`: `^6.0.6`
     - `less`: `^4.6.4`
     - `vite`: `^8.0.10`
     - `vite-plugin-vue-devtools`: `^8.1.1`

2. **Regenerate lockfile**
   - Run `pnpm install` to update `pnpm-lock.yaml`.

3. **Verify build**
   - Run `pnpm build`.
   - If the build fails, investigate Vite/plugin breaking changes:
     - Check if `vite.config.js` needs API adjustments (e.g., plugin import changes).
     - Check if `jsconfig.json` or `tsconfig.json` needs updates.
   - Fix any issues iteratively.

4. **Smoke test**
   - Run `pnpm dev` and ensure the application starts without errors.
   - Spot-check key UI functionality.

5. **Commit**
   - Stage `package.json`, `pnpm-lock.yaml`, and any config fixes.
   - Commit with a message like `chore: update dependencies to latest versions`.
   - Append `Model: kimi-k2.6` as the final line of the commit message.

## 4. Rollback Strategy

If the update proves too complex due to Vite 6 &rarr; 8 breaking changes:
- Revert `package.json` and `pnpm-lock.yaml` to the previous state.
- Consider a staged approach: update Vue/Lodash/Less first, then tackle Vite ecosystem separately.

## 5. Notes

- Node.js v24.12.0 is very recent and fully supports Vite 8.
- There are no existing test scripts in `package.json`, so verification is limited to build and manual smoke testing.
