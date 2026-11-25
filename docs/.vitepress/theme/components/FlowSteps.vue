<script setup lang="ts">
import { computed } from 'vue'

interface FlowStep {
  label: string
  note?: string
}

interface FlowRow {
  label?: string
  steps: Array<string | FlowStep>
}

const props = defineProps<{
  rows?: FlowRow[]
  steps?: Array<string | FlowStep>
  vertical?: boolean
}>()

const normalizedRows = computed(() => {
  const rows = props.rows ?? [{ steps: props.steps ?? [] }]
  return rows.map(row => ({
    label: row.label,
    steps: row.steps.map(step => (typeof step === 'string' ? { label: step } : step)),
  }))
})
</script>

<template>
  <figure
    class="flow"
    :class="{ 'flow-vertical': vertical }"
  >
    <div
      v-for="(row, rowIndex) in normalizedRows"
      :key="rowIndex"
      class="flow-row"
    >
      <span
        v-if="row.label"
        class="flow-row-label"
      >{{ row.label }}</span>
      <ol class="flow-steps">
        <li
          v-for="(step, stepIndex) in row.steps"
          :key="stepIndex"
          class="flow-step"
        >
          <span
            v-if="stepIndex > 0"
            class="flow-arrow"
            aria-hidden="true"
          />
          <span class="flow-step-body">
            <code class="flow-step-label">{{ step.label }}</code>
            <span
              v-if="step.note"
              class="flow-step-note"
            >{{ step.note }}</span>
          </span>
        </li>
      </ol>
    </div>
  </figure>
</template>
