'use client'
import type { FC } from 'react'
import React, { useEffect, useRef } from 'react'
import cn from 'classnames'
import { useTranslation } from 'react-i18next'
import Textarea from 'rc-textarea'
import Answer from './answer'
import Question from './question'
import type { FeedbackFunc } from './type'
import type { ChatItem, VisionFile, VisionSettings } from '@/types/app'
import { TransferMethod } from '@/types/app'
import Tooltip from '@/app/components/base/tooltip'
import Toast from '@/app/components/base/toast'
import ChatImageUploader from '@/app/components/base/image-uploader/chat-image-uploader'
import ImageList from '@/app/components/base/image-uploader/image-list'
import { useImageFiles } from '@/app/components/base/image-uploader/hooks'
import FileUploaderInAttachmentWrapper from '@/app/components/base/file-uploader-in-attachment'
import type { FileEntity, FileUpload } from '@/app/components/base/file-uploader-in-attachment/types'
import { getProcessedFiles } from '@/app/components/base/file-uploader-in-attachment/utils'
import { PaperAirplaneIcon, PauseIcon } from '@heroicons/react/24/solid'

export interface IChatProps {
  chatList: ChatItem[]
  /**
   * Whether to display the editing area and rating status
   */
  feedbackDisabled?: boolean
  /**
   * Whether to display the input area
   */
  isHideSendInput?: boolean
  onFeedback?: FeedbackFunc
  checkCanSend?: () => boolean
  onSend?: (message: string, files: VisionFile[]) => void
  onStop?: () => void
  useCurrentUserAvatar?: boolean
  isResponding?: boolean
  controlClearQuery?: number
  visionConfig?: VisionSettings
  fileConfig?: FileUpload
}

