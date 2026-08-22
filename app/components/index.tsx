'use client'
import type { FC } from 'react'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import produce, { setAutoFreeze } from 'immer'
import { useBoolean, useGetState } from 'ahooks'
import useConversation from '@/hooks/use-conversation'
import Toast from '@/app/components/base/toast'
import Sidebar from '@/app/components/sidebar'
import ConfigSence from '@/app/components/config-scence'
import Header from '@/app/components/header'
import { clearConversations, fetchAppParams, fetchChatList, fetchConversations, generationConversationName, sendChatMessage, stopChatMessage, updateFeedback } from '@/service'
import type { ChatItem, ConversationItem, Feedbacktype, PromptConfig, VisionFile, VisionSettings } from '@/types/app'
import type { FileUpload } from '@/app/components/base/file-uploader-in-attachment/types'
import { Resolution, TransferMethod, WorkflowRunningStatus } from '@/types/app'
import Chat from '@/app/components/chat'
import { setLocaleOnClient } from '@/i18n/client'
import useBreakpoints, { MediaType } from '@/hooks/use-breakpoints'
import Loading from '@/app/components/base/loading'
import { replaceVarWithValues, userInputsFormToPromptVariables } from '@/utils/prompt'
import AppUnavailable from '@/app/components/app-unavailable'
import { API_KEY, APP_ID, APP_INFO, isShowPrompt, promptTemplate } from '@/config'
import type { Annotation as AnnotationType } from '@/types/log'
import { addFileInfos, sortAgentSorts } from '@/utils/tools'
import { stripThinkMarkup } from '@/utils/think'

export interface IMainProps {
  params: any
}

const createThinkStreamFilter = () => {
  let insideThink = false
  let pending = ''
  const openTag = '<think>'
  const closeTag = '</think>'
  const isPrefix = (value: string, tag: string) => tag.startsWith(value.toLowerCase())

  return {
    push(chunk: string) {
      let text = pending + chunk
      pending = ''
      let visible = ''

      while (text) {
        const lower = text.toLowerCase()
        if (insideThink) {
          const closeIndex = lower.indexOf(closeTag)
          if (closeIndex < 0) {
            const lastOpen = text.lastIndexOf('<')
            const suffix = lastOpen >= 0 ? text.slice(lastOpen) : ''
            if (suffix && isPrefix(suffix, closeTag)) pending = suffix
            return visible
          }
          text = text.slice(closeIndex + closeTag.length)
          insideThink = false
          continue
        }

        const openIndex = lower.indexOf(openTag)
        if (openIndex >= 0) {
          visible += text.slice(0, openIndex)
          text = text.slice(openIndex + openTag.length)
          insideThink = true
          continue
        }

        const lastOpen = text.lastIndexOf('<')
        const suffix = lastOpen >= 0 ? text.slice(lastOpen) : ''
        if (suffix && isPrefix(suffix, openTag)) {
          visible += text.slice(0, lastOpen)
          pending = suffix
          return visible
        }
        visible += text
        return visible
      }
      return visible
    },
  }
}

const isUploadedFileValue = (value: any) => Boolean(
  value
  && typeof value === 'object'
  && (value.upload_file_id || value.file_id)
  && (value.transfer_method || value.type === 'image' || value.type === 'document'),
)

const flattenUploadedFiles = (value: any): any[] => {
  if (isUploadedFileValue(value)) return [value]
  if (Array.isArray(value)) return value.flatMap(flattenUploadedFiles)
  if (value && typeof value === 'object') return Object.values(value).flatMap(flattenUploadedFiles)
  return []
}

const getHistoryUserFiles = (message: any): any[] => {
  const messageFiles = Array.isArray(message?.message_files)
    ? message.message_files.filter((file: any) => file.belongs_to === 'user' || !file.belongs_to)
    : []
  if (messageFiles.length > 0) return messageFiles

  // Start-node file variables are often persisted by Dify under inputs rather
  // than message_files. Recover them so attachments remain visible after refresh.
  return flattenUploadedFiles(message?.inputs).map((file: any) => ({
    ...file,
    upload_file_id: file.upload_file_id || file.file_id,
    belongs_to: 'user',
  }))
}

type CachedConversationAttachment = {
  query: string
  files: any[]
  createdAt: number
}

const attachmentCacheKey = `maiya-conversation-attachments:${APP_ID}`

const readAttachmentCache = (): Record<string, CachedConversationAttachment[]> => {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(attachmentCacheKey)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  }
  catch {
    return {}
  }
}

const cacheConversationAttachments = (conversationId: string, query: string, files: VisionFile[]) => {
  if (typeof window === 'undefined' || !conversationId || conversationId === '-1' || files.length === 0) return
  try {
    const cache = readAttachmentCache()
    const cachedFiles = files.map((file: any) => {
      // 文件正文和大尺寸 base64 预览不写入 localStorage，只保留可恢复显示的元数据。
      const { base64Url: _base64Url, ...metadata } = file
      return metadata
    })
    const entries = cache[conversationId] || []
    cache[conversationId] = [...entries, { query, files: cachedFiles, createdAt: Date.now() }].slice(-100)
    const conversationIds = Object.keys(cache)
    conversationIds.slice(0, Math.max(0, conversationIds.length - 50)).forEach(id => delete cache[id])
    window.localStorage.setItem(attachmentCacheKey, JSON.stringify(cache))
  }
  catch {
    // 缓存失败不影响消息发送和 Dify 历史记录。
  }
}

