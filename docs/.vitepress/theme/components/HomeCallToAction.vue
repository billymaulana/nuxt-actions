<script setup lang="ts">
import { withBase } from 'vitepress'
import InstallCommand from './InstallCommand.vue'
</script>

<template>
  <section
    v-reveal
    class="home-block cta"
    aria-labelledby="cta-title"
  >
    <h2
      id="cta-title"
      class="cta-title"
    >
      Ship your first action in five minutes
    </h2>
    <p class="cta-lead">
      Install the module, add a file to server/actions, and call it from a page.
    </p>
    <div class="hero-actions">
      <a
        class="pill pill-primary"
        :href="withBase('/guide/getting-started')"
      >Read the guide</a>
      <a
        class="pill pill-ghost"
        href="https://stackblitz.com/github/billymaulana/nuxt-actions-example"
      >Open in StackBlitz</a>
    </div>
    <InstallCommand />
  </section>
</template>
