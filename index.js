/**
 * 基于 chrome-devtools-mcp 的 Node.js 中文控制台浏览器
 *
 * 功能：
 * - 打开/关闭/切换标签页
 * - 查看页面元素
 * - 点击按钮
 * - 输入文本
 * - 导航网页
 * - 截图
 * - 执行 JavaScript
 */

const readline = require('readline');
const { ConsoleBrowser } = require('./browser.js');
const { renderImageToTerminal, renderImageAsASCII, renderImageWithText, COLORS } = require('./renderer.js');
const { renderTextOnly } = require('./ocr.js');

// 创建 readline 接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// 浏览器实例
let browser = null;

// 命令帮助信息
const HELP_TEXT = `
╔══════════════════════════════════════════════════════════════╗
║           ShellChrome - 命令帮助                              ║
╠══════════════════════════════════════════════════════════════╣
║  快捷命令：                                                 ║
║    o <url>           打开新标签页（自动补充 https://）         ║
║    q                 关闭当前标签页                            ║
║    p                 显示所有标签页列表                        ║
║    w <id>            切换到指定标签页                          ║
║    n <url>           在当前页导航                              ║
╠══════════════════════════════════════════════════════════════╣
║  页面查看：                                                   ║
║    l                 获取所有元素（自动先获取快照）            ║
║    lc                获取可交互元素（按钮/输入框/链接）        ║
║    s                 截图保存到 ./image.png                    ║
║    sp                截图并在终端显示（彩色色块）              ║
║    st                截图并在终端显示（彩色色块 + 文字）       ║
║    sa                截图并在终端显示（ASCII）                 ║
╠══════════════════════════════════════════════════════════════╣
║  交互操作：                                                   ║
║    c <uid>           点击元素                                  ║
║    t <uid> <text>    向输入框输入文本                          ║
║    k <key>           发送键盘按键                              ║
╠══════════════════════════════════════════════════════════════╣
║  其他：                                                       ║
║    h / help          显示帮助信息                              ║
║    ui                配置 UI 模式（显示/隐藏浏览器窗口）         ║
║    x                 退出程序                                  ║
╚══════════════════════════════════════════════════════════════╝
`;

/**
 * 显示欢迎信息
 */
function showWelcome() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║       🌐  ShellChrome v1.0.0                                ║
║       基于 chrome-devtools-mcp                               ║
║                                                              ║
║       快捷命令：c=点击，t=输入，k=按键，q=关闭                ║
║       l=元素，lc=可交互元素，sp=色块，st=色块 + 文字，sa=ASCII  ║
║       ui=UI 模式，h=帮助，x=退出                               ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
}

/**
 * 解析并执行命令
 */
async function executeCommand(input) {
  const trimmed = input.trim();
  if (!trimmed) return;

  const parts = trimmed.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  try {
    switch (command) {
      case 'help':
      case 'h':
      case '？':
        console.log(HELP_TEXT);
        break;

      case 'exit':
      case 'quit':
      case 'x':
        await shutdown();
        break;

      case 'clear':
        console.clear();
        break;

      case 'status':
        showStatus();
        break;

      // 标签页管理
      case 'open':
      case 'o':
        await handleOpen(args);
        break;

      case 'close':
      case 'q':
        await handleClose(args);
        break;

      case 'pages':
      case 'list':
      case 'ls':
      case 'p':
        handlePages();
        break;

      case 'switch':
      case 'sw':
      case 'w':
        await handleSwitch(args);
        break;

      case 'navigate':
      case 'nav':
      case 'go':
      case 'n':
        await handleNavigate(args);
        break;

      // 页面查看
      case 'snapshot':
      case 'snap':
        await handleSnapshot();
        break;

      case 'screenshot':
      case 'shot':
      case 's':
        await handleScreenshot(args.length > 0 ? args : ['./image.png']);
        break;

      case 'sp':
        await handleScreenshotPreview();
        break;

      case 'st':
        await handleScreenshotWithText();
        break;

      case 'sa':
        await handleScreenshotASCII();
        break;

      case 'elements':
      case 'els':
      case 'e':
      case 'l':
        await handleElementsAuto();
        break;

      case 'lc':
        await handleInteractiveElements();
        break;

      // 交互操作
      case 'click':
      case 'c':
        await handleClick(args);
        break;

      case 'fill':
      case 'f':
      case 't':
        await handleFill(args);
        break;

      case 'key':
      case 'k':
        await handlePress(args);
        break;

      case 'hover':
        await handleHover(args);
        break;

      case 'wait':
        await handleWait(args);
        break;

      // 高级功能
      case 'eval':
      case 'js':
        await handleEval(args);
        break;

      case 'console':
      case 'log':
        await handleConsole();
        break;

      case 'network':
      case 'net':
        await handleNetwork();
        break;

      // UI 模式配置
      case 'ui':
        await handleUI(args);
        break;

      default:
        console.log(`未知命令：${command}，输入 'h' 查看帮助`);
    }
  } catch (error) {
    console.error(`❌ 错误：${error.message}`);
  }
}

