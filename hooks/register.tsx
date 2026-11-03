import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PastSession, Prefs, Turn, TurnStat, View } from '../types'
import { langOfText, normalizeLang, translator } from './i18n'
import type { Translate } from './i18n'
import {
  EDIT_TOOLS,
  build,
  clean,
  cut,
  diffOf,
  fileIndex,
  formatMs,
  formatTokens,
  headingsOf,
  localStamp,
  norm,
  projectDir,
  sessionInfo,
  shortNames,
  toMarkdown,
} from './model'

const PANE = 'outline'
// Без своего фона: панель того же цвета, что и чат, поэтому цвета темы
// (text в светлой теме тёмный) читаются так же, как в транскрипте.
const BG = 'transparent'
const MAX_SESSION_BYTES = 8 * 1024 * 1024

const turns = atom({ plugin: 'session-outline', key: 'turns' } as const, [] as Turn[], { shape: 'turns-2' })
const prefs = atom(
  { plugin: 'session-outline', key: 'prefs' } as const,
  {
    headings: true,
    files: true,
    filter: '',
    fileFilter: '',
    sessionFilter: '',
    expandAll: false,
    fold: {},
    onlyMarked: false,
    compact: false,
  } as Prefs,
  { shape: 'prefs-4' },
)
const langAtom = atom({ plugin: 'session-outline', key: 'lang' } as const, 'en', { shape: 'lang-1' })
const stats = atom({ plugin: 'session-outline', key: 'stats' } as const, {} as Record<string, TurnStat>, {
  shape: 'stats-1',
})
const marks = atom({ plugin: 'session-outline', key: 'marks' } as const, [] as string[], { shape: 'marks-1' })
const viewAtom = atom({ plugin: 'session-outline', key: 'view' } as const, { kind: 'turns' } as View, {
  shape: 'view-1',
})
const currentAtom = atom({ plugin: 'session-outline', key: 'current' } as const, null as string | null, {
  shape: 'current-1',
})
const focusAtom = atom({ plugin: 'session-outline', key: 'focus' } as const, null as number | null, {
  shape: 'focus-1',
})
const sessions = atom({ plugin: 'session-outline', key: 'sessions' } as const, null as PastSession[] | null, {
  shape: 'sessions-1',
})

// ---------------------------------------------------------------------------
// Связь «текст → строка в транскрипте».
//
// $.session.messages() даёт структуру диалога, но без id сообщений, а
// $.ui.scroll хочет requestId отрисованной строки. Поэтому подглядываем за
// отрисовкой UserMessage / AssistantMessage и запоминаем, какой текст в какой
// строке лежит. Повторы одного текста («продолжай», «## Итог») различаем по
// порядку появления: k-е вхождение в оглавлении = k-я увиденная строка.
// Это модульные переменные: после перезагрузки мода они заполнятся заново по
// мере отрисовки.
// ---------------------------------------------------------------------------
const seen = new Map<string, string[]>() // ключ → requestId по порядку
const visible = new Map<string, boolean>() // requestId строки запроса → на экране
const promptRows: string[] = [] // requestId строк запросов в порядке появления

function remember(key: string, requestId: string) {
  const list = seen.get(key) ?? []
  if (!list.includes(requestId)) {
    list.push(requestId)
    seen.set(key, list)
  }
}

// Только точный повтор: подставить «последний известный» значило бы увести
// к чужому запросу с тем же текстом. Нет повтора — строка считается неизвестной,
// и переход идёт шагами через соседей.
function rowFor(key: string, occurrence: number): string | undefined {
  return seen.get(key)?.[occurrence]
}

// «Где я сейчас» пишем в состояние из таймера, пачкой: из отрисовки писать
// нельзя, а глобальный $.ui.invalidate перерисовывал бы все строки чата.
let currentScheduled = false
async function flushCurrent($: EngineInterface) {
  currentScheduled = false
  let row: string | null = null
  for (const id of promptRows) if (visible.get(id)) row = id
  if ((await read($, currentAtom)) !== row) await update($, currentAtom, () => row)
}

