/**
 * Minimal DOM children patcher for live markdown preview (morphdom-lite).
 * Patches `container` children to match parsed HTML without clearing the container first.
 */
function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE
}

function isText(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE
}

function nodesCompatible(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType) return false
  if (isText(a) && isText(b)) return true
  if (isElement(a) && isElement(b)) {
    return a.tagName === b.tagName
  }
  return false
}

function syncAttributes(fromEl: Element, toEl: Element): void {
  const fromAttrs = fromEl.attributes
  for (let i = fromAttrs.length - 1; i >= 0; i--) {
    const attr = fromAttrs[i]
    if (!toEl.hasAttribute(attr.name)) {
      fromEl.removeAttribute(attr.name)
    }
  }
  for (const attr of Array.from(toEl.attributes)) {
    if (fromEl.getAttribute(attr.name) !== attr.value) {
      fromEl.setAttribute(attr.name, attr.value)
    }
  }
}

function patchNode(fromNode: Node, toNode: Node): void {
  if (isText(fromNode) && isText(toNode)) {
    if (fromNode.data !== toNode.data) {
      fromNode.data = toNode.data
    }
    return
  }
  if (!isElement(fromNode) || !isElement(toNode)) return
  syncAttributes(fromNode, toNode)
  morphdomChildren(fromNode, toNode)
}

export function morphdomChildren(container: Node, newContainer: Node): void {
  const newChildren = Array.from(newContainer.childNodes)
  let oldChild = container.firstChild
  let newIndex = 0

  while (newIndex < newChildren.length) {
    const newChild = newChildren[newIndex]

    if (!oldChild) {
      container.appendChild(newChild.cloneNode(true))
      newIndex++
      continue
    }

    if (nodesCompatible(oldChild, newChild)) {
      patchNode(oldChild, newChild)
      oldChild = oldChild.nextSibling
      newIndex++
      continue
    }

    const nextOld = oldChild.nextSibling
    if (nextOld && nodesCompatible(nextOld, newChild)) {
      if (oldChild.parentNode === container) {
        container.removeChild(oldChild)
      }
      oldChild = nextOld
      continue
    }

    const nextNew = newChildren[newIndex + 1]
    if (nextNew && nodesCompatible(oldChild, nextNew)) {
      container.insertBefore(newChild.cloneNode(true), oldChild)
      newIndex++
      continue
    }

    const replacement = newChild.cloneNode(true)
    if (oldChild.parentNode === container) {
      container.replaceChild(replacement, oldChild)
      oldChild = replacement.nextSibling
    } else {
      container.appendChild(replacement)
      oldChild = null
    }
    newIndex++
  }

  while (oldChild) {
    const next = oldChild.nextSibling
    if (oldChild.parentNode === container) {
      container.removeChild(oldChild)
    }
    oldChild = next
  }
}

export function patchElementFromHtml(container: HTMLElement, html: string): void {
  const template = document.createElement('div')
  template.innerHTML = html
  morphdomChildren(container, template)
}
