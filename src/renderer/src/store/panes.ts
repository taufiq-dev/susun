// The tab area's layout: a tree whose leaves are panes, each with its own tabs, and whose inner
// nodes (splits) share their space between their children side by side ('row') or one above
// another ('column'), as VS Code's editor groups do. Pure functions over immutable trees; the tabs
// store holds the tree.

export interface Pane {
  type: 'pane'
  id: string
  // In tab bar order.
  tabIds: string[]
  activeId: string | null
}

export interface Split {
  type: 'split'
  id: string
  direction: 'row' | 'column'
  // At least two. A child split never has its parent's direction: it would be merged into it.
  children: LayoutNode[]
  // Each child's share of the split's width (row) or height (column), summing to 1.
  sizes: number[]
}

export type LayoutNode = Pane | Split

// Where a new pane goes, next to an existing one.
export type Side = 'left' | 'right' | 'up' | 'down'

export function newPane(tabIds: string[] = []): Pane {
  return { type: 'pane', id: crypto.randomUUID(), tabIds, activeId: tabIds[0] ?? null }
}

// The panes in reading order: left to right, and top to bottom.
export function panesOf(node: LayoutNode): Pane[] {
  return node.type === 'pane' ? [node] : node.children.flatMap(panesOf)
}

export function findPane(root: LayoutNode, paneId: string): Pane | undefined {
  return panesOf(root).find((p) => p.id === paneId)
}

export function paneOfTab(root: LayoutNode, tabId: string): Pane | undefined {
  return panesOf(root).find((p) => p.tabIds.includes(tabId))
}

// Rebuilds a split from new children, keeping it (and so React state below it) if none changed.
function withChildren(split: Split, children: LayoutNode[]): Split {
  return children.every((c, i) => c === split.children[i]) ? split : { ...split, children }
}

export function updatePane(
  node: LayoutNode,
  paneId: string,
  update: (pane: Pane) => Pane
): LayoutNode {
  if (node.type === 'pane') return node.id === paneId ? update(node) : node
  return withChildren(
    node,
    node.children.map((c) => updatePane(c, paneId, update))
  )
}

// Puts `pane` on `side` of the pane `targetId`. As VS Code does by default, the new pane takes half
// of the target's space, except that in a split whose children are all the same size, it makes
// one more child of that size.
export function insertPane(node: LayoutNode, targetId: string, side: Side, pane: Pane): LayoutNode {
  const direction = side === 'left' || side === 'right' ? 'row' : 'column'
  const before = side === 'left' || side === 'up'
  if (node.type === 'pane') {
    if (node.id !== targetId) return node
    return {
      type: 'split',
      id: crypto.randomUUID(),
      direction,
      children: before ? [pane, node] : [node, pane],
      sizes: [0.5, 0.5]
    }
  }
  const index = node.children.findIndex((c) => c.type === 'pane' && c.id === targetId)
  // Beside a pane in a split of the same direction, the new pane is one more child.
  if (index !== -1 && node.direction === direction) {
    const children = [...node.children]
    children.splice(before ? index : index + 1, 0, pane)
    const even = node.sizes.every((s) => Math.abs(s - node.sizes[0]) < 1e-6)
    const sizes = [...node.sizes]
    sizes.splice(index, 1, sizes[index] / 2, sizes[index] / 2)
    return { ...node, children, sizes: even ? children.map(() => 1 / children.length) : sizes }
  }
  return withChildren(
    node,
    node.children.map((c) => insertPane(c, targetId, side, pane))
  )
}

function normalized(sizes: number[]): number[] {
  const total = sizes.reduce((a, b) => a + b, 0)
  return sizes.map((s) => s / total)
}

// Removes the pane; the others in its split share its space. A split left with one child is
// replaced by that child, and a split left inside one of the same direction is merged into it.
// The last pane can't be removed.
export function removePane(root: LayoutNode, paneId: string): LayoutNode {
  if (root.type === 'pane') return root
  return without(root, paneId)
}

function without(split: Split, paneId: string): LayoutNode {
  const children: LayoutNode[] = []
  const sizes: number[] = []
  split.children.forEach((child, i) => {
    if (child.type === 'pane' && child.id === paneId) return
    const next = child.type === 'split' ? without(child, paneId) : child
    if (next.type === 'split' && next.direction === split.direction) {
      children.push(...next.children)
      sizes.push(...next.sizes.map((s) => s * split.sizes[i]))
    } else {
      children.push(next)
      sizes.push(split.sizes[i])
    }
  })
  if (children.length === 1) return children[0]
  const unchanged =
    children.length === split.children.length && children.every((c, i) => c === split.children[i])
  return unchanged ? split : { ...split, children, sizes: normalized(sizes) }
}

export function resizeSplit(node: LayoutNode, splitId: string, sizes: number[]): LayoutNode {
  if (node.type === 'pane') return node
  if (node.id === splitId) return { ...node, sizes: normalized(sizes) }
  return withChildren(
    node,
    node.children.map((c) => resizeSplit(c, splitId, sizes))
  )
}
