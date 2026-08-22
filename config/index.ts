import type { AppInfo } from '@/types/app'
// Do not turn missing environment variables into the literal string
// "undefined". That value is later interpreted as an upstream URL.
const envValue = (value: string | undefined) => value?.trim() || ''
export const APP_ID = envValue(process.env.NEXT_PUBLIC_APP_ID)
export const API_KEY = envValue(process.env.NEXT_PUBLIC_APP_KEY)
export const API_URL = envValue(process.env.NEXT_PUBLIC_API_URL)
export const APP_INFO: AppInfo = {
  title: '麦芽幼教 AI',
  description: '专为幼儿园教师打造的智慧教研助手',
  copyright: '麦芽幼教 AI',
  privacy_policy: '',
  default_language: 'zh-Hans',
  disable_session_same_site: false, // set it to true if you want to embed the chatbot in an iframe
}

export const isShowPrompt = false
export const promptTemplate = 'I want you to act as a javascript console.'

export const API_PREFIX = '/api'

export const LOCALE_COOKIE_NAME = 'locale'

export const DEFAULT_VALUE_MAX_LEN = 48
