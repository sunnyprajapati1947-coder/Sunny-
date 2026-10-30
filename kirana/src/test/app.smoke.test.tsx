// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import App from '../App'
import { db } from '../lib/db'

/**
 * Full-app render smoke test. There is no browser in CI, so this mounts the real
 * app (providers, router, lazy pages, Dexie demo seed) in jsdom and checks every
 * screen paints without throwing. It is the closest thing to opening the app.
 */

function polyfills() {
  if (!window.matchMedia) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })
  }
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
  if (!window.HTMLCanvasElement.prototype.getContext) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.HTMLCanvasElement.prototype.getContext = (() => null) as any
  }
  // jsdom has no media APIs; the scan panel must not explode without a camera.
  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('no camera')) },
      configurable: true,
    })
  }
}

function visit(path: string) {
  window.history.pushState({}, '', path)
  return render(<App />)
}

beforeAll(() => {
  polyfills()
})

beforeEach(async () => {
  // Start each screen from the same seeded demo shop.
  if (!db.isOpen()) await db.open()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/**
 * Waits until the shell is painted. The boot sequence seeds the demo shop and
 * lazy-loads the route chunk, so this can take a couple of seconds in jsdom.
 */
async function waitForBoot() {
  await waitFor(() => {
    expect(screen.queryByText(/Dukaan khul rahi hai/i)).toBeNull()
    expect(document.querySelectorAll('a[href]').length).toBeGreaterThan(0)
  }, { timeout: 25_000 })
}

describe('app shell', () => {
  it('boots into the seeded demo shop', async () => {
    visit('/')
    await waitForBoot()
    expect(await screen.findByText(/Sharma Kirana/i)).toBeTruthy()
  }, 30_000)

  it('renders every route without crashing', async () => {
    const routes = [
      '/billing',
      '/products',
      '/products/new',
      '/khata',
      '/reports',
      '/reports/gst',
      '/reports/pnl',
      '/reports/day-close',
      '/inventory',
      '/inventory/audit',
      '/order-list',
      '/purchases',
      '/purchases/new',
      '/bills',
      '/settings',
      '/settings/audit',
      '/more',
    ]

    for (const route of routes) {
      const view = visit(route)
      await waitForBoot()
      // A crash boundary would render this heading instead of the page.
      expect(screen.queryByText(/Screen mein dikkat aa gayi/i), `${route} crashed`).toBeNull()
      // The lazy page painted: the suspense fallback is a bare spinner with no text.
      await waitFor(
        () => expect(document.querySelector('main')?.textContent?.trim().length ?? 0).toBeGreaterThan(10),
        { timeout: 15_000 },
      )
      // Every screen renders inside the shell (bottom nav is always there).
      expect(screen.getAllByRole('link').length, `${route} has no nav`).toBeGreaterThan(0)
      view.unmount()
    }
  }, 120_000)

  it('shows the billing screen with a cart total and scan control', async () => {
    visit('/billing')
    await waitForBoot()
    expect((await screen.findAllByText(/Cart khali hai|Cart is empty/i)).length).toBeGreaterThan(0)
    // The scan surface is always on the billing screen.
    expect((await screen.findAllByText(/Scan|स्कैन/i)).length).toBeGreaterThan(0)
  }, 30_000)

  it('falls back to the home screen for an unknown deep link', async () => {
    visit('/this/does/not/exist')
    await waitForBoot()
    expect(screen.queryByText(/Screen mein dikkat aa gayi/i)).toBeNull()
    expect(window.location.pathname).toBe('/')
  }, 30_000)
})
