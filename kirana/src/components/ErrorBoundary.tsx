import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
  /** Shown after a crash so the shopkeeper knows the data is safe. */
  context?: string
}

interface State {
  error: Error | null
}

/**
 * A crash in one screen must never blank out the whole till. React unmounts the
 * tree when a render throws, so we catch it, keep the IndexedDB data (nothing we
 * write is rolled back by a render error) and offer a reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept in the console for a technician; never sent anywhere automatically.
    console.error('Dukaan Dost screen crashed', error, info.componentStack)
  }

  private reset = () => {
    this.setState({ error: null })
  }

  private reload = () => {
    window.location.reload()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-5 py-10 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-saffron-100 text-saffron-700 dark:bg-saffron-900/40 dark:text-saffron-200">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="font-display text-xl font-extrabold text-ink-900 dark:text-ink-50">
          Screen mein dikkat aa gayi
        </h1>
        <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">
          {this.props.context ? `${this.props.context} — ` : ''}
          Aapka data safe hai, kuch bhi delete nahi hua. Screen dobara kholne ki koshish karein.
        </p>
        <p className="mt-3 w-full break-words rounded-xl bg-ink-100 p-2.5 text-left text-[11px] font-mono text-ink-600 dark:bg-ink-800 dark:text-ink-300">
          {error.message || 'Unknown error'}
        </p>
        <div className="mt-5 grid w-full gap-2">
          <button
            type="button"
            onClick={this.reset}
            className="h-12 rounded-2xl bg-brand-700 text-sm font-bold text-white shadow-lift active:scale-[0.99]"
          >
            Try again / Dobara try karein
          </button>
          <button
            type="button"
            onClick={this.reload}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-ink-200 text-sm font-bold text-ink-700 dark:border-ink-700 dark:text-ink-200"
          >
            <RotateCcw className="h-4 w-4" /> Reload app
          </button>
        </div>
      </div>
    )
  }
}
