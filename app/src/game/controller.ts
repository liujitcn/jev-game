import { apply, check, initial, key, label, legal, replay, side } from './rules'
import type { AiResponse, GameState, GameStats, Move, MoveRecord, ProgressEvent, RequestHandle, Side } from './types'

export interface GameServiceLike {
  play: () => Promise<GameStats | null>
  move: (history: Move[], mode: 'fast' | 'deep', progress: (event: ProgressEvent) => void) => RequestHandle<AiResponse>
}

export class Controller {
  service: GameServiceLike
  changed: () => void
  history: Move[] = []
  records: MoveRecord[] = []
  board = initial()
  selected: number | null = null
  busy = false
  revision = 0
  pending: RequestHandle<AiResponse> | null = null
  mode: 'fast' | 'deep' = 'fast'
  phase = ''
  error = ''
  stats: GameStats | null = null
  statsError = false
  started = 0

  constructor(service: GameServiceLike, changed: () => void) {
    this.service = service
    this.changed = changed
  }

  notify(): void {
    this.changed()
  }

  get state(): GameState {
    return replay(this.history)
  }

  get status(): string {
    if (this.busy) {
      return {
        queued: '正在连接云端',
        search: '正在推演攻防',
        jev: 'Jev 正在选招',
        deepseek: 'DeepSeek 复核中',
        ready: '即将落子'
      }[this.phase] || 'AI 正在思考'
    }
    if (this.error) return this.error
    const state = this.state
    return state.result || (state.turn === 'r'
      ? (check(this.board, 'r') ? '你被将军，请应将' : '轮到你落子')
      : '等待 AI，应手可重试')
  }

  pick(index: number): void {
    if (this.busy || this.state.turn !== 'r' || this.state.result) return
    if (side(this.board[index]) === 'r') {
      this.selected = this.selected === index ? null : index
      this.notify()
      return
    }
    const move = legal(this.board, 'r').find(item => item.from === this.selected && item.to === index)
    if (!move) {
      this.selected = null
      this.notify()
      return
    }
    this.commit(move)
    this.service.play().then(stats => {
      if (stats) {
        this.stats = stats
        this.notify()
      }
    }).catch(() => {
      this.statsError = true
      this.notify()
    })
    void this.ask()
  }

  commit(move: Move, ai: AiResponse | null = null): void {
    this.records.push({
      ...move,
      side: side(this.board[move.from]) as Side,
      notation: label(this.board, move),
      ai,
      time: Date.now()
    })
    this.history.push(move)
    this.board = apply(this.board, move)
    this.selected = null
    this.error = ''
    this.notify()
  }

  async ask(): Promise<void> {
    if (this.busy || this.state.turn !== 'b' || this.state.result) return
    const revision = ++this.revision
    this.busy = true
    this.started = Date.now()
    this.phase = 'queued'
    this.error = ''
    this.notify()
    const request = this.service.move(this.history.slice(), this.mode, event => {
      if (this.revision === revision) {
        this.phase = event.phase
        this.notify()
      }
    })
    this.pending = request
    try {
      const data = await request.promise
      if (revision !== this.revision) return
      if (!legal(this.board, 'b').some(move => key(move) === key(data.move))) throw new Error('AI 招法校验失败')
      this.busy = false
      this.pending = null
      this.commit(data.move, data)
    } catch (error) {
      if (revision !== this.revision) return
      this.busy = false
      this.pending = null
      this.error = error instanceof Error ? error.message : 'AI 请求失败'
      this.notify()
    }
  }

  cancel(): void {
    this.revision += 1
    this.pending?.abort()
    this.pending = null
    this.busy = false
  }

  undo(): void {
    if (!this.history.length) return
    this.cancel()
    const count = this.history.length % 2 ? 1 : 2
    this.history = this.history.slice(0, -count)
    this.records = this.records.slice(0, -count)
    this.board = replay(this.history).board
    this.selected = null
    this.error = ''
    this.notify()
  }

  restart(): void {
    this.cancel()
    this.history = []
    this.records = []
    this.board = initial()
    this.selected = null
    this.error = ''
    this.statsError = false
    this.notify()
  }

  pause(): void {
    if (this.busy) {
      this.cancel()
      this.error = '对局已暂停，点击重试'
      this.notify()
    }
  }
}
