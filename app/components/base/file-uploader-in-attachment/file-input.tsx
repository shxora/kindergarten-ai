import Toast from '@/app/components/base/toast'
import { useFile } from './hooks'
import { useStore } from './store'
import type { FileUpload } from './types'
import { FILE_EXTS } from './constants'
import { SupportUploadFileTypes } from './types'

interface FileInputProps {
  fileConfig: FileUpload
  acceptOverride?: string
}
const FileInput = ({
  fileConfig,
  acceptOverride,
}: FileInputProps) => {
  const files = useStore(s => s.files)
  const { handleLocalFileUpload } = useFile(fileConfig)
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetFiles = e.target.files

    if (targetFiles) {
      if (fileConfig.number_limits) {
        let rejected = 0
        for (let i = 0; i < targetFiles.length; i++) {
          if (i + 1 + files.length <= fileConfig.number_limits) {
            handleLocalFileUpload(targetFiles[i])
          }
          else {
            rejected += 1
          }
        }
        if (rejected > 0) {
          Toast.notify({
            type: 'warning',
            message: `已达到最大上传文件数 (${fileConfig.number_limits})，有 ${rejected} 个文件未上传`,
          })
        }
      }
      else {
        handleLocalFileUpload(targetFiles[0])
      }
    }
  }

  const allowedFileTypes = fileConfig.allowed_file_types
  const isCustom = allowedFileTypes?.includes(SupportUploadFileTypes.custom)
  const exts = isCustom ? (fileConfig.allowed_file_extensions || []) : (allowedFileTypes?.map(type => FILE_EXTS[type]) || []).flat().map(item => `.${item}`)
  const accept = acceptOverride || exts.join(',')

  const limitReached = !!(fileConfig.number_limits && files.length >= fileConfig.number_limits)

  return (
    <input
      className='absolute inset-0 block w-full cursor-pointer text-[0] opacity-0 disabled:cursor-not-allowed'
      onClick={e => {
        (e.target as HTMLInputElement).value = ''
        if (limitReached) {
          e.preventDefault()
          e.stopPropagation()
          Toast.notify({
            type: 'warning',
            message: `已达到最大上传文件数 (${fileConfig.number_limits})`,
          })
        }
      }}
      type='file'
      onChange={handleChange}
      accept={accept}
      multiple={!!fileConfig.number_limits && fileConfig.number_limits > 1}
    />
  )
}

export default FileInput
