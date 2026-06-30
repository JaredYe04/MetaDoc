/**
 * 主进程 IPC 注册入口：与 openDoc、主题等共享代码同处 main-calls 模块，
 * 后续可将各 bind* 拆入本目录子模块并在 registerMainProcessIpc 内按需 dynamic import。
 */
import { mainCalls } from '../main-calls'
import { registerSteamIpc } from '@metadoc/register-steam-ipc'
import { registerFileAssociationIpc } from './register-file-association-ipc'
import { registerCommunityPluginsIpc } from './register-community-plugins-ipc'
import { registerUserTemplatesIpc } from '../user-templates/user-templates-ipc'

export function registerMainProcessIpc(): void {
  registerSteamIpc()
  registerUserTemplatesIpc()
  registerFileAssociationIpc()
  registerCommunityPluginsIpc()
  mainCalls()
}
