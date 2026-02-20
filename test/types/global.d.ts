/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Ref, ComputedRef } from 'vue'

declare global {
  // Nuxt augments globalThis with Vue types
  // We replicate this for isolated type test environment
  type Ref<T> = import('vue').Ref<T>
  type ComputedRef<T> = import('vue').ComputedRef<T>
}
