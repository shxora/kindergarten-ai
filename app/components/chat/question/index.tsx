'use client'
import type { FC } from 'react'
import React from 'react'
import type { IChatItem } from '../type'
import s from '../style.module.css'

import StreamdownMarkdown from '@/app/components/base/streamdown-markdown'
import ImageGallery from '@/app/components/base/image-gallery'
import FileTypeIcon from '@/app/components/base/file-uploader-in-attachment/file-type-icon'
import { getFileAppearanceType } from '@/app/components/base/file-uploader-in-attachment/utils'
import { FileAppearanceTypeEnum } from '@/app/components/base/file-uploader-in-attachment/types'
import type { VisionFile } from '@/types/app'

type IQuestionProps = Pick<IChatItem, 'id' | 'content' | 'useCurrentUserAvatar'> & { files?: VisionFile[] }

const Question: FC<IQuestionProps> = ({ id, content, useCurrentUserAvatar, files = [] }) => {
  const userName = ''
  // 通过 URL/base64/文件名判断是否为图片（ImageFile.type 是 TransferMethod，不是字面量 'image'）
  const isImageFile = (file: VisionFile & { filename?: string, name?: string }) => {
    if (file.url && file.url.startsWith('data:image')) return true
    if (file.base64Url) return true
    if (file.type === FileAppearanceTypeEnum.image) return true
    if (file.filename) {
      const lower = file.filename.toLowerCase()
      return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lower)
    }
    return false
  }
  // 优先用 url（远程），没有就回退到 base64Url（本地 data URL）
  const getImagePreviewUrl = (file: VisionFile & { filename?: string, name?: string }) => file.url || file.base64Url || ''
  const imageFiles = files.filter(file => isImageFile(file) && !!getImagePreviewUrl(file))
  const otherFiles = files.filter(file => !imageFiles.includes(file)) as Array<VisionFile & { filename?: string, name?: string }>
  const getIconType = (file: VisionFile & { filename?: string, name?: string }) => {
    if (Object.values(FileAppearanceTypeEnum).includes(file.type as FileAppearanceTypeEnum)) return file.type as keyof typeof FileAppearanceTypeEnum
    return getFileAppearanceType(file.filename || file.name || '', file.type)
  }
  return (
    <div className='flex items-start justify-end' key={id}>
      <div>
        <div className={`${s.question} relative text-sm text-gray-900`}>
          <div
            className={'maiya-question-card mr-2 py-3 px-4 rounded-tl-2xl rounded-b-2xl'}
          >
            {imageFiles.length > 0 && (
              <ImageGallery srcs={imageFiles.map(file => getImagePreviewUrl(file))} />
            )}
            {otherFiles.length > 0 && (
              <div className='mb-2 flex max-w-full flex-wrap gap-1.5'>
                {otherFiles.map((file, index) => (
                  <div key={`${file.upload_file_id || file.url}-${index}`} className='flex max-w-[160px] items-center rounded-lg border border-white/60 bg-white/55 px-1.5 py-0.5 text-[11px] text-[#5d4935]' title={file.filename || file.name || file.upload_file_id}>
                    <FileTypeIcon
                      type={getIconType(file)}
                      size='sm'
                      className='mr-1 shrink-0'
                    />
                    <span className='truncate'>{file.filename || file.name || '已上传文件'}</span>
                  </div>
                ))}
              </div>
            )}
            <StreamdownMarkdown content={content} />
          </div>
        </div>
      </div>
      {useCurrentUserAvatar
        ? (
          <div className='w-10 h-10 shrink-0 leading-10 text-center mr-2 rounded-full bg-primary-600 text-white'>
            {userName?.[0].toLocaleUpperCase()}
          </div>
        )
        : (
          <div className={`${s.questionIcon} w-10 h-10 shrink-0 `}></div>
        )}
    </div>
  )
}

export default React.memo(Question)
