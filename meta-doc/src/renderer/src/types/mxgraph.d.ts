/**
 * mxgraph 类型声明
 */
declare module 'mxgraph' {
  interface MxGraphFactoryOptions {
    mxBasePath?: string
    mxImageBasePath?: string
  }

  interface MxGraphAPI {
    mxGraph: any
    mxGraphModel: any
    mxGeometry: any
    mxConstants: any
    mxCell: any
    mxUtils: any
    mxEvent: any
    mxConnectionHandler: any
    mxEdgeHandler: any
    mxCellEditor: any
    mxRubberband: any
    mxHierarchicalLayout: any
    mxCompactTreeLayout: any
    mxFastOrganicLayout: any
    mxCircleLayout: any
    mxParallelEdgeLayout: any
    mxClient: any
    mxEventSource: any
    mxToolbar: any
    mxForm: any
  }

  function mxgraphFactory(options?: MxGraphFactoryOptions): MxGraphAPI

  export default mxgraphFactory
}

// 扩展 Window 接口，添加 mxgraph 全局变量
interface Window {
  mxLoadResources?: () => void
  mxForceIncludes?: boolean
  mxBasePath?: string
  mxImageBasePath?: string
  mxLoadStylesheets?: boolean
  mxLanguage?: string
  mxResourceExtension?: string
  mxResourcePath?: string
  mxImageExtension?: string
  mxLog?: any
  mxClient?: any
  mxGraph?: any
  mxGraphModel?: any
  // 其他 mxgraph 全局对象可以根据需要添加
}
