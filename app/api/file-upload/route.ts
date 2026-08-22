import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { API_KEY, API_URL } from '@/config'
import { getInfo, setSession } from '@/app/api/utils/common'

export async function POST(request: NextRequest) {
  const { sessionId, user } = getInfo(request)
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ message: '请选择要上传的文件' }, { status: 400, headers: setSession(sessionId) })
    }

    formData.append('user', user)
    // 使用原生 fetch 转发 FormData，让运行时自动生成 multipart boundary。
    // 手动设置 multipart/form-data 会导致 Dify 收不到文件内容。
    const upstream = await fetch(`${API_URL}/files/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}` },
      body: formData,
    })
    const payload: any = await upstream.json().catch(() => ({}))
    if (!upstream.ok || !payload?.id) {
      return NextResponse.json({
        message: payload?.message || payload?.error || `文件上传失败（${upstream.status}）`,
        detail: payload,
      }, { status: upstream.ok ? 502 : upstream.status, headers: setSession(sessionId) })
    }

    return NextResponse.json({
      id: payload.id,
      name: payload.name || file.name,
      size: payload.size || file.size,
      type: payload.mime_type || file.type,
    }, { headers: setSession(sessionId) })
  }
  catch (e: any) {
    return NextResponse.json({
      message: e?.message || '文件上传失败，请稍后重试',
    }, { status: 500, headers: setSession(sessionId) })
  }
}
