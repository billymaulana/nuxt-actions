import { readdirSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  defineNuxtModule,
  addServerImportsDir,
  addImportsDir,
  addTemplate,
  createResolver,
  useLogger,
  updateTemplates,
} from '@nuxt/kit'
import { setupDevtools } from './devtools'

export interface ModuleOptions {
  /**
   * Enable or disable the module
   * @default true
   */
  enabled?: boolean

  /**
   * Directory name for action files (relative to server/)
   * @default 'actions'
   */
  actionsDir?: string
}

// ── Helper functions ──────────────────────────────────────────────

const METHOD_SUFFIXES = ['get', 'post', 'put', 'patch', 'delete', 'head'] as const

/** Pattern for safe action file names: alphanumeric, hyphens, dots only */
const SAFE_NAME_PATTERN = /^\w[\w.-]*\.ts$/

interface ScannedAction {
  /** camelCase name for the export (e.g. 'createTodo') */
  name: string
  /** kebab-case path segment (e.g. 'create-todo') */
  path: string
  /** HTTP method (e.g. 'POST') */
  method: string
  /** Absolute file path to the action source */
  filePath: string
  /** Relative import path from the generated template to the action file */
  importPath: string
}

/**
 * Convert a kebab-case name to camelCase.
 * e.g. 'create-todo' -> 'createTodo', 'get-users' -> 'getUsers'
 */
function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

/**
 * Parse method suffix from filename.
 * e.g. 'get-users.get.ts' -> { baseName: 'get-users', method: 'GET' }
 *      'create-todo.ts'   -> { baseName: 'create-todo', method: 'POST' }
 */
function parseMethodSuffix(fileName: string): { baseName: string, method: string } {
  // Remove .ts extension
  const withoutExt = fileName.replace(/\.ts$/, '')

  // Check for method suffix
  const parts = withoutExt.split('.')
  if (parts.length >= 2) {
    const suffix = parts[parts.length - 1].toLowerCase()
    if ((METHOD_SUFFIXES as readonly string[]).includes(suffix)) {
      return {
        baseName: parts.slice(0, -1).join('.'),
        method: suffix.toUpperCase(),
      }
    }
  }

  // Default to POST
  return { baseName: withoutExt, method: 'POST' }
}

/**
 * Recursively scan a directory for .ts action files.
 * Skips symlinks, dot-files, test files, and files starting with _.
 */
function scanActionFiles(
  dir: string,
  prefix = '',
  maxDepth = 10,
): Array<{ fileName: string, filePath: string, relativePath: string }> {
  if (!existsSync(dir) || maxDepth <= 0) return []

  const entries = readdirSync(dir, { withFileTypes: true })
  const results: Array<{ fileName: string, filePath: string, relativePath: string }> = []

  for (const entry of entries) {
    // Skip symlinks to prevent traversal attacks
    if (entry.isSymbolicLink()) continue

    if (entry.isDirectory()) {
      // Skip directories starting with . or _
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue

      const subPrefix = prefix ? `${prefix}/${entry.name}` : entry.name
      results.push(...scanActionFiles(join(dir, entry.name), subPrefix, maxDepth - 1))
    }
    else if (entry.isFile()) {
      // Skip non-.ts files, dot-files, _-prefixed files, test/spec files
      if (
        !entry.name.endsWith('.ts')
        || entry.name.startsWith('_')
        || entry.name.startsWith('.')
        || entry.name.includes('.test.')
        || entry.name.includes('.spec.')
        || !SAFE_NAME_PATTERN.test(entry.name)
      ) continue

      results.push({
        fileName: entry.name,
        filePath: join(dir, entry.name),
        relativePath: prefix ? `${prefix}/${entry.name}` : entry.name,
      })
    }
  }

  return results
}

/**
 * Generate the virtual handler code for a scanned action.
 * This creates a Nitro handler that imports and calls the action's _execute method.
 */
