import {
  createContext,
  useEffect,
  useContext,
  useRef,
} from 'react'
import {
  create,
  useStore as useZustandStore,
} from 'zustand'
import type {
  FileEntity,
} from './types'

interface Shape {
  files: FileEntity[]
  setFiles: (files: FileEntity[]) => void
}

export const createFileStore = (
  value: FileEntity[] = [],
  onChange?: (files: FileEntity[]) => void,
) => {
  return create<Shape>(set => ({
    files: value ? [...value] : [],
    setFiles: (files) => {
      set({ files })
      onChange?.(files)
    },
  }))
}

type FileStore = ReturnType<typeof createFileStore>
export const FileContext = createContext<FileStore | null>(null)

export function useStore<T>(selector: (state: Shape) => T): T {
  const store = useContext(FileContext)
  if (!store) { throw new Error('Missing FileContext.Provider in the tree') }

  return useZustandStore(store, selector)
}

export const useFileStore = () => {
  return useContext(FileContext)!
}

interface FileProviderProps {
  children: React.ReactNode
  value?: FileEntity[]
  onChange?: (files: FileEntity[]) => void
}
export const FileContextProvider = ({
  children,
  value,
  onChange,
}: FileProviderProps) => {
  const storeRef = useRef<FileStore | undefined>(undefined)

  if (!storeRef.current) { storeRef.current = createFileStore(value, onChange) }

  // FileContextProvider 的 store 只创建一次；同步受控 value，确保发送后
  // 父组件 setAttachmentFiles([]) 时，上传列表也会真正清空。
  useEffect(() => {
    storeRef.current?.setState({ files: value ? [...value] : [] })
  }, [value])

  return (
    <FileContext.Provider value={storeRef.current}>
      {children}
    </FileContext.Provider>
  )
}
