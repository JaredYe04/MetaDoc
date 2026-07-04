import eventBus from './event-bus'

/** GitHub Issues 新建页（开源版反馈入口） */
export const GITHUB_ISSUES_NEW_URL = 'https://github.com/JaredYe04/MetaDoc/issues/new'

export function openGithubIssuesNew(): void {
  eventBus.emit('open-link', GITHUB_ISSUES_NEW_URL)
}
