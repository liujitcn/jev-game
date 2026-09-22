import { describe, expect, it } from 'vitest'

import { Controller, type GameServiceLike } from '../src/game/controller'
import { initial, label, legal, outcome, replay } from '../src/game/rules'
import type { AiResponse, RequestHandle } from '../src/game/types'

function setup() {
  let resolve: ((value: AiResponse) => void) | null = null
  let aborted = false
  const requests: Array<{ history: Array<{ from: number; to: number }>; mode: 'fast' | 'deep' }> = []
  const service: GameServiceLike = {
    move: (history, mode) => {
      requests.push({ history, mode })
      return {
        promise: new Promise<AiResponse>(nextResolve => { resolve = nextResolve }),
        abort: () => { aborted = true }
      } as RequestHandle<AiResponse>
    }
  }
  const game = new Controller(service, () => undefined)
  return {
    game,
    complete: (data: AiResponse) => resolve?.(data),
    requests,
    wasAborted: () => aborted
  }
}

describe('弈境共享棋规与对局控制器', () => {
  it('支持人类落子、AI 应手和完整回合悔棋', async () => {
    const { game, complete, requests } = setup()
    game.pick(54)
    expect(requests).toHaveLength(0)
    game.pick(45)
    expect(requests).toEqual([{ history: [{ from: 54, to: 45 }], mode: 'fast' }])
    expect(game.state.turn).toBe('b')
    complete({ source: 'test', duration: 1, move: { from: 27, to: 36 } })
    await Promise.resolve()
    expect(game.records).toHaveLength(2)
    expect(game.state.turn).toBe('r')
    game.undo()
    expect(game.board).toEqual(initial())
    expect(game.history).toHaveLength(0)
  })

  it('重开会取消在途请求，迟到的 AI 结果不会污染新局', async () => {
    const { game, complete, wasAborted } = setup()
    game.pick(54)
    game.pick(45)
    game.restart()
    expect(wasAborted()).toBe(true)
    complete({ source: 'late', duration: 1, move: { from: 27, to: 36 } })
    await Promise.resolve()
    expect(game.history).toHaveLength(0)
    expect(game.busy).toBe(false)
  })

  it('拒绝不合法的模型走法', async () => {
    const { game, complete } = setup()
    game.pick(54)
    game.pick(45)
    complete({ source: 'test', duration: 1, move: { from: 4, to: 85 } })
    await Promise.resolve()
    expect(game.history).toHaveLength(1)
    expect(game.error).toMatch(/校验失败/)
  })

  it('保留象棋初始局面的合法走法和中文棋谱', () => {
    const board = initial()
    expect(legal(board, 'r')).toHaveLength(44)
    expect(() => replay([{ from: 54, to: 36 }])).toThrow('棋谱包含非法步骤')
    expect(label(board, { from: 54, to: 45 })).toBe('兵九进一')
  })

  it('提示无棋可走的死局', () => {
    const board = Array(90).fill(null)
    board[4] = 'bK'
    board[11] = 'rR'
    board[49] = 'rP'
    board[71] = 'rH'
    board[77] = 'rR'
    board[84] = 'rK'
    board[86] = 'rA'
    board[87] = 'rE'

    expect(legal(board, 'b')).toHaveLength(0)
    expect(outcome(board, 'b')).toBe('红方胜 · 死局')
  })
})
