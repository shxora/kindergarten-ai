import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { client, getInfo, setSession } from '@/app/api/utils/common'

export async function GET(request: NextRequest) {
  const { sessionId, user } = getInfo(request)
  try {
    const { data }: any = await client.getConversations(user)
    return NextResponse.json(data, {
      headers: setSession(sessionId),
    })
  }
  catch (error: any) {
    return NextResponse.json({
      data: [],
      error: error.message,
    })
  }
}

export async function DELETE(request: NextRequest) {
  const { sessionId, user } = getInfo(request)
  try {
    const response: any = await client.getConversations(user, null, 100)
    const payload = response?.data
    const conversations = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : [])
    await Promise.all(conversations
      .filter((conversation: any) => conversation?.id)
      .map((conversation: any) => client.deleteConversation(conversation.id, user)))
    return NextResponse.json({ result: 'success', deleted: conversations.length }, {
      headers: setSession(sessionId),
    })
  }
  catch (error: any) {
    return NextResponse.json({
      result: 'error',
      error: error?.response?.data?.message || error?.message || '清空历史记录失败',
    }, { status: 500, headers: setSession(sessionId) })
  }
}
