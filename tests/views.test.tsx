import { expect, test } from 'claude-code/testing'
import type { On, SessionMessage } from 'claude-code'

const PANE = {
  plugin: 'session-outline',
  component: 'Pane',
  requestId: 'outline',
  props: {
    title: 'Оглавление',
    isFocused: false,
    bodyColumns: 70,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const MESSAGES: SessionMessage[] = [
  { role: 'user', text: 'почини сборку проекта', toolUses: [] },
  {
    role: 'assistant',
    text: 'Смотрю.',
    toolUses: [
      {
        tool_use_id: 'a',
        tool: 'Edit',
        input: { file_path: '/proj/src/x.ts', old_string: 'a\nb', new_string: 'a\nB' },
      },
      { tool_use_id: 'b', tool: 'Bash', input: { command: 'npm test' }, isError: true },
    ],
  },
  { role: 'assistant', text: 'Исправил x.ts, но тесты падают.', toolUses: [] },
  { role: 'user', text: 'добавь документацию', toolUses: [] },
  {
    role: 'assistant',
    text: '## Документация',
    toolUses: [{ tool_use_id: 'c', tool: 'Bash', input: { command: 'echo hi > README.md' } }],
  },
]

/** Общая подмена движка: история, папка проекта, настройки, буфер, тосты. */
function engine(
  on: On,
  extra: { toasts?: string[]; copies?: string[]; home?: string } = {},
) {
  on('command.register', () => ({ value: { command: 'outline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.messages', () => ({ value: MESSAGES }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('session.root', () => ({ value: '/proj' }))
  on('session.id', () => ({ value: 'cur' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('settings.read', () => ({ value: {} }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? extra.home : undefined }))
  on('ui.toast', (_, e) => {
    extra.toasts?.push(String((e as { text?: string }).text ?? e))
    return { value: undefined }
  })
  on('ui.copy', (_, e) => {
    extra.copies?.push(e.text)
    return { value: { isCopied: true } }
  })
}

test('метки проблем: упавшие тесты отмечены ✗', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /✗/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('по файлам: индекс и переход к ходам с файлом', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'by-file' })
  expect((await ui.find({ type: 'Text', text: /2 файла/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /~README\.md/ }))?.text).toBeTruthy()
  await ui.press({ key: 'file:0' })
  // вернулись к ходам с фильтром по файлу: виден только первый ход
  expect((await ui.find({ type: 'Text', text: /найдено 1/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('прошлые сессии: список с названием, клик копирует команду', async ($, on) => {
  const toasts: string[] = []
  const copies: string[] = []
  engine(on, { toasts, copies, home: '/home/me' })
  on('fs.list', () => ({
    value: [
      { name: 'old.jsonl', kind: 'file', size: 100, mtimeMs: 1_700_000_000_000, isLink: false },
      { name: 'cur.jsonl', kind: 'file', size: 100, mtimeMs: 1_700_000_100_000, isLink: false },
    ],
  }))
  on('fs.read', () => ({
    value: '{"type":"ai-title","aiTitle":"Старая сессия"}\n{"type":"user","message":{"content":"вопрос про API"}}',
  }))
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'past' })
  expect((await ui.find({ type: 'Text', text: /Старая сессия/ }))?.text).toBeTruthy()
  // текущая сессия в списке не показывается
  expect(await ui.find({ type: 'Button', key: 's:1' })).toBeFalsy()
  await ui.press({ key: 's:0' })
  expect(copies).toEqual(['claude --resume old'])
  expect(toasts.join('\n')).toMatch(/Скопировано: claude --resume old/)
  await ui.press({ key: 'back' })
  expect(await ui.find({ type: 'Button', key: 't:1' })).toBeTruthy()
  await ui.unmount()
})

test('экспорт: оглавление в Markdown уходит в буфер', async ($, on) => {
  const copies: string[] = []
  engine(on, { copies })
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'export' })
  expect(copies[0]).toContain('1. почини сборку проекта')
  expect(copies[0]).toContain('2. добавь документацию\n   - Документация')
  await ui.unmount()
})

test('компактный чат прячет строки вызовов инструментов, но не в ctrl+o', async ($, on) => {
  const toasts: string[] = []
  engine(on, { toasts })
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'toggle-k' })
  expect(toasts.join('\n')).toMatch(/Компактный чат включён/)

  const row = (isExpanded: boolean) =>
    $.ui.mount({
      plugin: 'session-outline',
      surface: 'terminal',
      component: 'ToolUse',
      props: {
        tool_use_id: 'x',
        tool: 'Bash',
        input: { command: 'ls' },
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
        isExpanded,
      },
    })
  const hidden = await row(false)
  expect(await hidden.find({ type: 'Text', text: /engine row/ })).toBeFalsy()
  await hidden.unmount()
  const shown = await row(true)
  expect((await shown.find({ type: 'Text', text: /engine row/ }))?.text).toBe('engine row')
  await shown.unmount()
  await pane.unmount()
})

test('действия над выбранным ходом: дифф, закладка, копирование, переспросить', async ($, on) => {
  const toasts: string[] = []
  const copies: string[] = []
  const submitted: string[] = []
  const store = new Map<string, unknown>()
  engine(on, { toasts, copies })
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, isFocused: true } })

  // выбираем первый ход кликом (стрелки в тестовом наборе не изображаются)
  await ui.press({ key: 't:1' })
  expect((await ui.find({ type: 'Text', text: /Ход 1:/ }))?.text).toBeTruthy()

  await ui.press({ key: 'mark' })
  expect(toasts.at(-1)).toMatch(/Ход 1 добавлен в закладки/)
  expect(store.get('marks:cur')).toEqual(['u:починисборкупроекта#0'])

  await ui.press({ key: 'copy-answer' })
  expect(copies.at(-1)).toBe('Исправил x.ts, но тесты падают.')

  // первое нажатие только просит подтверждения, второе — отправляет
  await ui.press({ key: 'reask' })
  expect(submitted).toEqual([])
  expect(toasts.at(-1)).toMatch(/Нажмите a ещё раз/)
  await ui.press({ key: 'reask' })
  expect(submitted).toEqual(['почини сборку проекта'])

  await ui.press({ key: 'diff' })
  expect((await ui.find({ type: 'Text', text: /Изменения хода 1/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /✎ src\/x\.ts/ }))?.text).toBeTruthy()
  await ui.unmount()
})
