# 快捷键（dsh-composer-shortcuts）

[English](README.en.md) | 中文

一个带**左侧栏入口**的 DeepSeek Harness 插件：在输入框里自定义「发送消息」和「换行」的按键。

默认值与 DSH 原生行为完全一致：

| 操作 | 默认按键 |
| --- | --- |
| 发送消息 | `Enter` |
| 换行 | `Shift + Enter` |
| 加速发送（原生） | `Ctrl + Enter`（macOS 为 `⌘ + Enter`） |

安装后左侧栏会出现一个键盘图标；点击打开设置页，点「录制」后按下任意组合键即可替换默认按键。设置立即生效，无需重启。

## 功能

- **左侧栏独立入口**：与「插件」「计划任务」「声音提醒」并列，点击进入设置页。
- **组合键录制**：字母、数字、功能键、方向键、空格、Tab、`Ctrl` / `Alt` / `Shift` / `⌘` 组合均可录制；纯修饰键会被忽略。为了避免输入框无法正常打字，字母、数字、空格和编辑/导航键必须搭配 `Ctrl`、`Alt` 或 `Win`，`Enter` 和 `F1`–`F24` 可以单独使用。
- **真正覆盖旧快捷键**：一旦发送或换行不再使用默认值，输入框里旧的 `Enter` / `Shift + Enter` 手势会被吞掉，只执行新映射。
- **一键交换 / 恢复默认**：交换发送与换行，或恢复 DSH 默认。
- **安全边界**：斜杠命令、`@` 引用菜单展开时不拦截；输入法组字（`isComposing` / keyCode 229）不拦截；只读输入框不拦截。
- **发送走公开动作**：通过 `conversation.composer.dock` 注入的 `inputActions.submit()` 触发，和发送按钮走同一条提交链路；换行通过 Lexical 的 `beforeinput` 插入，和原生 `Shift + Enter` 一致。
- **轻量**：无 Host 路由、服务、定时器或网络请求；只有浏览器端逻辑。

## 安装

### 从 GitHub 安装（推荐）

```sh
# Desktop 应用使用 desktop profile
dsh plugin --profile desktop add github:iLazarus/dsh-composer-shortcuts

# 浏览器版 dsh web 使用 web profile
dsh plugin --profile web add github:iLazarus/dsh-composer-shortcuts
```

安装完成后完全退出并重新打开 DSH Desktop；`dsh web` 用户重启进程并刷新页面。左侧栏出现键盘图标即表示加载成功。

### 从本地目录安装（开发调试）

```text
plugin_manager install_bundle { target: "C:\\path\\to\\dsh-composer-shortcuts" }
```

修改 [client.js](client.js) 后，需要先 `remove_bundle` 再 `install_bundle`，然后重启应用。若当前 profile 使用 `link:` 安装，源码改动会直接反映到安装目录，但仍需重启以重新加载浏览器模块。

### 兼容性

面向 DSH 0.2.x 的 Web UI，已在 `0.2.2-rc.1` 桌面版验证。DSH 大版本重写输入框时可能需要适配。

## 使用

1. 点击左侧栏的键盘图标。
2. 在「发送消息」或「换行」一行点击「录制」。
3. 按下想使用的组合键；`Esc` 取消。
4. 设置立即保存到当前浏览器，并立即在输入框生效。

例如：

- 发送 = `Ctrl + Enter`，换行 = `Enter`：更接近聊天软件的习惯。
- 发送 = `Enter`，换行 = `Shift + Enter`：DSH 默认。
- 发送 = `F2`，换行 = `F3`：完全自定义。

## 行为细节

- 默认映射下插件**完全不干预**输入框：`Enter` 与 `Shift + Enter` 仍由 DSH 自己处理。
- 自定义映射生效后，DSH 原生会响应的三个 Enter 手势（`Enter`、`Shift + Enter`、`Ctrl/⌘ + Enter`）会被插件接管：
  - 命中发送映射 → 调用 `inputActions.submit()`。
  - 命中换行映射 → 派发 `beforeinput` 的 `insertLineBreak`。
  - 未命中任何映射 → 吞掉该手势，避免旧快捷键继续生效。
- 其他按键不拦截，正常输入。
- 菜单展开、输入法组字、只读状态下，插件完全不介入。
- 小键盘 Enter 与主键盘 Enter 视为同一个按键。

## 保存在哪里

设置保存在当前浏览器的 `localStorage`（键名 `dsh.composer-shortcuts.v1`），因此：

- 刷新页面、关闭再打开同一地址的页面后仍然保留。
- 不跨浏览器、不跨设备同步。
- 清理浏览器站点数据会恢复默认。
- 如果浏览器拒绝写入本地存储，设置只在当前页面有效，页面会显示提示。

## 已知限制

- DSH「设置 → 快捷键」里的 `Enter` / `Shift + Enter` 是引擎的**固定只读项**，插件无法改写它们的展示；本插件的设置页才是实际映射的来源。
- 浏览器/操作系统保留的组合键（例如 `Ctrl + W`、`Alt + F4`、部分 `⌘` 组合）可能无法被网页拦截，建议避开。
- 若组合键与 DSH 其他应用级快捷键重合，桌面端原生键盘层可能先于网页触发该命令；本插件会尽力在 DOM 捕获阶段拦截，但无法覆盖原生层。
- 只支持 Web UI（`dsh.client.platform: "web"`），不适用于终端 TUI。
- 依赖输入框的 `data-composer-input`、`data-composer-card`、`data-trigger-menu` 语义属性；DSH 大版本重写输入框时可能需要适配。失效时的表现是「恢复原生行为」，不会破坏输入。

## 开发与验证

```sh
node --check client.js
node --check index.js
node test.mjs
```

`test.mjs` 覆盖默认映射识别、原生 Enter 手势、自定义发送/换行、旧手势抑制、交换映射、冲突回退和小键盘 Enter 归一化。

## 文件

```text
package.json         # bundle + dsh.client 清单
cordis.patch.yml     # 插入 Loader 条目
index.js             # Host 半边（空实现）
client.js            # 浏览器半边：左侧栏入口、设置页、按键处理
locale/en.json       # 插件管理器的英文标题/描述
locale/zh.json       # 插件管理器的中文标题/描述
icon.svg             # 插件图标
test.mjs             # 纯逻辑单元测试
README.en.md         # 英文说明
```

> 文案位置：左侧栏图标名、设置页标题和行内文字都在 [client.js](client.js) 顶部的 `en` / `zh` 字典里；`locale/*.json` 只负责插件管理器里显示的插件标题和描述。

## 卸载

通过插件管理器移除 `dsh-composer-shortcuts`，刷新页面后输入框恢复 DSH 原生按键；浏览器中保存的偏好不会被自动删除，重新安装后会继续使用。
