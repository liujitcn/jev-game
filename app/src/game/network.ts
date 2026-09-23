import Taro from '@tarojs/taro'

import { API_ORIGIN } from './config'
import type { AiResponse, ProgressEvent, RequestHandle } from './types'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' ? value as JsonRecord : null
}

export function decodeUTF8(bytes: number[]): string {
  return decodeURIComponent(bytes.map(byte => `%${byte.toString(16).padStart(2, '0')}`).join(''))
}

export class LineStream {
  bytes: number[] = []
  consume: (value: unknown) => void

  constructor(consume: (value: unknown) => void) {
    this.consume = consume
  }

  write(chunk: ArrayBuffer | Uint8Array): void {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)
    for (const byte of bytes) {
      if (byte === 10) {
        if (this.bytes.length) this.consume(JSON.parse(decodeUTF8(this.bytes)) as unknown)
        this.bytes = []
      } else {
        this.bytes.push(byte)
      }
    }
    if (this.bytes.length > 262144) throw new Error('响应过大')
  }

  end(): void {
    if (this.bytes.length) {
      this.consume(JSON.parse(decodeUTF8(this.bytes)) as unknown)
      this.bytes = []
    }
  }
}

export class GameService {
  request<T>(path: string, body?: JsonRecord, onProgress?: (event: ProgressEvent) => void): RequestHandle<T> {
    let cancelled = false
    let abortController: AbortController | null = null
    let requestTask: Taro.RequestTask<unknown> | null = null

    const promise = Taro.getEnv() === Taro.ENV_TYPE.WEB
      ? this.requestH5<T>(path, body, onProgress, () => cancelled, controller => { abortController = controller })
      : new Promise<T>((resolve, reject) => {
        let result: T | null = null
        let streamError: Error | null = null
        let chunked = false
        const parser = new LineStream(value => {
          const record = asRecord(value)
          if (!record) return
          if (record.type === 'progress' && typeof record.phase === 'string') {
            onProgress?.({ type: 'progress', phase: record.phase, text: typeof record.text === 'string' ? record.text : undefined })
          }
          if (record.type === 'result') result = record.data as T
          if (record.type !== 'result' && typeof record.error === 'string') streamError = new Error(record.error)
        })
        requestTask = Taro.request({
          url: API_ORIGIN + path,
          method: body ? 'POST' : 'GET',
          data: body,
          timeout: 20000,
          header: {
            'Content-Type': 'application/json',
            Origin: API_ORIGIN,
            Accept: onProgress ? 'application/x-ndjson' : 'application/json'
          },
          enableChunked: Boolean(onProgress),
          responseType: onProgress ? 'arraybuffer' : 'text',
          success: response => {
            try {
              if (cancelled) return reject(new Error('已取消'))
              if (onProgress) {
                if (!chunked && response.data) parser.write(response.data as ArrayBuffer)
                parser.end()
                if (streamError) throw streamError
                if (response.statusCode >= 400 || !result) throw new Error('AI 请求未完成，请重试')
                resolve(result)
              } else {
                const data = typeof response.data === 'string' ? JSON.parse(response.data) as unknown : response.data
                const record = asRecord(data)
                if (response.statusCode >= 400) throw new Error(typeof record?.error === 'string' ? record.error : '请求失败')
                resolve(data as T)
              }
            } catch (error) {
              reject(error instanceof Error ? error : new Error('请求失败'))
            }
          },
          fail: error => reject(streamError || new Error(cancelled ? '已取消' : `网络请求失败：${error.errMsg || '请检查合法域名和网络'}`))
        })
        if (onProgress && requestTask.onChunkReceived) {
          requestTask.onChunkReceived(({ data }) => {
            try {
              chunked = true
              parser.write(data)
            } catch (error) {
              streamError = error instanceof Error ? error : new Error('响应解析失败')
              requestTask?.abort()
            }
          })
        }
      })

    return {
      promise,
      abort: () => {
        cancelled = true
        abortController?.abort()
        requestTask?.abort()
      }
    }
  }

  private async requestH5<T>(
    path: string,
    body: JsonRecord | undefined,
    onProgress: ((event: ProgressEvent) => void) | undefined,
    isCancelled: () => boolean,
    setController: (controller: AbortController) => void
  ): Promise<T> {
    const controller = new AbortController()
    setController(controller)
    const response = await fetch(API_ORIGIN + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: onProgress ? 'application/x-ndjson' : 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
      signal: controller.signal
    })
    if (isCancelled()) throw new Error('已取消')
    if (!response.ok) {
      const data = asRecord(await response.json().catch(() => null))
      throw new Error(typeof data?.error === 'string' ? data.error : '请求失败')
    }
    if (!onProgress) return await response.json() as T
    const reader = response.body?.getReader()
    if (!reader) throw new Error('浏览器不支持流式响应')
    const parser = new LineStream(value => {
      const record = asRecord(value)
      if (!record) return
      if (record.type === 'progress' && typeof record.phase === 'string') {
        onProgress({ type: 'progress', phase: record.phase, text: typeof record.text === 'string' ? record.text : undefined })
      }
      if (record.type === 'result') result = record.data as T
      if (record.type !== 'result' && typeof record.error === 'string') streamError = new Error(record.error)
    })
    let result: T | null = null
    let streamError: Error | null = null
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      if (isCancelled()) throw new Error('已取消')
      parser.write(chunk.value)
    }
    parser.end()
    if (streamError) throw streamError
    if (!result) throw new Error('AI 请求未完成，请重试')
    return result
  }

  move(history: unknown[], mode: 'fast' | 'deep', progress: (event: ProgressEvent) => void): RequestHandle<AiResponse> {
    let request: RequestHandle<AiResponse> | null = null
    let cancelled = false
    const promise = (async () => {
      if (cancelled) throw new Error('已取消')
      request = this.request<AiResponse>('/api/game/move', { history, mode }, progress)
      return await request.promise
    })()
    return {
      promise,
      abort: () => {
        cancelled = true
        request?.abort()
      }
    }
  }
}
