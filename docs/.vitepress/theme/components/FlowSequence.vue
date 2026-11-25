<script setup lang="ts">
import { computed } from 'vue'

interface SequenceMessage {
  direction: 'forward' | 'back' | 'note'
  text: string
  caption?: string
  step?: number
}

interface SequenceGroup {
  group: string
  messages: SequenceMessage[]
}

const props = defineProps<{
  from: string
  to: string
  messages: Array<SequenceMessage | SequenceGroup>
}>()

const rows = computed(() => props.messages.flatMap((item) => {
  if (!('group' in item)) return [{ message: item, inGroup: false, groupLabel: '', groupEnd: false }]
  return item.messages.map((message, index) => ({
    message,
    inGroup: true,
    groupLabel: index === 0 ? item.group : '',
    groupEnd: index === item.messages.length - 1,
  }))
}))

function describe(message: SequenceMessage): string {
  const step = message.step ? `Step ${message.step}. ` : ''
  if (message.direction === 'forward') return `${step}${props.from} to ${props.to}:`
  if (message.direction === 'back') return `${step}${props.to} to ${props.from}:`
  return `${step}${props.to}:`
}
</script>

<template>
  <figure class="sequence">
    <div
      class="sequence-lanes"
      aria-hidden="true"
    >
      <span class="sequence-lane">{{ from }}</span>
      <span class="sequence-lane">{{ to }}</span>
    </div>
    <ol class="sequence-messages">
      <li
        v-for="(row, index) in rows"
        :key="index"
        class="sequence-message"
        :class="[
          `sequence-message-${row.message.direction}`,
          { 'in-group': row.inGroup, 'group-start': row.groupLabel, 'group-end': row.groupEnd },
        ]"
      >
        <span
          v-if="row.inGroup"
          class="sequence-frame"
          aria-hidden="true"
        >
          <span
            v-if="row.groupLabel"
            class="sequence-frame-label"
          >{{ row.groupLabel }}</span>
        </span>
        <span
          v-if="row.groupLabel"
          class="visually-hidden"
        >{{ row.groupLabel }}:</span>
        <span class="visually-hidden">{{ describe(row.message) }}</span>
        <span class="sequence-body">
          <span class="sequence-label">
            <span
              v-if="row.message.step"
              class="sequence-step"
              aria-hidden="true"
            >{{ row.message.step }}</span>
            <code
              v-if="row.message.direction !== 'note'"
              class="sequence-text"
            >{{ row.message.text }}</code>
            <span
              v-else
              class="sequence-note"
            >{{ row.message.text }}</span>
          </span>
          <span
            v-if="row.message.caption"
            class="sequence-caption"
          >{{ row.message.caption }}</span>
        </span>
      </li>
    </ol>
  </figure>
</template>
