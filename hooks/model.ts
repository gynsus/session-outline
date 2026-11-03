// Разбор истории сессии в оглавление. Чистые функции без $: их легко тестировать.
import type { SessionMessage } from 'claude-code'

import type { FileEdit, Heading, Turn } from '../types'

export const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

const MAX_EDIT = 6000 // символов на одну сторону правки
const MAX_ANSWER = 20000

// ---------------------------------------------------------------------------
// Текст
// ---------------------------------------------------------------------------

/**
 * Ключ для сопоставления текста из сохранённой истории и из строки чата.
 * Они расходятся во вставках (в истории — <pasted_content>…, в чате —
 * [Pasted text #1 …]) и в пробелах. Вставки и теги выкидываем, пробелы
 * убираем совсем, а пунктуацию оставляем: иначе foo-bar и foo_bar совпадут.
 * 200 символов хватает, чтобы разные запросы почти не сталкивались.
 */
export const norm = (s: string) =>
  s
    .replace(/<pasted_content\b[^>]*>[\s\S]*?<\/pasted_content\b[^>]*>/g, ' ')
    .replace(/\[Pasted text[^\]]*\]/gi, ' ')
    .replace(/<\/?[a-z][\w-]*(\s[^>]*)?>/gi, ' ')
    .toLowerCase()
    .replace(/\s+/g, '')
    .slice(0, 200)

/** Текст запроса для показа: вставки и служебные теги — коротким значком. */
export const clean = (s: string, pasted: string) =>
  s
    .replace(/<pasted_content\b[^>]*>[\s\S]*?<\/pasted_content\b[^>]*>/g, ` ${pasted} `)
    .replace(/<pasted_content\b[^>]*>/g, ` ${pasted} `)
    .replace(/<\/?[a-z][\w-]*(\s[^>]*)?>/gi, ' ')

export const cut = (s: string, w: number) => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > w ? one.slice(0, Math.max(1, w - 1)) + '…' : one
}

export function headingsOf(text: string): Heading[] {
  const out: Heading[] = []
  let inFence = false
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (inFence) continue
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line)
    if (m?.[1] && m[2]) out.push({ level: m[1].length, text: m[2] })
  }
  return out
}

const FILLER = /^(конечно|отлично|хорошо|давай(те)?|понял|ок(ей)?|sure|okay|ok|great|got it)([\s,.!:]|$)/i

