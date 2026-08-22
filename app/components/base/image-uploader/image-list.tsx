import type { FC } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Loading02 from '@/app/components/base/icons/line/loading-02'
import RefreshCcw01 from '@/app/components/base/icons/line/refresh-ccw-01'
import AlertTriangle from '@/app/components/base/icons/solid/alert-triangle'
import TooltipPlus from '@/app/components/base/tooltip-plus'
import type { ImageFile } from '@/types/app'
import { TransferMethod } from '@/types/app'
import ImagePreview from '@/app/components/base/image-uploader/image-preview'
import AttachmentCard from '@/app/components/base/attachment-card'
import { formatFileSize } from '@/utils/format'

interface ImageListProps {
  list: ImageFile[]
  readonly?: boolean
  onRemove?: (imageFileId: string) => void
  onReUpload?: (imageFileId: string) => void
  onImageLinkLoadSuccess?: (imageFileId: string) => void
  onImageLinkLoadError?: (imageFileId: string) => void
}

const ImageList: FC<ImageListProps> = ({
  list,
  readonly,
  onRemove,
  onReUpload,
  onImageLinkLoadSuccess,
  onImageLinkLoadError,
}) => {
  const { t } = useTranslation()
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')

  const handleImageLinkLoadSuccess = (item: ImageFile) => {
    if (item.type === TransferMethod.remote_url && onImageLinkLoadSuccess && item.progress !== -1) { onImageLinkLoadSuccess(item._id) }
  }
  const handleImageLinkLoadError = (item: ImageFile) => {
    if (item.type === TransferMethod.remote_url && onImageLinkLoadError) { onImageLinkLoadError(item._id) }
  }
  const uploadingItems = list.filter(item => item.progress >= 0 && item.progress < 100)
  const uploadProgress = uploadingItems.length
    ? Math.round(uploadingItems.reduce((total, item) => total + item.progress, 0) / uploadingItems.length)
    : 0

  return (
    <div className='flex flex-wrap gap-2'>
      {list.map((item) => {
        const previewSrc = item.type === TransferMethod.remote_url ? item.url : item.base64Url
        const imageName = item.file?.name || (item.url ? item.url.split('/').pop()?.split('?')[0] : '') || '图片'
        const imageSize = item.file?.size ? formatFileSize(item.file.size) : ''
        const overlay = item.type === TransferMethod.local_file && item.progress === -1
          ? <RefreshCcw01 className='absolute left-5 top-6 z-10 h-5 w-5 text-white' onClick={() => onReUpload?.(item._id)} />
          : item.type === TransferMethod.remote_url && item.progress !== 100
            ? (
              <div className={`absolute inset-0 z-[1] flex items-center justify-center rounded-lg border ${item.progress === -1 ? 'bg-[#FEF0C7] border-[#DC6803]' : 'bg-black/[0.16] border-transparent'}`}>
                {item.progress > -1 && <Loading02 className='h-5 w-5 animate-spin text-white' />}
                {item.progress === -1 && (
                  <TooltipPlus popupContent={t('common.imageUploader.pasteImageLinkInvalid')}>
                    <AlertTriangle className='h-4 w-4 text-[#DC6803]' />
                  </TooltipPlus>
                )}
              </div>
            )
            : undefined

        return (
          <AttachmentCard
            key={item._id}
            name={imageName}
            meta={<>图片{imageSize ? ` · ${imageSize}` : ''}</>}
            previewUrl={previewSrc || undefined}
            previewAlt={imageName}
            onPreviewLoad={() => handleImageLinkLoadSuccess(item)}
            onPreviewError={() => handleImageLinkLoadError(item)}
            onPreview={() => item.progress === 100 && setImagePreviewUrl(previewSrc as string)}
            onDelete={!readonly ? () => onRemove?.(item._id) : undefined}
            overlay={overlay}
          />
        )
      })}
      {uploadingItems.length > 0 && (
        <div className='maiya-image-upload-progress' role='progressbar' aria-label='图片上传进度'>
          <div className='maiya-image-upload-progress-bar' style={{ width: `${uploadProgress}%` }} />
        </div>
      )}
      {imagePreviewUrl && (
        <ImagePreview
          url={imagePreviewUrl}
          onCancel={() => setImagePreviewUrl('')}
        />
      )}
    </div>
  )
}

export default ImageList
