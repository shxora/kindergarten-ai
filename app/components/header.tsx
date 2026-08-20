import type { FC } from 'react'
import React from 'react'
import {
  Bars3Icon,
  PencilSquareIcon,
} from '@heroicons/react/24/solid'
export interface IHeaderProps {
  title: string
  isMobile?: boolean
  onShowSideBar?: () => void
  onCreateNewChat?: () => void
}
const Header: FC<IHeaderProps> = ({
  title,
  isMobile,
  onShowSideBar,
  onCreateNewChat,
}) => {
  return (
    <header className="maiya-header">
      {isMobile
        ? (
          <div
            className='maiya-header-icon'
            onClick={() => onShowSideBar?.()}
          >
            <Bars3Icon className="h-4 w-4 text-gray-500" />
          </div>
        )
        : <div></div>}
      <div className='maiya-brand'>
        <span className='maiya-sunflower' aria-hidden="true">🌻</span>
        <div>
          <div className="maiya-brand-title">{title}</div>
          <div className="maiya-brand-subtitle">幼教智慧助手</div>
        </div>
      </div>
      {isMobile
        ? (
          <div className='maiya-header-icon' onClick={() => onCreateNewChat?.()} >
            <PencilSquareIcon className="h-4 w-4 text-gray-500" />
          </div>)
        : <div className='w-8' aria-hidden="true"></div>}
    </header>
  )
}

export default React.memo(Header)
