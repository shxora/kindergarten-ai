import type { IOnCompleted, IOnData, IOnError, IOnFile, IOnMessageEnd, IOnMessageReplace, IOnNodeFinished, IOnNodeStarted, IOnThought, IOnWorkflowFinished, IOnWorkflowStarted } from './base'
import { del, get, post, ssePost } from './base'
import type { Feedbacktype } from '@/types/app'
import { API_URL } from '@/config'

export const sendChatMessage = async (
  body: Record<string, any>,
  {
    onData,
    onCompleted,
    onThought,
    onFile,
    onError,
    getAbortController,
    onMessageEnd,
    onMessageReplace,
    onWorkflowStarted,
    onNodeStarted,
    onNodeFinished,
    onWorkflowFinished,
  }: {
    onData: IOnData
    onCompleted: IOnCompleted
    onFile: IOnFile
    onThought: IOnThought
    onMessageEnd: IOnMessageEnd
    onMessageReplace: IOnMessageReplace
    onError: IOnError
    getAbortController?: (abortController: AbortController) => void
    onWorkflowStarted: IOnWorkflowStarted
    onNodeStarted: IOnNodeStarted
    onNodeFinished: IOnNodeFinished
    onWorkflowFinished: IOnWorkflowFinished
  },
) => {
  return ssePost('chat-messages', {
    body: {
      ...body,
      response_mode: 'streaming',
    },
  }, { onData, onCompleted, onThought, onFile, onError, getAbortController, onMessageEnd, onMessageReplace, onNodeStarted, onWorkflowStarted, onWorkflowFinished, onNodeFinished })
}

export const fetchConversations = async () => {
  return get('conversations', { params: { limit: 100, first_id: '' } })
}

export const clearConversations = async () => {
  if (!API_URL) { return del('conversations') }
  const conversations: any = await fetchConversations()
  if (conversations?.error) { return conversations }
  const items = Array.isArray(conversations?.data) ? conversations.data : []
  const results = await Promise.allSettled(items.filter(item => item?.id).map(item => del(`conversations/${item.id}`)))
  const failed = results.find(result => result.status === 'rejected')
  if (failed?.status === 'rejected') { return { error: '部分历史会话删除失败，请稍后重试' } }
  return { result: 'success' }
}

export const fetchChatList = async (conversationId: string) => {
  return get('messages', { params: { conversation_id: conversationId, limit: 20, last_id: '' } })
}

// init value. wait for server update
export const fetchAppParams = async () => {
  return get('parameters')
}

export const updateFeedback = async ({ url, body }: { url: string, body: Feedbacktype }) => {
  return post(url, { body })
}

export const generationConversationName = async (id: string) => {
  return post(`conversations/${id}/name`, { body: { auto_generate: true } })
}

// 通知 Dify 终止指定 task，Dify 会保留已生成的内容并通过原 SSE 推一个 message_end 收尾。
// 失败也不抛错 —— 前端始终会本地 abort，只是放弃让 Dify 端优雅收尾。
export const stopChatMessage = async (taskId: string) => {
  if (!taskId) { return Promise.resolve({ result: 'noop' }) }
  return post(`chat-messages/${taskId}/stop`, { body: {} }).catch(() => ({ result: 'fail' }))
}