// 命令处理函数
async function handleOpen(args) {
  if (!args[0]) {
    console.log('用法：open <url>');
    return;
  }
  const url = args[0];
  await browser.openPage(url);
}

async function handleClose(args) {
  const pageId = args[0] ? parseInt(args[0]) : undefined;
  const result = await browser.closePage(pageId);
  if (result && result.text) {
    console.log(result.text);
  }
}

function handlePages() {
  browser.showPages();
}

async function handleSwitch(args) {
  if (!args[0]) {
    console.log('用法：switch <pageId>');
    return;
  }
  const pageId = parseInt(args[0]);
  await browser.switchPage(pageId);
}

async function handleNavigate(args) {
  if (!args[0]) {
    console.log('用法：navigate <url>');
    return;
  }
  await browser.navigate(args[0]);
}

async function handleSnapshot() {
  await browser.takeSnapshot();
  console.log('✅ 快照已获取，使用 elements 命令查看元素列表');
}

function handleElements() {
  browser.showElements();
}

/**
 * 获取元素（自动先获取快照）
 */
async function handleElementsAuto() {
  await browser.takeSnapshot();
  browser.showElements();
}

/**
 * 获取可交互元素（按钮/输入框/链接）
 */
async function handleInteractiveElements() {
  await browser.takeSnapshot();
  
  if (!browser.lastSnapshot) {
    console.log('请先获取页面快照');
    return;
  }

  console.log('\n========== 可交互元素 ==========');
  const lines = browser.lastSnapshot.split('\n');
  const interactiveTypes = ['button', 'textbox', 'link', 'checkbox', 'radio', 'combobox', 'listbox', 'menuitem', 'option', 'tab', 'treeitem', 'menu', 'menubar', 'toolbar', 'searchbox', 'spinbutton', 'slider', 'switch'];
  
  for (const line of lines) {
    if (line.trim()) {
      const match = line.match(/uid[=:\s]+([^\s,]+)/i);
      if (match) {
        const uid = match[1];
        // 检查是否是可交互元素
        for (const type of interactiveTypes) {
          if (line.toLowerCase().includes(type)) {
            const desc = line.replace(/uid[=:\s]+[^\s,]+\s*/i, '').trim();
            console.log(`[${uid}] ${desc}`);
            break;
          }
        }
      }
    }
  }
  console.log('=====================================\n');
}

async function handleScreenshot(args) {
  const filePath = args[0];
  await browser.screenshot(filePath);
  console.log(`✅ 截图已保存到：${filePath}`);
}

/**
 * 截图并在终端预览（彩色）
 */
async function handleScreenshotPreview() {
  console.log('正在截图并渲染...');
  try {
    const imageData = await browser.screenshotBuffer();
    const rendered = await renderImageToTerminal(imageData, 100, 50);
    console.log(rendered);
  } catch (error) {
    console.log(`${COLORS.fg.red}截图失败：${error.message}${COLORS.reset}`);
  }
}

/**
 * 截图并在终端显示（ASCII 艺术）
 */
async function handleScreenshotASCII() {
  console.log('正在截图并转换为 ASCII...');
  try {
    const imageData = await browser.screenshotBuffer();
    const rendered = await renderImageAsASCII(imageData, 80, 40);
    console.log(rendered);
  } catch (error) {
    console.log(`${COLORS.fg.red}截图失败：${error.message}${COLORS.reset}`);
  }
}

/**
 * 截图并在终端显示（彩色色块 + 文字）
 */
async function handleScreenshotWithText() {
  console.log('正在截图并识别文字...');
  try {
    const imageData = await browser.screenshotBuffer();
    const rendered = await renderImageWithText(imageData, 100, 50);
    console.log(rendered);
  } catch (error) {
    console.log(`${COLORS.fg.red}截图失败：${error.message}${COLORS.reset}`);
  }
}

async function handleClick(args) {
  if (!args[0]) {
    console.log('用法：click <uid>');
    return;
  }
  await browser.click(args[0]);
  console.log('✅ 点击完成');
}

