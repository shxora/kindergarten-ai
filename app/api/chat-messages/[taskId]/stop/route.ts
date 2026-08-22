import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { client, getInfo } from '@/app/api/utils/common'

// 转发到 Dify 的 chat-messages/{task_id}/stop：
// 告诉 Dify 终止当前任务，Dify 会保留已经生成的内容，
// 并通过 SSE 推一个 message_end 事件作为收尾。
export async function POST(request: NextRequest, { params }: {
  params: Promise<{ taskId: string }>
}) {
  const { taskId } = await params
  const { user } = getInfo(request)
  try {
    const res = await client.sendRequest(
      'POST',
      `/chat-messages/${taskId}/stop`,
      { user },
    )
    return NextResponse.json(res?.data ?? { result: 'success' })
  }
  catch (e: any) {
    // stop 失败不应阻塞前端 abort。返回 200 让前端继续走本地清理流程。
    return NextResponse.json({
      result: 'fail',
      message: e?.response?.data?.message || e?.message || 'stop request failed',
    }, { status: 200 })
  }
}
