const { renderImageToTerminal, renderImageAsASCII, renderImageWithText } = require('./renderer');

class CommandDispatcher {
  constructor(browserManager, snapshotManager, actionExecutor, automationManager) {
    this.browserManager = browserManager;
    this.snapshotManager = snapshotManager;
    this.actionExecutor = actionExecutor;
    this.automationManager = automationManager;
  }

  async dispatch(input) {
    const trimmed = input.trim();
    if (!trimmed) return null;

    const fillMatch = trimmed.match(/^(t|fill|f)\s+(\S+)\s+(.+)$/i);
    if (fillMatch) {
      return this._fill([fillMatch[2], fillMatch[3]]);
    }

    const parts = trimmed.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    const COMMAND_MAP = {
      'help': '_help', 'h': '_help', '\uff1f': '_help',
      'status': '_status',
      'open': '_open', 'o': '_open',
      'close': '_close', 'q': '_close',
      'pages': '_pages', 'list': '_pages', 'ls': '_pages', 'p': '_pages',
      'switch': '_switch', 'sw': '_switch', 'w': '_switch',
      'navigate': '_navigate', 'nav': '_navigate', 'go': '_navigate', 'n': '_navigate',
      'back': '_back', 'ba': '_back',
      'history': '_history', 'hi': '_history',
      'snapshot': '_snapshot', 'snap': '_snapshot',
      'screenshot': '_screenshot', 'shot': '_screenshot', 's': '_screenshot',
      'sp': '_screenshotPreview',
      'st': '_screenshotWithText',
      'sa': '_screenshotASCII',
      'elements': '_elements', 'els': '_elements', 'e': '_elements', 'l': '_elements',
      'lc': '_interactiveElements',
      'click': '_click', 'c': '_click',
      'fill': '_fill', 'f': '_fill', 't': '_fill',
      'fc': '_findClick',
      'ft': '_findFill',
      'key': '_press', 'k': '_press',
      'hover': '_hover',
      'sleep': '_sleep', 'sl': '_sleep',
      'wait': '_wait',
      'eval': '_eval', 'js': '_eval',
      'console': '_console', 'log': '_console',
      'network': '_network', 'net': '_network',
      'ui': '_ui',
      'auto': '_auto', 'a': '_auto',
    };

    const handler = COMMAND_MAP[command];
    if (!handler) {
      return { success: false, error: `未知命令：${command}`, displayType: 'error' };
    }

    try {
      return await this[handler](args);
    } catch (error) {
      return { success: false, error: error.message, displayType: 'error' };
    }
  }

  getCommandList() {
    return [
      { aliases: ['o', 'open'], description: '打开新标签页' },
      { aliases: ['q', 'close'], description: '关闭当前标签页' },
      { aliases: ['p', 'pages'], description: '显示所有标签页' },
      { aliases: ['w', 'switch'], description: '切换标签页' },
      { aliases: ['n', 'navigate'], description: '在当前页导航' },
      { aliases: ['ba', 'back'], description: '返回上一页' },
      { aliases: ['hi', 'history'], description: '打开历史记录' },
      { aliases: ['l', 'elements'], description: '获取所有元素' },
      { aliases: ['lc'], description: '获取可交互元素' },
      { aliases: ['s', 'screenshot'], description: '截图保存' },
      { aliases: ['sp'], description: '截图终端预览' },
      { aliases: ['st'], description: '截图+文字预览' },
      { aliases: ['sa'], description: '截图ASCII预览' },
      { aliases: ['c', 'click'], description: '点击元素' },
      { aliases: ['t', 'fill'], description: '输入文本' },
      { aliases: ['fc'], description: '点击文字' },
      { aliases: ['ft'], description: '输入到文字' },
      { aliases: ['k', 'key'], description: '发送按键' },
      { aliases: ['sl', 'sleep'], description: '停顿' },
      { aliases: ['wait'], description: '等待文本' },
      { aliases: ['eval', 'js'], description: '执行JS' },
      { aliases: ['console', 'log'], description: '控制台消息' },
      { aliases: ['network', 'net'], description: '网络请求' },
      { aliases: ['ui'], description: 'UI模式配置' },
      { aliases: ['a', 'auto'], description: '自动化' },
      { aliases: ['status'], description: '浏览器状态' },
      { aliases: ['h', 'help'], description: '帮助信息' },
    ];
  }

