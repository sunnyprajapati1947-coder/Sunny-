import { useLiveQuery } from 'dexie-react-hooks'

/**
 * Typed wrapper around Dexie's `useLiveQuery`.
 *
 * Dexie infers the generic from the default value, which narrows `[]` to
 * `never[]`. Every call site passes the array type explicitly instead.
 */
export function useLive<T>(querier: () => Promise<T> | T, deps: unknown[], fallback: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const value = useLiveQuery<T>(querier, deps as any[])
  return (value ?? fallback) as T
}
