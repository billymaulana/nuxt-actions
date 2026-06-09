#!/usr/bin/env node
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head']

export function parseArgs(argv) {
  if (argv[0] !== 'add') {
    return { error: 'Unknown command. Usage: nuxt-actions add <name> [--method post] [--dir server/actions] [--schema zod|none]' }
  }
  let name
  let method = 'post'
  let dir = 'server/actions'
  let schema = 'zod'
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--method') method = (argv[++i] ?? '').toLowerCase()
    else if (a === '--dir') dir = argv[++i] ?? dir
    else if (a === '--schema') schema = (argv[++i] ?? '').toLowerCase()
    else if (!a.startsWith('--')) name = a
    else return { error: `Unknown option: ${a}` }
  }
  if (!name) return { error: 'Missing action name. Usage: nuxt-actions add <name>' }
  if (!/^[a-z0-9-]+$/.test(name)) return { error: `Invalid name "${name}". Use kebab-case (a-z, 0-9, -).` }
  if (!METHODS.includes(method)) return { error: `Invalid method "${method}". One of: ${METHODS.join(', ')}.` }
  if (schema !== 'zod' && schema !== 'none') return { error: `Invalid schema "${schema}". Use zod or none.` }
  return { name, method, dir, schema }
}

export function actionFileName(name, method) {
  return method === 'post' ? `${name}.ts` : `${name}.${method}.ts`
}

export function buildActionContents({ schema }) {
  if (schema === 'none') {
    return `export default defineAction({\n  handler: async () => {\n    return { ok: true }\n  },\n})\n`
  }
  return `import { z } from 'zod'\n\nexport default defineAction({\n  input: z.object({\n    name: z.string().min(1),\n  }),\n  handler: async ({ input }) => {\n    return { received: input.name }\n  },\n})\n`
}

export function runCli(argv, opts = {}) {
  const cwd = opts.cwd ?? process.cwd()
  const out = opts.out ?? (m => process.stdout.write(`${m}\n`))
  const err = opts.err ?? (m => process.stderr.write(`${m}\n`))
  const parsed = parseArgs(argv)
  if (parsed.error) {
    err(parsed.error)
    return 1
  }
  const fileName = actionFileName(parsed.name, parsed.method)
  const filePath = resolve(cwd, parsed.dir, fileName)
  if (existsSync(filePath)) {
    err(`Refusing to overwrite existing file: ${parsed.dir}/${fileName}`)
    return 1
  }
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, buildActionContents(parsed))
  out(`Created ${parsed.dir}/${fileName} (${parsed.method.toUpperCase()} /api/_actions/${parsed.name})`)
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(runCli(process.argv.slice(2)))
}
