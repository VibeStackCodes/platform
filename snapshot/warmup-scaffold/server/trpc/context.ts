export interface Context {
  userId: string | null
}

export function createContext(): Context {
  return { userId: null }
}