// Обновление оглавления во время хода — не чаще раза в секунду (последнее
// не теряется: таймер всегда добегает), а после хода — сразу.
let refreshScheduled = false
function scheduleRefresh($: EngineInterface) {
  if (refreshScheduled) return
  refreshScheduled = true
  void $.clock.after(1000, async () => {
    refreshScheduled = false
    await refresh($)
  })
}

// Переход по чату: новый переход отменяет предыдущий, ещё не дошедший.
let jumpGeneration = 0
// «Повторить» требует второго нажатия a в течение 3 секунд.
let reaskPending: { n: number; at: number } | undefined

/** Ключи строк ходов: запрос и заголовки, с номером повтора одинаковых текстов. */
function keysOf(list: readonly Turn[]) {
  const occ = new Map<string, number>()
  const nth = (key: string) => {
    const k = occ.get(key) ?? 0
    occ.set(key, k + 1)
    return k
  }
  return list.map(turn => {
    const pkey = 'u:' + norm(turn.prompt)
    const pocc = nth(pkey)
    const heads = turn.headings.map(hd => {
      const key = 'h:' + norm(hd.text)
      return { key, occ: nth(key) }
    })
    return { n: turn.n, pkey, pocc, mark: `${pkey}#${pocc}`, heads }
  })
}

// ---------------------------------------------------------------------------
// Язык интерфейса. Порядок: настройка мода `language` → настройка Claude Code
// `language` → язык, на котором человек пишет запросы → $LANG → английский.
// ---------------------------------------------------------------------------
let configured: string | undefined // из userConfig; 'auto' = определить самому
let registeredLang: string | undefined // на каком языке зарегистрирована /outline

async function resolveLang($: EngineInterface, prompts: readonly string[]): Promise<string> {
  const fromConfig = configured === 'auto' ? undefined : normalizeLang(configured)
  if (fromConfig) return fromConfig
  // чтение настроек не должно ломать панель: при ошибке просто идём дальше
  const fromSettings = normalizeLang(await $.settings.read({ key: 'language' }).catch(() => undefined))
  if (fromSettings) return fromSettings
  const fromPrompts = langOfText(prompts)
  if (fromPrompts) return fromPrompts
  return (
    normalizeLang(await $.env.get('LC_ALL')) ??
    normalizeLang(await $.env.get('LC_MESSAGES')) ??
    normalizeLang(await $.env.get('LANG')) ??
    'en'
  )
}

async function registerCommand($: EngineInterface, lang: string) {
  if (registeredLang === lang) return
  registeredLang = lang
  await $.command.register({ name: 'outline', description: translator(lang)('cmdDescription') })
}

async function refresh($: EngineInterface) {
  const [messages, cwd] = await Promise.all([$.session.messages(), $.session.cwd()])
  const next = build(messages, cwd)
  await update($, turns, () => next)
  const lang = await resolveLang($, next.map(t => t.prompt))
  await update($, langAtom, () => lang)
  await registerCommand($, lang)
}

async function tr($: EngineInterface) {
  return translator(await read($, langAtom))
}

// ---------------------------------------------------------------------------
// Закладки живут в $.store, чтобы пережить перезапуск; ключ — id сессии.
// ---------------------------------------------------------------------------
async function loadMarks($: EngineInterface) {
  const id = await $.session.id()
  const saved = await $.store.get(`marks:${id}`)
  const list = Array.isArray(saved) ? saved.filter((x): x is string => typeof x === 'string') : []
  await update($, marks, () => list)
}

async function toggleMark($: EngineInterface, key: string) {
  const id = await $.session.id()
  let isOn = false
  await update($, marks, list => {
    isOn = !list.includes(key)
    return isOn ? [...list, key] : list.filter(k => k !== key)
  })
  await $.store.set(`marks:${id}`, await read($, marks))
  return isOn
}