async function handleFill(args) {
  if (args.length < 2) {
    console.log('用法：fill <uid> <text>');
    return;
  }
  const uid = args[0];
  const text = args.slice(1).join(' ');
  await browser.fill(uid, text);
  console.log('✅ 输入完成');
}

async function handleHover(args) {
  if (!args[0]) {
    console.log('用法：hover <uid>');
    return;
  }
  await browser.hover(args[0]);
  console.log('✅ 悬停完成');
}

async function handlePress(args) {
  if (!args[0]) {
    console.log('用法：press <key>');
    return;
  }
  const key = args.join(' ');
  await browser.pressKey(key);
  console.log('✅ 按键完成');
}

async function handleWait(args) {
  if (!args[0]) {
    console.log('用法：wait <text> [timeout]');
    return;
  }
  const text = args[0];
  const timeout = args[1] ? parseInt(args[1]) : 10000;
  await browser.waitFor(text, timeout);
  console.log('✅ 等待完成');
}

async function handleEval(args) {
  if (!args[0]) {
    console.log('用法：eval <code>');
    return;
  }
  const code = args.join(' ');
  const result = await browser.evaluate(code);
  console.log('执行结果:', JSON.stringify(result, null, 2));
}

async function handleConsole() {
  const messages = await browser.getConsoleMessages();
  if (messages.length === 0) {
    console.log('（无控制台消息）');
  } else {
    console.log('\n========== 控制台消息 ==========');
    for (const msg of messages) {
      console.log(`[${msg.type || 'log'}] ${msg.text || msg}`);
    }
    console.log('================================\n');
  }
}

async function handleNetwork() {
  const requests = await browser.getNetworkRequests();
  if (requests.length === 0) {
    console.log('（无网络请求）');
  } else {
    console.log(`\n========== 网络请求 (${requests.length} 个) ==========`);
    for (const req of requests.slice(0, 20)) {
      console.log(`${req.method || 'GET'} ${req.url || req}`);
    }
    if (requests.length > 20) {
      console.log(`... 还有 ${requests.length - 20} 个请求`);
    }
    console.log('========================================\n');
  }
}

/**
 * 配置 UI 模式
 */
async function handleUI(args) {
  if (!args[0]) {
    const config = browser.loadConfig();
    const currentMode = config.headless ? '无头模式（后台运行）[默认]' : 'UI 模式（显示窗口）';
    console.log(`当前配置：${currentMode}`);
    console.log('用法：');
    console.log('  ui on   - 下次启动时开启 UI 模式（显示浏览器窗口）');
    console.log('  ui off  - 下次启动时无头模式（后台运行）');
    return;
  }

  const mode = args[0].toLowerCase();
  let headless;

  if (mode === 'on' || mode === 'true' || mode === '1') {
    headless = false;
    browser.saveConfig({ headless: false });
    console.log('✅ 配置已保存：下次启动时开启 UI 模式（显示浏览器窗口）');
  } else if (mode === 'off' || mode === 'false' || mode === '0') {
    headless = true;
    browser.saveConfig({ headless: true });
    console.log('✅ 配置已保存：下次启动时无头模式（后台运行）');
  } else {
    console.log('未知模式，请使用：ui on 或 ui off');
    return;
  }

  console.log('提示：请重启程序以使配置生效（使用 x 退出后重新运行）');
}

function showStatus() {
  console.log('\n========== 浏览器状态 ==========');
  console.log(`连接状态：${browser ? '已连接' : '未连接'}`);
  console.log(`标签页数量：${browser?.pages?.length || 0}`);
  console.log(`当前标签页：${browser?.currentPageId || '无'}`);
  console.log('===============================\n');
}

/**
 * 启动程序
 */
async function start() {
  showWelcome();

  try {
    // 创建浏览器实例（默认无头模式）
    browser = new ConsoleBrowser();

    await browser.start();

    // 显示初始状态
    showStatus();

    // 开始命令行交互
    startPrompt();
  } catch (error) {
    console.error(`启动失败：${error.message}`);
    console.error('请确保已安装 chrome-devtools-mcp 并且 Node.js 版本 >= 20.19');
    process.exit(1);
  }
}

/**
 * 显示命令提示符
 */
function startPrompt() {
  rl.question('🌐 > ', async (input) => {
    await executeCommand(input);
    startPrompt();
  });
}

/**
 * 关闭程序
 */
async function shutdown() {
  console.log('\n正在关闭浏览器...');
  if (browser) {
    await browser.close();
  }
  rl.close();
  console.log('👋 再见！');
  process.exit(0);
}

// 处理 Ctrl+C
process.on('SIGINT', async () => {
  console.log('\n');
  await shutdown();
});

// 启动程序
start();
