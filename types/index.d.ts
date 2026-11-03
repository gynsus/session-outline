export type Heading = { level: number; text: string }

/** Одна правка файла за ход: из неё строится дифф. */
export type FileEdit = {
  /** Путь относительно корня проекта (или как есть, если вне его). */
  file: string
  /** edit: old → new; write: весь новый текст; notebook: ячейка. */
  kind: 'edit' | 'write' | 'notebook'
  old: string
  new: string
  /** Текст обрезан, чтобы не раздувать состояние. */
  isCut: boolean
}

export type Turn = {
  /** Порядковый номер запроса, с 1. */
  n: number
  /** Текст запроса пользователя, как сохранён. */
  prompt: string
  /** Заголовки markdown (#, ##, ###) из ответов на этот запрос. */
  headings: Heading[]
  /** Файлы, которые меняли Edit / Write / MultiEdit / NotebookEdit. */
  files: string[]
  /** Файлы, которые, судя по shell-командам, менялись (приблизительно). */
  shellFiles: string[]
  /** Правки для диффа. */
  edits: FileEdit[]
  /** Сколько всего было вызовов инструментов. */
  tools: number
  /** Сколько вызовов инструментов вернули ошибку. */
  errors: number
  /** Команда запуска тестов вернула ошибку. */
  testsFailed: boolean
  /** Первая строка последнего ответа: для ходов без заголовков. */
  gist: string
  /** Последний текстовый ответ целиком (обрезан): для «копировать ответ». */
  answer: string
}

/** Что известно о ходе из события turn.complete (только пока мод загружен). */
export type TurnStat = {
  ms: number
  tokens: number
  aborted: boolean
}

export type View =
  | { kind: 'turns' }
  | { kind: 'diff'; n: number }
  | { kind: 'files' }
  | { kind: 'sessions' }

export type PastSession = {
  id: string
  /** Название, которое Claude Code дал сессии; пусто — нет. */
  title: string
  mtimeMs: number
  /** Запросы сессии (первые строки), для показа и поиска. */
  prompts: string[]
  isLarge: boolean
}

export type Prefs = {
  headings: boolean
  files: boolean
  /** Фильтр оглавления ходов. */
  filter: string
  /** Фильтр вида «по файлам». */
  fileFilter: string
  /** Поиск по прошлым сессиям. */
  sessionFilter: string
  /** Раскрыть все ходы (иначе раскрыты только текущий и последний). */
  expandAll: boolean
  /** Ручные раскрытия/сворачивания по номеру хода: перекрывают правило выше. */
  fold: Record<string, boolean>
  /** Показывать только ходы с закладкой. */
  onlyMarked: boolean
  /** Компактный чат: строки вызовов инструментов скрыты. */
  compact: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'session-outline': {
      turns: Shaped<Turn[]>
      prefs: Shaped<Prefs>
      /** Код языка интерфейса (en, ru, …). */
      lang: Shaped<string>
      /** Время и токены по номеру хода. */
      stats: Shaped<Record<string, TurnStat>>
      /** Ключи ходов с закладкой (текст запроса + номер повтора). */
      marks: Shaped<string[]>
      view: Shaped<View>
      /** requestId строки запроса, которая сейчас на экране (самая нижняя). */
      current: Shaped<string | null>
      /** Номер хода под фокусом в панели (↑↓); null — фокуса на ходе нет. */
      focus: Shaped<number | null>
      /** Прошлые сессии проекта; null — ещё не загружены. */
      sessions: Shaped<PastSession[] | null>
    }
  }
}
