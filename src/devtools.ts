import type { Nuxt } from '@nuxt/schema'

interface DevtoolsLaunchAction {
  label: string
  src?: string
  handle?: () => void | Promise<void>
}

interface DevtoolsCustomTab {
  name: string
  title: string
  icon?: string
  view: {
    type: 'launch'
    description?: string
    actions?: DevtoolsLaunchAction[]
  }
}

interface ActionInfo {
  name: string
  path: string
  method: string
}

const DOCS_URL = 'https://billymaulana.github.io/nuxt-actions/'

export function buildActionsDescription(actions: ActionInfo[]): string {
  if (actions.length === 0) {
    return 'No action files found in server/actions/'
  }
  const blocks = actions.map((a) => {
    const endpoint = `/api/_actions/${a.path}`
    const curl = a.method === 'GET'
      ? `curl '${endpoint}'`
      : `curl -X ${a.method} ${endpoint} -H 'Content-Type: application/json' -d '{}'`
    return `${a.method.padEnd(6)} ${a.name}\n  ${endpoint}\n  ${curl}`
  })
  const count = actions.length
  return `${count} typed action${count !== 1 ? 's' : ''} registered:\n\n${blocks.join('\n\n')}`
}

export function setupDevtools(nuxt: Nuxt, actions: ActionInfo[]) {
  /* `devtools:customTabs` is provided by @nuxt/devtools at runtime but is not part of the base NuxtHooks types. */
  const registerCustomTab = nuxt.hook as unknown as (
    name: 'devtools:customTabs',
    cb: (tabs: DevtoolsCustomTab[]) => void,
  ) => void

  registerCustomTab('devtools:customTabs', (tabs) => {
    tabs.push({
      name: 'actions',
      title: 'Actions',
      icon: 'carbon:flash',
      view: {
        type: 'launch',
        description: buildActionsDescription(actions),
        actions: [{ label: 'Open docs', src: DOCS_URL }],
      },
    })
  })
}
