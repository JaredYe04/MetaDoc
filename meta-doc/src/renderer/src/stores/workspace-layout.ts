/**
 * 工作区分屏布局树（与扁平 tabs[] 并行；经典模式压成单组，工作区模式多窗格）
 */

export type LayoutDirection = 'row' | 'col'

export interface LayoutTabGroup {
  type: 'group'
  id: string
  tabIds: string[]
  activeTabId: string
}

export interface LayoutSplit {
  type: 'split'
  id: string
  direction: LayoutDirection
  /** 第一个子节点所占比例 0~1 */
  ratio: number
  children: [LayoutNode, LayoutNode]
}

export type LayoutNode = LayoutTabGroup | LayoutSplit

export function isLayoutTabGroup(n: LayoutNode): n is LayoutTabGroup {
  return n.type === 'group'
}

export function isLayoutSplit(n: LayoutNode): n is LayoutSplit {
  return n.type === 'split'
}

export function findSplitById(root: LayoutNode, splitId: string): LayoutSplit | null {
  if (isLayoutSplit(root)) {
    if (root.id === splitId) return root
    return findSplitById(root.children[0], splitId) ?? findSplitById(root.children[1], splitId)
  }
  return null
}

function genLayoutId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createEmptyGroup(): LayoutTabGroup {
  return { type: 'group', id: genLayoutId('group'), tabIds: [], activeTabId: '' }
}

export function createSplit(
  direction: LayoutDirection,
  first: LayoutNode,
  second: LayoutNode,
  ratio = 0.5
): LayoutSplit {
  return {
    type: 'split',
    id: genLayoutId('split'),
    direction,
    ratio: Math.min(0.9, Math.max(0.1, ratio)),
    children: [first, second]
  }
}

/** 遍历所有 TabGroup */
export function forEachGroup(root: LayoutNode, fn: (g: LayoutTabGroup) => void): void {
  if (isLayoutTabGroup(root)) {
    fn(root)
    return
  }
  forEachGroup(root.children[0], fn)
  forEachGroup(root.children[1], fn)
}

export function findGroupContainingTab(root: LayoutNode, tabId: string): LayoutTabGroup | null {
  let found: LayoutTabGroup | null = null
  forEachGroup(root, (g) => {
    if (g.tabIds.includes(tabId)) found = g
  })
  return found
}

export function findGroupByLayoutId(root: LayoutNode, layoutGroupId: string): LayoutTabGroup | null {
  let found: LayoutTabGroup | null = null
  forEachGroup(root, (g) => {
    if (g.id === layoutGroupId) found = g
  })
  return found
}

export function collectTabIdsInLayout(root: LayoutNode): Set<string> {
  const s = new Set<string>()
  forEachGroup(root, (g) => {
    for (const id of g.tabIds) s.add(id)
  })
  return s
}

/** 顶栏「工作台」合成标签：多分屏或布局内 ≥2 个标签时显示 */
export function layoutQualifiesForWorkbenchMainTab(root: LayoutNode): boolean {
  if (isLayoutSplit(root)) return true
  return collectTabIdsInLayout(root).size >= 2
}

/** 深度优先：第一个 TabGroup */
export function findFirstGroup(root: LayoutNode): LayoutTabGroup | null {
  if (isLayoutTabGroup(root)) return root
  const a = findFirstGroup(root.children[0])
  if (a) return a
  return findFirstGroup(root.children[1])
}

function cloneNode(node: LayoutNode): LayoutNode {
  if (isLayoutTabGroup(node)) {
    return {
      type: 'group',
      id: node.id,
      tabIds: [...node.tabIds],
      activeTabId: node.activeTabId
    }
  }
  return {
    type: 'split',
    id: node.id,
    direction: node.direction,
    ratio: node.ratio,
    children: [cloneNode(node.children[0]), cloneNode(node.children[1])]
  }
}

/** 剪掉空组、单枝提升；修正组内 activeTabId */
export function pruneLayout(node: LayoutNode): LayoutNode | null {
  if (isLayoutTabGroup(node)) {
    const tabIds = node.tabIds.filter(Boolean)
    if (tabIds.length === 0) return null
    let activeTabId = node.activeTabId
    if (!activeTabId || !tabIds.includes(activeTabId)) {
      activeTabId = tabIds[0] ?? ''
    }
    return { type: 'group', id: node.id, tabIds, activeTabId }
  }
  const a = pruneLayout(node.children[0])
  const b = pruneLayout(node.children[1])
  if (!a && !b) return null
  if (!a) return b
  if (!b) return a
  return {
    type: 'split',
    id: node.id,
    direction: node.direction,
    ratio: node.ratio,
    children: [a, b]
  }
}

