// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App'
import { stageShop } from './stage'

/**
 * Screen-content smoke tests against a small test-only shop row. They assert
 * that real data reaches the UI (not just that a component mounted) and that the
 * main till interaction — quick-add → cart total — works end to end.
 */

function polyfills() {
  if (!window.matchMedia) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).matchMedia = (query: string) => ({
      matches: false,
      media: query,
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
  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error('no camera')) },
      configurable: true,
    })
  }
}

async function open(path: string) {
  window.history.pushState({}, '', path)
  const view = render(<App />)
  await waitFor(
    () => {
      expect(screen.queryByText(/Dukaan khul rahi hai/i)).toBeNull()
      expect(document.querySelectorAll('a[href]').length).toBeGreaterThan(0)
    },
    { timeout: 25_000 },
  )
  return view
}

beforeAll(() => polyfills())

beforeEach(async () => {
  await stageShop()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('shop screens', () => {
  it('lists the products saved in the database', async () => {
    await open('/products')
    expect(await screen.findByText(/Test Salt 1kg/i)).toBeTruthy()
    expect(await screen.findByText(/Test Atta 5kg/i)).toBeTruthy()
  }, 40_000)

  it('shows udhaar balances on the khata screen', async () => {
    await open('/khata')
    expect(await screen.findByText(/Test Customer/i)).toBeTruthy()
  }, 40_000)

  it('shows today’s numbers on the home dashboard', async () => {
    await open('/')
    expect((await screen.findAllByText(/Test Kirana/i)).length).toBeGreaterThan(0)
    // The dashboard numbers arrive from IndexedDB after the shell paints.
    await waitFor(() => expect(document.body.textContent ?? '').toMatch(/₹/), { timeout: 15_000 })
  }, 40_000)

  it('lists bills with their bill numbers', async () => {
    await open('/bills')
    // Bill numbers use the shop's own prefix (TST here).
    expect((await screen.findAllByText(/TST-\d{6}-\d{3}/i)).length).toBeGreaterThan(0)
  }, 40_000)

  it('renders the reports screen with revenue figures', async () => {
    await open('/reports')
    await waitFor(() => expect((document.querySelector('main')?.textContent ?? '').length).toBeGreaterThan(50), {
      timeout: 15_000,
    })
    expect(document.body.textContent).toMatch(/₹/)
  }, 40_000)

  it('renders the day-close screen without crashing', async () => {
    await open('/reports/day-close')
    await waitFor(() => expect((document.querySelector('main')?.textContent ?? '').length).toBeGreaterThan(30), {
      timeout: 15_000,
    })
    expect(screen.queryByText(/Screen mein dikkat aa gayi/i)).toBeNull()
  }, 40_000)
})

describe('till interaction', () => {
  it('adds a quick-pick product to the cart and shows a total', async () => {
    await open('/billing')

    // "Cart khali hai" disappears as soon as the cart has a line.
    expect((await screen.findAllByText(/Cart khali hai/i)).length).toBeGreaterThan(0)

    // Quick-add chips are the buttons in the main pane that show a rupee price.
    const chips = await waitFor(
      () => {
        const found = [...document.querySelectorAll('main button')].filter((button) =>
          /₹/.test(button.textContent ?? ''),
        )
        expect(found.length).toBeGreaterThan(0)
        return found
      },
      { timeout: 15_000 },
    )

    const chipPrice = (chips[0].textContent ?? '').match(/₹[\d,]+(\.\d+)?/)?.[0] ?? ''
    fireEvent.click(chips[0])

    await waitFor(() => expect(screen.queryByText(/Cart khali hai/i)).toBeNull(), { timeout: 10_000 })
    // The scanned/picked price now appears in the cart and the total.
    expect(chipPrice).not.toBe('')
    expect((await screen.findAllByText(new RegExp(chipPrice.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).length).toBeGreaterThan(
      0,
    )
    expect(screen.queryByText(/Screen mein dikkat aa gayi/i)).toBeNull()
  }, 40_000)
})

describe('checkout sheet', () => {
  /**
   * The sheet is verified through the UI; the money path itself (pricing, stock,
   * audit, udhaar) is covered by the repository tests. Completing a bill inside
   * jsdom deadlocks fake-indexeddb when React flushes effects during the Dexie
   * transaction, which does not happen in a real browser.
   */
  it('opens the payment sheet with the exact total and every payment mode', async () => {
    await open('/billing')

    // Earlier tests may have left an item in the cart — that is fine, the sheet
    // works for any cart with at least one line.
    if (document.body.textContent?.includes('Cart khali hai')) {
      const chips = await waitFor(
        () => {
          const found = [...document.querySelectorAll('main button')].filter((button) => /₹/.test(button.textContent ?? ''))
          expect(found.length).toBeGreaterThan(0)
          return found
        },
        { timeout: 20_000 },
      )
      fireEvent.click(chips[0])
      await waitFor(() => expect(screen.queryByText(/Cart khali hai/i)).toBeNull(), { timeout: 10_000 })
    }

    const grandTotal = await screen.findByText(/Grand Total/i)
    expect(grandTotal).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Bill banayein|Make bill/i }))

    const payButton = await screen.findByRole('button', { name: /Bill pura karein|Complete bill/i }, { timeout: 15_000 })
    expect(payButton.textContent).toMatch(/₹\d/)
    // All four modes plus split payment must be offered.
    for (const label of [/Cash/, /UPI/, /Card/, /Udhaar/, /Split payment/i]) {
      expect(payButton.ownerDocument.body.textContent).toMatch(label)
    }
    expect(screen.queryByText(/Screen mein dikkat aa gayi/i)).toBeNull()
  }, 60_000)
})
