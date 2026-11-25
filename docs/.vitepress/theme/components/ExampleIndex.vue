<script setup lang="ts">
import { withBase } from 'vitepress'
import { exampleGroups } from '../../examples'
</script>

<template>
  <div class="example-index">
    <section
      v-for="group in exampleGroups"
      :key="group.title"
      class="example-group"
    >
      <h2
        :id="group.title.toLowerCase().replace(/\s+/g, '-')"
        class="example-group-title"
      >
        {{ group.title }}
      </h2>
      <ul class="example-cards">
        <li
          v-for="example in group.items"
          :key="example.slug"
        >
          <a
            class="example-card"
            :href="withBase(`/examples/${example.slug}`)"
          >
            <span class="example-card-title">{{ example.title }}</span>
            <span class="example-card-summary">{{ example.summary }}</span>
          </a>
        </li>
      </ul>
    </section>
  </div>
</template>
