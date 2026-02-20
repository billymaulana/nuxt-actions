<template>
  <div id="app">
    <nav>
      <NuxtLink to="/">
        Home
      </NuxtLink>
      <NuxtLink to="/actions">
        Actions
      </NuxtLink>
      <NuxtLink to="/optimistic">
        Optimistic
      </NuxtLink>
      <NuxtLink to="/streaming">
        Streaming
      </NuxtLink>
      <NuxtLink to="/queries">
        Queries
      </NuxtLink>
      <NuxtLink to="/middleware">
        Middleware
      </NuxtLink>
      <NuxtLink to="/advanced">
        Advanced
      </NuxtLink>
    </nav>
    <main>
      <NuxtPage />
    </main>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #0a0a0a;
  color: #e5e5e5;
  line-height: 1.6;
}

#app {
  max-width: 700px;
  margin: 0 auto;
  padding: 24px 16px;
}

nav {
  display: flex;
  gap: 12px;
  padding: 16px 0;
  border-bottom: 1px solid #333;
  margin-bottom: 32px;
  flex-wrap: wrap;
}

nav a {
  color: #a3a3a3;
  text-decoration: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 14px;
  transition: all 0.15s;
}

nav a:hover {
  background: #1a1a1a;
  color: #fff;
}

nav a.router-link-active {
  background: #1e3a5f;
  color: #60a5fa;
}

h1 {
  font-size: 24px;
  margin-bottom: 8px;
}

h2 {
  font-size: 18px;
  margin-bottom: 16px;
  color: #a3a3a3;
}

section {
  margin-bottom: 32px;
}

input, textarea {
  background: #1a1a1a;
  border: 1px solid #333;
  color: #e5e5e5;
  padding: 8px 12px;
  border-radius: 6px;
  width: 100%;
  font-size: 14px;
}

input:focus, textarea:focus {
  outline: none;
  border-color: #60a5fa;
}

button {
  background: #1e3a5f;
  color: #60a5fa;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
}

button:hover:not(:disabled) {
  background: #2563eb;
  color: #fff;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  color: #f87171;
  background: #1c1010;
  padding: 12px;
  border-radius: 6px;
  margin-top: 12px;
  font-size: 14px;
}

.success {
  color: #4ade80;
  background: #0a1c10;
  padding: 12px;
  border-radius: 6px;
  margin-top: 12px;
  font-size: 14px;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

pre {
  background: #111;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 13px;
  margin-top: 8px;
}
</style>
