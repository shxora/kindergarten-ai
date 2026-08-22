import { API_KEY, API_PREFIX, API_URL, APP_ID } from '@/config'
import Toast from '@/app/components/base/toast'
import type { AnnotationReply, MessageEnd, MessageReplace, ThoughtItem } from '@/app/components/chat/type'
import type { VisionFile } from '@/types/app'

const TIME_OUT = 100000

const ContentType = {
  json: 'application/json',
  stream: 'text/event-stream',
  form: 'application/x-www-form-urlencoded; charset=UTF-8',
  download: 'application/octet-stream', // for download
}

const baseOptions = {
  method: 'GET',
  mode: 'cors',
  credentials: 'include', // always send cookies、HTTP Basic authentication.
  headers: new Headers({
    'Content-Type': ContentType.json,
  }),
  redirect: 'follow',
}

// Vercel's serverless region cannot reach the NAS-hosted Dify service, while
// the browser can. Use the Dify API directly in the browser when an API URL is
// configured; keep the local proxy as the fallback for local/self-hosted runs.
const directApi = Boolean(API_URL)
const directApiPrefix = API_URL.replace(/\/$/, '')
const directUserKey = `maiya-dify-user:${APP_ID || 'default'}`

const getDirectUser = () => {
  if (typeof window === 'undefined') { return `web_${APP_ID || 'default'}` }
  const existing = window.localStorage.getItem(directUserKey)
  if (existing) { return existing }
  const generated = `web_${crypto.randomUUID()}`
  window.localStorage.setItem(directUserKey, generated)
  return generated
}

const getRequestUrl = (url: string) => {
  const path = url.startsWith('/') ? url : `/${url}`
  return directApi ? `${directApiPrefix}${path}` : `${API_PREFIX}${path}`
}

const prepareRequest = (options: any, body?: Record<string, any>) => {
  if (!directApi) { return body }
  options.credentials = 'omit'
  options.headers = new Headers(options.headers || {})
  options.headers.set('Authorization', `Bearer ${API_KEY}`)
  if (!body) { return body }
  return { ...body, user: body.user || getDirectUser() }
}

export interface WorkflowStartedResponse {
  task_id: string
  workflow_run_id: string
  event: string
  data: {
    id: string
    workflow_id: string
    sequence_number: number
    created_at: number
  }
}

export interface WorkflowFinishedResponse {
  task_id: string
  workflow_run_id: string
  event: string
  data: {
    id: string
    workflow_id: string
    status: string
    outputs: any
    error: string
    elapsed_time: number
    total_tokens: number
    total_steps: number
    created_at: number
    finished_at: number
  }
}

export interface NodeStartedResponse {
  task_id: string
  workflow_run_id: string
  event: string
  data: {
    id: string
    node_id: string
    node_type: string
    index: number
    predecessor_node_id?: string
    inputs: any
    created_at: number
    extras?: any
  }
}

export interface NodeFinishedResponse {
  task_id: string
  workflow_run_id: string
  event: string
  data: {
    id: string
    node_id: string
    node_type: string
    index: number
    predecessor_node_id?: string
    inputs: any
    process_data: any
    outputs: any
    status: string
    error: string
    elapsed_time: number
    execution_metadata: {
      total_tokens: number
      total_price: number
      currency: string
    }
    created_at: number
  }
}

export interface IOnDataMoreInfo {
  conversationId?: string
  taskId?: string
  messageId: string
  errorMessage?: string
  errorCode?: string
}

export type IOnData = (message: string, isFirstMessage: boolean, moreInfo: IOnDataMoreInfo) => void
export type IOnThought = (though: ThoughtItem) => void
export type IOnFile = (file: VisionFile) => void
export type IOnMessageEnd = (messageEnd: MessageEnd) => void
export type IOnMessageReplace = (messageReplace: MessageReplace) => void
export type IOnAnnotationReply = (messageReplace: AnnotationReply) => void
export type IOnCompleted = (hasError?: boolean) => void
export type IOnError = (msg: string, code?: string) => void
export type IOnWorkflowStarted = (workflowStarted: WorkflowStartedResponse) => void
export type IOnWorkflowFinished = (workflowFinished: WorkflowFinishedResponse) => void
export type IOnNodeStarted = (nodeStarted: NodeStartedResponse) => void
export type IOnNodeFinished = (nodeFinished: NodeFinishedResponse) => void

