export type Side = 'r' | 'b'

export type PieceType = 'K' | 'A' | 'E' | 'H' | 'R' | 'C' | 'P'

export type Piece = `${Side}${PieceType}`

export type Board = Array<Piece | null>

export interface Move {
  from: number
  to: number
}

export interface MoveRecord extends Move {
  side: Side
  notation: string
  ai: AiResponse | null
  time: number
}

export interface AiSearchInfo {
  depth: number
  shortlisted: number
}

export interface AiResponse {
  source: string
  duration: number
  search?: AiSearchInfo
  move: Move
}

export interface GameStats {
  visitors: number
  visits: number
  players: number
}

export interface GameState {
  board: Board
  turn: Side
  result: string | null
}

export interface ProgressEvent {
  type: 'progress'
  phase: string
  text?: string
}

export interface ApiResult<T> {
  type?: 'result'
  data: T
  error?: string
}

export interface RequestHandle<T> {
  promise: Promise<T>
  abort: () => void
}

export interface SystemInfo {
  windowWidth: number
  windowHeight: number
  pixelRatio: number
  statusBarHeight?: number
  safeArea?: {
    top: number
  }
}

export interface BoardHit {
  index: number
}