function generateHandlerCode(action: ScannedAction): string {
  // Safely escape the import path using JSON.stringify
  const importPath = JSON.stringify(action.filePath.split('\\').join('/'))
  return [
    `import { defineEventHandler, readBody, getQuery, getHeader } from 'h3'`,
    `import actionModule from ${importPath}`,
    ``,
    `export default defineEventHandler(async (event) => {`,
    `  if (typeof actionModule._execute === 'function') {`,
    `    let rawInput`,
    `    try {`,
    `      const method = event.method.toUpperCase()`,
    `      rawInput = (method === 'GET' || method === 'HEAD')`,
    `        ? getQuery(event)`,
    `        : (await readBody(event) ?? {})`,
    `    } catch (parseError) {`,
    `      const ct = getHeader(event, 'content-type') || ''`,
    `      if (ct.includes('application/json')) {`,
    `        return { success: false, error: { code: 'PARSE_ERROR', message: 'Invalid JSON in request body', statusCode: 400 } }`,
    `      }`,
    `      rawInput = {}`,
    `    }`,
    `    return actionModule._execute(rawInput, event)`,
    `  }`,
    `  return actionModule(event)`,
    `})`,
  ].join('\n')
}

/**
 * Build ScannedAction[] from raw file list.
 * Extracted as a helper to support HMR re-scanning.
 */
function buildScannedActions(
  actionFiles: Array<{ fileName: string, filePath: string, relativePath: string }>,
  nuxt: { options: { buildDir: string } },
  _actionsDir: string,
  warn?: (msg: string) => void,
): ScannedAction[] {
  const actions: ScannedAction[] = []
  const seenNames = new Map<string, string>()

  for (const file of actionFiles) {
    const { baseName, method } = parseMethodSuffix(file.fileName)
    const lastSlash = file.relativePath.lastIndexOf('/')
    const dirPrefix = lastSlash >= 0
      ? file.relativePath.substring(0, lastSlash)
      : ''
    const actionPath = dirPrefix ? `${dirPrefix}/${baseName}` : baseName
    const name = toCamelCase(actionPath.replace(/\//g, '-'))

    if (seenNames.has(name)) {
      warn?.(`Action name collision: "${name}" from "${file.relativePath}" conflicts with "${seenNames.get(name)}". Skipping.`)
      continue
    }
    seenNames.set(name, file.relativePath)

    actions.push({
      name,
      path: actionPath,
      method,
      filePath: file.filePath,
      importPath: relative(nuxt.options.buildDir, file.filePath).split('\\').join('/'),
    })
  }

  return actions
}

// ── Module definition ─────────────────────────────────────────────

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-actions',
    configKey: 'actions',
    compatibility: {
      nuxt: '^3.7.0 || ^4.0.0',
    },
  },
  defaults: {
    enabled: true,
    actionsDir: 'actions',
  },
  setup(options, nuxt) {
    if (!options.enabled) return

    const logger = useLogger('nuxt-actions')
    const resolver = createResolver(import.meta.url)

    // Auto-import server utilities: defineAction, createActionError, defineMiddleware
    addServerImportsDir(resolver.resolve('./runtime/server/utils'))

    // Auto-import client composables: useAction, useOptimisticAction
    addImportsDir(resolver.resolve('./runtime/composables'))

    // ── E2E Type Inference: Scan actions directory ──────────────

    const actionsDir = options.actionsDir || 'actions'
    const serverDir = nuxt.options.serverDir || join(nuxt.options.srcDir, 'server')
    const actionsDirPath = join(serverDir, actionsDir)

    // Scan for action files — reuse buildScannedActions to avoid duplication
    const actionFiles = scanActionFiles(actionsDirPath)
    const scannedActions = buildScannedActions(actionFiles, nuxt, actionsDir, msg => logger.warn(msg))

    // ── Register Nitro virtual handlers ────────────────────────

    if (scannedActions.length > 0) {
      nuxt.hook('nitro:config', (nitroConfig) => {
        nitroConfig.virtual = nitroConfig.virtual || {}
        nitroConfig.handlers = nitroConfig.handlers || []

        for (const action of scannedActions) {
          const virtualId = `#actions-handler/${action.path}`
          nitroConfig.virtual[virtualId] = () => generateHandlerCode(action)
          nitroConfig.handlers.push({
            route: `/api/_actions/${action.path}`,
            method: action.method.toLowerCase(),
            handler: virtualId,
          })
        }
      })
    }

    // ── Generate typed references template ─────────────────────

    addTemplate({
      filename: 'actions.ts',
      write: true,
      getContents: () => {
        // Re-scan on each call to support HMR
        const freshFiles = scanActionFiles(actionsDirPath)
        const freshActions = buildScannedActions(freshFiles, nuxt, actionsDir)
        return generateActionsTemplate(freshActions, nuxt.options.buildDir)
      },
    })

    // ── Register #actions alias ──────────────────────────

    nuxt.options.alias['#actions'] = join(nuxt.options.buildDir, 'actions')

    // ── Add type declarations ──────────────────────────────────

    nuxt.hook('prepare:types', ({ references }) => {
      references.push({
        path: join(nuxt.options.buildDir, 'actions.ts'),
      })
    })

    // ── HMR: Regenerate types on action file changes ──────────

    // Track known action files to detect additions and removals
    const knownActionFiles = new Set(actionFiles.map(f => f.filePath.replace(/\\/g, '/')))

    nuxt.hook('builder:watch', async (event, relativePath) => {
      const normalized = relativePath.replace(/\\/g, '/')
      if (!normalized.includes(`server/${actionsDir}/`)) return
      if (!normalized.endsWith('.ts')) return

      // Always regenerate type templates for content changes
      await updateTemplates({ filter: t => t.filename === 'actions.ts' })

      // Detect structural changes (new or deleted action files)
      const freshFiles = scanActionFiles(actionsDirPath)
      const freshPaths = new Set(freshFiles.map(f => f.filePath.replace(/\\/g, '/')))

      const hasStructuralChange
        = freshPaths.size !== knownActionFiles.size
          || [...freshPaths].some(p => !knownActionFiles.has(p))

      if (hasStructuralChange) {
        // Update tracking set
        knownActionFiles.clear()
        for (const p of freshPaths) knownActionFiles.add(p)

        // Nitro handlers are registered once — a restart is needed for new/removed routes
        logger.info('Action files changed, restarting Nuxt to update routes...')
        await nuxt.callHook('restart')
      }
      else {
        logger.info('Regenerated typed action types')
      }
    })

    // ── DevTools integration ────────────────────────────────────

    if (nuxt.options.dev) {
      setupDevtools(nuxt, scannedActions)
    }
  },
})

