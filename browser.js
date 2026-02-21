/**
 * 基于 chrome-devtools-mcp 的控制台浏览器类
 * 支持打开/关闭/切换标签页、查看元素、点击按钮、输入文本等功能
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const fs = require('node:fs');
const path = require('node:path');

class ConsoleBrowser {
  constructor(options = {}) {
    this.client = null;
    this.transport = null;
    this.currentPageId = null;
    this.pages = [];
    this.lastSnapshot = null;
    // 从配置文件读取 headless 设置，默认无头模式
    const config = this.loadConfig();
    this.headless = options.headless ?? config.headless ?? true;
  }

  /**
   * 加载配置文件
   */
  loadConfig() {
    try {
      const configPath = path.join(__dirname, 'config.json');
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch (error) {
      console.error('加载配置文件失败:', error.message);
    }
    return {};
  }

  /**
   * 保存配置文件
   */
  saveConfig(config) {
    try {
      const configPath = path.join(__dirname, 'config.json');
      const currentConfig = this.loadConfig();
      const newConfig = { ...currentConfig, ...config };
      fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('保存配置文件失败:', error.message);
      return false;
    }
  }

  /**
   * 启动浏览器并连接到 MCP 服务器
   */
  async start() {
    const args = [
      'chrome-devtools-mcp@latest',
      // 不使用 isolated，使用固定的用户数据目录以保留浏览数据
      '--channel=stable'
    ];
    
    // 只在无头模式下传递 --headless 参数
    if (this.headless) {
      args.push('--headless');
    }

    this.transport = new StdioClientTransport({
      command: 'npx',
      args: args,
    });

    this.client = new Client({
      name: 'console-browser',
      version: '1.0.0',
    }, {
      capabilities: {},
    });

    await this.client.connect(this.transport);
    await this.refreshPages();
    return this;
  }

  /**
   * 关闭浏览器
   */
  async close() {
    if (this.client) {
      await this.client.close();
    }
    if (this.transport) {
      await this.transport.close();
    }
  }

  /**
   * 刷新页面列表
   */
  async refreshPages() {
    try {
      const result = await this.callTool('list_pages', {});
      
      // 处理不同格式的响应
      if (result.pages && Array.isArray(result.pages)) {
        this.pages = result.pages;
      } else if (result.text) {
        // 解析文本格式的页面列表
        this.pages = this.parsePagesFromText(result.text);
      } else {
        this.pages = [];
      }
      
      // 设置当前页面 ID
      if (this.pages.length > 0) {
        // 查找被选中的页面（当前页）
        const selectedPage = this.pages.find(p => p.selected);
        this.currentPageId = selectedPage?.id ?? this.pages[0].id ?? null;
      }
      return this.pages;
    } catch (error) {
      this.pages = [];
      return [];
    }
  }

  /**
   * 从文本中解析页面列表
   * 格式：1: about:blank\n2: https://... [selected]
   */
  parsePagesFromText(text) {
    const pages = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
      // 匹配格式：数字：URL [selected]
      const match = line.match(/^(\d+):\s*(\S+)(?:\s*\[selected\])?/i);
      if (match) {
        const id = parseInt(match[1]);
        const url = match[2];
        const selected = line.includes('[selected]');
        pages.push({
          id: id,
          url: url,
          title: url,
          selected: selected
        });
      }
    }
    
    return pages;
  }

  /**
   * 打开新标签页
   * @param {string} url - 要打开的网址
   */
  async openPage(url) {
    // 自动补充协议
    const fullUrl = this.normalizeUrl(url);
    const result = await this.callTool('new_page', { url: fullUrl });
    await this.refreshPages();
    
    // 获取最新打开的页面 ID
    if (this.pages.length > 0) {
      // 使用最后一个页面作为当前页（最新打开的）
      const lastPage = this.pages[this.pages.length - 1];
      this.currentPageId = lastPage.id ?? lastPage.pageId ?? null;
    }
    
    return result;
  }

  /**
   * 自动补充协议
   * @param {string} url - 网址
   * @returns {string} 完整的 URL
   */
  normalizeUrl(url) {
    if (!url) return 'about:blank';
    // 如果已经有协议，直接返回
    if (/^https?:\/\//i.test(url) || /^about:/i.test(url) || /^file:/i.test(url)) {
      return url;
    }
    // 自动添加 https://
    return 'https://' + url;
  }

  /**
   * 导航到指定 URL
   * @param {string} url - 目标网址
   */
  async navigate(url) {
    const fullUrl = this.normalizeUrl(url);
    await this.callTool('navigate_page', { type: 'url', url: fullUrl });
  }

  /**
   * 关闭标签页
   * @param {number} pageId - 页面 ID，不传则关闭当前页
   */
  async closePage(pageId) {
    // 先刷新页面列表
    await this.refreshPages();
    
    const targetId = pageId ?? this.currentPageId;
    if (!targetId) {
      if (this.pages.length === 0) {
        return { text: '没有可关闭的标签页，请先使用 o 命令打开网页' };
      }
      throw new Error('没有可关闭的标签页');
    }
    await this.callTool('close_page', { pageId: targetId });
    await this.refreshPages();
    if (this.currentPageId === targetId) {
      this.currentPageId = this.pages[0]?.id ?? null;
    }
  }

  /**
   * 切换到指定标签页
   * @param {number} pageId - 页面 ID
   */
  async switchPage(pageId) {
    const page = this.pages.find(p => p.id === pageId);
    if (!page) {
      throw new Error(`标签页 ${pageId} 不存在`);
    }
    await this.callTool('select_page', { pageId, bringToFront: true });
    await this.refreshPages();
  }

  /**
   * 获取页面快照（查看元素）
   */
  async takeSnapshot() {
    const result = await this.callTool('take_snapshot', { verbose: false });
    // 处理响应：可能是 text 字段或 content 数组
    if (result.text) {
      this.lastSnapshot = result.text;
    } else if (result.content && Array.isArray(result.content)) {
      // 查找 text 类型的内容
      const textContent = result.content.find(item => item.type === 'text');
      this.lastSnapshot = textContent ? textContent.text : null;
    } else if (typeof result === 'string') {
      this.lastSnapshot = result;
    }
    return this.lastSnapshot;
  }

  /**
   * 显示快照中的元素列表
   */
  showElements() {
    if (!this.lastSnapshot) {
      console.log('请先获取页面快照（使用 l 命令）');
      return;
    }

    console.log('\n========== 页面元素列表 ==========');
    const lines = this.lastSnapshot.split('\n');
    
    for (const line of lines) {
      if (line.trim()) {
        // 跳过头部注释
        if (line.startsWith('#')) {
          continue;
        }
        
        // 提取 uid 和元素描述，支持多种格式
        const match = line.match(/uid[=:\s]+([^\s,]+)/i);
        if (match) {
          const uid = match[1];
          const desc = line.replace(/uid[=:\s]+[^\s,]+\s*/i, '').trim();
          if (desc) {
            console.log(`[${uid}] ${desc}`);
          }
        }
      }
    }
    console.log('=====================================\n');
  }

  /**
   * 点击元素
   * @param {string} uid - 元素 UID
   */
  async click(uid) {
    const result = await this.callTool('click', { uid, includeSnapshot: true });
    if (result.content) {
      this.lastSnapshot = result.content;
    }
    return result;
  }

  /**
   * 输入文本
   * @param {string} uid - 输入框元素 UID
   * @param {string} text - 要输入的文本
   */
  async fill(uid, text) {
    const result = await this.callTool('fill', { uid, value: text, includeSnapshot: true });
    if (result.content) {
      this.lastSnapshot = result.content;
    }
    return result;
  }

  /**
   * 按下键盘按键
   * @param {string} key - 按键名称，如 Enter, Control+A 等
   */
  async pressKey(key) {
    const result = await this.callTool('press_key', { key, includeSnapshot: true });
    if (result.content) {
      this.lastSnapshot = result.content;
    }
    return result;
  }

  /**
   * 悬停在元素上
   * @param {string} uid - 元素 UID
   */
  async hover(uid) {
    const result = await this.callTool('hover', { uid, includeSnapshot: true });
    if (result.content) {
      this.lastSnapshot = result.content;
    }
    return result;
  }

  /**
   * 等待文本出现
   * @param {string} text - 要等待的文本
   * @param {number} timeout - 超时时间（毫秒）
   */
  async waitFor(text, timeout = 10000) {
    await this.callTool('wait_for', { text, timeout });
  }

  /**
   * 执行 JavaScript 代码
   * @param {string} code - JS 代码
   */
  async evaluate(code) {
    return await this.callTool('evaluate_script', { function: code });
  }

  /**
   * 截图
   * @param {string} filePath - 保存路径（可选）
   */
  async screenshot(filePath) {
    const params = filePath ? { filePath, format: 'png' } : { format: 'png' };
    return await this.callTool('take_screenshot', params);
  }

  /**
   * 截图并返回 Buffer
   * @returns {Promise<Buffer>} PNG 图像数据
   */
  async screenshotBuffer() {
    // 先截图到临时文件
    const tempFile = 'temp_screenshot_' + Date.now() + '.png';
    await this.callTool('take_screenshot', { filePath: tempFile, format: 'png' });
    
    // 读取文件
    const fs = await import('node:fs');
    const buffer = fs.readFileSync(tempFile);
    
    // 删除临时文件
    fs.unlinkSync(tempFile);
    
    return buffer;
  }

  /**
   * 获取控制台消息
   */
  async getConsoleMessages() {
    const result = await this.callTool('list_console_messages', {});
    return result.messages || [];
  }

  /**
   * 获取网络请求列表
   */
  async getNetworkRequests() {
    const result = await this.callTool('list_network_requests', {});
    return result.requests || [];
  }

  /**
   * 调用 MCP 工具
   */
  async callTool(name, params) {
    if (!this.client) {
      throw new Error('浏览器未启动，请先调用 start()');
    }

    const response = await this.client.callTool({
      name: name,
      arguments: params,
    });

    if (response.isError) {
      throw new Error(response.content?.[0]?.text || `工具 ${name} 执行失败`);
    }

    // 解析响应
    const result = {};
    if (response.content) {
      for (const item of response.content) {
        if (item.type === 'text') {
          const text = item.text;
          // 尝试解析 JSON
          try {
            const parsed = JSON.parse(text);
            Object.assign(result, parsed);
          } catch {
            // 如果不是 JSON，保存为 text
            result.text = text;
          }
        }
      }
    }
    
    return result;
  }

  /**
   * 显示当前标签页列表
   */
  showPages() {
    console.log('\n========== 标签页列表 ==========');
    if (this.pages.length === 0) {
      console.log('（无标签页）');
      console.log('提示：使用 "o <url>" 命令打开网页，例如：o baidu.com');
    } else {
      for (const page of this.pages) {
        const current = page.selected || page.id === this.currentPageId ? ' [当前]' : '';
        console.log(`[${page.id}] ${page.url || page.title}${current}`);
      }
    }
    console.log('===============================\n');
  }
}

module.exports = { ConsoleBrowser };
