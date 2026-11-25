import type { Directive } from 'vue'
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme-without-fonts'
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import '@fontsource-variable/onest/index.css'
import '@fontsource-variable/geist-mono/index.css'
import ExampleIndex from './components/ExampleIndex.vue'
import ExampleSource from './components/ExampleSource.vue'
import FlowSequence from './components/FlowSequence.vue'
import FlowSteps from './components/FlowSteps.vue'
import HomeCallToAction from './components/HomeCallToAction.vue'
import HomeFeatures from './components/HomeFeatures.vue'
import HomeHero from './components/HomeHero.vue'
import HomeStack from './components/HomeStack.vue'
import './custom.css'

let revealObserver: IntersectionObserver | undefined

function getRevealObserver(): IntersectionObserver {
  revealObserver ??= new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.add('is-revealed')
      observer.unobserve(entry.target)
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 })
  return revealObserver
}

const reveal: Directive<HTMLElement, number | undefined> = {
  mounted(el, binding) {
    if (binding.value) el.style.setProperty('--reveal-delay', `${binding.value}ms`)
    el.setAttribute('data-reveal', '')
    getRevealObserver().observe(el)
  },
  unmounted(el) {
    revealObserver?.unobserve(el)
  },
}

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.directive('reveal', reveal)
    app.component('HomeHero', HomeHero)
    app.component('HomeStack', HomeStack)
    app.component('HomeFeatures', HomeFeatures)
    app.component('HomeCallToAction', HomeCallToAction)
    app.component('FlowSteps', FlowSteps)
    app.component('FlowSequence', FlowSequence)
    app.component('ExampleSource', ExampleSource)
    app.component('ExampleIndex', ExampleIndex)
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
      document.documentElement.classList.add('motion-ok')
    }
  },
} satisfies Theme
