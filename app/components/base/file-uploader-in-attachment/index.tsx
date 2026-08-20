import {
  useCallback,
} from 'react'
import {
  RiLink,
  RiUploadCloud2Line,
} from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { useFile } from './hooks'
import type { FileEntity, FileUpload } from './types'
import FileFromLinkOrLocal from './file-from-link-or-local'
import {
  FileContextProvider,
  useStore,
} from './store'
import FileInput from './file-input'
import FileItem from './file-item'
import Button from '@/app/components/base/button'
import cn from '@/utils/classnames'
import { TransferMethod } from '@/types/app'

interface Option {
  value: string
  label: string
  icon: JSX.Element
}
interface FileUploaderInAttachmentProps {
  fileConfig: FileUpload
  variant?: 'default' | 'media'
}
const FileUploaderInAttachment = ({
  fileConfig,
  variant = 'default',
}: FileUploaderInAttachmentProps) => {
  const { t } = useTranslation()
  const files = useStore(s => s.files)
  const {
    handleRemoveFile,
    handleReUploadFile,
  } = useFile(fileConfig)
  const options = [
    {
      value: TransferMethod.local_file,
      label: t('common.fileUploader.uploadFromComputer'),
      icon: <RiUploadCloud2Line className='h-4 w-4' />,
    },
    {
      value: TransferMethod.remote_url,
      label: t('common.fileUploader.pasteFileLink'),
      icon: <RiLink className='h-4 w-4' />,
    },
  ]

  const renderButton = useCallback((option: Option, open?: boolean) => {
    return (
      <Button
        key={option.value}
        // variant='tertiary'
        className={cn('relative grow', open && 'bg-components-button-tertiary-bg-hover')}
        disabled={!!(fileConfig.number_limits && files.length >= fileConfig.number_limits)}
      >
        {option.icon}
        <span className='ml-1'>{option.label}</span>
        {
          option.value === TransferMethod.local_file && (
            <FileInput fileConfig={fileConfig} />
          )
        }
      </Button>
    )
  }, [fileConfig, files.length])
  const renderTrigger = useCallback((option: Option) => {
    return (open: boolean) => renderButton(option, open)
  }, [renderButton])
  const renderOption = useCallback((option: Option) => {
    if (option.value === TransferMethod.local_file && fileConfig?.allowed_file_upload_methods?.includes(TransferMethod.local_file)) { return renderButton(option) }

    if (option.value === TransferMethod.remote_url && fileConfig?.allowed_file_upload_methods?.includes(TransferMethod.remote_url)) {
      return (
        <FileFromLinkOrLocal
          key={option.value}
          showFromLocal={false}
          trigger={renderTrigger(option)}
          fileConfig={fileConfig}
        />
      )
    }
  }, [renderButton, renderTrigger, fileConfig])

  if (variant === 'media') {
    const canUploadLocal = fileConfig.allowed_file_upload_methods?.includes(TransferMethod.local_file)
    return (
      <div className='maiya-file-area'>
        {canUploadLocal && (
          <div className='maiya-media-button maiya-audio-button relative flex items-center justify-center h-9 px-3 rounded-full cursor-pointer'>
            <span className='text-base leading-none'>🎙️</span><span>语音</span>
            <FileInput fileConfig={fileConfig} acceptOverride='.mp3,.m4a,.wav,.aac,.ogg,.flac' />
          </div>
        )}
        {canUploadLocal && (
          <div className='maiya-media-button maiya-file-button relative flex items-center justify-center h-9 px-3 rounded-full cursor-pointer'>
            <span className='text-base leading-none'>📄</span><span>教研文件</span>
            <FileInput fileConfig={fileConfig} acceptOverride='.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md' />
          </div>
        )}
        <div className='maiya-uploaded-files'>
          {files.map(file => (
            <FileItem key={file.id} file={file} showDeleteAction showDownloadAction={false} onRemove={() => handleRemoveFile(file.id)} onReUpload={() => handleReUploadFile(file.id)} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className='flex items-center space-x-1'>
        {options.map(renderOption)}
      </div>
      <div className='mt-1 space-y-1'>
        {
          files.map(file => (
            <FileItem
              key={file.id}
              file={file}
              showDeleteAction
              showDownloadAction={false}
              onRemove={() => handleRemoveFile(file.id)}
              onReUpload={() => handleReUploadFile(file.id)}
            />
          ))
        }
      </div>
    </div>
  )
}

interface FileUploaderInAttachmentWrapperProps {
  value?: FileEntity[]
  onChange: (files: FileEntity[]) => void
  fileConfig: FileUpload
  variant?: 'default' | 'media'
}
const FileUploaderInAttachmentWrapper = ({
  value,
  onChange,
  fileConfig,
  variant,
}: FileUploaderInAttachmentWrapperProps) => {
  return (
    <FileContextProvider
      value={value}
      onChange={onChange}
    >
      <FileUploaderInAttachment fileConfig={fileConfig} variant={variant} />
    </FileContextProvider>
  )
}

export default FileUploaderInAttachmentWrapper
