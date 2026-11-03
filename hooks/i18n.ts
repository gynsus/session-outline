// Все тексты интерфейса мода — здесь. Новый язык = ещё один объект в DICTS.
// Недостающий ключ берётся из английского словаря.

export type Lang = string

type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }

type Dict = {
  title: string
  cmdDescription: string
  cmdOpened: string
  turns: Plural
  found: string
  headings: string
  files: string
  expandAll: string
  collapseAll: string
  toggleSelected: string
  refresh: string
  filterPlaceholder: string
  empty: string
  nothingFound: string
  hintKeys: string
  hintMouse: string
  notDrawnYet: string
  cannotJump: string
  selectFirst: string
  pasted: string
  filesCount: Plural
  onlyMarked: string
  compactChat: string
  byFile: string
  pastSessions: string
  exportOutline: string
  turnLabel: string
  pickTurn: string
  bookmark: string
  copyAnswer: string
  reask: string
  diff: string
  back: string
  diffTitle: string
  noEdits: string
  textCut: string
  newFile: string
  approxNote: string
  fileHint: string
  sessionsLoading: string
  sessionsEmpty: string
  sessionsUnreadable: string
  sessionHint: string
  large: string
  copied: string
  copyFailed: string
  answerCopied: string
  outlineCopied: string
  reaskQueued: string
  noAnswer: string
  marked: string
  unmarked: string
  compactOn: string
  compactOff: string
  tokens: string
  legend: string
  hintDiff: string
  reaskConfirm: string
  diffNote: string
  unitS: string
  unitM: string
  unitH: string
  pickTurnHint: string
  filesFilterPlaceholder: string
  sessionsFilterPlaceholder: string
}

const en: Dict = {
  title: 'Outline',
  cmdDescription: 'Open the session outline: prompts, answer headings, changed files',
  cmdOpened: 'Outline opened.',
  turns: { one: '{n} prompt', other: '{n} prompts' },
  found: 'found {n}',
  headings: 'Headings',
  files: 'Files',
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
  toggleSelected: 'Expand/collapse',
  refresh: 'Refresh',
  filterPlaceholder: '/ filter: prompts, headings, files',
  empty: 'Nothing yet: the outline appears after the first prompt.',
  nothingFound: 'No matches.',
  hintKeys: '↑↓ select · Enter jump · o expand · s ⭐ · y copy · a again · d diff',
  hintMouse: 'click a row to jump to it and expand it',
  notDrawnYet: 'Could not reach this message automatically: scroll the chat up a little and press Enter again.',
  cannotJump: 'Could not scroll the chat to this message.',
  selectFirst: 'Select a prompt with ↑↓ first.',
  pasted: '[pasted]',
  filesCount: { one: '{n} file', other: '{n} files' },
  onlyMarked: 'Only ⭐',
  compactChat: 'Compact chat',
  byFile: 'By file',
  pastSessions: 'Past sessions',
  exportOutline: 'Export',
  turnLabel: 'Turn {n}:',
  pickTurn: 'Selected turn:',
  bookmark: '⭐',
  copyAnswer: 'Copy answer',
  reask: 'Ask again…',
  diff: 'Diff',
  back: 'Back',
  diffTitle: 'Changes in turn {n}',
  noEdits: 'No Edit/Write changes in this turn. Files touched by shell commands (~) have no diff.',
  textCut: '… text cut',
  newFile: 'whole file',
  approxNote: '~ guessed from shell commands',
  fileHint: 'click a file to show the turns that changed it',
  sessionsLoading: 'Reading session history…',
  sessionsEmpty: 'No other sessions in this project.',
  sessionsUnreadable: 'Could not read session history.',
  sessionHint: 'click to copy the command that reopens the session',
  large: '(large, not searched)',
  copied: 'Copied: {text}',
  copyFailed: 'Could not copy to the clipboard.',
  answerCopied: 'Answer of turn {n} copied.',
  outlineCopied: 'Outline copied to the clipboard as Markdown.',
  reaskQueued: 'Prompt {n} sent again.',
  noAnswer: 'This turn has no text answer.',
  marked: 'Turn {n} bookmarked.',
  unmarked: 'Bookmark removed from turn {n}.',
  compactOn: 'Compact chat on: tool calls hidden (ctrl+o shows everything).',
  compactOff: 'Compact chat off.',
  tokens: 'tok',
  legend: '⚠ errors · ✗ tests failed · ⏹ interrupted',
  hintDiff: 'q back · scroll the pane to read',
  reaskConfirm: 'Press a again within 3 s to send prompt {n} again.',
  diffNote: 'fragment · real line numbers unknown',
  unitS: 's',
  unitM: 'm',
  unitH: 'h',
  pickTurnHint: 'click or ↑↓ to pick a turn for actions',
  filesFilterPlaceholder: '/ filter files',
  sessionsFilterPlaceholder: '/ search past sessions',
}

