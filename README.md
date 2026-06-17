# ShellChrome - 命令行浏览器

基于 Puppeteer 的 Node.js 中文控制台浏览器，通过命令行控制 Chrome 浏览器。

支持两种使用模式：
- **交互模式 (REPL)**：人机交互，实时操作，按键翻页，录制自动化
- **CLI 模式 (守护进程)**：每条命令执行一次退出，适合 AI 代理和脚本自动化

## 演示

![SnowShot_Video_2026-02-23_14-48-14](https://github.com/user-attachments/assets/5f0583ba-e230-40bf-b871-20e4a723b775)

## 功能特性

- **标签页管理**：打开、关闭、切换标签页
- **页面导航**：导航到指定 URL（自动补充协议）
- **元素查看**：获取页面快照，查看所有元素或可交互元素（带 UID 标识）
- **交互操作**：点击按钮、输入文本、按键、悬停
- **文字查找**：通过页面文字快速定位元素（`fc`/`ft` 命令）
- **截图功能**：保存文件 / 彩色色块 / 色块+文字 / ASCII 四种模式
- **自动化**：录制操作序列并自动回放（仅 REPL 模式）
- **守护进程**：后台运行浏览器，崩溃自动重启（CLI 模式）
- **反检测**：集成 puppeteer-extra-stealth 插件

## 环境要求

- Node.js >= 20
- Google Chrome 浏览器（稳定版）

## 安装

```bash
git clone <repo-url>
cd shellchrome
npm install
```

---

## 模式一：交互模式 (REPL)

传统的交互式命令行浏览器，启动后进入 `🌐 >` 提示符，手动输入命令操作。

### 启动

```bash
npm start
# 或
node index.js
```

### 快捷命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `o <url>` | 打开新标签页（自动补充 https://） | `o baidu.com` |
| `q` | 关闭当前标签页 | `q` |
| `p` | 显示所有标签页 | `p` |
| `w <id>` | 切换到指定标签页 | `w 2` |
| `n <url>` | 在当前页导航 | `n github.com` |
| `ba` | 返回上一页 | `ba` |
| `hi` | 打开浏览器历史记录 | `hi` |
| `l` | 获取所有元素（按键翻页，Enter/\/ESC） | `l` |
| `lc` | 获取可交互元素（按键翻页） | `lc` |
| `s` | 截图保存到 ./image.png | `s` |
| `sp` | 截图终端预览（彩色色块） | `sp` |
| `st` | 截图终端预览（色块 + 文字） | `st` |
| `sa` | 截图终端预览（ASCII 艺术） | `sa` |
| `c <uid>` | 点击元素 | `c uid_5` |
| `fc <文字> [编号]` | 点击包含文字的元素 | `fc 登录` |
| `t <uid> <text>` | 输入文本 | `t uid_3 你好` |
| `ft <文字> <文本>` | 向包含文字的输入框输入 | `ft 用户名 admin` |
| `k <key>` | 发送键盘按键 | `k Enter` |
| `sl <秒>` | 停顿指定秒数 | `sl 1.5` |
| `wait <文字> [ms]` | 等待页面出现指定文字 | `wait 加载完成` |
| `eval <code>` | 执行 JavaScript | `eval document.title` |
| `ui` | 配置 UI 模式（需重启） | `ui on` / `ui off` |
| `a s` | 开始录制自动化 | `a s` |
| `a e` | 结束录制 | `a e` |
| `a l` | 列出自动化脚本 | `a l` |
| `a a <编号>` | 执行自动化脚本 | `a a 1` |
| `h` | 显示帮助 | `h` |
| `x` | 退出程序 | `x` |

### 交互模式操作示例

```
🌐 > o baidu.com
✅ 已打开 https://baidu.com

🌐 > l
========== 元素列表 (第 1/3 页) ==========
[uid_1] textbox: 搜索
[uid_2] button: 百度一下
[uid_3] link: 新闻
...
=====================================
[Enter] 下一页  [\] 上一页  [ESC] 退出

🌐 > fc 百度一下
找到 1 个匹配元素，点击第 1 个：百度一下 [uid_2]
✅ 点击完成

🌐 > x
👋 再见！
```

---

## 模式二：CLI 模式（守护进程）

非交互式模式，通过后台守护进程管理浏览器。每条命令独立执行、输出结果后退出。
适合 AI 代理、脚本自动化、CI/CD 流程。

### 基本流程

```bash
# 1. 启动守护进程（后台运行 Chrome）
node cli/index.js start

# 2. 发送命令（每条命令执行一次后退出）
node cli/index.js o baidu.com        # 打开网页
node cli/index.js l --all             # 获取所有元素
node cli/index.js fc 搜索             # 点击搜索框
node cli/index.js t uid_5 你好        # 输入文字
node cli/index.js k Enter             # 按回车

# 3. 查看状态
node cli/index.js status

# 4. 停止守护进程
node cli/index.js stop
```

### 守护进程管理

```bash
node cli/index.js start               # 启动（默认无头模式）
node cli/index.js start --no-headless # 启动（显示浏览器窗口）
node cli/index.js stop                # 停止
node cli/index.js status              # 查看状态（PID、运行时间、标签页数）
```

守护进程特性：
- 浏览器崩溃后自动重启（最多 3 次，指数退避）
- 通过命名管道（Windows）或 Unix Socket 通信
- 命令串行化执行，防止并发冲突
- PID 文件保存在 `.shellchrome.pid`

### CLI 命令一览

命令与 REPL 模式相同，区别在于：

| 差异 | REPL 模式 | CLI 模式 |
|------|-----------|----------|
| 元素列表 `l` | 按键翻页（Enter/\/ESC） | `--all` 全量输出 / `--page N` 参数分页 |
| 可交互元素 `lc` | 按键翻页 | 同上 |
| 连续截图 `spw`/`stw` | 支持 | 不支持（用 `sp`/`st` 单次截图代替） |
| 自动化录制 `a s`/`a e` | 支持 | 不支持（仅 REPL） |
| 输出格式 | 彩色终端文本 | 结构化文本 / `--json` 原始 JSON |
| 退出码 | 无 | 0=成功，1=失败 |

### CLI 分页参数

```bash
node cli/index.js l                      # 默认前 50 个元素
node cli/index.js l --all                # 全部元素
node cli/index.js l --page 2             # 第 2 页
node cli/index.js l --page-size 20       # 每页 20 个
node cli/index.js l --page 3 --page-size 10  # 第 3 页，每页 10 个
```

### JSON 输出

所有命令支持 `--json` 标志，输出原始 JSON 便于程序解析：

```bash
node cli/index.js status --json
# 输出：
# {
#   "success": true,
#   "displayType": "status",
#   "data": {
#     "connected": true,
#     "tabCount": 1,
#     "currentUrl": "https://www.baidu.com/"
#   }
# }

node cli/index.js p --json
# 输出标签页列表的 JSON

node cli/index.js l --all --json
# 输出所有元素的 JSON 数组
```

### CLI 完整操作示例

```bash
# 启动
$ node cli/index.js start
Starting daemon...
Daemon started (PID: 12345)

# 打开网页
$ node cli/index.js o baidu.com
OK
已打开 https://baidu.com

# 查看元素
$ node cli/index.js lc --all
OK (page 1/1, 5 elements)
[uid_1] textbox: 搜索
[uid_2] button: 百度一下
[uid_3] link: 新闻
[uid_4] link: hao123
[uid_5] link: 地图

# 用文字查找并点击
$ node cli/index.js fc 百度一下
OK
找到 1 个匹配，点击第 1 个：百度一下 [uid_2]

# 输入文字
$ node cli/index.js ft 搜索 ShellChrome
OK
找到 1 个匹配，向第 1 个输入文本：搜索

# 按键搜索
$ node cli/index.js k Enter
OK
已按下按键 Enter

# 查看结果
$ node cli/index.js l --all
OK (page 1/2, 78 elements)
[uid_1] link: ShellChrome - GitHub
...

# 截图
$ node cli/index.js s ./result.png
OK
截图已保存到：./result.png

# 停止
$ node cli/index.js stop
Stopping daemon (PID: 12345)...
Daemon stopped
```

---

## 项目结构

```
shellchrome/
├── core/                        # 共享核心逻辑
│   ├── browser-manager.js       #   浏览器生命周期、标签页管理
│   ├── snapshot.js              #   无障碍快照、UID 元素查找
│   ├── actions.js               #   交互操作（click/fill/press）
│   ├── automation.js            #   自动化脚本管理
│   ├── commands.js              #   命令分发器（返回结构化结果）
│   └── renderer.js              #   终端截图渲染
│
├── cli/                         # CLI 模式（守护进程）
│   ├── index.js                 #   入口：start/stop/status/<command>
│   ├── daemon.js                #   守护进程：浏览器管理 + 崩溃重启
│   ├── client.js                #   客户端：连接 → 发送 → 输出 → 退出
│   ├── output.js                #   输出格式化（文本 / JSON）
│   └── protocol.js              #   通信协议（NDJSON over socket）
│
├── repl/                        # 交互模式（REPL）
│   └── index.js                 #   readline 循环 + 按键翻页 + 录制
│
├── index.js                     # REPL 入口（兼容）
├── browser.js                   # 兼容 shim
├── renderer.js                  # 兼容 shim
├── config.json                  # 运行配置（headless 开关）
└── package.json
```

两种模式共享 `core/` 层的所有逻辑，`repl/` 和 `cli/` 只是不同的入口和输出方式。

## 编译为可执行文件

```bash
npm run bundle
npm run build:nexe
# 编译后的文件位于 ./dist/shellchrome
```

## 常见问题

### 启动失败
确保已运行 `npm install` 安装依赖，并且系统已安装 Chrome 浏览器。

### 元素 UID 找不到
页面内容变化后需要用 `l` 重新获取快照，UID 会重新分配。

### CLI 模式连不上守护进程
先运行 `node cli/index.js status` 检查，如果 PID 文件残留（daemon 异常退出），
手动删除 `.shellchrome.pid` 后重新 `start`。

### REPL 和 CLI 能同时用吗？
不能。两种模式共用同一个 Chrome 实例，同一时间只能用一种。

## 许可证

MIT License