interface IOtherOptions {
  isPublicAPI?: boolean
  bodyStringify?: boolean
  needAllResponseContent?: boolean
  deleteContentType?: boolean
  onData?: IOnData // for stream
  onThought?: IOnThought
  onFile?: IOnFile
  onMessageEnd?: IOnMessageEnd
  onMessageReplace?: IOnMessageReplace
  onError?: IOnError
  onCompleted?: IOnCompleted // for stream
  getAbortController?: (abortController: AbortController) => void
  onWorkflowStarted?: IOnWorkflowStarted
  onWorkflowFinished?: IOnWorkflowFinished
  onNodeStarted?: IOnNodeStarted
  onNodeFinished?: IOnNodeFinished
}

function unicodeToChar(text: string) {
  return text.replace(/\\u[0-9a-f]{4}/g, (_match, p1) => {
    return String.fromCharCode(parseInt(p1, 16))
  })
}

const handleStream = (
  response: Response,
  onData: IOnData,
  onCompleted?: IOnCompleted,
  onThought?: IOnThought,
  onMessageEnd?: IOnMessageEnd,
  onMessageReplace?: IOnMessageReplace,
  onFile?: IOnFile,
  onWorkflowStarted?: IOnWorkflowStarted,
  onWorkflowFinished?: IOnWorkflowFinished,
  onNodeStarted?: IOnNodeStarted,
  onNodeFinished?: IOnNodeFinished,
) => {
  if (!response.ok) { throw new Error('Network response was not ok') }

  const reader = response.body?.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let bufferObj: Record<string, any>
  let isFirstMessage = true
  function read() {
    let hasError = false
    reader?.read().then((result: any) => {
      if (result.done) {
        onCompleted && onCompleted()
        return
      }
      buffer += decoder.decode(result.value, { stream: true })
      const lines = buffer.split('\n')
      try {
        lines.forEach((message) => {
          if (message.startsWith('data: ')) { // check if it starts with data:
            try {
              bufferObj = JSON.parse(message.substring(6)) as Record<string, any>// remove data: and parse as json
            }
            catch (e) {
              // mute handle message cut off
              onData('', isFirstMessage, {
                conversationId: bufferObj?.conversation_id,
                messageId: bufferObj?.message_id,
              })
              return
            }
            if (bufferObj.status === 400 || !bufferObj.event) {
              onData('', false, {
                conversationId: undefined,
                messageId: '',
                errorMessage: bufferObj?.message,
                errorCode: bufferObj?.code,
              })
              hasError = true
              onCompleted?.(true)
              return
            }
            if (bufferObj.event === 'message' || bufferObj.event === 'agent_message') {
              // can not use format here. Because message is splited.
              onData(unicodeToChar(bufferObj.answer), isFirstMessage, {
                conversationId: bufferObj.conversation_id,
                taskId: bufferObj.task_id,
                messageId: bufferObj.id,
              })
              isFirstMessage = false
            }
            else if (bufferObj.event === 'text_chunk' || bufferObj.event === 'llm_chunk') {
              // Workflow streaming uses text_chunk/llm_chunk instead of the
              // chatflow message event. Forward the text through the same
              // callback so the UI can append it immediately.
              const chunk = bufferObj.data?.text ?? bufferObj.data?.chunk ?? bufferObj.text ?? bufferObj.answer
              if (typeof chunk === 'string' && chunk) {
                onData(unicodeToChar(chunk), isFirstMessage, {
                  conversationId: bufferObj.conversation_id,
                  taskId: bufferObj.task_id,
                  messageId: bufferObj.id || '',
                })
                isFirstMessage = false
              }
            }
            else if (bufferObj.event === 'agent_thought') {
              onThought?.(bufferObj as ThoughtItem)
            }
            else if (bufferObj.event === 'message_file') {
              onFile?.(bufferObj as VisionFile)
            }
            else if (bufferObj.event === 'message_end') {
              onMessageEnd?.(bufferObj as MessageEnd)
            }
            else if (bufferObj.event === 'message_replace') {
              onMessageReplace?.(bufferObj as MessageReplace)
            }
            else if (bufferObj.event === 'workflow_started') {
              onWorkflowStarted?.(bufferObj as WorkflowStartedResponse)
            }
            else if (bufferObj.event === 'workflow_finished') {
              onWorkflowFinished?.(bufferObj as WorkflowFinishedResponse)
            }
            else if (bufferObj.event === 'node_started') {
              onNodeStarted?.(bufferObj as NodeStartedResponse)
            }
            else if (bufferObj.event === 'node_finished') {
              onNodeFinished?.(bufferObj as NodeFinishedResponse)
            }
          }
        })
        buffer = lines[lines.length - 1]
      }
      catch (e) {
        onData('', false, {
          conversationId: undefined,
          messageId: '',
          errorMessage: `${e}`,
        })
        hasError = true
        onCompleted?.(true)
        return
      }
      if (!hasError) { read() }
    }).catch((e: any) => {
      // 用户点击暂停时，reader.read() 会以 AbortError 拒绝。
      // 这不是业务失败，不应触发 onError 也不应在控制台留下 unhandled rejection。
      const msg = String(e?.message || e || '')
      if (e?.name === 'AbortError' || /aborted|abort/i.test(msg)) { return }
      // 其它读取异常兜底
      onCompleted?.(true)
    })
  }
  read()
}