const getCachedConversationAttachments = (
  conversationId: string,
  query: string,
  usedIndexes: Set<number>,
): any[] => {
  const entries = readAttachmentCache()[conversationId] || []
  const index = entries.findIndex((entry, entryIndex) => !usedIndexes.has(entryIndex) && entry.query === query)
  if (index < 0) return []
  usedIndexes.add(index)
  return entries[index].files || []
}

const Main: FC<IMainProps> = () => {
  const { t } = useTranslation()
  const media = useBreakpoints()
  const isMobile = media === MediaType.mobile
  const hasSetAppConfig = APP_ID && API_KEY

  /*
  * app info
  */
  const [appUnavailable, setAppUnavailable] = useState<boolean>(false)
  const [isUnknownReason, setIsUnknownReason] = useState<boolean>(false)
  const [promptConfig, setPromptConfig] = useState<PromptConfig | null>(null)
  const [inited, setInited] = useState<boolean>(false)
  // in mobile, show sidebar by click button
  const [isShowSidebar, { setTrue: showSidebar, setFalse: hideSidebar }] = useBoolean(false)
  const [visionConfig, setVisionConfig] = useState<VisionSettings | undefined>({
    enabled: false,
    number_limits: 2,
    detail: Resolution.low,
    transfer_methods: [TransferMethod.local_file],
  })
  const [fileConfig, setFileConfig] = useState<FileUpload | undefined>()

  useEffect(() => {
    if (APP_INFO?.title) { document.title = `${APP_INFO.title} - Powered by Dify` }
  }, [APP_INFO?.title])

  // onData change thought (the produce obj). https://github.com/immerjs/immer/issues/576
  useEffect(() => {
    setAutoFreeze(false)
    return () => {
      setAutoFreeze(true)
    }
  }, [])

  /*
  * conversation info
  */
  const {
    conversationList,
    setConversationList,
    currConversationId,
    getCurrConversationId,
    setCurrConversationId,
    getConversationIdFromStorage,
    isNewConversation,
    currConversationInfo,
    currInputs,
    newConversationInputs,
    resetNewConversationInputs,
    setCurrInputs,
    setNewConversationInfo,
    setExistConversationInfo,
  } = useConversation()

  const [conversationIdChangeBecauseOfNew, setConversationIdChangeBecauseOfNew, getConversationIdChangeBecauseOfNew] = useGetState(false)
  const [isChatStarted, { setTrue: setChatStarted, setFalse: setChatNotStarted }] = useBoolean(false)
  const handleStartChat = (inputs: Record<string, any>) => {
    createNewChat()
    setConversationIdChangeBecauseOfNew(true)
    setCurrInputs(inputs)
    setChatStarted()
    // parse variables in introduction
    setChatList(generateNewChatListWithOpenStatement('', inputs))
  }
  const hasSetInputs = (() => {
    if (!isNewConversation) { return true }

    const hasRequiredInputs = promptConfig?.prompt_variables?.some(item => item.required)
    return isChatStarted || !hasRequiredInputs
  })()

  const hasRequiredInputs = promptConfig?.prompt_variables?.some(item => item.required) ?? false

  useEffect(() => {
    if (inited && isNewConversation && !isChatStarted && !hasRequiredInputs && chatList.length === 0) {
      setChatList(generateNewChatListWithOpenStatement())
    }
  }, [inited, isNewConversation, isChatStarted, hasRequiredInputs])

  const conversationName = currConversationInfo?.name || t('app.chat.newChatDefaultName') as string
  const conversationIntroduction = currConversationInfo?.introduction || ''
  const suggestedQuestions = currConversationInfo?.suggested_questions || []

  const handleConversationSwitch = () => {
    if (!inited) { return }

    // update inputs of current conversation
    let notSyncToStateIntroduction = ''
    let notSyncToStateInputs: Record<string, any> | undefined | null = {}
    if (!isNewConversation) {
      const item = conversationList.find(item => item.id === currConversationId)
      notSyncToStateInputs = item?.inputs || {}
      setCurrInputs(notSyncToStateInputs as any)
      notSyncToStateIntroduction = item?.introduction || ''
      setExistConversationInfo({
        name: item?.name || '',
        introduction: notSyncToStateIntroduction,
        suggested_questions: suggestedQuestions,
      })
    }
    else {
      notSyncToStateInputs = newConversationInputs
      setCurrInputs(notSyncToStateInputs)
    }

    // update chat list of current conversation
    if (!isNewConversation && !conversationIdChangeBecauseOfNew && !isResponding) {
      fetchChatList(currConversationId).then((res: any) => {
        const { data, error } = res
        if (error) {
          Toast.notify({ type: 'error', message: error })
          setChatList([
            ...generateNewChatListWithOpenStatement(notSyncToStateIntroduction, notSyncToStateInputs),
            {
              id: `history-error-${currConversationId}`,
              content: `历史消息加载失败：${error}`,
              isAnswer: true,
            },
          ])
          return
        }
        const newChatList: ChatItem[] = generateNewChatListWithOpenStatement(notSyncToStateIntroduction, notSyncToStateInputs)

        const messages = Array.isArray(data) ? data : []
        const usedCachedAttachmentIndexes = new Set<number>()
        messages.forEach((item: any) => {
          const historyFiles = getHistoryUserFiles(item)
          const messageFiles = historyFiles.length > 0
            ? historyFiles
            : getCachedConversationAttachments(currConversationId, item.query || '', usedCachedAttachmentIndexes)
          newChatList.push({
            id: `question-${item.id}`,
            content: item.query,
            isAnswer: false,
            message_files: messageFiles,

          })
          newChatList.push({
            id: item.id,
            content: stripThinkMarkup(item.answer || ''),
            agent_thoughts: addFileInfos(item.agent_thoughts ? sortAgentSorts(item.agent_thoughts) : item.agent_thoughts, item.message_files),
            feedback: item.feedback,
            isAnswer: true,
            message_files: item.message_files?.filter((file: any) => file.belongs_to === 'assistant') || [],
          })
        })
        setChatList(newChatList)
      })
    }

    if (isNewConversation) { setChatList(generateNewChatListWithOpenStatement()) }
  }
  useEffect(handleConversationSwitch, [currConversationId, inited])

  const handleConversationIdChange = (id: string) => {
    if (id === '-1') {
      createNewChat()
      setConversationIdChangeBecauseOfNew(true)
    }
    else {
      setConversationIdChangeBecauseOfNew(false)
    }
    // trigger handleConversationSwitch
    setCurrConversationId(id, APP_ID)
    hideSidebar()
  }

  /*
  * chat info. chat is under conversation.
  */
  const [chatList, setChatList, getChatList] = useGetState<ChatItem[]>([])
  const chatListDomRef = useRef<HTMLDivElement>(null)
  const skipNextScrollRef = useRef(false)
  useEffect(() => {
    // scroll to bottom with page-level scrolling
    if (chatListDomRef.current) {
      if (skipNextScrollRef.current) {
        skipNextScrollRef.current = false
        return
      }
      setTimeout(() => {
        chatListDomRef.current?.scrollIntoView({
          behavior: 'auto',
          block: 'end',
        })
      }, 50)
    }
  }, [chatList, currConversationId])
  // user can not edit inputs if user had send message
  const canEditInputs = !chatList.some(item => item.isAnswer === false) && isNewConversation
  const createNewChat = () => {
    // if new chat is already exist, do not create new chat
    if (conversationList.some(item => item.id === '-1')) { return }

    setConversationList(produce(conversationList, (draft) => {
      draft.unshift({
        id: '-1',
        name: t('app.chat.newChatDefaultName'),
        inputs: newConversationInputs,
        introduction: conversationIntroduction,
        suggested_questions: suggestedQuestions,
      })
    }))
  }

  // sometime introduction is not applied to state
  const generateNewChatListWithOpenStatement = (introduction?: string, inputs?: Record<string, any> | null) => {
    let calculatedIntroduction = introduction || conversationIntroduction || '你好，我是麦芽幼教 AI，很高兴帮助你完成教研记录。'
    const calculatedPromptVariables = inputs || currInputs || null
    if (calculatedIntroduction && calculatedPromptVariables) { calculatedIntroduction = replaceVarWithValues(calculatedIntroduction, promptConfig?.prompt_variables || [], calculatedPromptVariables) }

    const openStatement = {
      id: `${Date.now()}`,
      content: calculatedIntroduction,
      isAnswer: true,
      feedbackDisabled: true,
      isOpeningStatement: isShowPrompt,
      suggestedQuestions,
    }
    if (calculatedIntroduction) { return [openStatement] }

    return []
  }

  // init
  useEffect(() => {
    if (!hasSetAppConfig) {
      setAppUnavailable(true)
      return
    }
    (async () => {
      try {
        const [conversationData, appParams] = await Promise.all([fetchConversations(), fetchAppParams()])
        // handle current conversation id
        const { data: conversations, error } = conversationData as { data: ConversationItem[], error: string }
        if (error) {
          Toast.notify({ type: 'error', message: error })
          throw new Error(error)
          return
        }
        const _conversationId = getConversationIdFromStorage(APP_ID)
        const currentConversation = conversations.find(item => item.id === _conversationId)
        const isNotNewConversation = !!currentConversation

        // fetch new conversation info
        const { user_input_form, opening_statement: introduction, file_upload, system_parameters, suggested_questions = [] }: any = appParams
        setLocaleOnClient(APP_INFO.default_language, true)
        setNewConversationInfo({
          name: t('app.chat.newChatDefaultName'),
          introduction,
          suggested_questions,
        })
        if (isNotNewConversation) {
          setExistConversationInfo({
            name: currentConversation.name || t('app.chat.newChatDefaultName'),
            introduction,
            suggested_questions,
          })
        }
        const prompt_variables = userInputsFormToPromptVariables(user_input_form)
        setPromptConfig({
          prompt_template: promptTemplate,
          prompt_variables,
        } as PromptConfig)
        // This workflow uses two explicit Start-node file-list variables rather
        // than Dify's global chat attachment switch. Build the two upload
        // controls from those variables so the UI still works when the global
        // file_upload setting is disabled.
        const isFileVariable = (item: any) => item?.type === 'file' || item?.type === 'file-list'
        const imageInput = prompt_variables.find((item: any) => isFileVariable(item) && item.allowed_file_types?.includes('image'))
        const documentInput = prompt_variables.find((item: any) => isFileVariable(item) && item.allowed_file_types?.includes('document'))
        const localUploadOnly = [TransferMethod.local_file]
        const outerFileUploadEnabled = !!file_upload?.enabled
        setVisionConfig({
          ...file_upload?.image,
          enabled: !!imageInput || !!(outerFileUploadEnabled && file_upload?.image?.enabled),
          number_limits: imageInput?.max_length || file_upload?.image?.number_limits || 1,
          transfer_methods: imageInput?.allowed_file_upload_methods || file_upload?.image?.transfer_methods || localUploadOnly,
          image_file_size_limit: system_parameters?.image_file_size_limit || system_parameters?.system_parameters || 10,
        })
        setFileConfig({
          enabled: !!documentInput || outerFileUploadEnabled,
          allowed_file_types: documentInput?.allowed_file_types || file_upload?.allowed_file_types || ['document'],
          allowed_file_extensions: documentInput?.allowed_file_extensions || file_upload?.allowed_file_extensions || [],
          allowed_file_upload_methods: documentInput?.allowed_file_upload_methods || file_upload?.allowed_file_upload_methods || localUploadOnly,
          number_limits: documentInput?.max_length || file_upload?.number_limits || 5,
          fileUploadConfig: file_upload?.fileUploadConfig,
        })
        setConversationList(conversations as ConversationItem[])

        if (isNotNewConversation) { setCurrConversationId(_conversationId, APP_ID, false) }

        setInited(true)
      }
      catch (e: any) {
        if (e.status === 404) {
          setAppUnavailable(true)
        }
        else {
          setIsUnknownReason(true)
          setAppUnavailable(true)
        }
      }
    })()
  }, [])

  const [isResponding, { setTrue: setRespondingTrue, setFalse: setRespondingFalse }] = useBoolean(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const workflowTypingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const handleStop = () => {
    // 1) 通知 Dify 停止任务（fire-and-forget）。
    //    失败也无所谓——Dify 端会保留已生成内容，我们还会本地 abort。
    if (messageTaskId) { stopChatMessage(messageTaskId) }
    // 2) 本地中止 fetch，释放 UI
    if (workflowTypingTimerRef.current) {
      clearInterval(workflowTypingTimerRef.current)
      workflowTypingTimerRef.current = null
    }
    abortController?.abort()
    setAbortController(null)
    setRespondingFalse()
    setChatList(produce(getChatList(), (draft) => {
      const last = draft[draft.length - 1]
      if (last?.isAnswer && !last.content && !last.agent_thoughts?.length) draft.pop()
    }))
  }
  const { notify } = Toast

  const formatWorkflowOutput = (outputs: any): string => {
    if (outputs === undefined || outputs === null) return ''
    if (typeof outputs === 'string') return outputs
    if (typeof outputs !== 'object') return String(outputs)
    // 常见 Dify 工作流输出字段优先作为最终回答展示。
    for (const key of ['answer', 'text', 'result', 'output', 'content', 'response']) {
      if (outputs[key] !== undefined && outputs[key] !== null) {
        const value = outputs[key]
        return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
      }
    }
    const values = Object.values(outputs).filter(value => value !== undefined && value !== null)
    if (values.length === 1) return typeof values[0] === 'string' ? values[0] : JSON.stringify(values[0], null, 2)
    return JSON.stringify(outputs, null, 2)
  }

  const logError = (message: string) => {
    notify({ type: 'error', message })
  }

  const checkCanSend = () => {
    if (currConversationId !== '-1') { return true }

    if (!currInputs || !promptConfig?.prompt_variables) { return true }

    let emptyRequiredInput = false
    promptConfig.prompt_variables.forEach((item) => {
      if (item.required && !currInputs[item.key])
      { emptyRequiredInput = true }
    })

    if (emptyRequiredInput) {
      logError(t('app.errorMessage.valueOfVarRequired'))
      return false
    }
    return true
  }

  const [controlFocus, setControlFocus] = useState(0)
  const [openingSuggestedQuestions, setOpeningSuggestedQuestions] = useState<string[]>([])
  const [messageTaskId, setMessageTaskId] = useState('')
  const [hasStopResponded, setHasStopResponded, getHasStopResponded] = useGetState(false)
  const [isRespondingConIsCurrCon, setIsRespondingConCurrCon, getIsRespondingConIsCurrCon] = useGetState(true)
  const [userQuery, setUserQuery] = useState('')

  const updateCurrentQA = ({
    responseItem,
    questionId,
    placeholderAnswerId,
    questionItem,
  }: {
    responseItem: ChatItem
    questionId: string
    placeholderAnswerId: string
    questionItem: ChatItem
  }) => {
    // closesure new list is outdated.
    const newListWithAnswer = produce(
      getChatList().filter(item => item.id !== responseItem.id && item.id !== placeholderAnswerId),
      (draft) => {
        if (!draft.find(item => item.id === questionId)) { draft.push({ ...questionItem }) }

        draft.push({ ...responseItem })
      },
    )
    setChatList(newListWithAnswer)
  }

  const transformToServerFile = (fileItem: any) => {
    return {
      type: 'image',
      transfer_method: fileItem.transferMethod,
      url: fileItem.url,
      upload_file_id: fileItem.id,
    }
  }

  const handleSend = async (message: string, files?: VisionFile[]) => {
    if (isResponding) {
      notify({ type: 'info', message: t('app.errorMessage.waitForResponse') })
      return
    }
    if (workflowTypingTimerRef.current) {
      clearInterval(workflowTypingTimerRef.current)
      workflowTypingTimerRef.current = null
    }

    // 记录发送前已有的真实会话，避免刷新列表时误把旧会话当成本次新会话。
    const previousConversationIds = new Set(
      conversationList
        .filter(item => item.id !== '-1')
        .map(item => item.id),
    )
    const toServerInputs: Record<string, any> = {}
    if (currInputs) {
      Object.keys(currInputs).forEach((key) => {
        const value = currInputs[key]
        if (value.supportFileType) { toServerInputs[key] = transformToServerFile(value) }

        else if (value[0]?.supportFileType) { toServerInputs[key] = value.map((item: any) => transformToServerFile(item)) }

        else { toServerInputs[key] = value }
      })
    }

    const data: Record<string, any> = {
      inputs: toServerInputs,
      query: message,
      conversation_id: isNewConversation ? null : currConversationId,
    }

    const isFileVariable = (item: any) => item?.type === 'file' || item?.type === 'file-list'
    const imageInput = promptConfig?.prompt_variables?.find((item: any) => isFileVariable(item) && item.allowed_file_types?.includes('image'))
    const documentInput = promptConfig?.prompt_variables?.find((item: any) => isFileVariable(item) && item.allowed_file_types?.includes('document'))
    const imageFiles = (files || []).filter(file => file.type === 'image')
    const documentFiles = (files || []).filter(file => file.type !== 'image')
    const toServerFile = (item: VisionFile) => {
      const { filename: _filename, base64Url: _base64Url, ...serverFile } = item
      return item.transfer_method === TransferMethod.local_file
        ? { ...serverFile, url: '' }
        : serverFile
    }
    const assignFileInput = (variable: any, items: VisionFile[]) => {
      const serverFiles = items.map(toServerFile)
      return variable?.type === 'file' ? (serverFiles[0] || null) : serverFiles
    }

    if (imageInput || documentInput) {
      // The workflow has separate Start-node variables. Never send a mixed
      // top-level files array: that makes Dify pass document objects directly
      // into the model and can trigger DocumentPromptMessageContent errors.
      if (imageInput) { toServerInputs[imageInput.key] = assignFileInput(imageInput, imageFiles) }
      if (documentInput) { toServerInputs[documentInput.key] = assignFileInput(documentInput, documentFiles) }
    }
    else if (files && files.length > 0) {
      // Backward-compatible fallback for apps that only use Dify's global
      // attachment input instead of explicit Start-node variables.
      data.files = files.map(toServerFile)
    }

    // question
    const questionId = `question-${Date.now()}`
    const questionItem = {
      id: questionId,
      content: message,
      isAnswer: false,
      // 保留全部附件，历史消息加载后可显示教师上传的文档/音频等文件。
      message_files: (files || []).map((file: any) => ({
        ...file,
        // Dify 的 local_file 通常不会返回图片 URL，使用上传前的本地预览地址展示。
        url: file.url || file.base64Url || '',
      })),
    }

    const placeholderAnswerId = `answer-placeholder-${Date.now()}`
    const placeholderAnswerItem = {
      id: placeholderAnswerId,
      content: '',
      isAnswer: true,
    }

    const newList = [...getChatList(), questionItem, placeholderAnswerItem]
    setChatList(newList)

    // answer
    const responseItem: ChatItem = {
      id: `${Date.now()}`,
      content: '',
      agent_thoughts: [],
      message_files: [],
      isAnswer: true,
    }
    let hasReceivedAnswer = false
    let hasSetResponseId = false
    const thinkStreamFilter = createThinkStreamFilter()

    const prevTempNewConversationId = getCurrConversationId() || '-1'
    let tempNewConversationId = ''

    // 立即在历史记录里加一个"新对话"占位，避免带图片的消息发出去后等待 Dify 拉取新列表
    if (isNewConversation) {
      setConversationList(produce(conversationList, (draft) => {
        // 避免重复插入
        if (draft.some(item => item.id === '-1')) return
        draft.unshift({
          id: '-1',
          name: t('app.chat.newChatDefaultName'),
          inputs: newConversationInputs,
          introduction: conversationIntroduction,
          suggested_questions: suggestedQuestions,
        })
      }))
    }

    setRespondingTrue()
    sendChatMessage(data, {
      getAbortController: (abortController) => {
        setAbortController(abortController)
      },
      onData: (message: string, isFirstMessage: boolean, { conversationId: newConversationId, messageId, taskId }: any) => {
        const visibleMessage = thinkStreamFilter.push(message || '')
        // Replace the temporary status as soon as the first model content
        // arrives, instead of appending the answer to the status text.
        if (visibleMessage && !hasReceivedAnswer) {
          responseItem.content = ''
          hasReceivedAnswer = true
        }
        if (visibleMessage) {
          responseItem.content = responseItem.content + visibleMessage
        }
        else {
          const lastThought = responseItem.agent_thoughts?.[responseItem.agent_thoughts?.length - 1]
          if (lastThought) { lastThought.thought = lastThought.thought + message } // need immer setAutoFreeze
        }
        if (messageId && !hasSetResponseId) {
          responseItem.id = messageId
          hasSetResponseId = true
        }

        // 某些工作流先发送 thought/workflow 事件，conversation_id 不一定出现在第一条事件。
        if (newConversationId) { tempNewConversationId = newConversationId }

        setMessageTaskId(taskId)
        // has switched to other conversation
        if (prevTempNewConversationId !== getCurrConversationId()) {
          setIsRespondingConCurrCon(false)
          return
        }
        updateCurrentQA({
          responseItem,
          questionId,
          placeholderAnswerId,
          questionItem,
        })
      },
      async onCompleted(hasError?: boolean) {
        if (hasError) {
          setAbortController(null)
          setRespondingFalse()
          return
        }

        // Dify 有时只返回 workflow 事件而没有正文，不能让界面停留在空白气泡。
        if (!responseItem.content) {
          setChatList(produce(getChatList(), (draft) => {
            for (let i = draft.length - 1; i >= 0; i--) {
              if (draft[i].isAnswer) {
                draft[i].content = '工作流未返回文本结果，请检查 Dify 的结束节点或回答节点是否配置了输出。'
                return
              }
            }
          }))
        }

        const shouldGenerateName = getConversationIdChangeBecauseOfNew()
        setConversationIdChangeBecauseOfNew(false)
        resetNewConversationInputs()
        setChatNotStarted()
        setRespondingFalse()
        setAbortController(null)

        // 回复完成后刷新历史列表，这样即使命名接口较慢或回复没有文本，
        // 新会话也会马上出现在左侧“历史记录”中。
        void (async () => {
          try {
            const { data: allConversations }: any = await fetchConversations()
            if (!Array.isArray(allConversations)) return
            setConversationList(allConversations)
            // 如果流式事件没有携带会话 ID，使用 Dify 返回的最新会话作为兜底，
            // 避免把空字符串写入 localStorage，导致点击历史记录时请求空会话。
            const newlyCreatedConversation = allConversations.find(
              item => item.id && !previousConversationIds.has(item.id),
            )
            const conversationId = tempNewConversationId
              || newlyCreatedConversation?.id
              || (shouldGenerateName ? '' : prevTempNewConversationId)
            if (conversationId && conversationId !== '-1') {
              setCurrConversationId(conversationId, APP_ID, true)
              cacheConversationAttachments(conversationId, message, files || [])
            }
            if (shouldGenerateName && conversationId && conversationId !== '-1') {
              try {
                const newItem: any = await generationConversationName(conversationId)
                if (newItem?.name) {
                  setConversationList(produce(allConversations, (draft: any) => {
                    const target = draft.find((item: any) => item.id === conversationId)
                    if (target) target.name = newItem.name
                  }) as any)
                }
              }
              catch {
                // 自动命名失败不影响历史记录显示。
              }
            }
          }
          catch {
            // 历史列表刷新失败不影响已经完成的回答。
          }
        })()
      },
      onFile(file) {
        const lastThought = responseItem.agent_thoughts?.[responseItem.agent_thoughts?.length - 1]
        if (lastThought) { lastThought.message_files = [...(lastThought as any).message_files, { ...file }] }

        updateCurrentQA({
          responseItem,
          questionId,
          placeholderAnswerId,
          questionItem,
        })
      },
      onThought(thought) {
        if (!hasReceivedAnswer) {
          responseItem.content = ''
          hasReceivedAnswer = true
        }
        const response = responseItem as any
        if (thought.message_id && !hasSetResponseId) {
          response.id = thought.message_id
          hasSetResponseId = true
        }
        // responseItem.id = thought.message_id;
        if (response.agent_thoughts.length === 0) {
          response.agent_thoughts.push(thought)
        }
        else {
          const lastThought = response.agent_thoughts[response.agent_thoughts.length - 1]
          // thought changed but still the same thought, so update.
          if (lastThought.id === thought.id) {
            thought.thought = lastThought.thought
            thought.message_files = lastThought.message_files
            responseItem.agent_thoughts![response.agent_thoughts.length - 1] = thought
          }
          else {
            responseItem.agent_thoughts!.push(thought)
          }
        }
        // has switched to other conversation
        if (prevTempNewConversationId !== getCurrConversationId()) {
          setIsRespondingConCurrCon(false)
          return false
        }

        updateCurrentQA({
          responseItem,
          questionId,
          placeholderAnswerId,
          questionItem,
        })
      },
      onMessageEnd: (messageEnd) => {
        const endedConversationId = (messageEnd as any).conversation_id
        if (endedConversationId) { tempNewConversationId = endedConversationId }
        if (messageEnd.metadata?.annotation_reply) {
          responseItem.id = messageEnd.id
          responseItem.annotation = ({
            id: messageEnd.metadata.annotation_reply.id,
            authorName: messageEnd.metadata.annotation_reply.account.name,
          } as AnnotationType)
          const newListWithAnswer = produce(
            getChatList().filter(item => item.id !== responseItem.id && item.id !== placeholderAnswerId),
            (draft) => {
              if (!draft.find(item => item.id === questionId)) { draft.push({ ...questionItem }) }

              draft.push({
                ...responseItem,
              })
            },
          )
          setChatList(newListWithAnswer)
          return
        }
        // not support show citation
        // responseItem.citation = messageEnd.retriever_resources
        const newListWithAnswer = produce(
          getChatList().filter(item => item.id !== responseItem.id && item.id !== placeholderAnswerId),
          (draft) => {
            if (!draft.find(item => item.id === questionId)) { draft.push({ ...questionItem }) }

            draft.push({ ...responseItem })
          },
        )
        setChatList(newListWithAnswer)
      },
      onMessageReplace: (messageReplace) => {
        setChatList(produce(
          getChatList(),
          (draft) => {
            const current = draft.find(item => item.id === messageReplace.id)

              if (current) { current.content = stripThinkMarkup(messageReplace.answer || '') }
          },
        ))
      },
      onError(errorMessage) {
        setAbortController(null)
        setRespondingFalse()
        // 找到最后一条回答（可能是 placeholder，也可能是已经更新的 responseItem）替换为错误提示
        setChatList(produce(getChatList(), (draft) => {
          // 倒序找到最后一条 answer
          for (let i = draft.length - 1; i >= 0; i--) {
            if (draft[i].isAnswer) {
              draft[i] = {
                ...draft[i],
                content: errorMessage || '请求失败，请稍后再试。',
                isAnswer: true,
              }
              return
            }
          }
        }))
      },
      onWorkflowStarted: (workflowStarted: any) => {
        const eventConversationId = workflowStarted.conversation_id || workflowStarted.data?.conversation_id
        if (eventConversationId) { tempNewConversationId = eventConversationId }
        const { workflow_run_id, task_id } = workflowStarted
        // taskIdRef.current = task_id
        responseItem.workflow_run_id = workflow_run_id
        responseItem.workflowProcess = {
          status: WorkflowRunningStatus.Running,
          tracing: [],
        }
        setChatList(produce(getChatList(), (draft) => {
          const currentIndex = draft.findIndex(item => item.id === responseItem.id)
          draft[currentIndex] = {
            ...draft[currentIndex],
            ...responseItem,
          }
        }))
      },
      onWorkflowFinished: (workflowFinished: any) => {
        const eventConversationId = workflowFinished.conversation_id || workflowFinished.data?.conversation_id
        if (eventConversationId) { tempNewConversationId = eventConversationId }
        const { data } = workflowFinished
        responseItem.workflowProcess!.status = data.status as WorkflowRunningStatus
        // 只在 status 明确为 failed 时才视为失败。
        // Dify 成功运行也可能在 data.error 带回 warning 字符串（不是真错误），
        // 用 || data.error 会误判。
        if (data.status === WorkflowRunningStatus.Failed) {
          // 把每个字段单独 log，DevTools 一眼能看清不用展开
          console.error(
            '[workflow failed]',
            'status:', data.status,
            'error:', data.error,
            'outputs:', data.outputs,
            'conversationId:', eventConversationId,
            'taskId:', messageTaskId,
          )
          responseItem.content = '请求失败'
          hasReceivedAnswer = true
        }
        else {
          // 调试用：成功后也打一下 status / error / outputs，便于排查
          console.debug('[workflow finished]', { status: data.status, error: data.error, hasOutputs: data.outputs != null, conversationId: eventConversationId, taskId: messageTaskId })
        }
        const workflowOutput = stripThinkMarkup(formatWorkflowOutput(data.outputs))
        if (workflowOutput && !responseItem.content) {
          // 工作流通常只在 workflow_finished 中返回完整 outputs，前端按短文本块
          // 逐步追加，避免结果一次性整段出现；真正的 message 事件仍由 onData 实时处理。
          hasReceivedAnswer = true
          let outputIndex = Math.min(3, workflowOutput.length)
          responseItem.content = workflowOutput.slice(0, outputIndex)
          updateCurrentQA({
            responseItem,
            questionId,
            placeholderAnswerId,
            questionItem,
          })
          if (outputIndex < workflowOutput.length) {
            workflowTypingTimerRef.current = setInterval(() => {
              outputIndex = Math.min(outputIndex + 3, workflowOutput.length)
              responseItem.content = workflowOutput.slice(0, outputIndex)
              updateCurrentQA({
                responseItem,
                questionId,
                placeholderAnswerId,
                questionItem,
              })
              if (outputIndex >= workflowOutput.length && workflowTypingTimerRef.current) {
                clearInterval(workflowTypingTimerRef.current)
                workflowTypingTimerRef.current = null
              }
            }, 24)
          }
        }
        setChatList(produce(getChatList(), (draft) => {
          const currentIndex = draft.findIndex(item => item.id === responseItem.id)
          draft[currentIndex] = {
            ...draft[currentIndex],
            ...responseItem,
          }
        }))
      },
      onNodeStarted: (nodeStarted: any) => {
        const eventConversationId = nodeStarted.conversation_id || nodeStarted.data?.conversation_id
        if (eventConversationId) { tempNewConversationId = eventConversationId }
        const { data } = nodeStarted
        responseItem.workflowProcess!.tracing!.push(data as any)
        setChatList(produce(getChatList(), (draft) => {
          const currentIndex = draft.findIndex(item => item.id === responseItem.id)
          draft[currentIndex] = {
            ...draft[currentIndex],
            ...responseItem,
          }
        }))
      },
      onNodeFinished: (nodeFinished: any) => {
        const eventConversationId = nodeFinished.conversation_id || nodeFinished.data?.conversation_id
        if (eventConversationId) { tempNewConversationId = eventConversationId }
        const { data } = nodeFinished
        const currentIndex = responseItem.workflowProcess!.tracing!.findIndex(item => item.node_id === data.node_id)
        responseItem.workflowProcess!.tracing[currentIndex] = data as any
        setChatList(produce(getChatList(), (draft) => {
          const currentIndex = draft.findIndex(item => item.id === responseItem.id)
          draft[currentIndex] = {
            ...draft[currentIndex],
            ...responseItem,
          }
        }))
      },
    })
  }

  const handleFeedback = async (messageId: string, feedback: Feedbacktype) => {
    await updateFeedback({ url: `/messages/${messageId}/feedbacks`, body: { rating: feedback.rating } })
    skipNextScrollRef.current = true
    const newChatList = chatList.map((item) => {
      if (item.id === messageId) {
        return {
          ...item,
          feedback,
        }
      }
      return item
    })
    setChatList(newChatList)
    notify({ type: 'success', message: t('common.api.success') })
  }

  const handleClearHistory = async () => {
    if (isResponding) {
      notify({ type: 'info', message: '请等待当前回复完成后再清空历史记录' })
      return
    }
    if (typeof window !== 'undefined' && !window.confirm('确定清空当前应用的全部历史记录吗？此操作不可撤销。')) return
    const result: any = await clearConversations()
    if (result?.error || result?.result === 'error') {
      notify({ type: 'error', message: result.error || '清空历史记录失败' })
      return
    }
    setConversationList([])
    if (typeof window !== 'undefined') window.localStorage.removeItem(attachmentCacheKey)
    setCurrConversationId('-1', APP_ID, true)
    setChatNotStarted()
    setChatList(generateNewChatListWithOpenStatement())
    notify({ type: 'success', message: '历史记录已清空' })
  }

  const renderSidebar = () => {
    if (!APP_ID || !APP_INFO || !promptConfig) { return null }
    return (
      <Sidebar
        list={conversationList}
        onCurrentIdChange={handleConversationIdChange}
        onClearHistory={handleClearHistory}
        currentId={currConversationId}
        copyRight={APP_INFO.copyright || APP_INFO.title}
      />
    )
  }

  if (appUnavailable) { return <AppUnavailable isUnknownReason={isUnknownReason} errMessage={!hasSetAppConfig ? 'Please set APP_ID and API_KEY in config/index.tsx' : ''} /> }

  if (!APP_ID || !APP_INFO || !promptConfig) { return <Loading type='app' /> }

  return (
    <div className='maiya-app-shell'>
      <Header
        title={APP_INFO.title}
        isMobile={isMobile}
        onShowSideBar={showSidebar}
        onCreateNewChat={() => handleConversationIdChange('-1')}
      />
      <div className="maiya-content-shell">
        {/* sidebar */}
        {!isMobile && renderSidebar()}
        {isMobile && isShowSidebar && (
          <div className='fixed inset-0 z-50' style={{ backgroundColor: 'rgba(35, 56, 118, 0.2)' }} onClick={hideSidebar} >
            <div className='inline-block' onClick={e => e.stopPropagation()}>
              {renderSidebar()}
            </div>
          </div>
        )}
        {/* main */}
        <div className='min-w-0 min-h-0 flex-grow flex flex-col overflow-y-auto maiya-chat-scroll'>
          {hasRequiredInputs && (
            <ConfigSence
              conversationName={conversationName}
              hasSetInputs={hasSetInputs}
              isPublicVersion={isShowPrompt}
              siteInfo={APP_INFO}
              promptConfig={promptConfig}
              onStartChat={handleStartChat}
              canEditInputs={canEditInputs}
              savedInputs={currInputs as Record<string, any>}
              onInputsChange={setCurrInputs}
            ></ConfigSence>
          )}

          {
            hasSetInputs && (
              <div className='relative grow w-full max-w-[1120px] mobile:w-full pt-10 mobile:pt-5 pb-[210px] mobile:pb-[170px] mx-auto mb-3.5' ref={chatListDomRef}>
                <Chat
                  chatList={chatList}
                  onSend={handleSend}
                  onStop={handleStop}
                  onFeedback={handleFeedback}
                  isResponding={isResponding}
                  checkCanSend={checkCanSend}
                  visionConfig={visionConfig}
                  fileConfig={fileConfig}
                />
              </div>)
          }
        </div>
      </div>
    </div>
  )
}

export default React.memo(Main)
