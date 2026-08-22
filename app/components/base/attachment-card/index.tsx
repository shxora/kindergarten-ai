'use client'

import type { FC, ReactNode } from 'react'
import cn from '@/utils/classnames'
import XClose from '@/app/components/base/icons/line/x-close'

interface AttachmentCardProps {
  name: string
  meta?: ReactNode
  previewUrl?: string
  previewAlt?: string
  icon?: ReactNode
  onPreview?: () => void
  onPreviewLoad?: () => void
  onPreviewError?: () => void
  onDelete?: () => void
  actions?: ReactNode
  overlay?: ReactNode
  className?: string
}

const AttachmentCard: FC<AttachmentCardProps> = ({
  name,
  meta,
  previewUrl,
  previewAlt,
  icon,
  onPreview,
  onPreviewLoad,
  onPreviewError,
  onDelete,
  actions,
  overlay,
  className,
}) => {
  return (
    <div className={cn(
      'maiya-upload-card relative flex h-20 items-center rounded-lg border-[0.5px] border-components-panel-border bg-components-panel-on-panel-item-bg shadow-xs',
      className,
    )}>
      <div className='flex h-12 w-12 shrink-0 items-center justify-center p-0.5'>
        {
          previewUrl ? (
            <img
              className={cn('maiya-attachment-preview-frame rounded-md border-[2px] border-effects-image-frame object-cover shadow-xs', onPreview && 'cursor-pointer')}
              alt={previewAlt || name}
              src={previewUrl}
              onLoad={onPreviewLoad}
              onError={onPreviewError}
              onClick={onPreview}
            />
          ) : (
            <div className='maiya-attachment-preview-frame flex items-center justify-center rounded-md border-[2px] border-effects-image-frame bg-components-panel-on-panel-item-bg shadow-xs'>
              {icon}
            </div>
          )
        }
      </div>
      {actions && (
        <div className='relative z-10 ml-2 flex shrink-0 items-center'>
          {actions}
        </div>
      )}
      <div className='ml-3 mr-1 w-0 min-w-0 grow'>
        <div className='mb-1 truncate text-[12px] leading-4 text-text-secondary' title={name}>
          {name}
        </div>
        <div className='text-[11px] leading-4 text-text-tertiary'>
          {meta}
        </div>
      </div>
      {overlay}
      {onDelete && (
        <button
          type='button'
          className='maiya-attachment-delete'
          aria-label='删除附件'
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
        >
          <XClose className='h-3 w-3 text-gray-500' />
        </button>
      )}
    </div>
  )
}

export default AttachmentCard
