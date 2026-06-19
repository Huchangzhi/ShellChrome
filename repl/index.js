const readline = require('readline');
const { BrowserManager } = require('../core/browser-manager');
const { SnapshotManager } = require('../core/snapshot');
const { ActionExecutor } = require('../core/actions');
const { AutomationManager } = require('../core/automation');
const { CommandDispatcher } = require('../core/commands');
const { renderImageToTerminal, renderImageAsASCII, renderImageWithText, COLORS } = require('../core/renderer');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let browserManager = null;
let snapshotManager = null;
let actionExecutor = null;
let automationManager = null;
let dispatcher = null;

let recordingState = null;

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
║    spw               连续截图预览（动态刷新，按 ESC 退出）     ║
║    st                截图并在终端显示（彩色色块 + 文字）       ║
║    stw               连续截图显示文字（动态刷新，按 ESC 退出）  ║
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

function showWelcome() {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║       🌐  ShellChrome v1.2.3                                      ║
║       基于 Puppeteer                                               ║
║                                                                    ║
║       快捷命令：c=点击，t=输入，k=按键，sl=停顿，q=关闭，ba=返回       ║
║       l=元素，lc=可交互元素，sp=色块，spw=连续色块，st=色块+文字，      ║
║       stw=连续文字(ESC退出)，sa=ASCII，hi=历史                          ║
║       fc=点击文字，ft=输入到文字，ui=UI模式                          ║
║       h=帮助，x=退出，a=自动化                                       ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
`);
}

async function executeCommand(input) {
  const trimmed = input.trim();
  if (!trimmed) return;

  const parts = trimmed.split(/\s+/);
  const command = parts[0].toLowerCase();

  if (command === 'x' || command === 'exit' || command === 'quit') {
    await shutdown();
    return;
  }

  if (command === 'clear') {
    console.clear();
    return;
  }

  if (command === 'spw') {
    await handleScreenshotPreviewWatch();
    return;
  }

  if (command === 'stw') {
    await handleScreenshotWithTextWatch();
    return;
  }

  if (recordingState) {
    const skipCommands = ['a', 'l', 'lc', 's', 'sp', 'st', 'sa', 'e', 'els', 'elements', 'h', 'help', 'status', 'clear'];
    if (!skipCommands.includes(command)) {
      recordingState.commands.push({ raw: trimmed, timestamp: Date.now() });
    }
  }

  if (command === 'a' && parts[1]) {
    const sub = parts[1].toLowerCase();
    if (sub === 's') {
      await handleAutoRecord();
      return;
    }
    if (sub === 'e') {
      handleAutoEnd();
      return;
    }
  }

  if (command === 'l' || command === 'elements' || command === 'els' || command === 'e') {
    await handleElementsInteractive();
    return;
  }

  if (command === 'lc') {
    await handleInteractiveElementsPaginated();
    return;
  }

  const result = await dispatcher.dispatch(trimmed);
  if (result) {
    printResult(result);
  }
}

function printResult(result) {
  if (!result.success) {
    console.log(`❌ ${result.error}`);
    return;
  }

  switch (result.displayType) {
    case 'text':
      if (result.data.text) {
        console.log(`✅ ${result.data.text}`);
      } else if (result.data.scripts) {
        console.log('\n========== 自动化脚本列表 ==========');
        for (const s of result.data.scripts) {
          const createdAt = s.createdAt ? new Date(s.createdAt).toLocaleString('zh-CN') : '未知';
          console.log(`  [${s.id}] ${s.name} - ${s.commandCount}条命令 - 创建于：${createdAt}`);
        }
        console.log('=====================================\n');
        console.log('使用 a a <编号> 执行指定的自动化脚本');
      } else if (result.data.scriptName) {
        console.log(`▶️ 开始执行自动化："${result.data.scriptName}"`);
        for (const r of result.data.results) {
          if (r.success) {
            console.log(`  [${r.index}/${result.data.totalCommands}] ✅ ${r.raw}`);
          } else {
            console.log(`  [${r.index}/${result.data.totalCommands}] ⚠️ ${r.raw} - ${r.error}`);
          }
        }
        console.log(`✅ 自动化执行完成："${result.data.scriptName}"`);
      } else if (result.data.messages !== undefined) {
        if (result.data.messages.length === 0) {
          console.log('（无控制台消息）');
        } else {
          console.log('\n========== 控制台消息 ==========');
          for (const msg of result.data.messages) {
            console.log(`[${msg.type || 'log'}] ${msg.text || msg}`);
          }
          console.log('================================\n');
        }
      } else if (result.data.requests !== undefined) {
        if (result.data.requests.length === 0) {
          console.log('（无网络请求）');
        } else {
          console.log(`\n========== 网络请求 (${result.data.total} 个) ==========`);
          for (const req of result.data.requests) {
            console.log(`${req.method || 'GET'} ${req.url || req}`);
          }
          if (result.data.total > 20) {
            console.log(`... 还有 ${result.data.total - 20} 个请求`);
          }
          console.log('========================================\n');
        }
      }
      break;

    case 'pages':
      console.log('\n========== 标签页列表 ==========');
      if (result.data.pages.length === 0) {
        console.log('（无标签页）');
        console.log('提示：使用 "o <url>" 命令打开网页');
      } else {
        for (const page of result.data.pages) {
          const current = page.current ? ' [当前]' : '';
          console.log(`[${page.id}] ${page.url}${current}`);
        }
      }
      console.log('===============================\n');
      break;

    case 'elements':
      console.log(`\n========== 元素列表 (第 ${result.data.page}/${result.data.totalPages} 页, 共 ${result.data.totalElements} 个) ==========`);
      for (const line of result.data.elements) {
        console.log(line);
      }
      console.log('=====================================\n');
      break;

    case 'image':
      console.log(result.data.rendered);
      break;

    case 'status':
      console.log('\n========== 浏览器状态 ==========');
      console.log(`连接状态：${result.data.connected ? '已连接' : '未连接'}`);
      console.log(`标签页数量：${result.data.tabCount}`);
      console.log(`当前标签页：${result.data.currentUrl}`);
      console.log('===============================\n');
      break;

    case 'help':
      if (result.data.commands) {
        console.log(HELP_TEXT);
      } else if (result.data.text) {
        console.log(result.data.text);
      }
      break;

    default:
      console.log(result.data.text || JSON.stringify(result.data));
  }
}

/**
 * 元素列表（交互式分页，按键翻页）
 */
async function handleElementsInteractive() {
  await snapshotManager.takeSnapshot();

  if (!snapshotManager.getLastSnapshot()) {
    console.log('请先获取页面快照');
    return;
  }

  const page = browserManager.getCurrentPage();
  let linkHrefs = {};
  if (page) {
    try {
      linkHrefs = await page.evaluate(() => {
        const hrefs = {};
        document.querySelectorAll('a[href]').forEach((el) => {
          const text = el.textContent?.trim() || el.getAttribute('aria-label') || '';
          if (text) hrefs[text] = el.href;
        });
        return hrefs;
      });
    } catch (e) {}
  }

  const lines = snapshotManager.getLastSnapshot().split('\n').filter(line => line.trim());
  const termRows = process.stdout.rows || 30;
  const termCols = process.stdout.columns || 120;
  const reservedRows = 7;
  const availableRows = termRows - reservedRows;

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  let running = true;

  const calculateWrappedRows = (text, cols) => {
    if (!text || text.length === 0) return 1;
    let displayWidth = 0;
    for (const char of text) {
      const code = char.codePointAt(0);
      if (
        (code >= 0x4E00 && code <= 0x9FFF) ||
        (code >= 0x3400 && code <= 0x4DBF) ||
        (code >= 0x20000 && code <= 0x2A6DF) ||
        (code >= 0xF900 && code <= 0xFAFF) ||
        (code >= 0x2F800 && code <= 0x2FA1F) ||
        code >= 0xFF00
      ) {
        displayWidth += 2;
      } else {
        displayWidth += 1;
      }
    }
    return Math.ceil(displayWidth / cols);
  };

  const calculatePageSize = (startIndex, linesArray) => {
    let usedRows = 0;
    let count = 0;
    for (let i = startIndex; i < linesArray.length; i++) {
      let output = linesArray[i];
      const linkMatch = linesArray[i].match(/link:\s*([^\[\n]+)/);
      if (linkMatch) {
        const linkText = linkMatch[1].trim();
        const href = linkHrefs[linkText];
        if (href) output += ` → ${href}`;
      }
      const rowsNeeded = calculateWrappedRows(output, termCols);
      if (usedRows + rowsNeeded > availableRows) break;
      usedRows += rowsNeeded;
      count++;
    }
    return Math.max(1, count);
  };

  const pageBreaks = [];
  let currentIndex = 0;
  while (currentIndex < lines.length) {
    const count = calculatePageSize(currentIndex, lines);
    pageBreaks.push({ start: currentIndex, count });
    currentIndex += count;
  }

  const totalPages = pageBreaks.length;
  let currentPage = 0;

  const showPage = (pg) => {
    console.clear();
    const pageBreak = pageBreaks[pg];
    const start = pageBreak.start;
    const end = Math.min(start + pageBreak.count, lines.length);
    const pageLines = lines.slice(start, end);

    console.log(`\n========== 元素列表 (第 ${pg + 1}/${totalPages} 页) ==========`);
    for (const line of pageLines) {
      let output = line;
      const linkMatch = line.match(/link:\s*([^\[\n]+)/);
      if (linkMatch) {
        const linkText = linkMatch[1].trim();
        const href = linkHrefs[linkText];
        if (href) output += ` → ${href}`;
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
      if (currentPage < totalPages - 1) { currentPage++; showPage(currentPage); }
    } else if (str === '\\' || (key && key.name === 'backspace')) {
      if (currentPage > 0) { currentPage--; showPage(currentPage); }
    }
  };

  process.stdin.on('keypress', keypressHandler);
  try {
    showPage(currentPage);
    while (running) await new Promise(resolve => setTimeout(resolve, 100));
  } finally {
    process.stdin.off('keypress', keypressHandler);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    console.log('');
  }
}

/**
 * 可交互元素列表（交互式分页，按键翻页）
 */
async function handleInteractiveElementsPaginated() {
  await snapshotManager.takeSnapshot();

  if (!snapshotManager.getLastSnapshot()) {
    console.log('请先获取页面快照');
    return;
  }

  const page = browserManager.getCurrentPage();
  let linkHrefs = {};
  if (page) {
    try {
      linkHrefs = await page.evaluate(() => {
        const hrefs = {};
        document.querySelectorAll('a[href]').forEach((el) => {
          const text = el.textContent?.trim() || el.getAttribute('aria-label') || '';
          if (text) hrefs[text] = el.href;
        });
        return hrefs;
      });
    } catch (e) {}
  }

  const interactiveTypes = [
    'button:', 'textbox:', 'link:', 'checkbox:', 'radio:',
    'combobox:', 'listbox:', 'menuitem:', 'option:', 'tab:',
    'treeitem:', 'menu:', 'menubar:', 'toolbar:', 'searchbox:',
    'spinbutton:', 'slider:', 'switch:'
  ];

  const lines = snapshotManager.getLastSnapshot().split('\n');
  const interactiveLines = [];
  for (const line of lines) {
    if (line.trim()) {
      const match = line.match(/\[uid_(\d+)\]/i);
      if (match) {
        const uid = `uid_${match[1]}`;
        for (const type of interactiveTypes) {
          if (line.includes(type)) {
            let desc = line.replace(/\[uid_\d+\]\s*/i, '').trim();
            if (type === 'link:') {
              const linkMatch = desc.match(/link:\s*([^\[\n→]+)/);
              if (linkMatch) {
                const linkText = linkMatch[1].trim();
                const href = linkHrefs[linkText];
                if (href) desc += ` → ${href}`;
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

  const termRows = process.stdout.rows || 30;
  const termCols = process.stdout.columns || 120;
  const reservedRows = 7;
  const availableRows = termRows - reservedRows;

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  let running = true;

  const calculateWrappedRows = (text, cols) => {
    if (!text || text.length === 0) return 1;
    let displayWidth = 0;
    for (const char of text) {
      const code = char.codePointAt(0);
      if (
        (code >= 0x4E00 && code <= 0x9FFF) ||
        (code >= 0x3400 && code <= 0x4DBF) ||
        (code >= 0x20000 && code <= 0x2A6DF) ||
        (code >= 0xF900 && code <= 0xFAFF) ||
        (code >= 0x2F800 && code <= 0x2FA1F) ||
        code >= 0xFF00
      ) {
        displayWidth += 2;
      } else {
        displayWidth += 1;
      }
    }
    return Math.ceil(displayWidth / cols);
  };

  const calculatePageSize = (startIndex, linesArray) => {
    let usedRows = 0;
    let count = 0;
    for (let i = startIndex; i < linesArray.length; i++) {
      let output = linesArray[i];
      const linkMatch = linesArray[i].match(/link:\s*([^\[\n→]+)/);
      if (linkMatch) {
        const linkText = linkMatch[1].trim();
        const href = linkHrefs[linkText];
        if (href) output += ` → ${href}`;
      }
      const rowsNeeded = calculateWrappedRows(output, termCols);
      if (usedRows + rowsNeeded > availableRows) break;
      usedRows += rowsNeeded;
      count++;
    }
    return Math.max(1, count);
  };

  const pageBreaks = [];
  let currentIndex = 0;
  while (currentIndex < interactiveLines.length) {
    const count = calculatePageSize(currentIndex, interactiveLines);
    pageBreaks.push({ start: currentIndex, count });
    currentIndex += count;
  }

  const totalPages = pageBreaks.length;
  let currentPage = 0;

  const showPage = (pg) => {
    console.clear();
    const pageBreak = pageBreaks[pg];
    const start = pageBreak.start;
    const end = Math.min(start + pageBreak.count, interactiveLines.length);
    const pageLines = interactiveLines.slice(start, end);

    console.log(`\n========== 可交互元素 (第 ${pg + 1}/${totalPages} 页) ==========`);
    for (const line of pageLines) {
      let output = line;
      const linkMatch = output.match(/link:\s*([^\[\n→]+)/);
      if (linkMatch) {
        const linkText = linkMatch[1].trim();
        const href = linkHrefs[linkText];
        if (href) output += ` → ${href}`;
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
      if (currentPage < totalPages - 1) { currentPage++; showPage(currentPage); }
    } else if (str === '\\' || (key && key.name === 'backspace')) {
      if (currentPage > 0) { currentPage--; showPage(currentPage); }
    }
  };

  process.stdin.on('keypress', keypressHandler);
  try {
    showPage(currentPage);
    while (running) await new Promise(resolve => setTimeout(resolve, 100));
  } finally {
    process.stdin.off('keypress', keypressHandler);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    console.log('');
  }
}

async function handleAutoRecord() {
  if (recordingState) {
    console.log('⚠️ 已经在录制中，请先使用 a e 结束当前录制');
    return;
  }
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
}

function handleAutoEnd() {
  if (!recordingState) {
    console.log('⚠️ 当前没有正在录制的自动化');
    return;
  }
  if (recordingState.commands.length === 0) {
    console.log('⚠️ 录制的命令为空，已取消录制');
    recordingState = null;
    return;
  }
  const script = automationManager.addScript(recordingState.name, recordingState.commands);
  console.log(`✅ 已保存自动化脚本："${script.name}" (编号：${script.id})`);
  console.log(`   共录制 ${script.commands.length} 条命令`);
  recordingState = null;
}

function getTerminalSize() {
  const cols = process.stdout.columns || 100;
  const rows = process.stdout.rows || 50;
  return {
    width: Math.max(20, cols - 2),
    height: Math.max(10, rows - 3),
  };
}

async function handleScreenshotPreviewWatch() {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  console.log('正在连续截图预览...');
  console.log('按 [ESC] 退出');

  let running = true;
  const keypressHandler = (str, key) => {
    if (key && key.name === 'escape') running = false;
  };
  process.stdin.on('keypress', keypressHandler);

  await new Promise(resolve => setTimeout(resolve, 500));

  try {
    while (running) {
      const startTime = Date.now();
      const imageData = await actionExecutor.screenshotBuffer();
      const termSize = getTerminalSize();
      const rendered = await renderImageToTerminal(imageData, termSize.width, termSize.height);

      process.stdout.write('\x1b[2J\x1b[H');
      console.log('[spw - 按 ESC 退出]');
      console.log(rendered);

      const elapsed = Date.now() - startTime;
      const delay = Math.max(0, 200 - elapsed);
      if (delay > 0 && running) await new Promise(resolve => setTimeout(resolve, delay));
    }
  } catch (error) {
    console.log(`${COLORS.fg.red}截图失败：${error.message}${COLORS.reset}`);
  } finally {
    process.stdin.removeListener('keypress', keypressHandler);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    console.log('\n已退出连续预览');
  }
}

async function handleScreenshotWithTextWatch() {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  console.log('正在连续截图显示文字...');
  console.log('按 [ESC] 退出');

  let running = true;
  const keypressHandler = (str, key) => {
    if (key && key.name === 'escape') running = false;
  };
  process.stdin.on('keypress', keypressHandler);

  await new Promise(resolve => setTimeout(resolve, 500));

  try {
    while (running) {
      const startTime = Date.now();

      await snapshotManager.takeSnapshot();
      const elements = await snapshotManager.getElementsForOCR();

      const imageData = await actionExecutor.screenshotBuffer();
      const termSize = getTerminalSize();
      const rendered = await renderImageWithText(imageData, termSize.width, termSize.height, elements);

      process.stdout.write('\x1b[2J\x1b[H');
      console.log(`[stw - 按 ESC 退出] [元素：${elements.length}]`);
      console.log(rendered);

      const elapsed = Date.now() - startTime;
      const delay = Math.max(0, 200 - elapsed);
      if (delay > 0 && running) await new Promise(resolve => setTimeout(resolve, delay));
    }
  } catch (error) {
    console.log(`${COLORS.fg.red}截图失败：${error.message}${COLORS.reset}`);
  } finally {
    process.stdin.removeListener('keypress', keypressHandler);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    console.log('\n已退出连续预览');
  }
}

async function start() {
  showWelcome();

  try {
    browserManager = new BrowserManager();
    snapshotManager = new SnapshotManager(browserManager);
    actionExecutor = new ActionExecutor(browserManager, snapshotManager);
    automationManager = new AutomationManager();
    dispatcher = new CommandDispatcher(browserManager, snapshotManager, actionExecutor, automationManager);

    await browserManager.start();

    const statusResult = await dispatcher.dispatch('status');
    printResult(statusResult);

    startPrompt();
  } catch (error) {
    console.error(`启动失败：${error.message}`);
    console.error('请确保已安装 chrome-devtools-mcp 并且 Node.js 版本 >= 20.19');
    process.exit(1);
  }
}

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

async function shutdown() {
  console.log('\n正在关闭浏览器...');
  if (browserManager) {
    try {
      await browserManager.close();
    } catch (error) {
      console.log('浏览器已关闭');
    }
  }
  rl.close();
  console.log('👋 再见！');
  process.exit(0);
}

process.on('SIGINT', async () => {
  console.log('\n');
  await shutdown();
});

start();
