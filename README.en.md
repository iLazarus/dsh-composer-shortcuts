# Composer shortcuts for DeepSeek Harness

[中文](README.md) | English

A DeepSeek Harness plugin with a **left-sidebar page** for choosing the keys that send a message and insert a line break.

The defaults match DSH exactly:

| Action | Default key |
| --- | --- |
| Send message | `Enter` |
| Line break | `Shift + Enter` |
| Accelerated send (native) | `Ctrl + Enter` (`⌘ + Enter` on macOS) |

After installing, a keyboard icon appears in the left sidebar. Open it, press **Record** on a row, and press the combination you want. Settings apply immediately.

## Install

### From GitHub (recommended)

```sh
# Desktop app uses the desktop profile
dsh plugin --profile desktop add github:iLazarus/dsh-composer-shortcuts

# Browser-based dsh web uses the web profile
dsh plugin --profile web add github:iLazarus/dsh-composer-shortcuts
```

Fully quit and reopen DSH Desktop after installing. For `dsh web`, restart the process and refresh the page. The keyboard icon in the left sidebar confirms the plugin loaded.

### From a local directory (development)

```text
plugin_manager install_bundle { target: "C:\\path\\to\\dsh-composer-shortcuts" }
```

After editing [client.js](client.js), remove and reinstall the bundle, then restart the app. If the profile uses a `link:` install, source changes reach the installed directory directly, but the browser still needs a restart to reload the client module.

### Compatibility

Built for the DSH 0.2.x Web UI; verified against `0.2.2-rc.1` on Windows Desktop. A future major rewrite of the composer may require adaptation.

## Usage

1. Click the keyboard icon in the left sidebar.
2. Click **Record** on **Send message** or **Line break**.
3. Press the combination; press `Esc` to cancel.
4. The mapping is saved in the current browser and applies immediately.

Examples:

- Send = `Ctrl + Enter`, line break = `Enter` — closer to many chat apps.
- Send = `Enter`, line break = `Shift + Enter` — DSH defaults.
- Send = `F2`, line break = `F3` — fully custom.

## Behavior

- With the default mapping the plugin does not intervene at all: `Enter` and `Shift + Enter` stay with DSH.
- Once a custom mapping is active, the three native Enter gestures (`Enter`, `Shift + Enter`, `Ctrl/⌘ + Enter`) are taken over:
  - a send match calls the public `inputActions.submit()` path;
  - a line-break match dispatches Lexical's `beforeinput` `insertLineBreak`;
  - an unassigned native Enter gesture is swallowed so the old shortcut cannot fire.
- Other keys pass through normally.
- A slash/@ menu, IME composition, and a read-only composer are never intercepted.
- The main Enter and the numpad Enter are treated as the same key.
- Bare character and navigation keys are rejected while recording; add `Ctrl`, `Alt`, or `Win` so normal typing keeps working. `Enter` and `F1`–`F24` may be used alone.

## Persistence

Settings live in the current browser's `localStorage` under `dsh.composer-shortcuts.v1`:

- They survive page reloads and reopening the same origin.
- They are not shared across browsers or devices.
- Clearing site data restores the defaults.
- If the browser refuses local storage, the mapping only lasts for the current page and the UI shows a warning.

## Limitations

- DSH's own Settings → Keyboard shortcuts page shows the fixed `Enter` / `Shift + Enter` rows; the plugin cannot change those rows. This plugin's page is the source of truth for the actual mapping.
- Browser or OS reserved combinations such as `Ctrl + W`, `Alt + F4`, or some `⌘` chords may never reach the page.
- On Desktop, a native application shortcut can run before the DOM capture listener. The plugin tries to intercept in the page, but cannot override the native layer.
- Web UI only (`dsh.client.platform: "web"`); not available in the terminal UI.
- Depends on the `data-composer-input`, `data-composer-card`, and `data-trigger-menu` attributes. If a future DSH release rewrites the composer, the fallback is native behavior rather than broken input.

## Development

```sh
node --check client.js
node --check index.js
node test.mjs
```

The tests cover default detection, native Enter gestures, custom send/newline actions, suppressing old gestures, swapped mappings, conflict fallback, numpad Enter normalization, the unsafe bare-key guard, and keycap labels.

## Files

```text
package.json         # bundle + dsh.client manifest
cordis.patch.yml     # Loader insert row
index.js             # Host half (empty)
client.js            # Browser half: sidebar entry, settings page, key handling
locale/en.json       # Plugin Manager title/description
locale/zh.json       # Plugin Manager title/description
icon.svg             # Plugin icon
test.mjs             # Pure-logic unit tests
```

Text shown in the sidebar and settings page lives in the `en` / `zh` dictionaries at the top of [client.js](client.js). `locale/*.json` only supplies the Plugin Manager title and description.

## Uninstall

Remove `dsh-composer-shortcuts` in the plugin manager, then restart. The input composer returns to DSH's native keys. The browser preference is not deleted automatically, so reinstalling reuses it.

## License

MIT. See [LICENSE](LICENSE).
