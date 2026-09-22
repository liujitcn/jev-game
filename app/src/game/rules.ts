import type { Board, GameState, Move, Piece, PieceType, Side } from './types'

export const names: Record<Side, Record<PieceType, string>> = {
  r: { K: '帅', A: '仕', E: '相', H: '马', R: '车', C: '炮', P: '兵' },
  b: { K: '将', A: '士', E: '象', H: '馬', R: '車', C: '砲', P: '卒' }
}

export function side(piece: Piece | null | undefined): Side | undefined {
  return piece?.[0] as Side | undefined
}

export function opposite(current: Side): Side {
  return current === 'r' ? 'b' : 'r'
}

export function initial(): Board {
  const board: Board = Array(90).fill(null)
  const row: PieceType[] = ['R', 'H', 'E', 'A', 'K', 'A', 'E', 'H', 'R']
  row.forEach((piece, x) => {
    board[x] = `b${piece}` as Piece
    board[81 + x] = `r${piece}` as Piece
  })
  for (const x of [1, 7]) {
    board[18 + x] = 'bC'
    board[63 + x] = 'rC'
  }
  for (const x of [0, 2, 4, 6, 8]) {
    board[27 + x] = 'bP'
    board[54 + x] = 'rP'
  }
  return board
}

export function apply(board: Board, move: Move): Board {
  const next = board.slice()
  next[move.to] = next[move.from]
  next[move.from] = null
  return next
}

export function pseudo(board: Board, from: number, to: number): boolean {
  if (from === to || !board[from] || side(board[from]) === side(board[to])) return false
  const currentSide = side(board[from]) as Side
  const piece = board[from]?.[1] as PieceType
  const x = from % 9
  const y = Math.floor(from / 9)
  const u = to % 9
  const v = Math.floor(to / 9)
  const dx = u - x
  const dy = v - y
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  const palace = u >= 3 && u <= 5 && (currentSide === 'r' ? v >= 7 : v <= 2)
  let count = 0

  if (dx === 0 || dy === 0) {
    const step = dx === 0 ? Math.sign(dy) * 9 : Math.sign(dx)
    for (let index = from + step; index !== to; index += step) {
      if (board[index]) count += 1
    }
  }

  switch (piece) {
    case 'R':
      return (dx === 0 || dy === 0) && count === 0
    case 'C':
      return (dx === 0 || dy === 0) && count === (board[to] ? 1 : 0)
    case 'H':
      return ax === 2 && ay === 1
        ? !board[from + Math.sign(dx)]
        : ax === 1 && ay === 2
          ? !board[from + Math.sign(dy) * 9]
          : false
    case 'E':
      return ax === 2 && ay === 2
        && (currentSide === 'r' ? v >= 5 : v <= 4)
        && !board[from + (dy / 2) * 9 + dx / 2]
    case 'A':
      return ax === 1 && ay === 1 && palace
    case 'K':
      return (board[to]?.[1] === 'K' && dx === 0 && count === 0) || (ax + ay === 1 && palace)
    case 'P':
      return (dx === 0 && dy === (currentSide === 'r' ? -1 : 1))
        || (ay === 0 && ax === 1 && (currentSide === 'r' ? y <= 4 : y >= 5))
    default:
      return false
  }
}

export function check(board: Board, currentSide: Side): boolean {
  const king = board.indexOf(`${currentSide}K` as Piece)
  return king < 0 || board.some((piece, index) => piece && side(piece) !== currentSide && pseudo(board, index, king))
}

export function legal(board: Board, currentSide: Side): Move[] {
  const moves: Move[] = []
  board.forEach((piece, from) => {
    if (side(piece) !== currentSide) return
    for (let to = 0; to < 90; to += 1) {
      const move = { from, to }
      if (pseudo(board, from, to) && !check(apply(board, move), currentSide)) moves.push(move)
    }
  })
  return moves
}

// outcome 判断当前回合的终局结果。
export function outcome(board: Board, currentSide: Side): string | null {
  const moves = legal(board, currentSide)
  if (moves.length) return null
  const winner = currentSide === 'r' ? '黑方胜' : '红方胜'
  return `${winner} · ${check(board, currentSide) ? '将死' : '死局'}`
}

export function key(move: Move): string {
  return `${move.from}-${move.to}`
}

export function label(board: Board, move: Move): string {
  const piece = board[move.from] as Piece
  const currentSide = side(piece) as Side
  const x = move.from % 9
  const y = Math.floor(move.from / 9)
  const u = move.to % 9
  const v = Math.floor(move.to / 9)
  const digit = (value: number) => currentSide === 'r' ? '一二三四五六七八九'[8 - value] : String(value + 1)
  const movement = y === v ? '平' : (currentSide === 'r' ? v < y : v > y) ? '进' : '退'
  const end = y === v || ['H', 'A', 'E'].includes(piece[1])
    ? digit(u)
    : currentSide === 'r' ? '一二三四五六七八九'[Math.abs(v - y) - 1] : String(Math.abs(v - y))
  return names[currentSide][piece[1]] + digit(x) + movement + end
}

export function replay(history: Move[]): GameState {
  let board = initial()
  let turn: Side = 'r'
  let quiet = 0
  const seen = new Map([[JSON.stringify(board) + turn, 1]])
  let result: string | null = null

  for (const move of history) {
    if (result || !Number.isInteger(move?.from) || !Number.isInteger(move?.to) || !legal(board, turn).some(item => key(item) === key(move))) {
      throw new Error('棋谱包含非法步骤')
    }
    quiet = board[move.to] ? 0 : quiet + 1
    board = apply(board, move)
    turn = opposite(turn)
    const positionKey = JSON.stringify(board) + turn
    seen.set(positionKey, (seen.get(positionKey) || 0) + 1)
    const terminal = outcome(board, turn)
    if (terminal) result = terminal
    else if (seen.get(positionKey)! >= 3) result = '三次重复局面 · 和棋'
    else if (quiet >= 120) result = '连续 120 步未吃子 · 和棋'
  }

  return { board, turn, result }
}

const values: Record<PieceType, number> = { K: 100000, R: 900, C: 450, H: 400, E: 200, A: 200, P: 100 }

function material(board: Board): number {
  return board.reduce((sum, piece, index) => {
    if (!piece) return sum
    const y = Math.floor(index / 9)
    const progress = piece[0] === 'b' ? y : 9 - y
    return sum + (piece[0] === 'b' ? 1 : -1) * (values[piece[1]] + (piece[1] === 'P' ? progress * 12 : 0))
  }, 0)
}

export function candidates(board: Board): Array<Move & { id: string; notation: string; capture: string | null; check: boolean; score: number }> {
  return legal(board, 'b').map(move => {
    const next = apply(board, move)
    const replies = legal(next, 'r')
    const score = replies.length ? Math.min(...replies.map(reply => material(apply(next, reply)))) : 999999
    return {
      ...move,
      id: key(move),
      notation: label(board, move),
      capture: board[move.to] ? names.r[board[move.to]![1]] : null,
      check: check(next, 'r'),
      score
    }
  }).sort((a, b) => b.score - a.score)
}
