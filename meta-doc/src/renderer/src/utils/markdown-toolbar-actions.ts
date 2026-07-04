import * as monaco from 'monaco-editor'

export type MarkdownToolbarAction =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'link'
  | 'unorderedList'
  | 'orderedList'
  | 'table'
  | 'codeBlock'
  | 'quote'
  | 'headingSample1'
  | 'headingSample2'
  | 'headingSample3'
  | 'headingSample4'
  | 'headingSample5'
  | 'headingSample6'

function getEditorInstance(editorId: string | null): monaco.editor.IStandaloneCodeEditor | null {
  if (!editorId) return null
  const editors = (
    monaco.editor as unknown as { getEditors?: () => monaco.editor.IStandaloneCodeEditor[] }
  ).getEditors?.() ?? []
  return editors.find((e) => e.getId?.() === editorId) ?? null
}

function getInsertSelection(
  editor: monaco.editor.IStandaloneCodeEditor
): monaco.Selection | null {
  const selection = editor.getSelection()
  if (selection) return selection
  const position = editor.getPosition()
  const model = editor.getModel()
  if (!position || !model) return null
  return new monaco.Selection(
    position.lineNumber,
    position.column,
    position.lineNumber,
    position.column
  )
}

function wrapSelection(
  editor: monaco.editor.IStandaloneCodeEditor,
  before: string,
  after: string,
  placeholder = 'text'
): void {
  editor.focus()
  const selection = getInsertSelection(editor)
  const model = editor.getModel()
  if (!selection || !model) return
  const selected = model.getValueInRange(selection)
  const content = selected || placeholder
  const insert = `${before}${content}${after}`
  editor.executeEdits('markdown-toolbar', [
    {
      range: selection,
      text: insert,
      forceMoveMarkers: true
    }
  ])
  if (!selected) {
    const startCol = selection.startColumn + before.length
    editor.setSelection({
      startLineNumber: selection.startLineNumber,
      startColumn: startCol,
      endLineNumber: selection.startLineNumber,
      endColumn: startCol + placeholder.length
    })
  }
  editor.focus()
}

function insertAtCursor(editor: monaco.editor.IStandaloneCodeEditor, text: string): void {
  editor.focus()
  const selection = getInsertSelection(editor)
  const model = editor.getModel()
  if (!selection || !model) return
  editor.executeEdits('markdown-toolbar', [
    {
      range: selection,
      text,
      forceMoveMarkers: true
    }
  ])
  editor.focus()
}

function insertHeading(
  editor: monaco.editor.IStandaloneCodeEditor,
  level: number
): void {
  editor.focus()
  const selection = getInsertSelection(editor)
  const model = editor.getModel()
  if (!selection || !model) return
  const line = selection.startLineNumber
  const lineContent = model.getLineContent(line)
  const trimmed = lineContent.replace(/^#+\s*/, '').trim()
  const prefix = '#'.repeat(level) + ' '
  const newLine = trimmed ? `${prefix}${trimmed}` : prefix
  editor.executeEdits('markdown-toolbar', [
    {
      range: {
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: lineContent.length + 1
      },
      text: newLine,
      forceMoveMarkers: true
    }
  ])
  editor.setPosition({ lineNumber: line, column: newLine.length + 1 })
  editor.focus()
}

function insertHeadingSample(
  editor: monaco.editor.IStandaloneCodeEditor,
  level: number,
  sampleText: string
): void {
  editor.focus()
  const selection = getInsertSelection(editor)
  const model = editor.getModel()
  if (!selection || !model) return
  const line = selection.startLineNumber
  const lineContent = model.getLineContent(line)
  const headingLine = `${'#'.repeat(level)} ${sampleText}`
  const insertText = lineContent.trim() === '' ? headingLine : `\n${headingLine}\n`
  const targetLine = lineContent.trim() === '' ? line : line + 1
  editor.executeEdits('markdown-toolbar', [
    {
      range: selection,
      text: insertText,
      forceMoveMarkers: true
    }
  ])
  editor.setPosition({ lineNumber: targetLine, column: headingLine.length + 1 })
  editor.focus()
}

export function runMarkdownToolbarActionOnEditor(
  editor: monaco.editor.IStandaloneCodeEditor | null | undefined,
  action: MarkdownToolbarAction,
  sampleText?: string
): void {
  if (!editor) return

  switch (action) {
    case 'heading1':
      insertHeading(editor, 1)
      break
    case 'heading2':
      insertHeading(editor, 2)
      break
    case 'heading3':
      insertHeading(editor, 3)
      break
    case 'heading4':
      insertHeading(editor, 4)
      break
    case 'heading5':
      insertHeading(editor, 5)
      break
    case 'heading6':
      insertHeading(editor, 6)
      break
    case 'bold':
      wrapSelection(editor, '**', '**', 'bold')
      break
    case 'italic':
      wrapSelection(editor, '*', '*', 'italic')
      break
    case 'strike':
      wrapSelection(editor, '~~', '~~', 'text')
      break
    case 'link':
      wrapSelection(editor, '[', '](url)', 'text')
      break
    case 'unorderedList':
      insertAtCursor(editor, '- ')
      break
    case 'orderedList':
      insertAtCursor(editor, '1. ')
      break
    case 'table':
      insertAtCursor(
        editor,
        '| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n'
      )
      break
    case 'codeBlock':
      insertAtCursor(editor, '```\n\n```')
      break
    case 'quote':
      insertAtCursor(editor, '> ')
      break
    case 'headingSample1':
      insertHeadingSample(editor, 1, sampleText || 'Heading 1')
      break
    case 'headingSample2':
      insertHeadingSample(editor, 2, sampleText || 'Heading 2')
      break
    case 'headingSample3':
      insertHeadingSample(editor, 3, sampleText || 'Heading 3')
      break
    case 'headingSample4':
      insertHeadingSample(editor, 4, sampleText || 'Heading 4')
      break
    case 'headingSample5':
      insertHeadingSample(editor, 5, sampleText || 'Heading 5')
      break
    case 'headingSample6':
      insertHeadingSample(editor, 6, sampleText || 'Heading 6')
      break
  }
}

export function runMarkdownToolbarAction(
  editorId: string | null,
  action: MarkdownToolbarAction,
  sampleText?: string
): void {
  runMarkdownToolbarActionOnEditor(getEditorInstance(editorId), action, sampleText)
}
