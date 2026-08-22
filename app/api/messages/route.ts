import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { client, getInfo, setSession } from '@/app/api/utils/common'

export async function GET(request: NextRequest) {
  const { sessionId, user } = getInfo(request)
  const { searchParams } = new URL(request.url)
  const conversationId = searchParams.get('conversation_id')
  if (!conversationId || conversationId === '-1') {
    return NextResponse.json({ data: [] }, { headers: setSession(sessionId) })
  }

  try {
    const { data }: any = await client.getConversationMessages(user, conversationId)
    return NextResponse.json(data, {
      headers: setSession(sessionId),
    })
  }
  catch (error: any) {
    return NextResponse.json({
      data: [],
      error: error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Unable to load messages',
    }, { headers: setSession(sessionId) })
  }
}
