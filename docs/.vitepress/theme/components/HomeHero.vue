<script setup lang="ts">
import { withBase } from 'vitepress'
import EditorMockup from './EditorMockup.vue'
import InstallCommand from './InstallCommand.vue'
</script>

<template>
  <section
    class="hero"
    aria-labelledby="hero-title"
  >
    <div
      class="hero-backdrop"
      aria-hidden="true"
    />
    <div class="hero-content">
      <div class="eyebrow">
        <a
          class="eyebrow-pill eyebrow-pill-link"
          :href="withBase('/guide/server-runtimes')"
        >
          <span
            class="eyebrow-dot"
            aria-hidden="true"
          />
          New in 1.4: Nitro v3 support
        </a>
      </div>
      <h1
        id="hero-title"
        class="hero-title"
      >
        Type-safe server actions
        <span class="hero-title-accent">for Nuxt</span>
      </h1>
      <p class="hero-lead">
        Write the action once on the server. Call it from any component with validated input and typed results, without writing a single generic.
      </p>
      <div class="hero-actions">
        <a
          class="pill pill-primary"
          :href="withBase('/guide/getting-started')"
        >Get started</a>
        <a
          class="pill pill-ghost"
          href="https://github.com/billymaulana/nuxt-actions"
        >View on GitHub</a>
      </div>
      <InstallCommand />
    </div>
    <div class="hero-visual">
      <div
        class="hero-horizon"
        aria-hidden="true"
      />
      <EditorMockup />
    </div>
  </section>
</template>