  _help() {
    return {
      success: true,
      displayType: 'help',
      data: {
        commands: this.getCommandList(),
      },
    };
  }

  _status() {
    const pages = this.browserManager.getPages();
    const currentUrl = this.browserManager.getCurrentPage()?.url() || '无';
    return {
      success: true,
      displayType: 'status',
      data: {
        connected: this.browserManager.isRunning(),
        tabCount: pages.length,
        currentUrl,
        pages,
      },
    };
  }

  async _open(args) {
    if (!args[0]) {
      return { success: false, error: '用法：open <url>', displayType: 'error' };
    }
    const result = await this.browserManager.openPage(args[0]);
    return { success: true, displayType: 'text', data: { text: result.text, url: result.url } };
  }

  async _close(args) {
    const pageId = args[0] ? parseInt(args[0]) : undefined;
    const result = await this.browserManager.closePage(pageId);
    return { success: true, displayType: 'text', data: { text: result?.text || '已关闭' } };
  }

  _pages() {
    const pages = this.browserManager.getPages();
    const currentPage = this.browserManager.getCurrentPage();
    return {
      success: true,
      displayType: 'pages',
      data: {
        pages: pages.map(p => ({
          id: p.id,
          url: p.url,
          current: p._page === currentPage,
        })),
      },
    };
  }

  async _switch(args) {
    if (!args[0]) {
      return { success: false, error: '用法：switch <pageId>', displayType: 'error' };
    }
    const pageId = parseInt(args[0]);
    await this.browserManager.switchPage(pageId);
    return { success: true, displayType: 'text', data: { text: `已切换到标签页 ${pageId}`, pageId } };
  }

  async _navigate(args) {
    if (!args[0]) {
      return { success: false, error: '用法：navigate <url>', displayType: 'error' };
    }
    await this.browserManager.navigate(args[0]);
    return { success: true, displayType: 'text', data: { text: `已导航到 ${this.browserManager.normalizeUrl(args[0])}`, url: args[0] } };
  }

  async _back() {
    await this.browserManager.goBack();
    return { success: true, displayType: 'text', data: { text: '已返回上一页' } };
  }

  async _history() {
    await this.browserManager.openHistory();
    return { success: true, displayType: 'text', data: { text: '已打开历史记录页面' } };
  }

  async _snapshot() {
    await this.snapshotManager.takeSnapshot();
    return { success: true, displayType: 'text', data: { text: '快照已获取' } };
  }

  async _screenshot(args) {
    const filePath = args[0] || './image.png';
    await this.actionExecutor.screenshot(filePath);
    return { success: true, displayType: 'text', data: { text: `截图已保存到：${filePath}`, filePath } };
  }

  async _screenshotPreview() {
    const imageData = await this.actionExecutor.screenshotBuffer();
    const termSize = this._getTerminalSize();
    const rendered = await renderImageToTerminal(imageData, termSize.width, termSize.height);
    return { success: true, displayType: 'image', data: { rendered, imageData: imageData.toString('base64') } };
  }

  async _screenshotWithText() {
    await this.snapshotManager.takeSnapshot();
    const elements = await this.snapshotManager.getElementsForOCR();
    const imageData = await this.actionExecutor.screenshotBuffer();
    const termSize = this._getTerminalSize();
    const rendered = await renderImageWithText(imageData, termSize.width, termSize.height, elements);
    return {
      success: true,
      displayType: 'image',
      data: { rendered, elementCount: elements.length, imageData: imageData.toString('base64') },
    };
  }

  async _screenshotASCII() {
    const imageData = await this.actionExecutor.screenshotBuffer();
    const termSize = this._getTerminalSize();
    const rendered = await renderImageAsASCII(imageData, termSize.width, termSize.height);
    return { success: true, displayType: 'image', data: { rendered } };
  }

  async _elements(args) {
    await this.snapshotManager.takeSnapshot();

    if (!this.snapshotManager.getLastSnapshot()) {
      return { success: false, error: '请先获取页面快照', displayType: 'error' };
    }

    const lines = await this.snapshotManager.getSnapshotLines();

    let page = null;
    let pageSize = 50;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--page' && args[i + 1]) page = parseInt(args[i + 1]);
      if (args[i] === '--page-size' && args[i + 1]) pageSize = parseInt(args[i + 1]);
    }

