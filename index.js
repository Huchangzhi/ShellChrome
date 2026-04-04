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
const { ConsoleBrowser } = require('./browser');
const { renderImageToTerminal, renderImageAsASCII, renderImageWithText, COLORS } = require('./renderer');

// 创建 readline 接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// 浏览器实例
let browser = null;

// 自动化录制状态
let recordingState = null; // { name: string, commands: [] } | null

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
║    ba                返回上一页 (等同于 Alt+Left)              ║
║    hi/history        打开浏览器历史记录页面                    ║
╠══════════════════════════════════════════════════════════════╣
║  页面查看：                                                   ║
║    l                 获取所有元素（自动先获取快照）            ║
║    lc                获取可交互元素（按钮/输入框/链接）        ║
║    s                 截图保存到 ./image.png                    ║
║    sp                截图并在终端显示（彩色色块）              ║
║    spw               连续截图预览（动态刷新）                  ║
║    st                截图并在终端显示（彩色色块 + 文字）       ║
║    stw               连续截图显示文字（动态刷新）              ║
║    sa                截图并在终端显示（ASCII）                 ║
╠══════════════════════════════════════════════════════════════╣
║  交互操作：                                                   ║
║    c <uid>           点击元素                                  ║
║    fc <文字> [编号]   点击包含文字的元素                        ║
║    t <uid> <text>    向输入框输入文本                          ║
║    ft <文字> <文本>  向包含文字的输入框输入                    ║
║    k <key>           发送键盘按键 (Enter, Tab, Control+A 等)    ║
║    sl <秒>           停顿指定秒数 (例如：sl 1.5)                ║
╠══════════════════════════════════════════════════════════════╣
║  自动化：                                                     ║
║    a h               显示自动化帮助                            ║
║    a s               开始录制自动化（先输入名字）              ║
║    a e               结束录制                                  ║
║    a l               列出所有自动化脚本                        ║
║    a a <编号>        执行指定编号的自动化脚本                  ║
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
╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║       🌐  ShellChrome v1.0.4                                      ║
║       基于 Puppeteer                                               ║
║                                                                    ║
║       快捷命令：c=点击，t=输入，k=按键，sl=停顿，q=关闭，ba=返回       ║
║       l=元素，lc=可交互元素，sp=色块，st=色块 + 文字，sa=ASCII，hi=历史║
║       spw=连续色块，stw=连续文字 (按 ESC 退出)                       ║
║       fc=点击文字，ft=输入到文字，ui=UI 模式                         ║
║       h=帮助，x=退出，a=自动化                                         ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
`);
}

/**
 * 解析并执行命令
 */
async function executeCommand(input) {
  const trimmed = input.trim();
  if (!trimmed) return;

  // 特殊处理 t/fill 命令，支持空格
  const fillMatch = trimmed.match(/^(t|fill|t)\s+(\S+)\s+(.+)$/i);
  if (fillMatch) {
    const uid = fillMatch[2];
    const text = fillMatch[3];
    try {
      await handleFill([uid, text]);
    } catch (error) {
      console.log(`❌ 输入失败：${error.message}`);
    }
    return;
  }

  // 其他命令按空格分割
  const parts = trimmed.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  // 录制命令（在 switch 之前记录，确保所有命令都执行并记录）
  // replay 时不记录，查看命令不记录
  if (recordingState) {
    const skipCommands = ['a', 'l', 'lc', 's', 'sp', 'spw', 'st', 'stw', 'sa', 'e', 'els', 'elements'];
    if (!skipCommands.includes(command)) {
      recordingState.commands.push({
        raw: trimmed,
        timestamp: Date.now(),
      });
    }
  }

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

      case 'back':
      case 'ba':
        await handleBack();
        break;

      case 'history':
      case 'hi':
        await handleHistory();
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

      case 'spw':
        await handleScreenshotPreviewWatch();
        break;

      case 'st':
        await handleScreenshotWithText();
        break;

      case 'stw':
        await handleScreenshotWithTextWatch();
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

      case 'fc':
        await handleFindClick(args);
        break;

      case 'ft':
        await handleFindFill(args);
        break;

      case 'key':
      case 'k':
        await handlePress(args);
        break;

      case 'hover':
        await handleHover(args);
        break;

      case 'sleep':
      case 'sl':
        await handleSleep(args);
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

      // 自动化命令
      case 'a':
        await handleAuto(args);
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
  try {
    await browser.openPage(url);
    console.log(`✅ 已打开 ${url}`);
  } catch (error) {
    console.log(`❌ 打开失败：${error.message}`);
  }
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

async function handleBack() {
  await browser.goBack();
  console.log('✅ 已返回上一页');
}

async function handleHistory() {
  await browser.openHistory();
  console.log('✅ 已打开历史记录页面');
}

async function handleSnapshot() {
  await browser.takeSnapshot();
  console.log('✅ 快照已获取，使用 elements 命令查看元素列表');
}

async function handleElements() {
  await browser.showElements();
}

/**
 * 获取元素（分页显示，支持翻页）
 */
async function handleElementsAuto() {
  await browser.takeSnapshot();

  if (!browser.lastSnapshot) {
    console.log('请先获取页面快照');
    return;
  }

  // 获取所有 link 元素的 href
  const linkHrefs = await browser.currentPage.evaluate(() => {
    const hrefs = {};
    document.querySelectorAll('a[href]').forEach((el) => {
      const text = el.textContent?.trim() || el.getAttribute('aria-label') || '';
      if (text) {
        hrefs[text] = el.href;
      }
    });
    return hrefs;
  });

  // 解析快照行
  const lines = browser.lastSnapshot.split('\n').filter(line => line.trim());

  // 获取终端尺寸
  const termRows = process.stdout.rows || 30;
  const termCols = process.stdout.columns || 120;

  // 预留行数用于标题和提示（标题 2 行 + 底部提示 2 行 + 额外空 3 行 = 7 行）
  const reservedRows = 7;
  const availableRows = termRows - reservedRows;

  // 设置终端为 raw 模式以监听按键
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  let running = true;

  /**
   * 计算一行文本在终端中实际占用的行数（考虑自动换行）
   * 中文字符占 2 个宽度，英文字符占 1 个宽度
   */
  const calculateWrappedRows = (text, cols) => {
    if (!text || text.length === 0) return 1;
    
    // 计算文本的实际显示宽度
    let displayWidth = 0;
    for (const char of text) {
      const code = char.codePointAt(0);
      // 中文字符（CJK 统一表意文字）范围：0x4E00-0x9FFF，以及其他需要 2 个宽度的字符
      if (
        (code >= 0x4E00 && code <= 0x9FFF) ||  // CJK 统一表意文字
        (code >= 0x3400 && code <= 0x4DBF) ||  // CJK 扩展 A
        (code >= 0x20000 && code <= 0x2A6DF) || // CJK 扩展 B
        (code >= 0xF900 && code <= 0xFAFF) ||  // CJK 兼容表意文字
        (code >= 0x2F800 && code <= 0x2FA1F) || // CJK 兼容补充
        code >= 0xFF00  // 全角字符
      ) {
        displayWidth += 2;
      } else {
        displayWidth += 1;
      }
    }
    
    return Math.ceil(displayWidth / cols);
  };

  /**
   * 从当前索引开始，计算最多能显示多少个元素（不超过可用行数）
   */
  const calculatePageSize = (startIndex, linesArray) => {
    let usedRows = 0;
    let count = 0;
    for (let i = startIndex; i < linesArray.length; i++) {
      let output = linesArray[i];
      // 如果是 link 行，尝试添加 href（使用完整 URL）
      const linkMatch = linesArray[i].match(/link:\s*([^\[\n]+)/);
      if (linkMatch) {
        const linkText = linkMatch[1].trim();
        const href = linkHrefs[linkText];
        if (href) {
          output += ` → ${href}`;
        }
      }
      const rowsNeeded = calculateWrappedRows(output, termCols);
      if (usedRows + rowsNeeded > availableRows) {
        break;
      }
      usedRows += rowsNeeded;
      count++;
    }
    return Math.max(1, count);
  };

  // 预计算每页的起始位置和元素数量
  const pageBreaks = [];
  let currentIndex = 0;
  while (currentIndex < lines.length) {
    const count = calculatePageSize(currentIndex, lines);
    pageBreaks.push({ start: currentIndex, count });
    currentIndex += count;
  }

  const totalPages = pageBreaks.length;
  let currentPage = 0;

  const showPage = (page) => {
    console.clear();
    const pageBreak = pageBreaks[page];
    const start = pageBreak.start;
    const end = Math.min(start + pageBreak.count, lines.length);
    const pageLines = lines.slice(start, end);

    console.log(`\n========== 元素列表 (第 ${page + 1}/${totalPages} 页) ==========`);

    for (const line of pageLines) {
      let output = line;
      // 如果是 link 行，尝试添加 href
      const linkMatch = line.match(/link:\s*([^\[\n]+)/);
      if (linkMatch) {
        const linkText = linkMatch[1].trim();
        const href = linkHrefs[linkText];
        if (href) {
          output += ` → ${href}`;
        }
      }
      console.log(output);
    }

    console.log('=====================================\n');
    console.log('[Enter] 下一页  [\\] 上一页  [ESC] 退出');
  };

  const keypressHandler = (str, key) => {
    if (key && key.name === 'escape') {
      running = false;
    } else if (str === '\r' || str === '\n') {
      // Enter - 下一页
      if (currentPage < totalPages - 1) {
        currentPage++;
        showPage(currentPage);
      }
    } else if (str === '\\' || (key && key.name === 'backspace')) {
      // \ 或 Backspace - 上一页
      if (currentPage > 0) {
        currentPage--;
        showPage(currentPage);
      }
    }
  };

  process.stdin.on('keypress', keypressHandler);

  try {
    showPage(currentPage);
    
    while (running) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } finally {
    process.stdin.off('keypress', keypressHandler);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    console.log('');
  }
}

/**
 * 获取可交互元素（分页显示，支持翻页）
 */
async function handleInteractiveElements() {
  await browser.takeSnapshot();

  if (!browser.lastSnapshot) {
    console.log('请先获取页面快照');
    return;
  }

  // 获取所有 link 元素的 href
  const linkHrefs = await browser.currentPage.evaluate(() => {
    const hrefs = {};
    document.querySelectorAll('a[href]').forEach((el) => {
      const text = el.textContent?.trim() || el.getAttribute('aria-label') || '';
      if (text) {
        hrefs[text] = el.href;
      }
    });
    return hrefs;
  });

  // 解析快照行，过滤出可交互元素
  const lines = browser.lastSnapshot.split('\n');
  const interactiveTypes = [
    'button:', 'textbox:', 'link:', 'checkbox:', 'radio:',
    'combobox:', 'listbox:', 'menuitem:', 'option:', 'tab:',
    'treeitem:', 'menu:', 'menubar:', 'toolbar:', 'searchbox:',
    'spinbutton:', 'slider:', 'switch:'
  ];

  const interactiveLines = [];
  for (const line of lines) {
    if (line.trim()) {
      const match = line.match(/\[uid_(\d+)\]/i);
      if (match) {
        const uid = `uid_${match[1]}`;
        for (const type of interactiveTypes) {
          if (line.includes(type)) {
            let desc = line.replace(/\[uid_\d+\]\s*/i, '').trim();

            // 如果是 link，添加 href
            if (type === 'link:') {
              const linkMatch = desc.match(/link:\s*([^\[\n→]+)/);
              if (linkMatch) {
                const linkText = linkMatch[1].trim();
                const href = linkHrefs[linkText];
                if (href) {
                  desc += ` → ${href}`;
                }
              }
            }

            interactiveLines.push(`[${uid}] ${desc}`);
            break;
          }
        }
      }
    }
  }

  if (interactiveLines.length === 0) {
    console.log('\n========== 可交互元素 ==========');
    console.log('（没有找到可交互元素）');
    console.log('=====================================\n');
    return;
  }

  // 获取终端尺寸
  const termRows = process.stdout.rows || 30;
  const termCols = process.stdout.columns || 120;

  // 预留行数用于标题和提示（标题 2 行 + 底部提示 2 行 + 额外空 3 行 = 7 行）
  const reservedRows = 7;
  const availableRows = termRows - reservedRows;

  // 设置终端为 raw 模式
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  let running = true;

  /**
   * 计算一行文本在终端中实际占用的行数（考虑自动换行）
   * 中文字符占 2 个宽度，英文字符占 1 个宽度
   */
  const calculateWrappedRows = (text, cols) => {
    if (!text || text.length === 0) return 1;
    
    // 计算文本的实际显示宽度
    let displayWidth = 0;
    for (const char of text) {
      const code = char.codePointAt(0);
      // 中文字符（CJK 统一表意文字）范围：0x4E00-0x9FFF，以及其他需要 2 个宽度的字符
      if (
        (code >= 0x4E00 && code <= 0x9FFF) ||  // CJK 统一表意文字
        (code >= 0x3400 && code <= 0x4DBF) ||  // CJK 扩展 A
        (code >= 0x20000 && code <= 0x2A6DF) || // CJK 扩展 B
        (code >= 0xF900 && code <= 0xFAFF) ||  // CJK 兼容表意文字
        (code >= 0x2F800 && code <= 0x2FA1F) || // CJK 兼容补充
        code >= 0xFF00  // 全角字符
      ) {
        displayWidth += 2;
      } else {
        displayWidth += 1;
      }
    }
    
    return Math.ceil(displayWidth / cols);
  };

  /**
   * 从当前索引开始，计算最多能显示多少个元素（不超过可用行数）
   */
  const calculatePageSize = (startIndex, linesArray) => {
    let usedRows = 0;
    let count = 0;
    for (let i = startIndex; i < linesArray.length; i++) {
      let output = linesArray[i];
      // 如果是 link 行，尝试添加 href（使用完整 URL）
      const linkMatch = linesArray[i].match(/link:\s*([^\[\n→]+)/);
      if (linkMatch) {
        const linkText = linkMatch[1].trim();
        const href = linkHrefs[linkText];
        if (href) {
          output += ` → ${href}`;
        }
      }
      const rowsNeeded = calculateWrappedRows(output, termCols);
      if (usedRows + rowsNeeded > availableRows) {
        break;
      }
      usedRows += rowsNeeded;
      count++;
    }
    return Math.max(1, count);
  };

  // 预计算每页的起始位置和元素数量
  const pageBreaks = [];
  let currentIndex = 0;
  while (currentIndex < interactiveLines.length) {
    const count = calculatePageSize(currentIndex, interactiveLines);
    pageBreaks.push({ start: currentIndex, count });
    currentIndex += count;
  }

  const totalPages = pageBreaks.length;
  let currentPage = 0;

  const showPage = (page) => {
    console.clear();
    const pageBreak = pageBreaks[page];
    const start = pageBreak.start;
    const end = Math.min(start + pageBreak.count, interactiveLines.length);
    const pageLines = interactiveLines.slice(start, end);

    console.log(`\n========== 可交互元素 (第 ${page + 1}/${totalPages} 页) ==========`);

    for (const line of pageLines) {
      let output = line;
      // 如果是 link 行，尝试添加 href
      const linkMatch = output.match(/link:\s*([^\[\n→]+)/);
      if (linkMatch) {
        const linkText = linkMatch[1].trim();
        const href = linkHrefs[linkText];
        if (href) {
          output += ` → ${href}`;
        }
      }
      console.log(output);
    }

    console.log('=====================================\n');
    console.log('[Enter] 下一页  [\\] 上一页  [ESC] 退出');
  };

  const keypressHandler = (str, key) => {
    if (key && key.name === 'escape') {
      running = false;
    } else if (str === '\r' || str === '\n') {
      // Enter - 下一页
      if (currentPage < totalPages - 1) {
        currentPage++;
        showPage(currentPage);
      }
    } else if (str === '\\' || (key && key.name === 'backspace')) {
      // \ 或 Backspace - 上一页
      if (currentPage > 0) {
        currentPage--;
        showPage(currentPage);
      }
    }
  };

  process.stdin.on('keypress', keypressHandler);

  try {
    showPage(currentPage);
    
    while (running) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } finally {
    process.stdin.off('keypress', keypressHandler);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    console.log('');
  }
}

async function handleScreenshot(args) {
  const filePath = args[0];
  await browser.screenshot(filePath);
  console.log(`✅ 截图已保存到：${filePath}`);
}

/**
 * 获取终端尺寸（考虑留边）
 * 返回原始终端尺寸，由渲染函数自行处理字符宽度
 */
function getTerminalSize() {
  const cols = process.stdout.columns || 100;
  const rows = process.stdout.rows || 50;
  // 留出边距
  return {
    width: Math.max(20, cols - 2),
    height: Math.max(10, rows - 3)
  };
}

/**
 * 截图并在终端预览（彩色）
 */
async function handleScreenshotPreview() {
  console.log('正在截图并渲染...');
  try {
    const imageData = await browser.screenshotBuffer();
    const termSize = getTerminalSize();
    const rendered = await renderImageToTerminal(imageData, termSize.width, termSize.height);
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
    const termSize = getTerminalSize();
    const rendered = await renderImageAsASCII(imageData, termSize.width, termSize.height);
    console.log(rendered);
  } catch (error) {
    console.log(`${COLORS.fg.red}截图失败：${error.message}${COLORS.reset}`);
  }
}

/**
 * 截图并在终端显示（彩色色块 + 文字）
 */
async function handleScreenshotWithText() {
  console.log('正在截图并获取元素位置...');
  try {
    // 先获取快照
    await browser.takeSnapshot();
    const elements = await browser.getElementsForOCR();
    console.log(`[获取到 ${elements.length} 个元素位置]`);

    const imageData = await browser.screenshotBuffer();
    const termSize = getTerminalSize();
    const rendered = await renderImageWithText(imageData, termSize.width, termSize.height, elements);
    console.log(rendered);
  } catch (error) {
    console.log(`${COLORS.fg.red}截图失败：${error.message}${COLORS.reset}`);
  }
}

/**
 * 连续截图预览（动态刷新），按 ESC 退出
 */
async function handleScreenshotPreviewWatch() {
  // 设置终端为 raw 模式以监听按键
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  
  console.log('正在连续截图预览...');
  console.log('按 [ESC] 退出');
  
  let running = true;
  
  const keypressHandler = (str, key) => {
    if (key && key.name === 'escape') {
      running = false;
    }
  };
  
  process.stdin.on('keypress', keypressHandler);
  
  // 等待 0.5 秒后开始
  await new Promise(resolve => setTimeout(resolve, 500));
  
  try {
    while (running) {
      const startTime = Date.now();
      
      const imageData = await browser.screenshotBuffer();
      const termSize = getTerminalSize();
      const rendered = await renderImageToTerminal(imageData, termSize.width, termSize.height);
      
      // 清屏并输出
      process.stdout.write('\x1b[2J\x1b[H');
      console.log(`[spw - 按 ESC 退出]`);
      console.log(rendered);
      
      // 计算剩余等待时间
      const elapsed = Date.now() - startTime;
      const delay = Math.max(0, 50 - elapsed);
      
      if (delay > 0 && running) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } catch (error) {
    console.log(`${COLORS.fg.red}截图失败：${error.message}${COLORS.reset}`);
  } finally {
    process.stdin.removeListener('keypress', keypressHandler);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    console.log('\n已退出连续预览');
  }
}

/**
 * 连续截图显示文字（动态刷新），按 ESC 退出
 */
async function handleScreenshotWithTextWatch() {
  // 设置终端为 raw 模式以监听按键
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  
  console.log('正在连续截图显示文字...');
  console.log('按 [ESC] 退出');
  
  let running = true;
  
  const keypressHandler = (str, key) => {
    if (key && key.name === 'escape') {
      running = false;
    }
  };
  
  process.stdin.on('keypress', keypressHandler);
  
  // 等待 0.5 秒后开始
  await new Promise(resolve => setTimeout(resolve, 500));
  
  try {
    while (running) {
      const startTime = Date.now();
      
      await browser.takeSnapshot();
      const elements = await browser.getElementsForOCR();
      
      const imageData = await browser.screenshotBuffer();
      const termSize = getTerminalSize();
      const rendered = await renderImageWithText(imageData, termSize.width, termSize.height, elements);
      
      // 清屏并输出
      process.stdout.write('\x1b[2J\x1b[H');
      console.log(`[stw - 按 ESC 退出] [元素：${elements.length}]`);
      console.log(rendered);
      
      // 计算剩余等待时间
      const elapsed = Date.now() - startTime;
      const delay = Math.max(0, 50 - elapsed);
      
      if (delay > 0 && running) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } catch (error) {
    console.log(`${COLORS.fg.red}截图失败：${error.message}${COLORS.reset}`);
  } finally {
    process.stdin.removeListener('keypress', keypressHandler);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    console.log('\n已退出连续预览');
  }
}

async function handleClick(args) {
  if (!args[0]) {
    console.log('用法：click <uid>');
    return;
  }
  await browser.click(args[0]);
  console.log('✅ 点击完成，若未反应，有可能是网页正在加载,可稍后使用p获取');
}

async function handleFill(args) {
  if (args.length < 2) {
    console.log('用法：t <uid> <text>');
    console.log('示例：');
    console.log('  t uid_5 hello world');
    console.log('  t uid_5 你好，世界');
    return;
  }
  const uid = args[0];
  const text = args.slice(1).join(' ');
  try {
    await browser.fill(uid, text);
    console.log('✅ 输入完成');
  } catch (error) {
    console.log(`❌ 输入失败：${error.message}`);
  }
}

/**
 * 根据文字查找并点击元素
 * fc <文字> [编号]
 */
async function handleFindClick(args) {
  if (!args[0]) {
    console.log('用法：fc <文字> [编号]');
    console.log('示例：');
    console.log('  fc 登录      - 点击包含"登录"的元素（默认第1个）');
    console.log('  fc 登录 2    - 点击包含"登录"的第2个元素');
    return;
  }
  const text = args[0];
  const index = args[1] ? parseInt(args[1]) : 1;
  try {
    const uid = await browser.findElementByText(text, index, 'click');
    await browser.click(uid);
    console.log('✅ 点击完成');
  } catch (error) {
    console.log(`❌ 点击失败：${error.message}`);
  }
}

/**
 * 根据文字查找输入框并输入文本
 * ft <文字> <输入文本> [编号]
 */
async function handleFindFill(args) {
  if (args.length < 2) {
    console.log('用法：ft <文字> <输入文本> [编号]');
    console.log('示例：');
    console.log('  ft 用户名 zhangsan  - 向包含"用户名"的输入框输入文本');
    console.log('  ft 用户名 zhangsan 2 - 向包含"用户名"的第2个输入框输入文本');
    return;
  }
  const text = args[0];
  const inputText = args[1];
  const index = args[2] ? parseInt(args[2]) : 1;
  try {
    const uid = await browser.findElementByText(text, index, 'fill');
    await browser.fill(uid, inputText);
    console.log('✅ 输入完成');
  } catch (error) {
    console.log(`❌ 输入失败：${error.message}`);
  }
}

async function handleHover(args) {
  if (!args[0]) {
    console.log('用法：hover <uid>');
    return;
  }
  await browser.hover(args[0]);
  console.log('✅ 悬停完成');
}

/**
 * 停顿命令（sleep）
 */
async function handleSleep(args) {
  if (!args[0]) {
    console.log('用法：sl <秒数>');
    console.log('示例：');
    console.log('  sl 1    - 停顿 1 秒');
    console.log('  sl 2.5  - 停顿 2.5 秒');
    return;
  }
  const seconds = parseFloat(args[0]);
  if (isNaN(seconds) || seconds < 0) {
    console.log('❌ 请输入有效的秒数');
    return;
  }
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
  console.log(`✅ 已停顿 ${seconds} 秒`);
}

async function handlePress(args) {
  if (!args[0]) {
    console.log('用法：press <key>');
    console.log('支持的按键：');
    console.log('  字母数字：A-Z, 0-9');
    console.log('  功能键：Enter, Tab, Escape, Space, Backspace, Delete');
    console.log('  方向键：ArrowUp, ArrowDown, ArrowLeft, ArrowRight');
    console.log('  修饰键：Control, Shift, Alt, Meta');
    console.log('  其他：F1-F12, PageDown, PageUp, Home, End, Insert');
    console.log('  组合键：Control+A, Control+Shift+T 等');
    console.log('示例：k Enter, k Control+A, k F5');
    return;
  }
  const key = args.join(' ');
  try {
    await browser.pressKey(key);
    console.log('✅ 按键完成');
  } catch (error) {
    console.log(`❌ 按键失败：${error.message}`);
    console.log('提示：检查按键名称是否正确，例如使用 Enter 而不是 enter');
  }
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

/**
 * 自动化命令处理
 */
async function handleAuto(args) {
  if (args.length === 0) {
    console.log('自动化命令用法：');
    console.log('  a h          - 显示自动化帮助');
    console.log('  a s          - 开始录制自动化');
    console.log('  a e          - 结束录制');
    console.log('  a l          - 列出所有自动化脚本');
    console.log('  a a <编号>   - 执行指定编号的自动化脚本');
    return;
  }

  const subCommand = args[0].toLowerCase();

  switch (subCommand) {
    case 'h':
    case 'help':
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║           自动化命令帮助                                      ║
╠══════════════════════════════════════════════════════════════╣
║  a h               显示此帮助信息                             ║
║  a s               开始录制自动化操作                         ║
║                    输入后会提示输入自动化名字                 ║
║                    之后记录每一个命令直到 a e                 ║
║  a e               结束录制并保存自动化脚本                   ║
║  a l               列出所有自动化脚本（编号 + 备注）          ║
║  a a <编号>        自动执行指定编号的自动化脚本               ║
╠══════════════════════════════════════════════════════════════╣
║  示例：                                                      ║
║    a s              开始录制，输入名字"登录"                   ║
║    o luogu.com.cn   打开网页                                  ║
║    c uid_1          点击元素                                  ║
║    t uid_2 hello    输入文本                                  ║
║    a e              结束录制                                  ║
║    a l              查看自动化列表                            ║
║    a a 1            执行编号为 1 的自动化                       ║
╚══════════════════════════════════════════════════════════════╝
`);
      break;

    case 's':
      if (recordingState) {
        console.log('⚠️ 已经在录制中，请先使用 a e 结束当前录制');
        return;
      }
      // 提示用户输入名字
      return new Promise((resolve) => {
        console.log('请输入自动化脚本的名字：');
        rl.question('> ', (name) => {
          if (!name || name.trim() === '') {
            console.log('❌ 名字不能为空');
            resolve();
            return;
          }
          recordingState = {
            name: name.trim(),
            commands: [],
            startTime: new Date().toISOString(),
          };
          console.log(`✅ 已开始录制自动化："${name}"`);
          console.log('   请执行操作（点击、输入等），使用 a e 结束录制');
          resolve();
        });
      });
      break;

    case 'e':
      if (!recordingState) {
        console.log('⚠️ 当前没有正在录制的自动化');
        return;
      }
      if (recordingState.commands.length === 0) {
        console.log('⚠️ 录制的命令为空，已取消录制');
        recordingState = null;
        return;
      }
      // 保存自动化脚本
      const script = browser.addAutoScript(recordingState.name, recordingState.commands);
      console.log(`✅ 已保存自动化脚本："${script.name}" (编号：${script.id})`);
      console.log(`   共录制 ${script.commands.length} 条命令`);
      recordingState = null;
      break;

    case 'l':
      const scripts = browser.loadAutoScripts();
      if (scripts.length === 0) {
        console.log('（没有保存的自动化脚本）');
        return;
      }
      console.log('\n========== 自动化脚本列表 ==========');
      for (const s of scripts) {
        const cmdCount = s.commands ? s.commands.length : 0;
        const createdAt = s.createdAt ? new Date(s.createdAt).toLocaleString('zh-CN') : '未知';
        console.log(`  [${s.id}] ${s.name} - ${cmdCount}条命令 - 创建于：${createdAt}`);
      }
      console.log('=====================================\n');
      console.log('使用 a a <编号> 执行指定的自动化脚本');
      break;

    case 'a':
      if (!args[1]) {
        console.log('用法：a a <编号>');
        console.log('使用 a l 查看自动化脚本列表');
        return;
      }
      const scriptId = parseInt(args[1]);
      const scripts2 = browser.loadAutoScripts();
      const targetScript = scripts2.find(s => s.id === scriptId);
      if (!targetScript) {
        console.log(`❌ 找不到编号为 ${scriptId} 的自动化脚本`);
        console.log('使用 a l 查看自动化脚本列表');
        return;
      }
      console.log(`▶️ 开始执行自动化："${targetScript.name}"`);
      console.log(`   共 ${targetScript.commands.length} 条命令`);
      await executeAutoScript(targetScript.commands);
      console.log(`✅ 自动化执行完成："${targetScript.name}"`);
      break;

    default:
      console.log(`未知自动化子命令：${subCommand}`);
      console.log('使用 a h 查看自动化帮助');
  }
}

