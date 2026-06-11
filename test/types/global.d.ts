/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Ref, ComputedRef } from 'vue'

/*
 * Loads '#app' into this isolated program so the RuntimeNuxtHooks
 * augmentation in src/runtime/types.ts targets a known module.
 */
import type {} from '#app'

declare global {
  // Nuxt augments globalThis with Vue types
  // We replicate this for isolated type test environment
  type Ref<T> = import('vue').Ref<T>
  type ComputedRef<T> = import('vue').ComputedRef<T>
}