const ru: Dict = {
  title: 'Оглавление',
  cmdDescription: 'Открыть оглавление сессии: запросы, заголовки ответов, изменённые файлы',
  cmdOpened: 'Оглавление открыто.',
  turns: { one: '{n} запрос', few: '{n} запроса', many: '{n} запросов', other: '{n} запроса' },
  found: 'найдено {n}',
  headings: 'Заголовки',
  files: 'Файлы',
  expandAll: 'Раскрыть все',
  collapseAll: 'Свернуть все',
  toggleSelected: 'Раскрыть/свернуть',
  refresh: 'Обновить',
  filterPlaceholder: '/ фильтр: запросы, заголовки, файлы',
  empty: 'Пока пусто: оглавление появится после первого запроса.',
  nothingFound: 'Ничего не найдено.',
  hintKeys: '↑↓ выбор · Enter перейти · o раскрыть · s ⭐ · y копировать · a повторить · d дифф',
  hintMouse: 'клик по строке — перейти и раскрыть',
  notDrawnYet: 'Не удалось дойти до сообщения автоматически: прокрутите чат немного выше и нажмите Enter ещё раз.',
  cannotJump: 'Не удалось прокрутить чат к этому сообщению.',
  selectFirst: 'Сначала выберите запрос стрелками ↑↓.',
  pasted: '[вставка]',
  filesCount: { one: '{n} файл', few: '{n} файла', many: '{n} файлов', other: '{n} файла' },
  onlyMarked: 'Только ⭐',
  compactChat: 'Компактный чат',
  byFile: 'По файлам',
  pastSessions: 'Прошлые сессии',
  exportOutline: 'Экспорт',
  turnLabel: 'Ход {n}:',
  pickTurn: 'Выбранный ход:',
  bookmark: '⭐',
  copyAnswer: 'Копировать ответ',
  reask: 'Повторить…',
  diff: 'Дифф',
  back: 'Назад',
  diffTitle: 'Изменения хода {n}',
  noEdits: 'В этом ходе нет правок через Edit/Write. У файлов из shell-команд (~) диффа нет.',
  textCut: '… текст обрезан',
  newFile: 'файл целиком',
  approxNote: '~ — по shell-командам, приблизительно',
  fileHint: 'клик по файлу — показать ходы, где его меняли',
  sessionsLoading: 'Читаю историю сессий…',
  sessionsEmpty: 'Других сессий в этом проекте нет.',
  sessionsUnreadable: 'Не удалось прочитать историю сессий.',
  sessionHint: 'клик — скопировать команду, которая откроет сессию',
  large: '(большой, без поиска)',
  copied: 'Скопировано: {text}',
  copyFailed: 'Не удалось скопировать в буфер обмена.',
  answerCopied: 'Ответ хода {n} скопирован.',
  outlineCopied: 'Оглавление скопировано в буфер обмена в формате Markdown.',
  reaskQueued: 'Запрос {n} отправлен заново.',
  noAnswer: 'В этом ходе нет текстового ответа.',
  marked: 'Ход {n} добавлен в закладки.',
  unmarked: 'Ход {n} убран из закладок.',
  compactOn: 'Компактный чат включён: вызовы инструментов скрыты (ctrl+o покажет всё).',
  compactOff: 'Компактный чат выключен.',
  tokens: 'ток.',
  legend: '⚠ ошибки · ✗ упали тесты · ⏹ прерван',
  hintDiff: 'q — назад · панель прокручивается',
  reaskConfirm: 'Нажмите a ещё раз в течение 3 с, чтобы отправить запрос {n} заново.',
  diffNote: 'фрагмент · настоящие номера строк неизвестны',
  unitS: 'с',
  unitM: 'м',
  unitH: 'ч',
  pickTurnHint: 'клик или ↑↓ — выбрать ход для действий',
  filesFilterPlaceholder: '/ фильтр по файлам',
  sessionsFilterPlaceholder: '/ поиск по прошлым сессиям',
}

const DICTS: Record<string, Dict> = { en, ru }
export const SUPPORTED = Object.keys(DICTS)

/** Приводит «ru», «ru_RU.UTF-8», «Russian», «русский» к коду словаря, если он есть. */
export function normalizeLang(value: unknown): Lang | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const v = value.trim().toLowerCase()
  const byName: Record<string, string> = {
    english: 'en',
    russian: 'ru',
    русский: 'ru',
  }
  const code = byName[v] ?? v.split(/[_.\-@]/)[0] ?? ''
  return code in DICTS ? code : undefined
}

/** Язык, на котором человек пишет запросы: по преобладающей письменности. */
export function langOfText(texts: readonly string[]): Lang | undefined {
  let cyr = 0
  let lat = 0
  for (const t of texts) {
    cyr += (t.match(/[Ѐ-ӿ]/g) ?? []).length
    lat += (t.match(/[A-Za-z]/g) ?? []).length
  }
  if (cyr + lat < 20) return undefined
  return cyr > lat ? 'ru' : 'en'
}

type PluralKey = 'turns' | 'filesCount'

export type Translate = {
  (key: Exclude<keyof Dict, PluralKey>, vars?: Record<string, string | number>): string
  plural: (key: PluralKey, n: number) => string
  lang: Lang
}

export function translator(lang: Lang): Translate {
  const dict = DICTS[lang] ?? en
  const fill = (s: string, vars?: Record<string, string | number>) =>
    s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ''))
  const t = ((key, vars) => fill(dict[key] ?? en[key], vars)) as Translate
  t.plural = (key, n) => {
    const forms = dict[key] ?? en[key]
    let rule: Intl.LDMLPluralRule = n === 1 ? 'one' : 'other'
    try {
      rule = new Intl.PluralRules(lang).select(n)
    } catch {
      // среда без Intl: остаётся грубое правило выше
    }
    return fill(forms[rule] ?? forms.other, { n })
  }
  t.lang = lang
  return t
}
