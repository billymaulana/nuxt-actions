# Contributing to nuxt-actions

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/billymaulana/nuxt-actions.git
cd nuxt-actions

# Install dependencies
pnpm install

# Generate type stubs
pnpm run dev:prepare

# Start development with the playground
pnpm run dev
```

## Project Structure

```
src/
  module.ts              # Nuxt module definition, action scanning, type generation
  devtools.ts            # Nuxt DevTools integration
  runtime/
    composables/         # Client-side composables (useAction, useOptimisticAction, etc.)
    server/utils/        # Server utilities (defineAction, createActionClient, etc.)
    types.ts             # Shared TypeScript types
test/
  unit/                  # Unit tests (100% coverage target)
  types/                 # Compile-time type tests
  fixtures/              # Test fixtures (Nuxt apps for E2E)
  basic.test.ts          # E2E integration tests
docs/                    # VitePress documentation site
playground/              # Development playground app
```

## Coding Style

- **ESLint** with `@nuxt/eslint-config` (stylistic rules enabled, no Prettier)
- **2-space indentation**, LF line endings
- Run `pnpm run lint` before committing
- Auto-fix available: `pnpm run lint --fix`

## Testing

```bash
# Run unit tests
pnpm run test

# Run with watch mode
pnpm run test:watch

# Run with coverage (100% threshold enforced)
pnpm run test:coverage

# Run type checking
pnpm run test:types

# Run compile-time type tests
pnpm run test:type-tests
```

All pull requests must pass unit tests and maintain 100% code coverage for `src/runtime/`.

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description
```

**Types:** `feat`, `fix`, `docs`, `chore`, `test`, `ci`, `build`, `refactor`, `perf`

**Scopes:** `module`, `composables`, `server`, `docs`, `ci`, `deps`

**Examples:**
```
feat(composables): add timeout option to useAction
fix(server): handle empty body in defineAction
docs: update middleware guide
test(unit): add edge case tests for streaming
```

## Pull Request Process

1. Fork the repository
2. Create a branch from `main` (`git checkout -b feat/my-feature`)
3. Write tests for your changes
4. Ensure all checks pass: `pnpm run lint && pnpm run test && pnpm run test:types`
5. Open a pull request to `main`
6. Fill out the PR template

## Release Process

Releases are handled by the maintainer using [changelogen](https://github.com/unjs/changelogen):

```bash
pnpm run release
```

This runs: lint → test → build → changelogen → npm publish → git push tags.

CI automatically creates GitHub Releases when a version tag is pushed.
