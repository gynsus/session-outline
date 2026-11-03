import { expect, test } from 'claude-code/testing'
import type { SessionMessage } from 'claude-code'

const PANE = {
  plugin: 'session-outline',
  component: 'Pane',
  requestId: 'outline',
  props: {
    title: 'Оглавление',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const MESSAGES: SessionMessage[] = [
  { role: 'user', text: 'есть ли готовое решение?', toolUses: [] },
  {
    role: 'assistant',
    text: '## Что уже есть\nтекст\n```\n# не заголовок\n```\n## Что можно сделать\nещё',
    toolUses: [],
  },
  { role: 'user', text: 'собери прототип', toolUses: [] },
  {
    role: 'assistant',
    text: 'Пишу мод.',
    toolUses: [
      { tool_use_id: 't1', tool: 'Write', input: { file_path: '/proj/hooks/register.tsx' } },
      { tool_use_id: 't2', tool: 'Bash', input: { command: 'ls' } },
    ],
  },
  { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't1', text: 'ok', isError: false }] },
  { role: 'assistant', text: 'Готово, мод собран.', toolUses: [] },
]

test('панель строит оглавление на каждой поверхности', async ($, on) => {
  on('command.register', () => ({ value: { command: 'outline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.messages', () => ({ value: MESSAGES }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('settings.read', () => ({ value: {} }))
  on('env.get', () => ({ value: 'en_AU.UTF-8' }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /2 запроса/ }))?.text).toBeTruthy()
    // по умолчанию раскрыт только последний ход
    expect(await ui.find({ type: 'Button', key: 'h:1:0' })).toBeFalsy()
    await ui.press({ key: 'expand-all' })
    expect((await ui.find({ type: 'Text', text: /есть ли готовое/ }))?.text).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'h:1:0' })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'h:1:1' })).toBeTruthy()
    // строка внутри блока кода заголовком не считается
    expect(await ui.find({ type: 'Button', key: 'h:1:2' })).toBeFalsy()
    expect((await ui.find({ type: 'Text', text: /✎ register\.tsx · ⚙ 2/ }))?.text).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /→ Готово, мод собран/ }))?.text).toBeTruthy()
    // возвращаем общее состояние для следующей поверхности
    await ui.press({ key: 'expand-all' })
    await ui.unmount()
  }
})

test('кнопка «заголовки» прячет заголовки', async ($, on) => {
  on('command.register', () => ({ value: { command: 'outline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.messages', () => ({ value: MESSAGES }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('settings.read', () => ({ value: {} }))
  on('env.get', () => ({ value: 'en_AU.UTF-8' }))
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'expand-all' })
  expect(await ui.find({ type: 'Button', key: 'h:1:0' })).toBeTruthy()
  await ui.press({ key: 'toggle-h' })
  expect(await ui.find({ type: 'Button', key: 'h:1:0' })).toBeFalsy()
  await ui.unmount()
})

test('фильтр оставляет совпавшие ходы и раскрывает их', async ($, on) => {
  on('command.register', () => ({ value: { command: 'outline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.messages', () => ({ value: MESSAGES }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('settings.read', () => ({ value: {} }))
  on('env.get', () => ({ value: 'en_AU.UTF-8' }))
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.input({ key: 'filter', text: 'можно', kind: 'change' })
  expect((await ui.find({ type: 'Text', text: /найдено 1/ }))?.text).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'h:1:1' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 't:2' })).toBeFalsy()
  await ui.unmount()
})

const ENGLISH: SessionMessage[] = [
  { role: 'user', text: 'is there a ready-made solution for this?', toolUses: [] },
  { role: 'assistant', text: '## What exists\nSome text', toolUses: [] },
]

test('язык: английские запросы → английский интерфейс', async ($, on) => {
  on('command.register', () => ({ value: { command: 'outline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.messages', () => ({ value: ENGLISH }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('settings.read', () => ({ value: {} }))
  on('env.get', () => ({ value: 'ru_RU.UTF-8' }))
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^1 prompt$/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /Headings/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('язык: настройка мода важнее автоопределения', { options: { language: 'en' } }, async ($, on) => {
  on('command.register', () => ({ value: { command: 'outline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.messages', () => ({ value: MESSAGES }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('settings.read', () => ({ value: { language: 'russian' } }))
  on('env.get', () => ({ value: undefined }))
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^2 prompts$/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('без выбранного хода действий нет, есть подсказка; после клика — появляются', async ($, on) => {
  const toasts: string[] = []
  on('command.register', () => ({ value: { command: 'outline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.messages', () => ({ value: MESSAGES }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('settings.read', () => ({ value: {} }))
  on('env.get', () => ({ value: undefined }))
  on('ui.toast', (_, e) => {
    toasts.push(String((e as { text?: string }).text ?? e))
    return { value: undefined }
  })
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Button', key: 'toggle-one' })).toBeFalsy()
  expect((await ui.find({ type: 'Text', text: /выбрать ход для действий/ }))?.text).toBeTruthy()
  await ui.press({ key: 't:1' })
  expect(await ui.find({ type: 'Button', key: 'toggle-one' })).toBeTruthy()
  // у первого хода нет правок — кнопки «Дифф» нет; у второго есть (Write)
  expect(await ui.find({ type: 'Button', key: 'diff' })).toBeFalsy()
  await ui.press({ key: 't:2' })
  expect(await ui.find({ type: 'Button', key: 'diff' })).toBeTruthy()
  await ui.unmount()
})

test('клик по свёрнутому ходу раскрывает его; ненарисованная строка — подсказка', async ($, on) => {
  const toasts: string[] = []
  on('command.register', () => ({ value: { command: 'outline' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.messages', () => ({ value: MESSAGES }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('settings.read', () => ({ value: {} }))
  on('env.get', () => ({ value: undefined }))
  on('ui.toast', (_, e) => {
    toasts.push(String((e as { text?: string }).text ?? e))
    return { value: undefined }
  })
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Button', key: 'h:1:0' })).toBeFalsy()
  await ui.press({ key: 't:1' })
  expect(await ui.find({ type: 'Button', key: 'h:1:0' })).toBeTruthy()
  expect(toasts.join('\n')).toMatch(/Не удалось дойти/)
  await ui.unmount()
})