/**
 * Generate the actions.ts template content.
 */
function generateActionsTemplate(
  actions: ScannedAction[],
  buildDir: string,
): string {
  if (actions.length === 0) {
    return [
      '// Auto-generated by nuxt-actions',
      '// No action files found in server/actions/',
      'export {}',
    ].join('\n')
  }

  const lines: string[] = [
    '// Auto-generated by nuxt-actions — do not edit',
    `import type { TypedActionReference } from 'nuxt-actions/dist/runtime/types'`,
    '',
  ]

  // Import types from each action file
  for (const action of actions) {
    const importPath = posixRelative(buildDir, action.filePath)
    lines.push(`import type _action_${action.name} from '${importPath}'`)
  }

  lines.push('')

  // Export typed references
  for (const action of actions) {
    lines.push(
      `export const ${action.name} = Object.freeze({`,
      `  __actionPath: '${action.path}',`,
      `  __actionMethod: '${action.method}',`,
      `  _types: {} as { readonly input: unknown, readonly output: unknown },`,
      `}) as TypedActionReference<`,
      `  typeof _action_${action.name}['_types']['input'],`,
      `  typeof _action_${action.name}['_types']['output']`,
      `>`,
      '',
    )
  }

  return lines.join('\n')
}

/**
 * Get a POSIX-style relative path suitable for TypeScript imports.
 */
function posixRelative(from: string, to: string): string {
  let rel = relative(from, to).split('\\').join('/')
  // Remove .ts extension for imports
  rel = rel.replace(/\.ts$/, '')
  if (!rel.startsWith('.')) {
    rel = './' + rel
  }
  return rel
}
