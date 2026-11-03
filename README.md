# session-outline

A side pane for [Claude Code](https://code.claude.com) that turns a long session into a table of contents. Instead of scrolling the chat, you see every prompt, the headings of each answer, the files that changed, and markers for turns that went wrong. Click a row to jump to it in the chat.

*Русская версия — ниже.*

```
3 prompts
h: ● Headings  f: ● Files  b: ○ Only ⭐  k: ○ Compact chat
i: By file  p: Past sessions  x: Export  e: Expand all  r: ↻
[/ filter: prompts, headings, files]
──────────────────────────────────────────
  ▸ 1. ✗ fix the build
 ▶▾ 2. ⭐ add documentation
       · Installation
       · Usage
       ✎ README.md, ~build.sh · ⚙ 12 · ⏱ 2m 10s
──────────────────────────────────────────
Turn 2:  o: Expand/collapse  s: ⭐  y: Copy answer  a: Ask again…  d: Diff
```

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install session-outline --marketplace gynsus/session-outline
```

Answer `y` to add the marketplace, then pick a scope (user scope is the usual choice).

From a shell:

```
claude plugin install session-outline --marketplace gynsus/session-outline
```

In the desktop app: click **+** next to the prompt box → **Plugins** → **Add marketplace** with `gynsus/session-outline` → **Add plugin**.

## Use

The pane opens by itself in a wide terminal (fullscreen layout, about 110–144 columns and up). Otherwise run `/outline`.

| Key | What it does |
| --- | --- |
| ↑ ↓ | move between rows (the pane must have focus: click it, `ctrl+x tab`, or `/outline`) |
| Enter / click | jump to that prompt or heading in the chat, expand the turn and select it |
| `o` `s` `y` `a` `d` | on the selected turn: expand/collapse, bookmark ⭐, copy the answer, send the prompt again (press `a` twice), show the diff |
| `h` `f` `b` `k` | toggle headings, files, only bookmarked turns, compact chat (hides tool-call rows; `ctrl+o` still shows everything) |
| `i` | files view: every changed file with the turns that touched it |
| `p` | past sessions of this project; click one to copy `claude --resume <id>` |
| `x` | copy the whole outline as Markdown |
| `e` `r` `q` | expand all, refresh, back |
| Esc | return focus to the prompt |

Markers: `⚠` a tool returned an error, `✗` a test command failed, `⏹` the turn was interrupted, `⭐` bookmark. Files marked `~` were guessed from shell commands (`sed -i`, `>`, `mv`, …) and have no diff.

**Language.** English and Russian. By default the pane follows Claude Code's `language` setting, then the language you write your prompts in, then `$LANG`. You can set it under the plugin's options in `/plugin`.

## Limits

- A mod gets no keystrokes of its own, so `←` / `→` do nothing in the pane. If the focus is in the prompt, Claude Code handles them itself.
- Claude Code only lets you scroll to messages it has drawn. After a restart, older messages are drawn only once you scroll to them, so the first jump to them goes in steps. If it stops, scroll up a bit and press Enter again.
- Message ids are not exposed, so rows are matched by text. Two identical prompts can be swapped after a restart.
- Time and tokens are shown only for turns that finished while the plugin was loaded. Tokens include cache reads, so the numbers are large.
- Diffs come from the Edit/Write inputs and have no real line numbers.

## Develop

```
claude --plugin-dir ~/code/session-outline    # run a session with the plugin loaded from this folder
claude plugin validate ~/code/session-outline
claude plugin test ~/code/session-outline
```

The code is in `hooks/`: `register.tsx` (hooks and the pane), `model.ts` (parsing the session, no engine calls), `i18n.ts` (all interface text). To add a language, add one dictionary object to `i18n.ts`.

## License

MIT

---

# session-outline (по-русски)

Боковая панель для Claude Code: оглавление длинной сессии. Вместо прокрутки чата видно все запросы, заголовки ответов, изменённые файлы и метки проблемных ходов. Клик по строке прокручивает чат к нужному месту.

## Установка

В строке ввода Claude Code (в терминале):

```
/plugin install session-outline --marketplace gynsus/session-outline
```

Ответьте `y`, чтобы добавить маркетплейс, затем выберите область (обычно user).

Из командной строки:

```
claude plugin install session-outline --marketplace gynsus/session-outline
```

## Как пользоваться

Панель открывается сама в широком терминале, иначе наберите `/outline`.

- **↑↓** — выбор строки, **Enter** или клик — перейти к сообщению в чате, раскрыть ход и выбрать его.
- **У выбранного хода:** `o` раскрыть, `s` закладка ⭐, `y` копировать ответ, `a` повторить запрос (нажать дважды), `d` дифф.
- **Переключатели:** `h` заголовки, `f` файлы, `b` только ⭐, `k` компактный чат (скрывает вызовы инструментов, `ctrl+o` показывает всё).
- **Виды:** `i` по файлам, `p` прошлые сессии (клик копирует `claude --resume <id>`).
- **Прочее:** `x` экспорт оглавления в Markdown, `e` раскрыть все, `r` обновить, `q` назад, Esc вернуть фокус в строку ввода.

**Метки:**
- `⚠` — инструмент вернул ошибку;
- `✗` — упали тесты;
- `⏹` — ход прерван;
- `~` у файла — изменение угадано по shell-команде.

**Язык.** Русский и английский. По умолчанию язык берётся из настройки Claude Code `language`, затем по языку ваших запросов, затем из `$LANG`. Выбрать вручную можно в настройках плагина в `/plugin`.

Ограничения описаны выше, в разделе **Limits**.
