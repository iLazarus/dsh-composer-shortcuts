/**
 * dsh-composer-shortcuts — Client half.
 *
 * A left-sidebar page plus a document-capture key handler for the conversation
 * composer. Defaults reproduce the shipped behavior exactly:
 *
 *   Enter            send
 *   Shift+Enter      line break
 *   Ctrl/Cmd+Enter   send (the shipped complementary delivery gesture)
 *
 * Once the user records a different binding, the composer's native Enter
 * gestures are swallowed and only the recorded combos act. Send goes through
 * the public `inputActions.submit()` bridge mounted in
 * `conversation.composer.dock`; a line break is replayed as a Lexical
 * `beforeinput` event, the same path Shift+Enter uses natively.
 *
 * Nothing is intercepted while a slash/@ menu is visible, during IME
 * composition, or when the composer is read-only.
 */
window.__ModuleLoader__.load({
  id: 'dsh-composer-shortcuts',
  factory(require) {
    'use strict'

    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef, useState, useSyncExternalStore } = React
    const useIsomorphicLayoutEffect = React.useLayoutEffect || React.useEffect

    const NS = 'dsh.composerShortcuts'
    const SLOT_ID = 'composer-shortcuts'
    const STORAGE_KEY = 'dsh.composer-shortcuts.v1'
    const COMPOSER_SELECTOR = '[data-composer-input]'
    const CARD_SELECTOR = '[data-composer-card]'
    const TRIGGER_MENU_SELECTOR = '[data-trigger-menu]'

    const DEFAULT_SEND = Object.freeze({
      code: 'Enter',
      ctrl: false,
      meta: false,
      alt: false,
      shift: false,
    })
    const DEFAULT_NEWLINE = Object.freeze({
      code: 'Enter',
      ctrl: false,
      meta: false,
      alt: false,
      shift: true,
    })
    const DEFAULT_PREFS = Object.freeze({ send: DEFAULT_SEND, newline: DEFAULT_NEWLINE })

    // Physical modifier and exotic keys can be held for a chord, never recorded
    // as its ordinary key.
    const MODIFIER_PATTERN = /^(?:Control|Shift|Alt|Meta)(?:Left|Right)$/
    const MODIFIER_ONLY = new Set([
      'CapsLock',
      'Fn',
      'FnLock',
      'OS',
      'OSLeft',
      'OSRight',
      'Hyper',
      'Super',
      'AltGraph',
      'Dead',
    ])

    const PRINTABLE_CODES = new Set([
      'Comma',
      'Period',
      'Slash',
      'Backslash',
      'Backquote',
      'Minus',
      'Equal',
      'BracketLeft',
      'BracketRight',
      'Semicolon',
      'Quote',
    ])

    const NAVIGATION_CODES = new Set([
      'Tab',
      'Backspace',
      'Delete',
      'Insert',
      'Home',
      'End',
      'PageUp',
      'PageDown',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
    ])

    const KEY_NAMES = {
      Enter: 'Enter',
      NumpadEnter: 'Num Enter',
      Escape: 'Esc',
      Space: 'Space',
      Tab: 'Tab',
      Backspace: '\u232b',
      Delete: 'Del',
      Insert: 'Ins',
      Home: 'Home',
      End: 'End',
      PageUp: 'PgUp',
      PageDown: 'PgDn',
      ArrowUp: '\u2191',
      ArrowDown: '\u2193',
      ArrowLeft: '\u2190',
      ArrowRight: '\u2192',
      Comma: ',',
      Period: '.',
      Slash: '/',
      Backslash: '\\',
      Backquote: '`',
      Minus: '-',
      Equal: '=',
      BracketLeft: '[',
      BracketRight: ']',
      Semicolon: ';',
      Quote: "'",
      NumpadAdd: 'Num +',
      NumpadSubtract: 'Num -',
      NumpadMultiply: 'Num *',
      NumpadDivide: 'Num /',
      NumpadDecimal: 'Num .',
      Numpad0: 'Num 0',
      Numpad1: 'Num 1',
      Numpad2: 'Num 2',
      Numpad3: 'Num 3',
      Numpad4: 'Num 4',
      Numpad5: 'Num 5',
      Numpad6: 'Num 6',
      Numpad7: 'Num 7',
      Numpad8: 'Num 8',
      Numpad9: 'Num 9',
    }

    const syntheticKeys = new WeakSet()

    // ---- Pure chord logic -------------------------------------------------

    /** @param {string} code - KeyboardEvent.code. */
    function isModifierCode(code) {
      return (
        typeof code === 'string' &&
        (MODIFIER_PATTERN.test(code) || MODIFIER_ONLY.has(code))
      )
    }

    /** @param {string} code - KeyboardEvent.code. */
    function keyName(code) {
      if (typeof code !== 'string' || code === '') return '?'
      if (Object.prototype.hasOwnProperty.call(KEY_NAMES, code)) return KEY_NAMES[code]
      if (code.startsWith('Key')) return code.slice(3)
      if (code.startsWith('Digit')) return code.slice(5)
      if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`
      return code
    }

    /** The numpad Enter is the same gesture as the main Enter for users. */
    function normalizeCode(code) {
      return code === 'NumpadEnter' ? 'Enter' : code
    }

    /** @param {KeyboardEvent} event */
    function chordOf(event) {
      return {
        code: normalizeCode(event.code),
        ctrl: event.ctrlKey === true,
        meta: event.metaKey === true,
        alt: event.altKey === true,
        shift: event.shiftKey === true,
      }
    }

    /** @param {unknown} value */
    function cleanChord(value) {
      if (value === null || typeof value !== 'object') return undefined
      const code = normalizeCode(value.code)
      if (
        typeof code !== 'string' ||
        code === '' ||
        code === 'Unidentified' ||
        isModifierCode(code)
      ) {
        return undefined
      }
      return {
        code,
        ctrl: value.ctrl === true,
        meta: value.meta === true,
        alt: value.alt === true,
        shift: value.shift === true,
      }
    }

    /** @param {object} chord */
    function cloneChord(chord) {
      return {
        code: chord.code,
        ctrl: chord.ctrl === true,
        meta: chord.meta === true,
        alt: chord.alt === true,
        shift: chord.shift === true,
      }
    }

    function cloneDefaults() {
      return {
        send: cloneChord(DEFAULT_SEND),
        newline: cloneChord(DEFAULT_NEWLINE),
      }
    }

    /** @param {unknown} a @param {unknown} b */
    function sameChord(a, b) {
      return (
        a !== null &&
        b !== null &&
        typeof a === 'object' &&
        typeof b === 'object' &&
        a.code === b.code &&
        a.ctrl === b.ctrl &&
        a.meta === b.meta &&
        a.alt === b.alt &&
        a.shift === b.shift
      )
    }

    /** @param {unknown} raw */
    function normalizePrefs(raw) {
      if (raw === null || typeof raw !== 'object') return cloneDefaults()
      const send = cleanChord(raw.send)
      const newline = cleanChord(raw.newline)
      if (
        send === undefined ||
        newline === undefined ||
        sameChord(send, newline) ||
        isUnsafeBareChord(send) ||
        isUnsafeBareChord(newline)
      ) {
        return cloneDefaults()
      }
      return { send, newline }
    }

    /** @param {{send: object, newline: object}} prefs */
    function isDefaultPrefs(prefs) {
      return sameChord(prefs.send, DEFAULT_SEND) && sameChord(prefs.newline, DEFAULT_NEWLINE)
    }

    /**
     * The three gestures the shipped composer reacts to. Alt, AltGraph, and
     * Shift together with Ctrl/Cmd deliberately return null and stay native.
     * @param {KeyboardEvent} event
     * @returns {'send'|'newline'|null}
     */
    function nativeGestureOf(event) {
      if (event.key !== 'Enter' || event.altKey === true) return null
      if (event.shiftKey === true) {
        if (event.ctrlKey === true || event.metaKey === true) return null
        return 'newline'
      }
      if (event.ctrlKey === true || event.metaKey === true) {
        if (event.ctrlKey === true && event.metaKey === true) return null
        return 'send'
      }
      return 'send'
    }

    /**
     * Decide what one keydown should do under the current mapping. A null
     * answer means "leave the event completely alone".
     * @param {KeyboardEvent} event
     * @param {{send: object, newline: object}} prefs
     * @returns {'send'|'newline'|'suppress'|null}
     */
    function actionFor(event, prefs) {
      if (isDefaultPrefs(prefs)) return null
      const chord = chordOf(event)
      const wantsSend = sameChord(chord, prefs.send)
      const wantsNewline = sameChord(chord, prefs.newline)
      if (!wantsSend && !wantsNewline && nativeGestureOf(event) === null) return null
      if (wantsSend) return 'send'
      if (wantsNewline) return 'newline'
      // A shipped Enter gesture that is no longer assigned: swallow it so a
      // custom mapping truly replaces the old shortcut.
      return 'suppress'
    }

    /**
     * A bare character or editing/navigation key would make the composer
     * unusable (every "s" would send). Such a chord needs Ctrl, Alt, or Win.
     * Enter keeps its native family, and function keys are safe on their own.
     * @param {{code: string, ctrl: boolean, meta: boolean, alt: boolean, shift: boolean}} chord
     */
    function isUnsafeBareChord(chord) {
      if (chord.ctrl === true || chord.alt === true || chord.meta === true) return false
      if (chord.code === 'Enter') return false
      if (/^F(?:[1-9]|1[0-9]|2[0-4])$/u.test(chord.code)) return false
      return (
        chord.code === 'Space' ||
        chord.code.startsWith('Key') ||
        chord.code.startsWith('Digit') ||
        chord.code.startsWith('Numpad') ||
        PRINTABLE_CODES.has(chord.code) ||
        NAVIGATION_CODES.has(chord.code)
      )
    }

    /**
     * IME composition owns the keyboard. AltGraph is not treated as composition:
     * a user may deliberately record an AltGr chord, and the mapping only acts
     * when it matches that exact chord.
     * @param {KeyboardEvent} event
     */
    function isComposing(event) {
      return event.isComposing === true || event.keyCode === 229
    }

    function isMacPlatform() {
      try {
        const platform =
          (navigator.userAgentData && navigator.userAgentData.platform) ||
          navigator.platform ||
          ''
        return /mac|iphone|ipad/i.test(platform)
      } catch (_error) {
        return false
      }
    }

    /** @param {{code: string, ctrl: boolean, meta: boolean, alt: boolean, shift: boolean}} chord */
    function chordTokens(chord, mac) {
      const tokens = []
      if (chord.ctrl) tokens.push(mac ? '\u2303' : 'Ctrl')
      if (chord.alt) tokens.push(mac ? '\u2325' : 'Alt')
      if (chord.shift) tokens.push(mac ? '\u21e7' : 'Shift')
      if (chord.meta) tokens.push(mac ? '\u2318' : 'Win')
      tokens.push(keyName(chord.code))
      return tokens
    }

    function chordLabel(chord, mac) {
      return chordTokens(chord, mac).join(mac ? '' : '+')
    }

    // ---- Small observable store ------------------------------------------

    function createStore(initial) {
      let snapshot = initial
      const listeners = new Set()
      return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        set(next) {
          if (Object.is(next, snapshot)) return
          snapshot = next
          for (const listener of [...listeners]) listener()
        },
      }
    }

    function readPrefs() {
      try {
        return normalizePrefs(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null'))
      } catch (_error) {
        return cloneDefaults()
      }
    }

    function persistPrefs(prefs) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
        return true
      } catch (_error) {
        return false
      }
    }

    // ---- Locale dictionaries ---------------------------------------------

    const en = {
      title: 'Composer shortcuts',
      subtitle:
        'Choose the keys that send a message and insert a line break. These bindings apply only inside the conversation composer; menus and IME composition are never intercepted.',
      mapping: 'Key mapping',
      send: 'Send message',
      sendDesc: 'Press this combination in the composer to send the current draft.',
      newline: 'Line break',
      newlineDesc: 'Press this combination to insert a line break at the caret.',
      record: 'Record',
      cancel: 'Cancel',
      pressKeys: 'Press the new shortcut\u2026',
      escHint: 'Press Esc to cancel.',
      statusDefault: 'Using the DSH defaults',
      statusDefaultDesc: 'Enter sends the message and Shift+Enter adds a line break. The plugin leaves the native handling untouched.',
      statusCustom: 'Custom shortcut mapping active',
      statusCustomDesc: 'The old Enter gestures are replaced by the mapping below inside the composer.',
      defaultBadge: 'Default',
      customBadge: 'Custom',
      swap: 'Swap send and line break',
      reset: 'Restore defaults',
      conflict: 'Send and line break cannot use the same combination. Try another one.',
      unsafeChord:
        'Add Ctrl, Alt, or Win to a character or navigation key so normal typing keeps working.',
      storageFailed:
        'The browser refused local storage, so this change only lasts for the current page.',
      note:
        'Shortcuts work only inside the conversation composer. While the slash command or @ reference menu is open, keys remain with the menu; IME composition and read-only states are also left alone.',
      storageNote: 'Settings are stored in this browser\u2019s local storage.',
      recordAria: 'Record the {name} shortcut',
      cancelAria: 'Cancel recording the {name} shortcut',
      currentAria: '{name} is currently {keys}',
    }

    const zh = {
      title: '快捷键',
      subtitle:
        '自定义发送消息和换行的按键。设置只作用于对话输入框；菜单展开和输入法组字时不会拦截。',
      mapping: '按键映射',
      send: '发送消息',
      sendDesc: '在输入框里按下这个组合键，直接发送当前内容。',
      newline: '换行',
      newlineDesc: '按下这个组合键，在光标处插入一个换行。',
      record: '录制',
      cancel: '取消',
      pressKeys: '请按下新的组合键…',
      escHint: '按 Esc 取消。',
      statusDefault: '使用 DSH 默认按键',
      statusDefaultDesc: 'Enter 发送消息，Shift + Enter 换行。插件不会干预原生行为。',
      statusCustom: '自定义按键已生效',
      statusCustomDesc: '在输入框里，原来的 Enter 手势会被下面的映射替换。',
      defaultBadge: '默认',
      customBadge: '自定义',
      swap: '交换发送与换行',
      reset: '恢复默认',
      conflict: '发送和换行不能使用同一个组合键，请换一个。',
      unsafeChord: '字符键或导航键请搭配 Ctrl、Alt 或 Win，避免影响正常输入。',
      storageFailed: '浏览器拒绝写入本地存储，本次修改只在当前页面有效。',
      note:
        '快捷键只在对话输入框内生效。斜杠命令或 @ 引用菜单展开时，按键仍归菜单；输入法组字和只读状态也不会被拦截。',
      storageNote: '设置保存在当前浏览器的本地存储中。',
      recordAria: '录制{name}快捷键',
      cancelAria: '取消录制{name}快捷键',
      currentAria: '{name}当前是{keys}',
    }

    // ---- Presentation -----------------------------------------------------

    const CSS = `
.dsh-cs-page{height:100%;min-height:0;flex:1 1 auto;overflow-y:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:1.5}
.dsh-cs-page *{box-sizing:border-box}
.dsh-cs-inner{max-width:760px;margin:0 auto;padding:36px 28px 80px}
.dsh-cs-head{display:flex;align-items:center;gap:10px}
.dsh-cs-head-glyph{color:var(--dsw-alias-brand-primary);flex:none;display:block}
.dsh-cs-title{font-size:20px;font-weight:600;margin:0;letter-spacing:-.01em}
.dsh-cs-sub{color:var(--dsw-alias-label-secondary);margin:8px 0 24px;max-width:64ch}
.dsh-cs-status{display:flex;align-items:center;gap:12px;padding:14px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);margin:0 0 24px}
.dsh-cs-status-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-success-primary);flex:none}
.dsh-cs-status.is-custom .dsh-cs-status-dot{background:var(--dsw-alias-brand-primary)}
.dsh-cs-status-main{flex:1;min-width:0}
.dsh-cs-status-title{font-weight:500}
.dsh-cs-status-desc{color:var(--dsw-alias-label-secondary);font-size:12px;margin-top:2px}
.dsh-cs-badge{flex:none;font-size:10px;font-weight:600;letter-spacing:.04em;padding:2px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);text-transform:uppercase}
.dsh-cs-status.is-custom .dsh-cs-badge{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dsh-cs-section-title{font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);margin:0 0 8px}
.dsh-cs-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden}
.dsh-cs-row{display:flex;align-items:center;gap:18px;padding:16px}
.dsh-cs-row+.dsh-cs-row{border-top:1px solid var(--dsw-alias-border-l1)}
.dsh-cs-row.is-armed{background:var(--dsw-alias-bg-layer-2)}
.dsh-cs-main{flex:1;min-width:0}
.dsh-cs-name{font-weight:500}
.dsh-cs-desc{color:var(--dsw-alias-label-secondary);font-size:12px;margin-top:3px}
.dsh-cs-recording{color:var(--dsw-alias-brand-primary);font-size:12px;font-weight:500;margin-top:7px}
.dsh-cs-esc{color:var(--dsw-alias-label-secondary);font-weight:400;margin-left:4px}
.dsh-cs-controls{display:flex;align-items:center;gap:12px;flex:none}
.dsh-cs-keys-wrap{display:flex;align-items:center;gap:4px;min-height:28px}
.dsh-cs-keys-wrap.is-muted{opacity:.4}
.dsh-cs-keys{display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.dsh-cs-keys kbd{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:26px;padding:0 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;font-weight:500;line-height:1;box-shadow:inset 0 -1px 0 var(--dsw-alias-border-l1);white-space:nowrap}
.dsh-cs-sep{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1}
.dsh-cs-record{height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;transition:background .12s,border-color .12s,color .12s;white-space:nowrap}
.dsh-cs-record:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay)}
.dsh-cs-record[aria-pressed="true"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dsh-cs-record:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-cs-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.dsh-cs-btn{height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;transition:background .12s,border-color .12s;white-space:nowrap}
.dsh-cs-btn:hover:not(:disabled){border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
.dsh-cs-btn:disabled{opacity:.45;cursor:default}
.dsh-cs-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-cs-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.6;margin:12px 0 0}
.dsh-cs-note{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.65;margin:22px 0 0;max-width:70ch}
.dsh-cs-note-quiet{margin-top:6px}
@media (max-width:640px){
  .dsh-cs-inner{padding:24px 18px 64px}
  .dsh-cs-row{flex-direction:column;align-items:stretch;gap:12px}
  .dsh-cs-controls{justify-content:space-between}
  .dsh-cs-keys{justify-content:flex-start}
}
@media (prefers-reduced-motion:reduce){
  .dsh-cs-record,.dsh-cs-btn{transition:none}
}
`

    function KeyboardGlyph(props) {
      const size = typeof props.size === 'number' ? props.size : 16
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 20 20',
          fill: 'none',
          'aria-hidden': 'true',
          focusable: 'false',
          className: props.className,
          style: { display: 'block' },
        },
        h('rect', {
          x: 2.2,
          y: 4.4,
          width: 15.6,
          height: 11.2,
          rx: 2.4,
          stroke: 'currentColor',
          strokeWidth: 1.4,
        }),
        h('path', {
          d: 'M5 8h1M8 8h1M11 8h1M14 8h1M5 11h1M8 11h1M11 11h1M14 11h1',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M6.5 13.4h7',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
        }),
      )
    }

    function Keycaps(props) {
      const tokens = chordTokens(props.chord, props.mac)
      return h(
        'span',
        { className: 'dsh-cs-keys' },
        tokens.map((token, index) =>
          h(
            React.Fragment,
            { key: index },
            index > 0
              ? h(
                  'span',
                  { className: 'dsh-cs-sep', 'aria-hidden': 'true' },
                  props.mac ? '' : '+',
                )
              : null,
            h('kbd', null, token),
          ),
        ),
      )
    }

    function ShortcutRow(props) {
      const { t, mac, slot, title, desc, chord, armed, onRecord } = props
      const isArmed = armed === slot
      return h(
        'div',
        { className: `dsh-cs-row${isArmed ? ' is-armed' : ''}` },
        h(
          'div',
          { className: 'dsh-cs-main' },
          h('div', { className: 'dsh-cs-name' }, title),
          h('div', { className: 'dsh-cs-desc' }, desc),
          isArmed
            ? h(
                'div',
                { className: 'dsh-cs-recording', role: 'status' },
                t('pressKeys'),
                ' ',
                h('span', { className: 'dsh-cs-esc' }, t('escHint')),
              )
            : null,
        ),
        h(
          'div',
          { className: 'dsh-cs-controls' },
          h(
            'div',
            {
              className: `dsh-cs-keys-wrap${isArmed ? ' is-muted' : ''}`,
              'aria-label': t('currentAria', {
                name: title,
                keys: chordLabel(chord, mac),
              }),
            },
            h(Keycaps, { chord, mac }),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-cs-record',
              'data-dsh-cs-record': slot,
              'aria-pressed': isArmed,
              'aria-label': t(isArmed ? 'cancelAria' : 'recordAria', { name: title }),
              onClick: () => onRecord(slot),
            },
            isArmed ? t('cancel') : t('record'),
          ),
        ),
      )
    }

    function ShortcutPanel(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const store = props.store
      const prefs = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
      const [armed, setArmed] = useState(null)
      const [error, setError] = useState(null)
      const [saveFailed, setSaveFailed] = useState(false)
      const prefsRef = useRef(prefs)
      prefsRef.current = prefs
      const mac = isMacPlatform()
      const custom = !isDefaultPrefs(prefs)

      useEffect(() => {
        if (armed === null) return undefined
        let active = true
        const handlers = {
          onChord(chord) {
            if (!active) return
            if (isUnsafeBareChord(chord)) {
              setError('unsafeChord')
              return
            }
            const current = prefsRef.current
            const other = armed === 'send' ? current.newline : current.send
            if (sameChord(chord, other)) {
              setError('conflict')
              return
            }
            const next = { ...current, [armed]: chord }
            const saved = props.actions.setBindings(next)
            setSaveFailed(!saved)
            setError(null)
            setArmed(null)
          },
          onCancel() {
            if (!active) return
            setArmed(null)
            setError(null)
          },
        }
        props.actions.beginRecording(armed, handlers)
        return () => {
          active = false
          props.actions.endRecording()
        }
      }, [armed, props.actions])

      useEffect(() => {
        if (armed === null) return undefined
        const onPointerDown = (event) => {
          const record = document.querySelector(`[data-dsh-cs-record="${armed}"]`)
          const target = event.target
          if (record !== null && target instanceof Node && record.contains(target)) return
          setArmed(null)
          setError(null)
        }
        const onBlur = () => {
          setArmed(null)
          setError(null)
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        window.addEventListener('blur', onBlur)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          window.removeEventListener('blur', onBlur)
        }
      }, [armed])

      const onRecord = (slot) => {
        setError(null)
        setArmed((current) => (current === slot ? null : slot))
      }

      const onReset = () => {
        const saved = props.actions.reset()
        setSaveFailed(!saved)
        setError(null)
        setArmed(null)
      }

      const onSwap = () => {
        if (sameChord(prefs.send, prefs.newline)) return
        const saved = props.actions.setBindings({ send: prefs.newline, newline: prefs.send })
        setSaveFailed(!saved)
        setError(null)
        setArmed(null)
      }

      return h(
        'div',
        { className: 'dsh-cs-page' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'dsh-cs-inner' },
          h(
            'div',
            { className: 'dsh-cs-head' },
            h(KeyboardGlyph, { size: 22, className: 'dsh-cs-head-glyph' }),
            h('h1', { className: 'dsh-cs-title' }, t('title')),
          ),
          h('p', { className: 'dsh-cs-sub' }, t('subtitle')),
          h(
            'div',
            { className: `dsh-cs-status${custom ? ' is-custom' : ''}`, role: 'status' },
            h('span', { className: 'dsh-cs-status-dot', 'aria-hidden': 'true' }),
            h(
              'div',
              { className: 'dsh-cs-status-main' },
              h(
                'div',
                { className: 'dsh-cs-status-title' },
                custom ? t('statusCustom') : t('statusDefault'),
              ),
              h(
                'div',
                { className: 'dsh-cs-status-desc' },
                custom ? t('statusCustomDesc') : t('statusDefaultDesc'),
              ),
            ),
            h('span', { className: 'dsh-cs-badge' }, custom ? t('customBadge') : t('defaultBadge')),
          ),
          h(
            'section',
            { className: 'dsh-cs-section' },
            h('h2', { className: 'dsh-cs-section-title' }, t('mapping')),
            h(
              'div',
              { className: 'dsh-cs-card' },
              h(ShortcutRow, {
                t,
                mac,
                slot: 'send',
                title: t('send'),
                desc: t('sendDesc'),
                chord: prefs.send,
                armed,
                onRecord,
              }),
              h(ShortcutRow, {
                t,
                mac,
                slot: 'newline',
                title: t('newline'),
                desc: t('newlineDesc'),
                chord: prefs.newline,
                armed,
                onRecord,
              }),
            ),
          ),
          h(
            'div',
            { className: 'dsh-cs-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-cs-btn',
                onClick: onSwap,
                disabled: sameChord(prefs.send, prefs.newline),
              },
              t('swap'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-cs-btn',
                onClick: onReset,
                disabled: !custom,
              },
              t('reset'),
            ),
          ),
          error !== null ? h('p', { className: 'dsh-cs-error', role: 'alert' }, t(error)) : null,
          saveFailed
            ? h('p', { className: 'dsh-cs-error', role: 'alert' }, t('storageFailed'))
            : null,
          h('p', { className: 'dsh-cs-note' }, t('note')),
          h('p', { className: 'dsh-cs-note dsh-cs-note-quiet' }, t('storageNote')),
        ),
      )
    }

    function SidebarIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 16
      return h(KeyboardGlyph, { size, className: 'dsh-cs-sidebar-glyph' })
    }

    function ComposerBridge(props) {
      const { bridge, inputActions, sessionId } = props
      useIsomorphicLayoutEffect(() => {
        if (bridge === null || bridge === undefined) return undefined
        bridge.actions = inputActions || null
        bridge.sessionId = sessionId
        return () => {
          if (bridge.actions === inputActions) {
            bridge.actions = null
            bridge.sessionId = null
          }
        }
      }, [bridge, inputActions, sessionId])
      return h('span', {
        'data-dsh-composer-shortcuts': 'active',
        'aria-hidden': 'true',
        style: { display: 'none' },
      })
    }

    // ---- Client half ------------------------------------------------------

    function apply(ctx) {
      const translate = ctx.locale.bind(NS)
      const store = createStore(readPrefs())
      const bridge = { actions: null, sessionId: null }
      let recording = null

      const actions = {
        beginRecording(slot, handlers) {
          recording = { slot, onChord: handlers.onChord, onCancel: handlers.onCancel }
        },
        endRecording() {
          recording = null
        },
        setBindings(next) {
          const normalized = normalizePrefs(next)
          const saved = persistPrefs(normalized)
          store.set(normalized)
          return saved
        },
        reset() {
          return actions.setBindings(cloneDefaults())
        },
      }

      function sendMessage(editor, repeat) {
        if (repeat === true) return
        const current = bridge.actions
        if (current !== null && current !== undefined && typeof current.submit === 'function') {
          try {
            current.submit()
            return
          } catch (error) {
            console.error('[composer-shortcuts] submit failed', error)
          }
        }
        // The bridge is mounted with the composer; this fallback covers the
        // first frame and any future shell that omits the standard prop.
        const synthetic = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          bubbles: true,
          cancelable: true,
          composed: true,
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
        })
        syntheticKeys.add(synthetic)
        try {
          editor.dispatchEvent(synthetic)
        } catch (_error) {
          /* nothing else left to try */
        }
      }

      function insertLineBreak(editor) {
        let handled = false
        try {
          handled = !editor.dispatchEvent(
            new InputEvent('beforeinput', {
              inputType: 'insertLineBreak',
              bubbles: true,
              cancelable: true,
              composed: true,
            }),
          )
        } catch (_error) {
          handled = false
        }
        if (handled) return
        try {
          document.execCommand('insertLineBreak')
        } catch (_error) {
          /* no editor path answered */
        }
      }

      function menuOpen(target) {
        const card = target.closest(CARD_SELECTOR)
        const scope = card === null ? document : card
        const menu = scope.querySelector(TRIGGER_MENU_SELECTOR)
        return menu instanceof Element && menu.getClientRects().length > 0
      }

      ctx.effect(() => {
        const onKeyDown = (event) => {
          if (syntheticKeys.has(event)) return

          if (recording !== null) {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopImmediatePropagation()
              const current = recording
              if (current !== null) current.onCancel()
              return
            }
            if (isModifierCode(event.code)) {
              event.preventDefault()
              event.stopImmediatePropagation()
              return
            }
            if (
              isComposing(event) ||
              typeof event.code !== 'string' ||
              event.code === '' ||
              event.code === 'Unidentified'
            ) {
              return
            }
            event.preventDefault()
            event.stopImmediatePropagation()
            const current = recording
            if (current !== null) current.onChord(chordOf(event))
            return
          }

          const target = event.target
          if (!(target instanceof Element)) return
          const editor = target.closest(COMPOSER_SELECTOR)
          if (editor === null) return
          if (editor.getAttribute('contenteditable') === 'false') return
          if (event.defaultPrevented === true) return
          if (isComposing(event)) return

          const prefs = store.getSnapshot()
          if (isDefaultPrefs(prefs)) return
          const action = actionFor(event, prefs)
          if (action === null) return
          if (menuOpen(target)) return

          event.preventDefault()
          event.stopImmediatePropagation()
          if (action === 'send') sendMessage(editor, event.repeat)
          else if (action === 'newline') insertLineBreak(editor)
        }

        document.addEventListener('keydown', onKeyDown, true)
        return () => document.removeEventListener('keydown', onKeyDown, true)
      }, 'composer-shortcuts: composer key handling')

      ctx.effect(
        () => ctx.locale.register(NS, { en, zh }),
        'composer-shortcuts: dictionaries',
      )

      ctx.slots.inject('conversation.composer.dock', () =>
        ctx.slots.register(
          {
            name: 'conversation.composer.dock',
            id: `${SLOT_ID}-bridge`,
            order: 900,
            inject: () => ({ bridge }),
          },
          ComposerBridge,
        ),
      )

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: SLOT_ID,
            order: 45,
            label: () => translate('title'),
            locale: NS,
          },
          SidebarIcon,
        ),
      )

      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: SLOT_ID,
            locale: NS,
            inject: () => ({ store, actions }),
          },
          ShortcutPanel,
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply,
      __test: {
        DEFAULTS: DEFAULT_PREFS,
        isModifierCode,
        keyName,
        normalizeCode,
        chordOf,
        cleanChord,
        normalizePrefs,
        isDefaultPrefs,
        nativeGestureOf,
        actionFor,
        isUnsafeBareChord,
        isComposing,
        chordTokens,
        chordLabel,
        createStore,
        readPrefs,
      },
    }
  },
})
