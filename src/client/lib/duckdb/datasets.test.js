import { describe, expect, it, vi } from 'vitest'
import { registerDuckDBCompleter } from './datasets'

describe('registerDuckDBCompleter', () => {
  it('replaces the current partial identifier when accepting an older completion', () => {
    const line = { value: 'datasets.' }
    const cursor = { value: { row: 0, column: line.value.length } }
    const replace = vi.fn()
    let changeCursor
    globalThis.window = {
      ace: {
        require: () => ({ snippetCompleter: {}, textCompleter: {}, keyWordCompleter: {} })
      }
    }
    const editor = {
      session: {
        getLine: () => line.value,
        replace
      },
      selection: {
        on: (event, listener) => { changeCursor = listener },
        off: vi.fn()
      },
      getCursorPosition: () => cursor.value,
      execCommand: vi.fn()
    }

    registerDuckDBCompleter(editor, () => [{ label: 'source "one"' }])
    changeCursor()
    const completer = editor.completers[0]
    let completion
    completer.getCompletions(editor, editor.session, cursor.value, '', (error, matches) => {
      expect(error).toBeNull()
      completion = matches[0]
    })

    line.value = 'datasets."source o'
    cursor.value = { row: 0, column: line.value.length }
    completion.completer.insertMatch(editor, completion)

    expect(replace).toHaveBeenCalledWith({
      start: { row: 0, column: 'datasets.'.length },
      end: cursor.value
    }, '"source ""one"""')
  })
})