    const totalPages = Math.ceil(lines.length / pageSize);

    if (page === null) {
      return {
        success: true,
        displayType: 'elements',
        data: { elements: lines, totalElements: lines.length, page: 1, totalPages, all: true },
      };
    }

    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, lines.length);
    const pageElements = lines.slice(start, end);

    return {
      success: true,
      displayType: 'elements',
      data: { elements: pageElements, totalElements: lines.length, page, totalPages },
    };
  }

  async _interactiveElements(args) {
    await this.snapshotManager.takeSnapshot();

    if (!this.snapshotManager.getLastSnapshot()) {
      return { success: false, error: '请先获取页面快照', displayType: 'error' };
    }

    const interactiveElements = this.snapshotManager.getInteractiveElements();

    const all = args.includes('--all');
    let page = null;
    let pageSize = 50;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--page' && args[i + 1]) page = parseInt(args[i + 1]);
      if (args[i] === '--page-size' && args[i + 1]) pageSize = parseInt(args[i + 1]);
    }

    const totalPages = Math.ceil(interactiveElements.length / pageSize);

    let resultElements;
    if (page === null) {
      resultElements = interactiveElements;
    } else {
      const start = (page - 1) * pageSize;
      const end = Math.min(start + pageSize, interactiveElements.length);
      resultElements = interactiveElements.slice(start, end);
    }

    return {
      success: true,
      displayType: 'elements',
      data: {
        elements: resultElements.map(e => `[${e.uid}] ${e.desc}`),
        totalElements: interactiveElements.length,
        page: all ? 1 : page,
        totalPages,
      },
    };
  }

  async _click(args) {
    if (!args[0]) {
      return { success: false, error: '用法：click <uid>', displayType: 'error' };
    }
    const result = await this.actionExecutor.click(args[0]);
    return { success: true, displayType: 'text', data: { text: result.text, uid: args[0] } };
  }

  async _fill(args) {
    if (args.length < 2) {
      return { success: false, error: '用法：t <uid> <text>', displayType: 'error' };
    }
    const uid = args[0];
    const text = args.slice(1).join(' ');
    const result = await this.actionExecutor.fill(uid, text);
    return { success: true, displayType: 'text', data: { text: result.text, uid } };
  }

  async _findClick(args) {
    if (!args[0]) {
      return { success: false, error: '用法：fc <文字> [编号]', displayType: 'error' };
    }
    const text = args[0];
    const index = args[1] ? parseInt(args[1]) : 1;
    const findResult = await this.snapshotManager.findElementByText(text, index, 'click');
    await this.actionExecutor.click(findResult.uid);
    return {
      success: true,
      displayType: 'text',
      data: {
        text: `找到 ${findResult.matchCount} 个匹配，点击第 ${findResult.selectedIndex} 个：${findResult.matchName} [${findResult.uid}]`,
        uid: findResult.uid,
        matchCount: findResult.matchCount,
      },
    };
  }

  async _findFill(args) {
    if (args.length < 2) {
      return { success: false, error: '用法：ft <文字> <输入文本> [编号]', displayType: 'error' };
    }
    const text = args[0];
    const inputText = args[1];
    const index = args[2] ? parseInt(args[2]) : 1;
    const findResult = await this.snapshotManager.findElementByText(text, index, 'fill');
    await this.actionExecutor.fill(findResult.uid, inputText);
    return {
      success: true,
      displayType: 'text',
      data: {
        text: `找到 ${findResult.matchCount} 个匹配，向第 ${findResult.selectedIndex} 个输入文本：${findResult.matchName}`,
        uid: findResult.uid,
      },
    };
  }

  async _press(args) {
    if (!args[0]) {
      return { success: false, error: '用法：k <key>', displayType: 'error' };
    }
    const key = args.join(' ');
    const result = await this.actionExecutor.pressKey(key);
    return { success: true, displayType: 'text', data: { text: result.text, key } };
  }

  async _hover(args) {
    if (!args[0]) {
      return { success: false, error: '用法：hover <uid>', displayType: 'error' };
    }
    const result = await this.actionExecutor.hover(args[0]);
    return { success: true, displayType: 'text', data: { text: result.text, uid: args[0] } };
  }

  async _sleep(args) {
    if (!args[0]) {
      return { success: false, error: '用法：sl <秒数>', displayType: 'error' };
    }
    const seconds = parseFloat(args[0]);
    if (isNaN(seconds) || seconds < 0) {
      return { success: false, error: '请输入有效的秒数', displayType: 'error' };
    }
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    return { success: true, displayType: 'text', data: { text: `已停顿 ${seconds} 秒`, seconds } };
  }

  async _wait(args) {
    if (!args[0]) {
      return { success: false, error: '用法：wait <text> [timeout]', displayType: 'error' };
    }
    const text = args[0];
    const timeout = args[1] ? parseInt(args[1]) : 10000;
    const result = await this.actionExecutor.waitFor(text, timeout);
    return { success: true, displayType: 'text', data: { text: result.text } };
  }

  async _eval(args) {
    if (!args[0]) {
      return { success: false, error: '用法：eval <code>', displayType: 'error' };
    }
    const code = args.join(' ');
    const result = await this.actionExecutor.evaluate(code);
    return {
      success: true,
      displayType: 'text',
      data: { text: `执行结果: ${JSON.stringify(result.result, null, 2)}`, result: result.result },
    };
  }

  async _console() {
    const messages = await this.actionExecutor.getConsoleMessages();
    return { success: true, displayType: 'text', data: { messages } };
  }

  async _network() {
    const requests = await this.actionExecutor.getNetworkRequests();
    return { success: true, displayType: 'text', data: { requests: requests.slice(0, 20), total: requests.length } };
  }

  async _ui(args) {
    if (!args[0]) {
      const config = this.browserManager.loadConfig();
      const currentMode = config.headless ? '无头模式（后台运行）' : 'UI 模式（显示窗口）';
      return {
        success: true,
        displayType: 'text',
        data: { text: `当前配置：${currentMode}\n用法：ui on / ui off`, headless: config.headless ?? true },
      };
    }

    const mode = args[0].toLowerCase();
    if (mode === 'on' || mode === 'true' || mode === '1') {
      this.browserManager.saveConfig({ headless: false });
      return { success: true, displayType: 'text', data: { text: '配置已保存：下次启动时开启 UI 模式', headless: false } };
    } else if (mode === 'off' || mode === 'false' || mode === '0') {
      this.browserManager.saveConfig({ headless: true });
      return { success: true, displayType: 'text', data: { text: '配置已保存：下次启动时无头模式', headless: true } };
    }

    return { success: false, error: '未知模式，请使用：ui on 或 ui off', displayType: 'error' };
  }

  async _auto(args) {
    if (args.length === 0) {
      return {
        success: true,
        displayType: 'text',
        data: { text: '自动化子命令：a l (列表) | a a <编号> (执行) | a h (帮助)' },
      };
    }

    const subCommand = args[0].toLowerCase();

    switch (subCommand) {
      case 'h':
      case 'help':
        return {
          success: true,
          displayType: 'help',
          data: { text: 'a l - 列出脚本\na a <编号> - 执行脚本\n(录制功能仅在交互模式可用)' },
        };

      case 'l': {
        const scripts = this.automationManager.listScripts();
        return { success: true, displayType: 'text', data: { scripts } };
      }

      case 'a': {
        if (!args[1]) {
          return { success: false, error: '用法：a a <编号>', displayType: 'error' };
        }
        const scriptId = parseInt(args[1]);
        const commandRunner = async (raw) => {
          return await this.dispatch(raw);
        };
        const result = await this.automationManager.executeScript(scriptId, commandRunner);
        return { success: true, displayType: 'text', data: result };
      }

      case 's':
      case 'e':
        return {
          success: false,
          error: '自动化录制仅在交互模式（REPL）中可用',
          displayType: 'error',
        };

      default:
        return { success: false, error: `未知自动化子命令：${subCommand}`, displayType: 'error' };
    }
  }

  _getTerminalSize() {
    const cols = process.stdout.columns || 100;
    const rows = process.stdout.rows || 50;
    return {
      width: Math.max(20, cols - 2),
      height: Math.max(10, rows - 3),
    };
  }
}

module.exports = { CommandDispatcher };