export interface DocumentTabOrder {
  id: string
  /** 在全局 tabs 数组中的索引，用于插入顺序 */
  orderIndex: number
}

/** 经典模式：强制单组，与全局 tabs 中文档顺序一致 */
export function collapseLayoutToSingleGroup(
  documentTabs: DocumentTabOrder[],
  globalActiveTabId: string
): LayoutTabGroup {
  const sorted = [...documentTabs].sort((a, b) => a.orderIndex - b.orderIndex)
  const tabIds = sorted.map((d) => d.id)
  let activeTabId = globalActiveTabId
  if (!activeTabId || !tabIds.includes(activeTabId)) {
    activeTabId = tabIds[0] ?? ''
  }
  return {
    type: 'group',
    id: genLayoutId('group'),
    tabIds,
    activeTabId
  }
}

/**
 * 与当前窗口可布局 tabs 对齐：每个 id 恰好出现在一个组中；移除已关闭 tab；合并空窗格
 */
export function reconcileDocumentLayout(
  root: LayoutNode,
  documentTabs: DocumentTabOrder[],
  globalActiveTabId: string
): LayoutNode {
  let next = cloneNode(root)
  const docIdSet = new Set(documentTabs.map((d) => d.id))
  const orderMap = new Map(documentTabs.map((d) => [d.id, d.orderIndex]))

  forEachGroup(next, (g) => {
    g.tabIds = g.tabIds.filter((id) => docIdSet.has(id))
    if (g.activeTabId && !g.tabIds.includes(g.activeTabId)) {
      g.activeTabId = g.tabIds[0] ?? ''
    }
  })

  const inLayout = collectTabIdsInLayout(next)
  const missing = documentTabs
    .filter((d) => !inLayout.has(d.id))
    .sort((a, b) => a.orderIndex - b.orderIndex)

  if (missing.length > 0) {
    const activeIsDoc = docIdSet.has(globalActiveTabId)
    let target =
      activeIsDoc ? findGroupContainingTab(next, globalActiveTabId) : null
    if (!target) {
      const first = findFirstGroup(next)
      if (first && first.tabIds.length === 0 && missing.length > 0) {
        target = first
      } else if (first) {
        target = first
      }
    }
    if (!target) {
      next = createEmptyGroup()
      target = next as LayoutTabGroup
    }
    for (const m of missing) {
      if (!target.tabIds.includes(m.id)) {
        target.tabIds.push(m.id)
      }
    }
    if (!target.activeTabId && target.tabIds.length > 0) {
      target.activeTabId = globalActiveTabId && target.tabIds.includes(globalActiveTabId)
        ? globalActiveTabId
        : target.tabIds[0]!
    }
  }

  // 组内 tab 顺序与全局 tabs 顺序一致
  forEachGroup(next, (g) => {
    if (g.tabIds.length <= 1) return
    g.tabIds.sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0))
  })

  const pruned = pruneLayout(next)
  if (!pruned) {
    return createEmptyGroup()
  }
  return pruned
}

/** 激活某文档 tab 时，将其所在组的 activeTabId 设为该 tab */
export function setGroupActiveTab(root: LayoutNode, tabId: string): void {
  const g = findGroupContainingTab(root, tabId)
  if (g && g.tabIds.includes(tabId)) {
    g.activeTabId = tabId
  }
}

/**
 * 将 tabId 从当前组移到目标组（若目标即当前组则仅调整顺序可选，此处不处理顺序）
 * @returns 是否成功
 */
export function moveTabBetweenGroups(
  root: LayoutNode,
  tabId: string,
  targetGroupId: string,
  insertBeforeTabId: string | null
): boolean {
  const source = findGroupContainingTab(root, tabId)
  if (!source) return false
  let target: LayoutTabGroup | null = null
  forEachGroup(root, (g) => {
    if (g.id === targetGroupId) target = g
  })
  if (!target || source === target) return false

  source.tabIds = source.tabIds.filter((id) => id !== tabId)
  if (source.activeTabId === tabId) {
    source.activeTabId = source.tabIds[0] ?? ''
  }

  const idx = insertBeforeTabId ? target.tabIds.indexOf(insertBeforeTabId) : -1
  if (idx >= 0) {
    target.tabIds.splice(idx, 0, tabId)
  } else {
    target.tabIds.push(tabId)
  }
  target.activeTabId = tabId
  return true
}