// ---------------------------------------------------------------------------
// Прошлые сессии проекта: файлы ~/.claude/projects/<проект>/*.jsonl
// ---------------------------------------------------------------------------
async function loadSessions($: EngineInterface) {
  try {
    const [home, cwd, current] = await Promise.all([
      $.env.get('HOME'),
      $.session.root(),
      $.session.id(),
    ])
    const dir = projectDir(home ?? '', cwd)
    const entries = (await $.fs.list(dir))
      .filter(e => e.kind === 'file' && e.name.endsWith('.jsonl') && e.name !== `${current}.jsonl`)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, 40)
    const out: PastSession[] = []
    for (const e of entries) {
      const id = e.name.replace(/\.jsonl$/, '')
      if (e.size > MAX_SESSION_BYTES) {
        out.push({ id, title: '', mtimeMs: e.mtimeMs, prompts: [], isLarge: true })
        continue
      }
      const info = sessionInfo(await $.fs.read(`${dir}/${e.name}`))
      out.push({ id, title: info.title, mtimeMs: e.mtimeMs, prompts: info.prompts, isLarge: false })
    }
    await update($, sessions, () => out)
  } catch (err) {
    $.ui.log(`outline: sessions: ${String(err)}`, { to: 'debug' })
    await update($, sessions, () => [])
    $.ui.toast((await tr($))('sessionsUnreadable'))
  }
}

