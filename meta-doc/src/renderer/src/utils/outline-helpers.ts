import type { DocumentOutlineNode } from '../../../types';

export function searchNode(path: string, node: DocumentOutlineNode): DocumentOutlineNode | null {
  if (!node) return null;
  if (node.path === path) {
    return node;
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = searchNode(path, child);
      if (found) return found;
    }
  }
  return null;
}

export function searchParentNode(path: string, node: DocumentOutlineNode): DocumentOutlineNode | null {
  if (!node || !Array.isArray(node.children)) {
    return null;
  }
  for (const child of node.children) {
    if (child.path === path) {
      return node;
    }
    const result = searchParentNode(path, child);
    if (result) {
      return result;
    }
  }
  return null;
}

export function countNodes(node: DocumentOutlineNode): number {
  if (!node) {
    return 0;
  }
  let count = 1;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

