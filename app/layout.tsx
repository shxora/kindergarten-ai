import { getLocaleOnServer } from '@/i18n/server'

import './styles/globals.css'
import './styles/markdown.scss'

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