export const register: Register = (on, options) => {
  configured = typeof options.language === 'string' ? options.language : 'auto'

  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await refresh($)
    await loadMarks($)
    void $.ui.open({ id: PANE, title: (await tr($))('title'), backgroundColor: BG })
    return ran
  })

  on('command.run', { command: 'outline' }, async $ => {
    await refresh($)
    const t = await tr($)
    await $.ui.open({ id: PANE, title: t('title'), focus: true, backgroundColor: BG })
    return { text: t('cmdOpened') }
  })

  on('prompt.submit', async ($, e, next) => {
    const ran = await next(e)
    void $.clock.after(300, () => refresh($))
    return ran
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (EDIT_TOOLS.has(e.tool) || e.tool === 'Bash') scheduleRefresh($)
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined) return ran
    await refresh($)
    const n = (await read($, turns)).length
    const u = ran.usage
    const tokens = u
      ? u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      : 0
    const aborted = e.isAborted || e.reason === 'aborted'
    // на один запрос бывает несколько turn.complete (уведомления фоновых
    // задач и т. п.) — складываем, а не перезаписываем
    if (n > 0)
      await update($, stats, s => {
        const prev: TurnStat | undefined = s[String(n)]
        const sum: TurnStat = {
          ms: (prev?.ms ?? 0) + e.durationMs,
          tokens: (prev?.tokens ?? 0) + tokens,
          aborted: (prev?.aborted ?? false) || aborted,
        }
        return { ...s, [String(n)]: sum }
      })
    return ran
  })

  // ↑↓ двигают фокус по кнопкам панели; запоминаем, на каком ходе он стоит
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const r = await next(e)
    if (r.deny) return r
    // фокус в состоянии, а не в переменной: панель перерисуется с «Ход N:»,
    // а кнопки действий прочитают актуальный ход в момент нажатия
    const m = /^(?:t|h):(\d+)/.exec(e.element ?? '')
    const n = m?.[1] ? Number(m[1]) : null
    if (n !== null || !e.element) await update($, focusAtom, () => n)
    return r
  })

  // --- подглядываем за строками транскрипта; рисует их сам движок ---------
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const key = 'u:' + norm(e.props.text)
    remember(key, e.requestId)
    if (!promptRows.includes(e.requestId)) promptRows.push(e.requestId)
    if (e.props.onScreen !== undefined) {
      const now = e.props.onScreen !== null
      if (visible.get(e.requestId) !== now) {
        visible.set(e.requestId, now)
        if (!currentScheduled) {
          currentScheduled = true
          void $.clock.after(80, () => flushCurrent($))
        }
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    for (const hd of headingsOf(e.props.text)) remember('h:' + norm(hd.text), e.requestId)
    return next(e)
  })

  // --- компактный чат: строки вызовов инструментов скрыты ------------------
  // ctrl+o (полный транскрипт) показывает всё как обычно.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const p = await read($, prefs)
    if (!p.compact || e.props.isExpanded) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const p = await read($, prefs)
    const isExpanded = 'isExpanded' in e.props && e.props.isExpanded === true
    if (!p.compact || isExpanded) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  })

  // --- панель ---------------------------------------------------------------
  // Одна кнопка на строку: ↑↓ ходят по строкам, Enter — перейти (и раскрыть).
  // Действия над ходом под фокусом — хоткеями (o s y a d). Стрелки ←→ движок
  // плагину не отдаёт, поэтому на них ничего не завязано.
  // Иерархия без dim (в части тем он почти невидим):
  //   текущий ход — акцент claude + bold и ▶; запросы и заголовки — text;
  //   файлы/инструменты — suggestion; проблемы — warning/error;
  //   переключатели — явное ●/○.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button, Code } = els
    // на mobile поля ввода нет: там фильтр просто не рисуется
    const Input = 'Input' in els ? els.Input : undefined
    const list = await read($, turns)
    const p = await read($, prefs)
    const t: Translate = translator(await read($, langAtom))
    const view = await read($, viewAtom)
    const width = Math.max(24, (e.props.bodyColumns ?? e.viewport?.columns ?? 60) - 1)
    const rule = <Text color="subtle">{'─'.repeat(width)}</Text>
    const keys = keysOf(list)

    const go = (v: View) => update($, viewAtom, () => v)
    const backButton = (
      <Button key="back" plain hotkey="q" onPress={() => go({ kind: 'turns' })}>
        {`← ${t('back')}`}
      </Button>
    )
    const toggleLabel = (isOn: boolean, text: string) => (
      <Text color={isOn ? 'claude' : undefined} bold={isOn}>{`${isOn ? '●' : '○'} ${text}`}</Text>
    )
    type FilterField = 'filter' | 'fileFilter' | 'sessionFilter'
    const filterInput = (field: FilterField, placeholder: string) =>
      Input && (
        <Input
          key={field}
          placeholder={placeholder}
          value={p[field]}
          onInput={(value: string) => update($, prefs, v => ({ ...v, [field]: value }))}
          onSubmit={(value: string) => update($, prefs, v => ({ ...v, [field]: value }))}
        />
      )

    // ---- вид: дифф одного хода ------------------------------------------
    if (view.kind === 'diff') {
      const turn = list.find(x => x.n === view.n)
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" gap={2}>
            {backButton}
            <Text bold>{t('diffTitle', { n: view.n })}</Text>
          </Box>
          {turn && <Text>{cut(clean(turn.prompt, t('pasted')), width)}</Text>}
          {rule}
          {(!turn || turn.edits.length === 0) && <Text>{t('noEdits')}</Text>}
          {turn?.edits.map((ed, i) => {
            const source = ed.kind === 'edit' ? diffOf(ed) : ''
            return (
              <Box key={`edit:${i}`} flexDirection="column" marginTop={i ? 1 : 0}>
                <Text bold color="suggestion">
                  {`✎ ${ed.file}${ed.kind !== 'edit' ? ` · ${t('newFile')}` : ''}`}
                </Text>
                {ed.kind === 'edit' && source && <Text italic>{t('diffNote')}</Text>}
                {ed.kind === 'edit' && source ? (
                  <Code source={source} format="diff" path={ed.file} wrap="truncate-end" />
                ) : (
                  <Code source={ed.new.split('\n').slice(0, 200).join('\n')} path={ed.file} wrap="truncate-end" />
                )}
                {ed.isCut && <Text italic>{t('textCut')}</Text>}
              </Box>
            )
          })}
          {turn && turn.shellFiles.length > 0 && (
            <Text color="suggestion">{`~ ${cut(turn.shellFiles.join(', '), width - 2)}`}</Text>
          )}
          {rule}
          <Text>{t('hintDiff')}</Text>
        </Box>
      )
    }

    // ---- вид: индекс «файл → ходы» --------------------------------------
    if (view.kind === 'files') {
      const index = fileIndex(list)
      const needle = p.fileFilter.trim().toLowerCase()
      const shown = index.filter(f => !needle || f.file.toLowerCase().includes(needle))
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" gap={2}>
            {backButton}
            <Text bold>{t.plural('filesCount', index.length)}</Text>
          </Box>
          {filterInput('fileFilter', t('filesFilterPlaceholder'))}
          {rule}
          {shown.length === 0 && <Text>{t('nothingFound')}</Text>}
          {shown.map((f, i) => {
            const nums = f.turns.join(', ')
            const name = (f.approx ? '~' : '') + f.file
            return (
              <Button
                key={`file:${i}`}
                plain
                onPress={() =>
                  update($, prefs, v => ({ ...v, filter: f.file })).then(() => go({ kind: 'turns' }))
                }
              >
                <Text>{cut(name, Math.max(10, width - nums.length - 3))}</Text>
                <Text color="suggestion">{`  ${nums}`}</Text>
              </Button>
            )
          })}
          {rule}
          <Text>{t('fileHint')}</Text>
          {index.some(f => f.approx) && <Text>{t('approxNote')}</Text>}
        </Box>
      )
    }

    // ---- вид: прошлые сессии --------------------------------------------
    if (view.kind === 'sessions') {
      const all = await read($, sessions)
      const needle = p.sessionFilter.trim().toLowerCase()
      const hitIn = (s: string) => !!needle && s.toLowerCase().includes(needle)
      const shown = (all ?? []).filter(
        s => !needle || hitIn(s.title) || s.prompts.some(hitIn) || s.id.startsWith(needle),
      )
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" gap={2}>
            {backButton}
            <Text bold>{t('pastSessions')}</Text>
            <Button key="reload-sessions" plain hotkey="r" onPress={() => loadSessions($)}>
              {`↻ ${t('refresh')}`}
            </Button>
          </Box>
          {filterInput('sessionFilter', t('sessionsFilterPlaceholder'))}
          {rule}
          {all === null && <Text>{t('sessionsLoading')}</Text>}
          {all !== null && all.length === 0 && <Text>{t('sessionsEmpty')}</Text>}
          {all !== null && all.length > 0 && shown.length === 0 && <Text>{t('nothingFound')}</Text>}
          {shown.map((s, i) => {
            const date = localStamp(s.mtimeMs)
            const name = s.title || s.prompts[0] || s.id
            const hits = needle ? s.prompts.filter(hitIn).slice(0, 3) : []
            const command = `claude --resume ${s.id}`
            return (
              <Box key={`sess:${i}`} flexDirection="column">
                <Button
                  key={`s:${i}`}
                  plain
                  onPress={async press => {
                    const r = await $.ui.copy({ text: command, surface: press.surface })
                    $.ui.toast(r.isCopied ? t('copied', { text: command }) : t('copyFailed'))
                  }}
                >
                  <Text color="suggestion">{`${date}  `}</Text>
                  <Text>{cut(clean(name, t('pasted')), Math.max(10, width - 18))}</Text>
                </Button>
                <Text>
                  {`     ${s.isLarge ? t('large') : t.plural('turns', s.prompts.length)}`}
                </Text>
                {hits.map((line, j) => (
                  <Text key={`hit:${i}:${j}`} underline>{`     · ${cut(clean(line, t('pasted')), width - 7)}`}</Text>
                ))}
              </Box>
            )
          })}
          {rule}
          <Text>{t('sessionHint')}</Text>
        </Box>
      )
    }

    // ---- вид: оглавление ходов (основной) -------------------------------
    const st = await read($, stats)
    const marked = await read($, marks)
    // узкая панель: только верхний уровень заголовков
    const maxLevel = width < 45 ? 1 : 3

    const setFold = (n: number, open: boolean) =>
      update($, prefs, v => ({ ...v, fold: { ...v.fold, [String(n)]: open } }))

    const scrollTo = async (id: string, block: 'start' | 'end') => {
      const r = await $.ui.scroll({ to: { requestId: id }, block })
      if ('deny' in r && r.deny) {
        // причина от движка — по-английски; человеку показываем свой текст
        $.ui.log(`outline: scroll denied: ${r.deny}`, { to: 'debug' })
        return false
      }
      return true
    }

    // Опорные строки: всё, что знаем о ходах, с номером хода.
    const anchors = keys.flatMap(k => [
      { n: k.n, key: k.pkey, occ: k.pocc },
      ...k.heads.map(hr => ({ n: k.n, key: hr.key, occ: hr.occ })),
    ])

    // Переход к строке. Строка может быть не отрисована: после перезапуска
    // старые сообщения рисуются, только когда до них докрутишь, а ушедшие
    // далеко за экран снимаются с отрисовки, и прокрутка к ним отказывает,
    // хотя их id мы помним. Тогда идём шагами: берём ближайшую к цели строку,
    // к которой прокрутка проходит, и ставим её к краю экрана со стороны цели
    // (цель выше — к нижнему краю, ниже — к верхнему). Соседние строки
    // дорисовываются, и на следующем шаге пробуем снова.
    const jump = async (key: string, occurrence: number, n: number) => {
      const mine = ++jumpGeneration
      const used = new Set<string>()
      for (let step = 0; step < 15; step++) {
        if (mine !== jumpGeneration) return // начался новый переход
        const id = rowFor(key, occurrence)
        if (id && (await scrollTo(id, 'start'))) return
        if (id) used.add(id)
        const candidates = anchors
          .map(a => ({ n: a.n, id: rowFor(a.key, a.occ) }))
          .filter((a): a is { n: number; id: string } => !!a.id && !used.has(a.id))
          .sort((x, y) => Math.abs(x.n - n) - Math.abs(y.n - n))
        let moved = false
        for (const c of candidates) {
          used.add(c.id)
          if (await scrollTo(c.id, c.n >= n ? 'end' : 'start')) {
            moved = true
            break
          }
        }
        if (!moved) break
        await $.clock.sleep(150)
      }
      if (mine === jumpGeneration) $.ui.toast(t('notDrawnYet'))
    }

    // «где я сейчас»: самый нижний запрос, строка которого видна на экране
    const currentRow = (await read($, currentAtom)) ?? undefined

    const needle = p.filter.trim().toLowerCase()
    const hit = (s: string) => !!needle && s.toLowerCase().includes(needle)
    const matches = (turn: Turn, mark: string) =>
      (!p.onlyMarked || marked.includes(mark)) &&
      (!needle ||
        hit(turn.prompt) ||
        turn.headings.some(hd => hit(hd.text)) ||
        turn.files.some(hit) ||
        turn.shellFiles.some(hit))

    const flip = (field: 'headings' | 'files' | 'onlyMarked') => () =>
      update($, prefs, v => ({ ...v, [field]: !v[field] }))

    const last = list.at(-1)?.n
    const openNow = new Map<number, boolean>()
    const rows = list.map((turn, idx) => {
      const k = keys[idx]
      if (!k || !matches(turn, k.mark)) return null

      const isCur = currentRow !== undefined && rowFor(k.pkey, k.pocc) === currentRow
      const isMarked = marked.includes(k.mark)
      const isOpen = p.fold[String(turn.n)] ?? (p.expandAll || isCur || turn.n === last || !!needle)
      openNow.set(turn.n, isOpen)
      const stat = st[String(turn.n)]
      const heads = p.headings
        ? turn.headings.map((hd, j) => ({ hd, j })).filter(x => x.hd.level <= maxLevel)
        : []
      const names = shortNames(turn.files)
      const approx = shortNames(turn.shellFiles).map(f => '~' + f)
      const allNames = [...names, ...approx]
      const filesPart =
        p.files && allNames.length
          ? allNames.length <= 2
            ? allNames.join(', ')
            : `${allNames.slice(0, 2).join(', ')} +${allNames.length - 2}`
          : ''
      const meta = [
        filesPart && `✎ ${filesPart}`,
        turn.tools > 0 && `⚙ ${turn.tools}`,
        stat && stat.ms > 0 && `⏱ ${formatMs(stat.ms, { s: t('unitS'), m: t('unitM'), h: t('unitH') })}`,
        stat && stat.tokens > 0 && `${formatTokens(stat.tokens)} ${t('tokens')}`,
      ]
        .filter(Boolean)
        .join(' · ')
      const fallback = heads.length === 0 && turn.gist ? turn.gist : ''
      const hasBody = heads.length > 0 || !!meta || !!fallback
      const minLevel = Math.min(...heads.map(x => x.hd.level))
      const glyph = hasBody ? (isOpen ? '▾' : '▸') : '·'
      // метки проблем: ⏹ прерван, ✗ упали тесты, ⚠ ошибки инструментов
      const flags = [
        stat?.aborted ? '⏹' : '',
        turn.testsFailed ? '✗' : '',
        turn.errors > 0 && !turn.testsFailed ? '⚠' : '',
        isMarked ? '⭐' : '',
      ].join('')
      const label = `${isCur ? '▶' : ' '}${glyph} ${turn.n}. `
      const flagsText = flags ? `${flags} ` : ''

      return (
        <Box key={`turn:${turn.n}`} flexDirection="column">
          <Button
            key={`t:${turn.n}`}
            plain
            onPress={async () => {
              // клик/Enter по ходу ещё и выбирает его для действий s y a d
              await update($, focusAtom, () => turn.n)
              if (hasBody && !isOpen) void setFold(turn.n, true)
              return jump(k.pkey, k.pocc, turn.n)
            }}
          >
            <Text color={isCur ? 'claude' : undefined} bold={isCur}>
              {label}
            </Text>
            <Text color={turn.testsFailed || stat?.aborted ? 'error' : 'warning'}>{flagsText}</Text>
            <Text color={isCur ? 'claude' : undefined} bold={isCur} underline={hit(turn.prompt)}>
              {cut(clean(turn.prompt, t('pasted')), width - label.length - flagsText.length)}
            </Text>
          </Button>
          {isOpen &&
            heads.map(({ hd, j }) => {
              const pad = '     ' + '  '.repeat(hd.level - minLevel)
              const href = k.heads[j]
              return (
                <Button
                  key={`h:${turn.n}:${j}`}
                  plain
                  onPress={async () => {
                    await update($, focusAtom, () => turn.n)
                    return jump(href?.key ?? '', href?.occ ?? 0, turn.n)
                  }}
                >
                  <Text underline={hit(hd.text)}>{`${pad}· ${cut(hd.text, width - pad.length - 2)}`}</Text>
                </Button>
              )
            })}
          {isOpen && fallback && <Text italic>{`     → ${cut(fallback, width - 7)}`}</Text>}
          {isOpen && meta && <Text color="suggestion">{`     ${cut(meta, width - 5)}`}</Text>}
        </Box>
      )
    })

    // действия над ходом под фокусом: ход читаем в момент нажатия
    const focusedN = await read($, focusAtom)
    const focused = list.find(x => x.n === focusedN && openNow.has(x.n))
    const withTurn = (fn: (turn: Turn, mark: string) => unknown) => async () => {
      const n = await read($, focusAtom)
      const idx = list.findIndex(x => x.n === n && openNow.has(x.n))
      const turn = list[idx]
      const k = keys[idx]
      if (!turn || !k) {
        $.ui.toast(t('selectFirst'))
        return
      }
      return fn(turn, k.mark)
    }

    const shown = rows.filter(Boolean).length
    const hasFlags = list.some(
      x => x.testsFailed || x.errors > 0 || st[String(x.n)]?.aborted,
    )
    return (
      <Box flexDirection="column">
        <Text bold>
          {t.plural('turns', list.length)}
          {needle ? ` · ${t('found', { n: shown })}` : ''}
        </Text>
        {/* переключатели вида */}
        <Box flexDirection="row" gap={2} flexWrap="wrap">
          <Button key="toggle-h" plain hotkey="h" onPress={flip('headings')}>
            {toggleLabel(p.headings, t('headings'))}
          </Button>
          <Button key="toggle-f" plain hotkey="f" onPress={flip('files')}>
            {toggleLabel(p.files, t('files'))}
          </Button>
          <Button key="toggle-b" plain hotkey="b" onPress={flip('onlyMarked')}>
            {toggleLabel(p.onlyMarked, t('onlyMarked'))}
          </Button>
          <Button
            key="toggle-k"
            plain
            hotkey="k"
            onPress={async () => {
              let isOn = false
              await update($, prefs, v => {
                isOn = !v.compact
                return { ...v, compact: isOn }
              })
              // разово: строки вызовов в чате перерисуются уже скрытыми/видимыми
              $.ui.invalidate('ui.render')
              $.ui.toast(isOn ? t('compactOn') : t('compactOff'))
            }}
          >
            {toggleLabel(p.compact, t('compactChat'))}
          </Button>
        </Box>
        {/* другие виды и общие действия */}
        <Box flexDirection="row" gap={2} flexWrap="wrap">
          <Button key="by-file" plain hotkey="i" onPress={() => go({ kind: 'files' })}>
            {t('byFile')}
          </Button>
          <Button
            key="past"
            plain
            hotkey="p"
            onPress={async () => {
              await go({ kind: 'sessions' })
              if ((await read($, sessions)) === null) await loadSessions($)
            }}
          >
            {t('pastSessions')}
          </Button>
          <Button
            key="export"
            plain
            hotkey="x"
            onPress={async press => {
              const r = await $.ui.copy({ text: toMarkdown(list, t('pasted')), surface: press.surface })
              $.ui.toast(r.isCopied ? t('outlineCopied') : t('copyFailed'))
            }}
          >
            {t('exportOutline')}
          </Button>
          <Button
            key="expand-all"
            plain
            hotkey="e"
            onPress={() => update($, prefs, v => ({ ...v, expandAll: !v.expandAll, fold: {} }))}
          >
            {p.expandAll ? t('collapseAll') : t('expandAll')}
          </Button>
          <Button key="refresh" plain hotkey="r" onPress={() => refresh($)}>
            ↻
          </Button>
        </Box>
        {filterInput('filter', t('filterPlaceholder'))}
        {rule}
        {list.length === 0 && <Text>{t('empty')}</Text>}
        {(needle || p.onlyMarked) && shown === 0 && list.length > 0 && <Text>{t('nothingFound')}</Text>}
        {rows}
        {rule}
        {/* действия над выбранным ходом — только когда ход выбран */}
        {focused ? (
          <Box flexDirection="row" gap={2} flexWrap="wrap">
            <Text bold>{t('turnLabel', { n: focused.n })}</Text>
            <Button
              key="toggle-one"
              plain
              hotkey="o"
              onPress={withTurn(turn => setFold(turn.n, !openNow.get(turn.n)))}
            >
              {t('toggleSelected')}
            </Button>
            <Button
              key="mark"
              plain
              hotkey="s"
              onPress={withTurn(async (turn, mark) => {
                const isOn = await toggleMark($, mark)
                $.ui.toast(t(isOn ? 'marked' : 'unmarked', { n: turn.n }))
              })}
            >
              {t('bookmark')}
            </Button>
            <Button
              key="copy-answer"
              plain
              hotkey="y"
              onPress={press =>
                withTurn(async turn => {
                  if (!turn.answer) {
                    $.ui.toast(t('noAnswer'))
                    return
                  }
                  const r = await $.ui.copy({ text: turn.answer, surface: press.surface })
                  $.ui.toast(r.isCopied ? t('answerCopied', { n: turn.n }) : t('copyFailed'))
                })()
              }
            >
              {t('copyAnswer')}
            </Button>
            <Button
              key="reask"
              plain
              hotkey="a"
              onPress={withTurn(async turn => {
                // запрос может быть дорогим или менять файлы: нужен второй нажим
                const now = Date.now()
                if (!reaskPending || reaskPending.n !== turn.n || now - reaskPending.at > 3000) {
                  reaskPending = { n: turn.n, at: now }
                  $.ui.toast(t('reaskConfirm', { n: turn.n }))
                  return
                }
                reaskPending = undefined
                await $.prompt.submit({ text: turn.prompt, asUser: true })
                $.ui.toast(t('reaskQueued', { n: turn.n }))
              })}
            >
              {t('reask')}
            </Button>
            {focused.edits.length > 0 && (
              <Button key="diff" plain hotkey="d" onPress={withTurn(turn => go({ kind: 'diff', n: turn.n }))}>
                {t('diff')}
              </Button>
            )}
          </Box>
        ) : (
          <Text>{t('pickTurnHint')}</Text>
        )}
        <Text>{e.props.isFocused ? t('hintKeys') : t('hintMouse')}</Text>
        {hasFlags && <Text>{t('legend')}</Text>}
      </Box>
    )
  })
}