/**
 * 执行自动化脚本
 */
async function executeAutoScript(commands) {
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    console.log(`  [${i + 1}/${commands.length}] 执行：${cmd.raw}`);
    try {
      await executeCommand(cmd.raw);
      // 命令之间等待 1 秒，确保页面响应并让用户看到效果
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.log(`  ⚠️ 命令执行失败：${error.message}`);
    }
  }
}

function showStatus() {
  console.log('\n========== 浏览器状态 ==========');
  console.log(`连接状态：${browser ? '已连接' : '未连接'}`);
  console.log(`标签页数量：${browser?.pages?.length || 0}`);
  
  // 获取当前标签页 URL
  let currentUrl = '无';
  if (browser?.currentPage) {
    try {
      currentUrl = browser.currentPage.url();
    } catch (e) {
      currentUrl = '未知';
    }
  }
  console.log(`当前标签页：${currentUrl}`);
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
    try {
      await executeCommand(input);
    } catch (error) {
      console.error(`❌ 错误：${error.message}`);
    }
    startPrompt();
  });
}

/**
 * 关闭程序
 */
async function shutdown() {
  console.log('\n正在关闭浏览器...');
  if (browser) {
    try {
      await browser.close();
    } catch (error) {
      // 忽略关闭时的错误（临时目录清理问题）
      console.log('浏览器已关闭');
    }
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
