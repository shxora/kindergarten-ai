import { getLocaleOnServer } from '@/i18n/server'

import './styles/globals.css'
import './styles/markdown.scss'

export const metadata = {
  title: '麦芽幼教 AI',
  icons: {
    icon: '/favicon.svg?v=2',
    shortcut: '/favicon.svg?v=2',
    apple: '/favicon.svg?v=2',
  },
}

const LocaleLayout = async ({
  children,
}: {
  children: React.ReactNode
}) => {
  const locale = await getLocaleOnServer()
  return (
    <html lang={locale ?? 'zh-Hans'} className="h-full">
      <body className="h-full">
        <div className="w-full h-full overflow-hidden">
          <div className="w-full h-full min-w-0">
            {children}
          </div>
        </div>
      </body>
    </html>
  )
}

export default LocaleLayout
