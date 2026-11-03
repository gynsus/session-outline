import { expect, test } from 'claude-code/testing'
import type { SessionMessage } from 'claude-code'

import { build, diffOf, fileIndex, formatMs, localStamp, norm, sessionInfo, shellTargets, toMarkdown } from '../hooks/model'

test('shellTargets: sed -i, перенаправления, tee, mv, rm, python open', async () => {
  expect(shellTargets("sed -i '' 's/a/b/' src/a.ts")).toEqual(['src/a.ts'])
  expect(shellTargets('echo hi > out.txt && cat x >> log.md')).toEqual(['out.txt', 'log.md'])
  expect(shellTargets('npm test 2>&1 | tee report.txt')).toEqual(['report.txt'])
  expect(shellTargets('mv old.ts new.ts').sort()).toEqual(['new.ts', 'old.ts'])
  expect(shellTargets('rm -rf build tmp.txt')).toEqual(['build', 'tmp.txt'])
  expect(shellTargets("python3 -c \"open('a.json','w').write('{}')\"")).toEqual(['a.json'])
  expect(shellTargets('ls -la && cat file.txt > /dev/null')).toEqual([])
})

test('build: ошибки, упавшие тесты, правки, shell-файлы, ответ', async () => {
  const messages: SessionMessage[] = [
    { role: 'user', text: 'почини', toolUses: [] },
    {
      role: 'assistant',
      text: 'Смотрю.',
      toolUses: [
        {
          tool_use_id: 'a',
          tool: 'Edit',
          input: { file_path: '/p/src/x.ts', old_string: 'a\nb\nc', new_string: 'a\nB\nc' },
        },
        { tool_use_id: 'b', tool: 'Bash', input: { command: 'npm test' }, isError: true },
        { tool_use_id: 'c', tool: 'Bash', input: { command: "sed -i '' 's/x/y/' src/y.ts" } },
      ],
    },
    { role: 'assistant', text: 'Готово: исправил x.ts.', toolUses: [] },
  ]
  const [turn] = build(messages, '/p')
  expect(turn?.files).toEqual(['src/x.ts'])
  expect(turn?.shellFiles).toEqual(['src/y.ts'])
  expect(turn?.errors).toBe(1)
  expect(turn?.testsFailed).toBe(true)
  expect(turn?.edits.length).toBe(1)
  expect(turn?.answer).toBe('Готово: исправил x.ts.')
})

test('diffOf: общий контекст сохраняется, середина — замена', async () => {
  const d = diffOf({ file: 'x.ts', kind: 'edit', old: 'a\nb\nc', new: 'a\nB\nc', isCut: false })
  expect(d).toBe('@@ -1,3 +1,3 @@\n a\n-b\n+B\n c')
})

test('fileIndex и toMarkdown', async () => {
  const list = build(
    [
      { role: 'user', text: 'раз', toolUses: [] },
      {
        role: 'assistant',
        text: '## Итог',
        toolUses: [{ tool_use_id: 'a', tool: 'Write', input: { file_path: '/p/a.ts', content: 'x' } }],
      },
      { role: 'user', text: 'два', toolUses: [] },
      {
        role: 'assistant',
        text: 'ок',
        toolUses: [{ tool_use_id: 'b', tool: 'Bash', input: { command: 'touch a.ts b.ts' } }],
      },
    ],
    '/p',
  )
  expect(fileIndex(list)).toEqual([
    { file: 'a.ts', turns: [1, 2], approx: false },
    { file: 'b.ts', turns: [2], approx: true },
  ])
  expect(toMarkdown(list, '[вставка]')).toContain('1. раз\n   - Итог\n   - ✎ a.ts')
})

test('sessionInfo: название и запросы, служебное пропускается', async () => {
  const jsonl = [
    '{"type":"ai-title","aiTitle":"Моя сессия"}',
    '{"type":"user","message":{"role":"user","content":"первый вопрос"}}',
    '{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"x"}]}}',
    '{"type":"user","isMeta":true,"message":{"role":"user","content":"скрытое"}}',
    '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"второй"}]}}',
    'битая строка',
  ].join('\n')
  expect(sessionInfo(jsonl)).toEqual({ title: 'Моя сессия', prompts: ['первый вопрос', 'второй'] })
})

test('norm: вставки и пробелы не мешают, пунктуация различает', async () => {
  expect(norm('знакомый — <pasted_content id="1">длинный текст</pasted_content> ок')).toBe(
    norm('знакомый — [Pasted text #1 +3 lines] ок'),
  )
  expect(norm('fix foo-bar')).not.toBe(norm('fix foo_bar'))
})

test('formatMs с единицами языка и localStamp в местном времени', async () => {
  expect(formatMs(130_000, { s: 'с', m: 'м', h: 'ч' })).toBe('2м 10с')
  const d = new Date(2026, 10, 3, 9, 5)
  expect(localStamp(d.getTime())).toBe('2026-11-03 09:05')
})

test('shellTargets: каталог-цель не считается файлом', async () => {
  expect(shellTargets('cp a.txt dist/')).toEqual([])
  expect(shellTargets('echo x > "$FILE"')).toEqual([])
})
