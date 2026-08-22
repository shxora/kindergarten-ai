import type { NextRequest } from 'next/server'
import { Readable } from 'node:stream'
import { client, getInfo } from '@/app/api/utils/common'

const MAX_CAPACITY_RETRIES = 3
const getErrorText = (error: any) => {
  const data = error?.response?.data
  if (typeof data === 'string') return `${error?.message || ''} ${data}`
  try { return `${error?.message || ''} ${JSON.stringify(data || '')}` }
  catch { return error?.message || '' }
}
const isCapacityError = (error: any) => /selected model is at capacity|model.*capacity|at capacity/i.test(getErrorText(error))
const isAbortError = (error: any) => /body.*stream.*aborted|aborted|abort|canceled|cancelled/i.test(getErrorText(error))
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function POST(request: NextRequest) {
  let body: any
  try {
    body = await request.json()
  }
  catch (error: any) {
    // 客户端在请求体尚未读完时点击暂停，读取请求体也可能被取消。
    if (isAbortError(error) || /unexpected end|request aborted/i.test(String(error?.message || error))) {
      return new Response(null, { status: 499 })
    }
    return Response.json({ message: '请求内容无效' }, { status: 400 })
  }
  const {
    inputs,
    query,
    files,
    conversation_id: conversationId,
    response_mode: responseMode,
  } = body
  const { user } = getInfo(request)
  let lastError: any
  for (let attempt = 0; attempt < MAX_CAPACITY_RETRIES; attempt++) {
    try {
      const res = await client.createChatMessage(inputs, query, user, responseMode, conversationId, files)
      // dify-client uses Axios in Node, so `res.data` is a Node Readable.
      // Next's Response needs a Web ReadableStream; without this conversion
      // the request returns 200 but the browser receives an empty body.
      const upstreamStream = res.data as Readable
      // 当浏览器点击暂停时，Next 会取消下游响应，Axios 上游可能抛出
      // BodyStreamBuffer was aborted。把这类中止视为正常结束，避免服务端报错。
      let settled = false
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          upstreamStream.on('data', (chunk: Buffer | string) => {
            if (!settled) controller.enqueue(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
          })
          upstreamStream.on('end', () => {
            if (!settled) { settled = true; controller.close() }
          })
          upstreamStream.on('error', (error: any) => {
            if (settled) return
            settled = true
            if (isAbortError(error)) controller.close()
            else controller.error(error)
          })
        },
        cancel() {
          settled = true
          upstreamStream.destroy()
        },
      })
      return new Response(stream as unknown as BodyInit, {
        headers: {
          'Content-Type': res.headers?.['content-type'] || 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      })
    }
    catch (error: any) {
      lastError = error
      if (!isCapacityError(error) || attempt === MAX_CAPACITY_RETRIES - 1) break
      await wait(800 * (attempt + 1))
    }
  }
  const message = isCapacityError(lastError)
    ? '当前模型繁忙，已自动重试 3 次，请稍后再试或切换模型。'
    : lastError?.response?.data?.message || lastError?.message || '请求失败，请检查 Dify 配置。'
  return Response.json({ message, error: getErrorText(lastError) }, { status: 503 })
}
