import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { resetFeedback } from '../state/feedback'

// jsdom não implementa matchMedia; o app usa para tema e layout.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia
}

afterEach(() => {
  cleanup()
  resetFeedback()
  window.localStorage.clear()
})
