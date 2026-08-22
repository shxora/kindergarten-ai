import React from 'react'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChatBubbleOvalLeftEllipsisIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { ChatBubbleOvalLeftEllipsisIcon as ChatBubbleOvalLeftEllipsisSolidIcon } from '@heroicons/react/24/solid'
import Button from '@/app/components/base/button'
// import Card from './card'
import type { ConversationItem } from '@/types/app'

function classNames(...classes: any[]) {
  return classes.filter(Boolean).join(' ')
}

const MAX_CONVERSATION_LENTH = 20

export interface ISidebarProps {
  copyRight: string
  currentId: string
  onCurrentIdChange: (id: string) => void
  onClearHistory?: () => void
  list: ConversationItem[]
}

const Sidebar: FC<ISidebarProps> = ({
  copyRight,
  currentId,
  onCurrentIdChange,
  onClearHistory,
  list,
}) => {
  const { t } = useTranslation()
  return (
    <div
      className="maiya-sidebar shrink-0 flex flex-col overflow-y-auto pc:w-[244px] tablet:w-[192px] mobile:w-[240px] tablet:h-[calc(100vh_-_4.5rem)] mobile:h-screen"
    >
      {list.length < MAX_CONVERSATION_LENTH && (
        <div className="flex flex-shrink-0 p-4 !pb-0">
          <Button
            onClick={() => { onCurrentIdChange('-1') }}
            className="maiya-new-chat group block w-full flex-shrink-0 !justify-start !h-10 items-center text-sm"
          >
            <PencilSquareIcon className="mr-2 h-4 w-4" /> {t('app.chat.newChat')}
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between px-4 pt-4 pb-2 text-xs font-semibold text-[#a58c72] tracking-wide">
        <span>历史记录</span>
        {list.some(item => item.id !== '-1') && onClearHistory && (
          <button
            type="button"
            onClick={onClearHistory}
            className="rounded-md p-1 text-[#b9a58d] transition-colors hover:bg-[#fff4e8] hover:text-[#d87e2d]"
            title="清空历史记录"
            aria-label="清空历史记录"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-4 pb-4">
        {list.map((item) => {
          const isCurrent = item.id === currentId
          const ItemIcon
            = isCurrent ? ChatBubbleOvalLeftEllipsisSolidIcon : ChatBubbleOvalLeftEllipsisIcon
          return (
            <div
              onClick={() => onCurrentIdChange(item.id)}
              key={item.id}
              className={classNames(
                isCurrent
                  ? 'maiya-conversation-active'
                  : 'text-gray-700 hover:text-gray-700',
                'group flex min-w-0 items-center rounded-md border border-transparent hover:border-[#f7d793] px-2 py-2 text-sm font-medium cursor-pointer',
              )}
            >
              <ItemIcon
                className={classNames(
                  isCurrent
                    ? 'text-[#e58b38]'
                    : 'text-gray-400 group-hover:text-gray-500',
                  'mr-3 h-5 w-5 flex-shrink-0',
                )}
                aria-hidden="true"
              />
              <span className="truncate" title={item.name}>{item.name}</span>
            </div>
          )
        })}
      </nav>
      {/* <a className="flex flex-shrink-0 p-4" href="https://langgenius.ai/" target="_blank">
        <Card><div className="flex flex-row items-center"><ChatBubbleOvalLeftEllipsisSolidIcon className="text-primary-600 h-6 w-6 mr-2" /><span>LangGenius</span></div></Card>
      </a> */}
      <div className="flex flex-shrink-0 pr-4 pb-4 pl-4">
        <div className="text-[#a59681] font-normal text-xs">© {copyRight} {(new Date()).getFullYear()}</div>
      </div>
    </div>
  )
}

export default React.memo(Sidebar)