export function gistOf(text: string): string {
  let inFence = false
  for (const raw of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) inFence = !inFence
    if (inFence) continue
    const line = raw
      .replace(/^\s*([-*>]|\d+\.)\s+/, '')
      .replace(/[*_`]/g, '')
      .trim()
    if (!line || line.startsWith('#') || line.startsWith('|') || FILLER.test(line)) continue
    return line
  }
  return ''
}

/** Короткие имена файлов; одинаковые basename различаем по родительской папке. */
export function shortNames(files: readonly string[]): string[] {
  const base = (f: string) => f.split('/').pop() ?? f
  return files.map(f => {
    const b = base(f)
    if (files.filter(o => base(o) === b).length < 2) return b
    return f.split('/').slice(-2).join('/')
  })
}

export type TimeUnits = { s: string; m: string; h: string }

export function formatMs(ms: number, u: TimeUnits = { s: 's', m: 'm', h: 'h' }): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}${u.s}`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}${u.m} ${s % 60}${u.s}` : `${Math.floor(m / 60)}${u.h} ${m % 60}${u.m}`
}

/** Местные дата и время «ГГГГ-ММ-ДД ЧЧ:ММ» (toISOString дал бы UTC). */
export function localStamp(ms: number): string {
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

// ---------------------------------------------------------------------------
// Файлы из shell-команд (приблизительно)
// ---------------------------------------------------------------------------

function words(segment: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(segment))) out.push(m[1] ?? m[2] ?? m[3] ?? '')
  return out
}

const looksLikePath = (w: string) =>
  !!w &&
  !w.startsWith('-') &&
  !w.includes('$') &&
  !w.endsWith('/') && // каталог (cp a dir/): какой файл в нём — неизвестно
  !/^\/dev\//.test(w) &&
  !/[*?{}()<>|;&`]/.test(w)

/**
 * Какие файлы команда, вероятно, меняет: sed -i, перенаправления > и >>, tee,
 * mv / cp (цель), rm, touch, а также open('…', 'w') в коде на Python.
 */
export function shellTargets(command: string): string[] {
  const found = new Set<string>()
  const add = (w: string | undefined) => {
    if (w && looksLikePath(w)) found.add(w)
  }
  // перенаправления вывода, кроме 2>&1 и т. п.
  for (const m of command.matchAll(/(?:^|[^0-9&])>>?\s*("[^"]+"|'[^']+'|[^\s;&|)]+)/g)) {
    add(m[1]?.replace(/^["']|["']$/g, ''))
  }
  for (const m of command.matchAll(/open\(\s*["']([^"']+)["']\s*,\s*["'][wa]/g)) add(m[1])

  for (const segment of command.split(/&&|\|\||;|\||\n/)) {
    const [cmd, ...rest] = words(segment.trim())
    const args = rest.filter(a => !a.startsWith('-'))
    switch (cmd) {
      case 'sed':
        if (rest.some(a => /^-i/.test(a) || a === '--in-place')) {
          const files = args.filter(a => a !== "''" && a !== '')
          // первый не-флаговый аргумент — сам скрипт sed
          files.slice(1).forEach(add)
        }
        break
      case 'tee':
      case 'touch':
      case 'rm':
        args.forEach(add)
        break
      case 'mv':
      case 'cp':
        add(args.at(-1))
        if (cmd === 'mv') args.slice(0, -1).forEach(add)
        break
    }
  }
  return [...found]
}

// ---------------------------------------------------------------------------
// Ходы
// ---------------------------------------------------------------------------

export function isRealPrompt(m: SessionMessage) {
  if (m.role !== 'user' || m.toolResults?.length) return false
  const t = m.text.trim()
  // служебные вставки: <command-name>, <task-notification>, <system-reminder>…
  return t.length > 0 && !t.startsWith('<')
}

const TEST_COMMAND =
  /\b(jest|vitest|pytest|mocha|phpunit|rspec|go test|cargo test|bun test|deno test|npm (run )?test|pnpm (run )?test|yarn test|plugin test|make test)\b/

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s)

function editsOf(tool: string, input: Record<string, unknown>, file: string): FileEdit[] {
  const one = (kind: FileEdit['kind'], old: string, now: string): FileEdit => ({
    file,
    kind,
    old: clip(old, MAX_EDIT),
    new: clip(now, MAX_EDIT),
    isCut: old.length > MAX_EDIT || now.length > MAX_EDIT,
  })
  switch (tool) {
    case 'Edit':
      return [one('edit', str(input.old_string), str(input.new_string))]
    case 'MultiEdit':
      return (Array.isArray(input.edits) ? input.edits : []).map(e => {
        const r = (e ?? {}) as Record<string, unknown>
        return one('edit', str(r.old_string), str(r.new_string))
      })
    case 'Write':
      return [one('write', '', str(input.content))]
    case 'NotebookEdit':
      return [one('notebook', '', str(input.new_source))]
    default:
      return []
  }
}

export function build(messages: readonly SessionMessage[], cwd: string): Turn[] {
  const rel = (p: string) => (p.startsWith(cwd + '/') ? p.slice(cwd.length + 1) : p)
  const out: Turn[] = []
  let cur: Turn | undefined
  for (const m of messages) {
    if (isRealPrompt(m)) {
      cur = {
        n: out.length + 1,
        prompt: m.text.trim(),
        headings: [],
        files: [],
        shellFiles: [],
        edits: [],
        tools: 0,
        errors: 0,
        testsFailed: false,
        gist: '',
        answer: '',
      }
      out.push(cur)
      continue
    }
    if (!cur || m.role !== 'assistant') continue
    if (m.text.trim()) {
      cur.headings.push(...headingsOf(m.text))
      const gist = gistOf(m.text)
      if (gist) cur.gist = gist
      cur.answer = clip(m.text.trim(), MAX_ANSWER)
    }
    for (const use of m.toolUses) {
      cur.tools++
      if (use.isError) cur.errors++
      const input = (use.input ?? {}) as Record<string, unknown>
      if (use.tool === 'Bash') {
        const command = str(input.command)
        if (use.isError && TEST_COMMAND.test(command)) cur.testsFailed = true
        for (const f of shellTargets(command)) {
          const r = rel(f)
          if (!cur.files.includes(r) && !cur.shellFiles.includes(r)) cur.shellFiles.push(r)
        }
        continue
      }
      if (!EDIT_TOOLS.has(use.tool)) continue
      const p = str(input.file_path) || str(input.notebook_path)
      if (!p) continue
      const r = rel(p)
      if (!cur.files.includes(r)) cur.files.push(r)
      cur.shellFiles = cur.shellFiles.filter(f => f !== r)
      if (!use.isError) cur.edits.push(...editsOf(use.tool, input, r))
    }
  }
  return out
}

/** Unified diff одной правки: без номеров строк (их нет в истории), одним блоком. */
export function diffOf(edit: FileEdit, maxLines = 400): string {
  const oldLines = edit.old ? edit.old.split('\n') : []
  const newLines = edit.new ? edit.new.split('\n') : []
  // общий префикс и суффикс показываем контекстом, середину — как замену
  let pre = 0
  while (pre < oldLines.length && pre < newLines.length && oldLines[pre] === newLines[pre]) pre++
  let suf = 0
  while (
    suf < oldLines.length - pre &&
    suf < newLines.length - pre &&
    oldLines[oldLines.length - 1 - suf] === newLines[newLines.length - 1 - suf]
  )
    suf++
  const ctxBefore = oldLines.slice(Math.max(0, pre - 2), pre)
  const removed = oldLines.slice(pre, oldLines.length - suf)
  const added = newLines.slice(pre, newLines.length - suf)
  const ctxAfter = oldLines.slice(oldLines.length - suf, oldLines.length - suf + 2)
  const body = [
    ...ctxBefore.map(l => ' ' + l),
    ...removed.map(l => '-' + l),
    ...added.map(l => '+' + l),
    ...ctxAfter.map(l => ' ' + l),
  ].slice(0, maxLines)
  const oldCount = body.filter(l => !l.startsWith('+')).length
  const newCount = body.filter(l => !l.startsWith('-')).length
  if (body.length === 0) return ''
  return [`@@ -1,${oldCount} +1,${newCount} @@`, ...body].join('\n')
}

/** Оглавление в Markdown: для экспорта в буфер обмена. */
export function toMarkdown(list: readonly Turn[], pasted: string): string {
  const lines: string[] = []
  for (const t of list) {
    lines.push(`${t.n}. ${cut(clean(t.prompt, pasted), 200)}`)
    // отступ от самого верхнего уровня заголовков в ответе, а не от «#»
    const top = Math.min(...t.headings.map(hd => hd.level))
    for (const hd of t.headings) lines.push(`${'   '.repeat(hd.level - top + 1)}- ${hd.text}`)
    if (t.files.length || t.shellFiles.length)
      lines.push(`   - ✎ ${[...t.files, ...t.shellFiles.map(f => '~' + f)].join(', ')}`)
  }
  return lines.join('\n')
}

/** Индекс «файл → номера ходов». */
export function fileIndex(list: readonly Turn[]): { file: string; turns: number[]; approx: boolean }[] {
  const map = new Map<string, { turns: number[]; approx: boolean }>()
  for (const t of list) {
    for (const f of t.files) {
      const e = map.get(f) ?? { turns: [], approx: false }
      if (!e.turns.includes(t.n)) e.turns.push(t.n)
      e.approx = false
      map.set(f, e)
    }
    for (const f of t.shellFiles) {
      const e = map.get(f) ?? { turns: [], approx: true }
      if (!e.turns.includes(t.n)) e.turns.push(t.n)
      map.set(f, e)
    }
  }
  return [...map.entries()]
    .map(([file, e]) => ({ file, ...e }))
    .sort((a, b) => b.turns.length - a.turns.length || a.file.localeCompare(b.file))
}

/** Название и запросы из файла сессии (.jsonl). */
export function sessionInfo(text: string, limit = 200): { title: string; prompts: string[] } {
  const out: string[] = []
  let title = ''
  for (const line of text.split('\n')) {
    if (out.length >= limit) break
    if (line.includes('"type":"ai-title"')) {
      try {
        title = String((JSON.parse(line) as { aiTitle?: unknown }).aiTitle ?? title)
      } catch {
        // пропускаем
      }
      continue
    }
    if (!line.includes('"type":"user"')) continue
    try {
      const row = JSON.parse(line) as {
        type?: string
        isMeta?: boolean
        message?: { content?: unknown }
      }
      if (row.type !== 'user' || row.isMeta) continue
      const c = row.message?.content
      const text =
        typeof c === 'string'
          ? c
          : Array.isArray(c)
            ? c
                .filter((b): b is { type: string; text: string } => !!b && b.type === 'text')
                .map(b => b.text)
                .join('\n')
            : ''
      const t = text.trim()
      if (t && !t.startsWith('<')) out.push(cut(t, 300))
    } catch {
      // битая строка — пропускаем
    }
  }
  return { title, prompts: out }
}

/** Каталог с файлами сессий проекта: ~/.claude/projects/<путь, где не-буквы → «-»>. */
export const projectDir = (home: string, cwd: string) =>
  `${home}/.claude/projects/${cwd.replace(/[^A-Za-z0-9]/g, '-')}`
