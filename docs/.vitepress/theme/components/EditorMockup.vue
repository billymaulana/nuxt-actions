<script setup lang="ts">
type TokenKind = 'kw' | 'fn' | 'str' | 'p' | 'tag'
type Token = [kind: TokenKind, text: string]

const serverCode: Token[][] = [
  [['kw', 'import '], ['p', '{ z } '], ['kw', 'from '], ['str', '\'zod\'']],
  [],
  [['kw', 'export default '], ['fn', 'defineAction'], ['p', '({']],
  [['p', '  input: z.object({ title: z.string() }),']],
  [['p', '  handler: '], ['kw', 'async '], ['p', '({ input }) => ({']],
  [['p', '    id: Date.now(),']],
  [['p', '    title: input.title,']],
  [['p', '  }),']],
  [['p', '})']],
]

const clientBefore: Token[][] = [
  [['tag', '<script '], ['p', 'setup lang='], ['str', '"ts"'], ['tag', '>']],
  [['kw', 'import '], ['p', '{ createTodo } '], ['kw', 'from '], ['str', '\'#actions\'']],
  [],
  [['kw', 'const '], ['p', '{ execute, data } = '], ['fn', 'useAction'], ['p', '(createTodo)']],
]

const clientAfter: Token[][] = [
  [['kw', 'await '], ['fn', 'execute'], ['p', '({ title: '], ['str', '\'Buy milk\''], ['p', ' })']],
  [['tag', '</'], ['tag', 'script>']],
]
</script>

<template>
  <figure
    class="editor"
    aria-label="An action file and a component that calls it, with the inferred type of data shown"
  >
    <div
      class="editor-titlebar"
      aria-hidden="true"
    >
      <span class="editor-dot editor-dot-close" />
      <span class="editor-dot editor-dot-min" />
      <span class="editor-dot editor-dot-max" />
      <span class="editor-title">my-nuxt-app</span>
    </div>
    <div class="editor-panes">
      <div class="editor-pane">
        <div class="editor-tab">
          <span class="editor-tab-name">create-todo.ts</span>
          <span class="editor-tab-path">server/actions</span>
        </div>
        <pre class="editor-code"><code><span
          v-for="(line, index) in serverCode"
          :key="index"
          class="editor-line"
        ><span
          v-for="([kind, text], position) in line"
          :key="position"
          :class="`tok-${kind}`"
        >{{ text }}</span></span></code></pre>
      </div>
      <div class="editor-pane">
        <div class="editor-tab">
          <span class="editor-tab-name">index.vue</span>
          <span class="editor-tab-path">app/pages</span>
        </div>
        <pre class="editor-code"><code><span
          v-for="(line, index) in clientBefore"
          :key="`before-${index}`"
          class="editor-line"
        ><span
          v-for="([kind, text], position) in line"
          :key="position"
          :class="`tok-${kind}`"
        >{{ text }}</span></span><span class="editor-hover"><span class="tok-kw">const </span>data: Ref&lt;{
  id: <span class="tok-type">number</span>
  title: <span class="tok-type">string</span>
} | <span class="tok-type">null</span>&gt;</span><span
          v-for="(line, index) in clientAfter"
          :key="`after-${index}`"
          class="editor-line"
        ><span
          v-for="([kind, text], position) in line"
          :key="position"
          :class="`tok-${kind}`"
        >{{ text }}</span></span></code></pre>
      </div>
    </div>
    <figcaption class="editor-status">
      <span><span
        class="editor-status-dot"
        aria-hidden="true"
      />Types inferred from server/actions/create-todo.ts</span>
      <span class="editor-status-meta">0 problems</span>
    </figcaption>
  </figure>
</template>
