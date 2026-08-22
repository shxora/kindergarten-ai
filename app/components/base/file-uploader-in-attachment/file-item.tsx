import {
  memo,
  useState,
} from 'react'
import {
  RiDownloadLine,
  RiEyeLine,
} from '@remixicon/react'
import FileTypeIcon from './file-type-icon'
import type { FileEntity } from './types'
import {
  downloadFile,
  getFileAppearanceType,
  getFileExtension,
} from './utils'
import { SupportUploadFileTypes } from './types'
import ActionButton from '@/app/components/base/action-button'
import AttachmentCard from '@/app/components/base/attachment-card'
import { formatFileSize } from '@/utils/format'
import ReplayLine from '@/app/components/base/icons/other/ReplayLine'
import ImagePreview from '@/app/components/base/image-uploader/image-preview'

interface FileInAttachmentItemProps {
  file: FileEntity
  showDeleteAction?: boolean
  showDownloadAction?: boolean
  onRemove?: (fileId: string) => void
  onReUpload?: (fileId: string) => void
  canPreview?: boolean
}

const FileInAttachmentItem = ({
  file,
  showDeleteAction,
  showDownloadAction = true,
  onRemove,
  onReUpload,
  canPreview,
}: FileInAttachmentItemProps) => {
  const { id, name, type, progress, supportFileType, base64Url, url, isRemote } = file
  const ext = getFileExtension(name, type, isRemote)
  const isImageFile = supportFileType === SupportUploadFileTypes.image
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')

  const meta = (
    <>
      {ext && <span>{ext.toLowerCase()}</span>}
      {ext && <span className='system-2xs-medium mx-1'>·</span>}
      {!!file.size && <span>{formatFileSize(file.size)}</span>}
    </>
  )

  const hasActions = progress === -1 || (canPreview && isImageFile) || showDownloadAction
  const actions = hasActions ? (
    <>
      {progress === -1 && (
        <ActionButton
          className='mr-1'
          onClick={() => onReUpload?.(id)}
        >
          <ReplayLine className='h-4 w-4 text-text-tertiary' />
        </ActionButton>
      )}
      {canPreview && isImageFile && (
        <ActionButton className='mr-1' onClick={() => setImagePreviewUrl(url || '')}>
          <RiEyeLine className='h-4 w-4' />
        </ActionButton>
      )}
      {showDownloadAction && (
        <ActionButton onClick={(event) => {
          event.stopPropagation()
          downloadFile(url || base64Url || '', name)
        }}>
          <RiDownloadLine className='h-4 w-4' />
        </ActionButton>
      )}
    </>
  ) : undefined

  return (
    <>
      <AttachmentCard
        name={name}
        meta={meta}
        previewUrl={base64Url || url || undefined}
        previewAlt={name}
        icon={<FileTypeIcon type={getFileAppearanceType(name, type)} size='lg' className='!h-7 !w-7' />}
        onDelete={showDeleteAction ? () => onRemove?.(id) : undefined}
        actions={actions}
        className={progress === -1 ? 'border-state-destructive-border bg-state-destructive-hover' : undefined}
      />
      {imagePreviewUrl && canPreview && (
        <ImagePreview
          url={imagePreviewUrl}
          onCancel={() => setImagePreviewUrl('')}
        />
      )}
    </>
  )
}

export default memo(FileInAttachmentItem)
