import { Button, Image, Text, View } from '@tarojs/components'
import Taro, { useDidHide, useReady } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'

import { Controller } from '../../game/controller'
import { GameService } from '../../game/network'
import { check, legal } from '../../game/rules'
import type { Piece, SystemInfo } from '../../game/types'
import './index.css'

interface Layout {
  top: number
  boardTop: number
  boardWidth: number
  boardHeight: number
  controlsTop: number
  metaTop: number
  historyTop: number
}

function getSystemInfo(): SystemInfo {
  return Taro.getSystemInfoSync() as unknown as SystemInfo
}

function getLayout(): Layout {
  const info = getSystemInfo()
  const top = info.safeArea?.top || info.statusBarHeight || 20
  const boardTop = top + 113
  const availableHeight = Math.max(190, info.windowHeight - boardTop - 224)
  const boardWidth = Math.min(Math.max(190 * 10 / 11, availableHeight / 1.1), Math.max(190, info.windowWidth - 28))
  const boardHeight = boardWidth * 1.1
  const controlsTop = boardTop + boardHeight + 2
  const metaTop = controlsTop + 46
  const historyTop = metaTop + 55
  return { top, boardTop, boardWidth, boardHeight, controlsTop, metaTop, historyTop }
}

function cellPoint(index: number): { x: number; y: number } {
  const column = index % 9
  const row = Math.floor(index / 9)
  return {
    x: 10 + column * 10,
    y: 9.09 + row * 9.09
  }
}

function cellPosition(index: number): { left: string; top: string } {
  const point = cellPoint(index)
  return { left: `${point.x}%`, top: `${point.y}%` }
}

function moveLinePosition(from: number, to: number): { left: string; top: string; width: string; transform: string } {
  const start = cellPoint(from)
  const end = cellPoint(to)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.sqrt(dx * dx + dy * dy)
  const angle = Math.atan2(dy, dx) * 180 / Math.PI
  return {
    left: `${start.x}%`,
    top: `${start.y}%`,
    width: `${length}%`,
    transform: `translateY(-50%) rotate(${angle}deg)`
  }
}

function pieceAsset(piece: Piece): string {
  return `/static/assets/${piece}-cjk.png`
}

