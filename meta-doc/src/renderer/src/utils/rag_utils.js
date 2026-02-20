import { getSetting } from './settings.js'
import { waitForService } from './service-status.ts'
import { webMainCalls } from './web-adapter/web-main-calls.js'
import messageBridge from '../bridge/message-bridge'

if (typeof window !== 'undefined' && !window.electron?.ipcRenderer) {
  webMainCalls()
}

export async function queryKnowledgeBase(question, scoreThreshold) {
  await waitForService('rag')
  if (scoreThreshold === undefined) {
    scoreThreshold = await getSetting('knowledgeBaseScoreThreshold')
  }
  const response = await messageBridge.invoke('query-knowledge-base', { question, scoreThreshold })
  return response
}
