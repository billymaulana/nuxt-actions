import type { Nuxt } from '@nuxt/schema'

interface DevtoolsCustomTab {
  name: string
  title: string
  icon?: string
  view: {
    type: 'launch'
    description?: string
    actions?: { label: string, handle: () => void }[]
  }
}

interface ActionInfo {
  name: string
  path: string
  method: string
}

export function setupDevtools(nuxt: Nuxt, actions: ActionInfo[]) {
  /* `devtools:customTabs` is provided by @nuxt/devtools at runtime but is not part of the base NuxtHooks types. */
  const registerCustomTab = nuxt.hook as unknown as (
    name: 'devtools:customTabs',
    cb: (tabs: DevtoolsCustomTab[]) => void,
  ) => void

  registerCustomTab('devtools:customTabs', (tabs) => {
    const summary = actions.length === 0
      ? 'No action files found in server/actions/'
      : actions
          .map(a => `${a.method.padEnd(6)} ${a.name} → /api/_actions/${a.path}`)
          .join('\n')

    const description = actions.length > 0
      ? `${actions.length} typed action${actions.length !== 1 ? 's' : ''} registered:\n\n${summary}`
      : summary

    tabs.push({
      name: 'actions',
      title: 'Actions',
      icon: 'carbon:flash',
      view: {
        type: 'launch',
        description,
        actions: [],
      },
    })
  })
}