export default function Index() {
  const serviceRef = useRef<GameService | null>(null)
  const gameRef = useRef<Controller | null>(null)
  const initializedRef = useRef(false)
  const [, setRenderVersion] = useState(0)
  const [layout, setLayout] = useState<Layout>(() => getLayout())
  const isBusy = gameRef.current?.busy ?? false

  const notify = () => setRenderVersion(version => version + 1)

  useReady(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    const service = new GameService()
    const game = new Controller(service, notify)
    game.mode = Taro.getStorageSync('yijing-speed') === 'deep' ? 'deep' : 'fast'
    serviceRef.current = service
    gameRef.current = game
    notify()
    service.visit().then(stats => {
      game.stats = stats
      game.notify()
    }).catch(() => {
      game.statsError = true
      game.notify()
    })
  })

  useEffect(() => {
    if (!isBusy) return undefined
    const timer = setInterval(() => setRenderVersion(version => version + 1), 100)
    return () => clearInterval(timer)
  }, [isBusy])

  useEffect(() => {
    const resize = () => setLayout(getLayout())
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB) window.addEventListener('resize', resize)
    return () => {
      if (Taro.getEnv() === Taro.ENV_TYPE.WEB) window.removeEventListener('resize', resize)
    }
  }, [])

  useDidHide(() => gameRef.current?.pause())

  useEffect(() => () => {
    gameRef.current?.cancel()
    gameRef.current = null
  }, [])

  const game = gameRef.current
  const state = game?.state
  const last = game?.records[game.records.length - 1]
  const latestAi = [...(game?.records || [])].reverse().find(record => record.ai)?.ai
  const gameRecords = game?.records || []
  const recent = game?.records.slice(-4) || []
  const selectedIndex = game?.selected ?? -1
  const selectedMoves = selectedIndex < 0 || !game
    ? []
    : legal(game.board, 'r').filter(move => move.from === selectedIndex)
  const checkedSides = game
    ? (['r', 'b'] as const).filter(side => check(game.board, side))
    : []
  const status = game?.status || '正在初始化棋盘'
  const statusText = status.length > 18 ? `${status.slice(0, 18)}…` : status

  const retry = () => {
    if (!game) return
    if (game.statsError && serviceRef.current) {
      serviceRef.current.visit().then(stats => {
        game.stats = stats
        game.statsError = false
        void game.ask()
        game.notify()
      }).catch(() => {
        game.error = '云服务未连接，请检查网络和合法域名'
        game.notify()
      })
    } else {
      void game.ask()
    }
  }

  const toggleMode = () => {
    if (!game || game.busy) return
    game.mode = game.mode === 'fast' ? 'deep' : 'fast'
    Taro.setStorageSync('yijing-speed', game.mode)
    game.notify()
  }

  const showRecord = () => {
    if (!game) return
    const all = game.records.map((record, index) => `${index + 1}. ${record.side === 'r' ? '红' : '黑'} ${record.notation}`).join('\n')
    const content = game.records.length
      ? game.records.slice(-30).map((record, index) => `${Math.max(0, game.records.length - 30) + index + 1}. ${record.notation}`).join('\n')
      : '尚未落子'
    Taro.showModal({ title: '本局棋谱', content, confirmText: '复制全部', cancelText: '关闭' }).then(result => {
      if (result.confirm && all) return Taro.setClipboardData({ data: all })
      return undefined
    })
  }

  return (
    <View className='root'>
      <View className='board-area' style={{ top: `${layout.boardTop}px`, width: `${layout.boardWidth}px`, height: `${layout.boardHeight}px` }}>
        <View className='board-hit-grid'>
          {Array.from({ length: 90 }, (_, index) => <View key={`cell-${index}`} className='board-cell' style={cellPosition(index)} onClick={() => game?.pick(index)} />)}
        </View>
        {last && <>
          <View className='board-mark last-from' style={cellPosition(last.from)} />
          <View className='board-mark last-to' style={cellPosition(last.to)} />
        </>}
        {game?.selected !== null && game && <View className='board-mark selected-mark' style={cellPosition(game.selected)} />}
        {game && selectedIndex >= 0 && selectedMoves.map(move => <View key={`line-${move.to}`} className={`legal-line ${game.board[move.to] ? 'capture-line' : ''}`} style={moveLinePosition(selectedIndex, move.to)} />)}
        {selectedMoves.map(move => <View key={`move-${move.to}`} className={`board-mark legal-mark ${game?.board[move.to] ? 'capture-mark' : ''}`} style={cellPosition(move.to)} />)}
        {checkedSides.map(side => {
          const index = game?.board.indexOf(`${side}K` as Piece) ?? -1
          return index >= 0 ? <View key={`check-${side}`} className='board-mark check-mark' style={cellPosition(index)} /> : null
        })}
        {game?.board.map((piece, index) => piece
          ? <View key={`piece-${index}`} className={`piece ${game.selected === index ? 'selected-piece' : ''}`} style={cellPosition(index)}>
            <Image className='piece-image' src={pieceAsset(piece)} mode='aspectFit' />
          </View>
          : null)}
      </View>

      <View className='hud'>
        <View className='title-row'>
          <Text className='title'>弈境</Text>
          <Text className='subtitle'>JEV / 中国象棋</Text>
        </View>
        <View className='status-card'>
          <Button className={`mode-button ${game?.busy ? 'disabled' : ''}`} disabled={Boolean(game?.busy)} onClick={toggleMode}>{game?.mode === 'deep' ? '深思' : '快速'}</Button>
          <Text className={`status-title ${game?.error ? 'error-text' : ''}`}>{statusText}</Text>
          <Text className='status-help'>
            {game?.busy
              ? `已等待 ${((Date.now() - game.started) / 1000).toFixed(1)} 秒 · 可悔棋或重开`
              : game?.error
                ? '点击下方重试；也可以悔棋或重新开局'
                : '你执红先行 · 点选棋子，再点亮起的落点'}
          </Text>
        </View>
        {last?.side === 'b' && <View className='last-move' style={{ top: `${layout.boardTop + 4}px` }}><Text>黑方刚走 · {last.notation}</Text></View>}
        <View className='controls' style={{ top: `${layout.controlsTop}px` }}>
          <Button className={`control-button ${!game?.history.length ? 'disabled' : ''}`} disabled={!game?.history.length} onClick={() => game?.undo()}>↶ 悔棋</Button>
          <Button className='control-button' onClick={() => game?.restart()}>↻ 重开</Button>
        </View>
        <View className='meta-card' style={{ top: `${layout.metaTop}px` }}>
          <Text className='meta-title'>{latestAi ? `${latestAi.source} · ${(latestAi.duration / 1000).toFixed(1)}秒` : 'Jev 与博弈搜索，共同选择下一步'}</Text>
          <Text className='meta-subtitle'>{latestAi?.search ? `推演 ${latestAi.search.depth} 层 · ${latestAi.search.shortlisted} 个候选` : '保留完整攻防校验，密钥仅存服务端'}</Text>
        </View>
        <View className='history-title' style={{ top: `${layout.historyTop}px` }}>
          <Text>最近棋谱</Text>
          <Button className='record-button' onClick={showRecord}>全部棋谱</Button>
        </View>
        {!game?.busy && state?.turn === 'b' && !state.result && <Button className='retry-button' style={{ top: `${layout.historyTop + 32}px` }} onClick={retry}>重试 AI</Button>}
        {(game?.busy || state?.turn !== 'b' || state.result) && <View className='recent-records' style={{ top: `${layout.historyTop + 27}px` }}>
          {!recent.length && <Text className='empty-history'>好棋，从第一步开始。</Text>}
          {recent.map((record, index) => <Text key={`${record.time}-${index}`} className={`record-item ${record.side === 'r' ? 'red-record' : 'black-record'}`} style={{ left: `${20 + (index % 2) * 50}%`, top: `${Math.floor(index / 2) * 19}px` }}>{`${gameRecords.length - recent.length + index + 1}. ${record.notation}`}</Text>)}
        </View>}
        <Text className='stats'>
          {game?.stats ? `访问 ${game.stats.visitors} 人 · ${game.stats.visits} 次 · ${game.stats.players} 人玩过` : game?.statsError ? '统计暂不可用' : '正在连接云端统计…'}
        </Text>
      </View>
    </View>
  )
}