/**
 * 将尚不在布局树中的 Tab（如顶栏 workspacePlacement=top）插入某组。
 * 若 tab 已在任一组内则返回 false，应改用 moveTabBetweenGroups。
 */
export function insertTabIntoGroupFromOutside(
  root: LayoutNode,
  tabId: string,
  targetGroupId: string,
  insertBeforeTabId: string | null
): boolean {
  if (findGroupContainingTab(root, tabId)) return false
  let target: LayoutTabGroup | null = null
  forEachGroup(root, (g) => {
    if (g.id === targetGroupId) target = g
  })
  if (!target) return false
  if (target.tabIds.includes(tabId)) return false
  const idx = insertBeforeTabId ? target.tabIds.indexOf(insertBeforeTabId) : -1
  if (idx >= 0) {
    target.tabIds.splice(idx, 0, tabId)
  } else {
    target.tabIds.push(tabId)
  }
  target.activeTabId = tabId
  return true
}

/** 同组内重排 */
export function reorderTabInGroup(root: LayoutNode, tabId: string, beforeTabId: string | null): boolean {
  const g = findGroupContainingTab(root, tabId)
  if (!g) return false
  const from = g.tabIds.indexOf(tabId)
  if (from < 0) return false
  g.tabIds.splice(from, 1)
  if (beforeTabId == null) {
    g.tabIds.push(tabId)
  } else {
    const to = g.tabIds.indexOf(beforeTabId)
    if (to < 0) {
      g.tabIds.push(tabId)
    } else {
      g.tabIds.splice(to, 0, tabId)
    }
  }
  return true
}

export type SplitEdge = 'left' | 'right' | 'top' | 'bottom'

/**
 * 将 draggedTabId 从原组拆出，在「含 targetTabId 的组」旁新建一组（不可变，返回新树）
 */
export function splitTabOutFromTarget(
  root: LayoutNode,
  draggedTabId: string,
  targetTabId: string,
  edge: SplitEdge
): LayoutNode | null {
  const targetGroup = findGroupContainingTab(root, targetTabId)
  const sourceGroup = findGroupContainingTab(root, draggedTabId)
  if (!targetGroup || !sourceGroup || !sourceGroup.tabIds.includes(draggedTabId)) return null

  let next = cloneNode(root)

  const sg = findGroupByLayoutId(next, sourceGroup.id)
  if (!sg) return null
  sg.tabIds = sg.tabIds.filter((id) => id !== draggedTabId)
  if (sg.activeTabId === draggedTabId) {
    sg.activeTabId = sg.tabIds[0] ?? ''
  }

  const tg = findGroupByLayoutId(next, targetGroup.id)
  if (!tg) return null

  const newGroup: LayoutTabGroup = {
    type: 'group',
    id: genLayoutId('group'),
    tabIds: [draggedTabId],
    activeTabId: draggedTabId
  }

  const direction: LayoutDirection =
    edge === 'left' || edge === 'right' ? 'row' : 'col'
  const newFirst = edge === 'left' || edge === 'top'
  const tgClone = cloneNode(tg) as LayoutTabGroup
  const split = createSplit(
    direction,
    newFirst ? newGroup : tgClone,
    newFirst ? tgClone : newGroup,
    0.5
  )

  const replaced = replaceGroupByIdImmutable(next, tg.id, split)
  return pruneLayout(replaced)
}

function replaceGroupByIdImmutable(
  node: LayoutNode,
  targetGroupId: string,
  replacement: LayoutNode
): LayoutNode {
  if (isLayoutTabGroup(node)) {
    if (node.id === targetGroupId) return replacement
    return node
  }
  const left = replaceGroupByIdImmutable(node.children[0], targetGroupId, replacement)
  const right = replaceGroupByIdImmutable(node.children[1], targetGroupId, replacement)
  if (left === node.children[0] && right === node.children[1]) return node
  return {
    type: 'split',
    id: node.id,
    direction: node.direction,
    ratio: node.ratio,
    children: [left, right]
  }
}