const baseFetch = (url: string, fetchOptions: any, { needAllResponseContent }: IOtherOptions) => {
  const options = Object.assign({}, baseOptions, fetchOptions)

  let urlWithPrefix = getRequestUrl(url)

  const { method, params } = options
  let { body } = options
  if (directApi && method === 'DELETE' && !body) { body = {} }
  body = prepareRequest(options, body)
  // handle query
  if (method === 'GET' && params) {
    const requestParams = directApi ? { ...params, user: params.user || getDirectUser() } : params
    const paramsArray: string[] = []
    Object.keys(requestParams).forEach(key =>
      paramsArray.push(`${key}=${encodeURIComponent(requestParams[key])}`),
    )
    if (urlWithPrefix.search(/\?/) === -1) { urlWithPrefix += `?${paramsArray.join('&')}` }

    else { urlWithPrefix += `&${paramsArray.join('&')}` }

    delete options.params
  }

  if (body) { options.body = JSON.stringify(body) }

  // Handle timeout
  return Promise.race([
    new Promise((resolve, reject) => {
      setTimeout(() => {
        reject(new Error('request timeout'))
      }, TIME_OUT)
    }),
    new Promise((resolve, reject) => {
      globalThis.fetch(urlWithPrefix, options)
        .then((res: any) => {
          const resClone = res.clone()
          // Error handler
          if (!/^(2|3)\d{2}$/.test(res.status)) {
            try {
              const bodyJson = res.json()
              switch (res.status) {
                case 401: {
                  Toast.notify({ type: 'error', message: 'Invalid token' })
                  return
                }
                default:
                  // eslint-disable-next-line no-new
                  new Promise(() => {
                    bodyJson.then((data: any) => {
                      Toast.notify({ type: 'error', message: data.message })
                    })
                  })
              }
            }
            catch (e) {
              Toast.notify({ type: 'error', message: '请求失败，请稍后再试' })
            }

            return Promise.reject(resClone)
          }

          // handle delete api. Delete api not return content.
          if (res.status === 204) {
            resolve({ result: 'success' })
            return
          }

          // return data
          const data = options.headers.get('Content-type') === ContentType.download ? res.blob() : res.json()

          resolve(needAllResponseContent ? resClone : data)
        })
        .catch((err) => {
          const msg = (err && err.status) ? `请求失败 (${err.status})` : '请求失败，请稍后再试'
          Toast.notify({ type: 'error', message: typeof err === 'string' ? err : msg })
          reject(err)
        })
    }),
  ])
}