const Chat: FC<IChatProps> = ({
  chatList,
  feedbackDisabled = false,
  isHideSendInput = false,
  onFeedback,
  checkCanSend,
  onSend = () => { },
  onStop = () => { },
  useCurrentUserAvatar,
  isResponding,
  controlClearQuery,
  visionConfig,
  fileConfig,
}) => {
  const { t } = useTranslation()
  const { notify } = Toast
  const isUseInputMethod = useRef(false)

  const [query, setQuery] = React.useState('')
  const queryRef = useRef('')

  const handleContentChange = (e: any) => {
    const value = e.target.value
    setQuery(value)
    queryRef.current = value
  }

  const logError = (message: string) => {
    notify({ type: 'error', message, duration: 3000 })
  }

  const valid = () => {
    const query = queryRef.current
    if (!query || query.trim() === '') {
      logError(t('app.errorMessage.valueOfVarRequired'))
      return false
    }
    return true
  }

  useEffect(() => {
    if (controlClearQuery) {
      setQuery('')
      queryRef.current = ''
    }
  }, [controlClearQuery])
  const {
    files,
    onUpload,
    onRemove,
    onReUpload,
    onImageLinkLoadError,
    onImageLinkLoadSuccess,
    onClear,
  } = useImageFiles()

  const [attachmentFiles, setAttachmentFiles] = React.useState<FileEntity[]>([])

  const handleSend = () => {
    if (isResponding) {
      onStop()
      return
    }
    if (!valid() || (checkCanSend && !checkCanSend())) { return }
    const hasPendingImageUploads = files.some(file => file.progress !== -1 && file.progress < 100)
    const hasPendingAttachmentUploads = attachmentFiles.some(file => file.progress !== -1 && file.progress < 100)
    if (hasPendingImageUploads || hasPendingAttachmentUploads) {
      logError(t('app.errorMessage.waitForFileUpload'))
      return
    }
    const hasFailedImageUpload = files.some(file => (
      file.progress === -1 || (file.type === TransferMethod.local_file && !file.fileId)
    ))
    if (hasFailedImageUpload) {
      logError('图片上传失败，请删除后重新上传')
      return
    }
    // 上传失败的文件不能被静默丢弃，否则用户会看到“已发送”但 Dify 实际收到的 files 为空。
    const hasFailedAttachmentUpload = attachmentFiles.some(file => (
      file.transferMethod === TransferMethod.local_file && (!file.uploadedId || file.progress === -1)
    ))
    if (hasFailedAttachmentUpload) {
      logError('文件上传失败，请删除后重新上传')
      return
    }
    const imageFiles: VisionFile[] = files.filter(file => file.progress !== -1).map(fileItem => ({
      type: 'image',
      transfer_method: fileItem.type,
      url: fileItem.url || '',
      // Keep the local preview for the immediately rendered question. The
      // server request strips this field before sending it to Dify.
      base64Url: fileItem.base64Url,
      upload_file_id: fileItem.fileId,
    }))
    const docAndOtherFiles: VisionFile[] = getProcessedFiles(attachmentFiles)
    const combinedFiles: VisionFile[] = [...imageFiles, ...docAndOtherFiles]
    onSend(queryRef.current, combinedFiles)
    if (!files.find(item => item.type === TransferMethod.local_file && !item.fileId)) {
      if (files.length) { onClear() }
      if (!isResponding) {
        setQuery('')
        queryRef.current = ''
      }
    }
    // 文件已经通过校验并进入发送请求，立即清空输入框上方的附件列表。
    // 上传失败/未完成的文件在上面已拦截，不会被误清空。
    setAttachmentFiles([])
  }

  const handleKeyUp = (e: any) => {
    if (e.code === 'Enter') {
      e.preventDefault()
      // prevent send message when using input method enter
      if (!e.shiftKey && !isUseInputMethod.current) { handleSend() }
    }
  }

  const handleKeyDown = (e: any) => {
    isUseInputMethod.current = e.nativeEvent.isComposing
    if (e.code === 'Enter' && !e.shiftKey) {
      const result = query.replace(/\n$/, '')
      setQuery(result)
      queryRef.current = result
      e.preventDefault()
    }
  }

  const suggestionClick = (suggestion: string) => {
    setQuery(suggestion)
    queryRef.current = suggestion
    handleSend()
  }

  return (
    <div className={cn(!feedbackDisabled && 'px-3.5', 'h-full')}>
      {/* Chat List */}
      <div className="h-full space-y-[30px]">
        {chatList.map((item) => {
          if (item.isAnswer) {
            const isLast = item.id === chatList[chatList.length - 1].id
            return <Answer
              key={item.id}
              item={item}
              feedbackDisabled={feedbackDisabled}
              onFeedback={onFeedback}
              isResponding={isResponding && isLast}
              suggestionClick={suggestionClick}
            />
          }
          return (
            <Question
              key={item.id}
              id={item.id}
              content={item.content}
              useCurrentUserAvatar={useCurrentUserAvatar}
              files={item.message_files || []}
            />
          )
        })}
      </div>
      {
        !isHideSendInput && (
          <div className='fixed z-10 bottom-5 inset-x-0 pointer-events-none'>
            <div className='mx-auto max-w-[1120px] pointer-events-auto pc:pl-[282px] tablet:pl-[230px] mobile:pl-3.5 pc:pr-[26px] tablet:pr-[26px] mobile:pr-3.5'>
              {(files.length > 0 || attachmentFiles.length > 0) && (
                <div className='maiya-attachment-outside'>
                  <div className='maiya-attachment-list flex min-w-0 items-start gap-2 overflow-x-auto'>
                    {visionConfig?.enabled && (
                      <ImageList
                        list={files}
                        onRemove={onRemove}
                        onReUpload={onReUpload}
                        onImageLinkLoadSuccess={onImageLinkLoadSuccess}
                        onImageLinkLoadError={onImageLinkLoadError}
                      />
                    )}
                    {fileConfig?.enabled && (
                      <FileUploaderInAttachmentWrapper
                        fileConfig={fileConfig}
                        value={attachmentFiles}
                        onChange={setAttachmentFiles}
                        variant='media'
                        renderMode='list'
                      />
                    )}
                  </div>
                </div>
              )}
              <div className='maiya-composer p-2' data-responding={isResponding ? 'true' : 'false'}>
                <div className='flex max-h-[200px] flex-col gap-1 overflow-y-auto'>
                <Textarea
                  className={`
                    block w-full min-h-[60px] px-3 py-[9px] leading-5 text-base text-[#5d4935] bg-transparent outline-none appearance-none resize-none overflow-y-auto
                  `}
                  value={query}
                  onChange={handleContentChange}
                  onKeyUp={handleKeyUp}
                  onKeyDown={handleKeyDown}
                  autoSize
                />
                </div>
                <div className="mt-1 flex items-center justify-end gap-2 pt-1.5 pr-1">
                  <div className='flex flex-wrap items-center gap-2'>
                    {visionConfig?.enabled && (
                      <ChatImageUploader
                        settings={visionConfig}
                        onUpload={onUpload}
                        disabled={files.length >= visionConfig.number_limits}
                      />
                    )}
                    {fileConfig?.enabled && (
                      <FileUploaderInAttachmentWrapper
                        fileConfig={fileConfig}
                        value={attachmentFiles}
                        onChange={setAttachmentFiles}
                        variant='media'
                        renderMode='button'
                      />
                    )}
                  </div>
                  <Tooltip
                    selector='send-tip'
                    htmlContent={isResponding ? <div>暂停生成</div> : (
                      <div>
                        <div>{t('common.operation.send')} Enter</div>
                        <div>{t('common.operation.lineBreak')} Shift Enter</div>
                      </div>
                    )}
                  >
                    {isResponding ? (
                      <button type='button' className='maiya-send-button maiya-stop-button' aria-label='暂停生成' onClick={onStop}>
                        <PauseIcon className='w-4 h-4' />
                      </button>
                    ) : (
                      <button type='button' className='maiya-send-button' aria-label='发送消息' onClick={handleSend}>
                        <PaperAirplaneIcon className='w-4 h-4' />
                      </button>
                    )}
                  </Tooltip>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </div>
  )
}

export default React.memo(Chat)
