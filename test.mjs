import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('./client.js', import.meta.url), 'utf8')
let definition

const React = {
  Fragment: 'Fragment',
  createElement() {
    return {}
  },
  useEffect() {},
  useRef(value) {
    return { current: value }
  },
  useState(value) {
    return [typeof value === 'function' ? value() : value, () => {}]
  },
  useSyncExternalStore() {
    return {}
  },
}

const sandbox = {
  console,
  window: {
    __ModuleLoader__: {
      load(value) {
        definition = value
      },
    },
    localStorage: {
      getItem() {
        return null
      },
      setItem() {},
    },
  },
  navigator: { platform: 'Win32' },
  document: {
    addEventListener() {},
    removeEventListener() {},
    querySelector() {
      return null
    },
  },
}

vm.createContext(sandbox)
vm.runInContext(source, sandbox)
assert.equal(definition.id, 'dsh-composer-shortcuts')
const plugin = definition.factory((id) => {
  assert.equal(id, 'react')
  return React
})
const t = plugin.__test

const custom = {
  send: { code: 'KeyS', ctrl: true, meta: false, alt: false, shift: false },
  newline: { code: 'KeyJ', ctrl: true, meta: false, alt: false, shift: false },
}

assert.equal(t.isDefaultPrefs(t.normalizePrefs(null)), true)
assert.equal(t.isDefaultPrefs(custom), false)
assert.equal(t.nativeGestureOf({ key: 'Enter' }), 'send')
assert.equal(t.nativeGestureOf({ key: 'Enter', shiftKey: true }), 'newline')
assert.equal(t.nativeGestureOf({ key: 'Enter', ctrlKey: true }), 'send')
assert.equal(t.nativeGestureOf({ key: 'Enter', metaKey: true }), 'send')
assert.equal(t.nativeGestureOf({ key: 'Enter', altKey: true }), null)
assert.equal(t.nativeGestureOf({ key: 'Enter', shiftKey: true, ctrlKey: true }), null)
assert.equal(t.nativeGestureOf({ key: 'Enter', ctrlKey: true, metaKey: true }), null)

assert.equal(t.actionFor({ key: 'Enter', code: 'Enter' }, custom), 'suppress')
assert.equal(t.actionFor({ key: 's', code: 'KeyS', ctrlKey: true }, custom), 'send')
assert.equal(t.actionFor({ key: 'j', code: 'KeyJ', ctrlKey: true }, custom), 'newline')
assert.equal(t.actionFor({ key: 'x', code: 'KeyX' }, custom), null)

const swapped = {
  send: { code: 'Enter', ctrl: false, meta: false, alt: false, shift: true },
  newline: { code: 'Enter', ctrl: false, meta: false, alt: false, shift: false },
}
assert.equal(t.actionFor({ key: 'Enter', code: 'Enter', shiftKey: true }, swapped), 'send')
assert.equal(t.actionFor({ key: 'Enter', code: 'Enter' }, swapped), 'newline')

assert.deepEqual(
  JSON.parse(JSON.stringify(t.normalizePrefs({ send: custom.send, newline: custom.send }))),
  {
    send: { code: 'Enter', ctrl: false, meta: false, alt: false, shift: false },
    newline: { code: 'Enter', ctrl: false, meta: false, alt: false, shift: true },
  },
)
assert.deepEqual(
  JSON.parse(JSON.stringify(t.normalizePrefs({
    send: { code: 'KeyS', ctrl: false, meta: false, alt: false, shift: false },
    newline: { code: 'KeyJ', ctrl: true, meta: false, alt: false, shift: false },
  }))),
  {
    send: { code: 'Enter', ctrl: false, meta: false, alt: false, shift: false },
    newline: { code: 'Enter', ctrl: false, meta: false, alt: false, shift: true },
  },
)
assert.equal(t.cleanChord({ code: 'ShiftLeft', ctrl: false }), undefined)
assert.equal(t.cleanChord({ code: 'Unidentified', ctrl: false }), undefined)
assert.equal(t.chordOf({ code: 'NumpadEnter' }).code, 'Enter')
assert.equal(t.normalizeCode('NumpadEnter'), 'Enter')
assert.equal(t.isModifierCode('ControlLeft'), true)
assert.equal(t.isModifierCode('KeyA'), false)
assert.equal(t.isUnsafeBareChord({ code: 'KeyS', ctrl: false, meta: false, alt: false, shift: false }), true)
assert.equal(t.isUnsafeBareChord({ code: 'Space', ctrl: false, meta: false, alt: false, shift: false }), true)
assert.equal(t.isUnsafeBareChord({ code: 'Enter', ctrl: false, meta: false, alt: false, shift: false }), false)
assert.equal(t.isUnsafeBareChord({ code: 'Enter', ctrl: false, meta: false, alt: false, shift: true }), false)
assert.equal(t.isUnsafeBareChord({ code: 'F2', ctrl: false, meta: false, alt: false, shift: false }), false)
assert.equal(t.isUnsafeBareChord({ code: 'KeyS', ctrl: true, meta: false, alt: false, shift: false }), false)

assert.equal(t.keyName('KeyA'), 'A')
assert.equal(t.keyName('Digit1'), '1')
assert.equal(t.keyName('NumpadEnter'), 'Num Enter')
assert.equal(t.chordLabel({ code: 'KeyS', ctrl: true, meta: false, alt: false, shift: false }, false), 'Ctrl+S')
assert.equal(t.chordLabel({ code: 'Enter', ctrl: false, meta: false, alt: false, shift: true }, true), '\u21e7Enter')
assert.deepEqual(
  JSON.parse(JSON.stringify(t.chordTokens({ code: 'Enter', ctrl: false, meta: false, alt: false, shift: true }, false))),
  ['Shift', 'Enter'],
)

console.log('PASS default detection')
console.log('PASS native Enter gestures')
console.log('PASS custom send / newline actions and suppression')
console.log('PASS swapped Enter mapping')
console.log('PASS conflict fallback and chord normalization')
console.log('PASS unsafe bare-key guard')
console.log('PASS keycap labels')