export const upload = (fetchOptions: any): Promise<any> => {
  const urlWithPrefix = directApi ? `${directApiPrefix}/files/upload` : `${API_PREFIX}/file-upload`
  const defaultOptions = {
    method: 'POST',
    url: `${urlWithPrefix}`,
    data: {},
  }
  const options = {
    ...defaultOptions,
    ...fetchOptions,
  }
  return new Promise((resolve, reject) => {
    const xhr = options.xhr
    xhr.open(options.method, options.url)
    for (const key in options.headers) { xhr.setRequestHeader(key, options.headers[key]) }

    if (directApi) { xhr.setRequestHeader('Authorization', `Bearer ${API_KEY}`) }
    xhr.withCredentials = !directApi
    xhr.responseType = 'text'
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        const responseText = String(xhr.response || '').trim()
        let response: any
        try { response = responseText ? JSON.parse(responseText) : undefined } catch { /* plain text response */ }
        if (xhr.status >= 200 && xhr.status < 300) {
          const id = response?.id || responseText
          if (!id) {
            reject(new Error('服务器没有返回文件 ID'))
            return
          }
          resolve({ id, ...response })
        }
        else {
          const error = new Error(response?.message || response?.error || responseText || `文件上传失败（${xhr.status}）`)
          Object.assign(error, { status: xhr.status, response })
          reject(error)
        }
      }
    }
    xhr.upload.onprogress = options.onprogress
    if (directApi && options.data instanceof FormData) { options.data.append('user', getDirectUser()) }
    xhr.send(options.data)
  })
}

export const ssePost = (
  url: string,
  fetchOptions: any,
  {
    onData,
    onCompleted,
    onThought,
    onFile,
    onMessageEnd,
    onMessageReplace,
    onWorkflowStarted,
    onWorkflowFinished,
    onNodeStarted,
    onNodeFinished,
    onError,
    getAbortController,
  }: IOtherOptions,
) => {
  const options = Object.assign({}, baseOptions, {
    method: 'POST',
  }, fetchOptions)

  const urlWithPrefix = getRequestUrl(url)

  const body = prepareRequest(options, options.body)
  if (body) { options.body = JSON.stringify(body) }

  const abortController = new AbortController()
  options.signal = abortController.signal
  getAbortController?.(abortController)

  globalThis.fetch(urlWithPrefix, options)
    .then((res: any) => {
      if (!/^(2|3)\d{2}$/.test(res.status)) {
        res.json().then((data: any) => {
          const message = data?.message || data?.error || 'Server Error'
          Toast.notify({ type: 'error', message })
          onError?.(message, data?.code)
        }).catch(() => {
          Toast.notify({ type: 'error', message: 'Server Error' })
          onError?.('Server Error')
        })
        return
      }
      return handleStream(res, (str: string, isFirstMessage: boolean, moreInfo: IOnDataMoreInfo) => {
        if (moreInfo.errorMessage) {
          Toast.notify({ type: 'error', message: moreInfo.errorMessage })
          onError?.(moreInfo.errorMessage, moreInfo.errorCode)
          return
        }
        onData?.(str, isFirstMessage, moreInfo)
      }, () => {
        onCompleted?.()
      }, onThought, onMessageEnd, onMessageReplace, onFile, onWorkflowStarted, onWorkflowFinished, onNodeStarted, onNodeFinished)
    })
    .catch((e) => {
      // 用户点击暂停后，浏览器会把正在读取的响应流标记为 aborted。
      // 这不是业务失败，不应弹出 BodyStreamBuffer 错误。
      if (e?.name === 'AbortError' || options.signal?.aborted || /body.*stream.*aborted|aborted|abort/i.test(String(e?.message || e))) { return }
      Toast.notify({ type: 'error', message: e })
      onError?.(e)
    })
}

export const request = (url: string, options = {}, otherOptions?: IOtherOptions) => {
  return baseFetch(url, options, otherOptions || {})
}

export const get = (url: string, options = {}, otherOptions?: IOtherOptions) => {
  return request(url, Object.assign({}, options, { method: 'GET' }), otherOptions)
}

export const post = (url: string, options = {}, otherOptions?: IOtherOptions) => {
  return request(url, Object.assign({}, options, { method: 'POST' }), otherOptions)
}

export const put = (url: string, options = {}, otherOptions?: IOtherOptions) => {
  return request(url, Object.assign({}, options, { method: 'PUT' }), otherOptions)
}

export const del = (url: string, options = {}, otherOptions?: IOtherOptions) => {
  return request(url, Object.assign({}, options, { method: 'DELETE' }), otherOptions)
}
