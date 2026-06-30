import { createMetaDocPlugin } from '../../host-api'

export default createMetaDocPlugin(
  {
    id: 'metadoc.examples.hello-world',
    name: 'Hello World Plugin',
    version: '1.0.0',
    entry: './hello-world',
    permissions: ['settings.read'],
    activationEvents: ['onStartup']
  },
  ({ host }) => {
    console.info('[MetaDoc Plugin] hello-world activated, host version:', host.version)
  }
)
