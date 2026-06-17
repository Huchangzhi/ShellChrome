const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

require('puppeteer-extra-plugin-stealth/evasions/chrome.app');
require('puppeteer-extra-plugin-stealth/evasions/chrome.csi');
require('puppeteer-extra-plugin-stealth/evasions/chrome.loadTimes');
require('puppeteer-extra-plugin-stealth/evasions/chrome.runtime');
require('puppeteer-extra-plugin-stealth/evasions/defaultArgs');
require('puppeteer-extra-plugin-stealth/evasions/iframe.contentWindow');
require('puppeteer-extra-plugin-stealth/evasions/media.codecs');
require('puppeteer-extra-plugin-stealth/evasions/navigator.hardwareConcurrency');
require('puppeteer-extra-plugin-stealth/evasions/navigator.languages');
require('puppeteer-extra-plugin-stealth/evasions/navigator.permissions');
require('puppeteer-extra-plugin-stealth/evasions/navigator.plugins');
require('puppeteer-extra-plugin-stealth/evasions/navigator.vendor');
require('puppeteer-extra-plugin-stealth/evasions/navigator.webdriver');
require('puppeteer-extra-plugin-stealth/evasions/sourceurl');
require('puppeteer-extra-plugin-stealth/evasions/user-agent-override');
require('puppeteer-extra-plugin-stealth/evasions/webgl.vendor');
require('puppeteer-extra-plugin-stealth/evasions/window.outerdimensions');
puppeteer.use(StealthPlugin());

const { EventEmitter } = require('events');
const fs = require('node:fs');
const path = require('node:path');

class BrowserManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.browser = null;
    this.currentPage = null;
    this.pages = [];
    this.configDir = options.configDir || process.cwd();

    const config = this.loadConfig();
    this.headless = options.headless ?? config.headless ?? true;
  }

  loadConfig() {
    try {
      const configPath = path.join(this.configDir, 'config.json');
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch (error) {
      console.error('加载配置文件失败:', error.message);
    }
    return {};
  }

  saveConfig(config) {
    try {
      const configPath = path.join(this.configDir, 'config.json');
      const currentConfig = this.loadConfig();
      const newConfig = { ...currentConfig, ...config };
      fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('保存配置文件失败:', error.message);
      return false;
    }
  }

  async start() {
    const channel = 'chrome';

    let executablePath = null;
    if (process.platform === 'win32') {
      const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      ];
      for (const p of chromePaths) {
        if (fs.existsSync(p)) {
          executablePath = p;
          break;
        }
      }
    }

    this.browser = await puppeteer.launch({
      channel: executablePath ? undefined : channel,
      executablePath,
      headless: this.headless,
      defaultViewport: null,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--hide-crash-restore-bubble',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--lang=zh-CN',
      ],
    });

    this.browser.on('targetdestroyed', async () => {
      await this.refreshPages();
    });

    this.browser.on('disconnected', () => {
      this.emit('disconnected');
    });

    await this.refreshPages();
    return this;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.currentPage = null;
      this.pages = [];
    }
  }

  async refreshPages() {
    try {
      const allPages = await this.browser.pages();
      this.pages = allPages.map((page, index) => ({
        id: index + 1,
        url: page.url(),
        title: page.url(),
        selected: page === this.currentPage,
        _page: page,
      }));

      if (this.pages.length > 0 && !this.currentPage) {
        this.currentPage = this.pages[0]._page;
        this.pages[0].selected = true;
      }

      return this.pages;
    } catch (error) {
      this.pages = [];
      return [];
    }
  }

  normalizeUrl(url) {
    if (!url) return 'about:blank';
    if (/^https?:\/\//i.test(url) || /^about:/i.test(url) || /^file:/i.test(url)) {
      return url;
    }
    return 'https://' + url;
  }

  async openPage(url) {
    const fullUrl = this.normalizeUrl(url);
    const page = await this.browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9' });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'language', { get: () => 'zh-CN' });
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] });
    });
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.refreshPages();
    this.currentPage = page;
    return { text: `已打开 ${fullUrl}`, url: fullUrl };
  }

  async navigate(url) {
    const fullUrl = this.normalizeUrl(url);
    if (!this.currentPage) {
      throw new Error('没有选中的页面');
    }
    await this.currentPage.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.refreshPages();
  }

  async goBack() {
    if (!this.currentPage) {
      throw new Error('没有选中的页面');
    }
    await this.currentPage.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.refreshPages();
  }

  async openHistory() {
    if (!this.currentPage) {
      throw new Error('没有选中的页面');
    }
    await this.currentPage.goto('chrome://history', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.refreshPages();
  }

  async closePage(pageId) {
    await this.refreshPages();

    if (this.pages.length === 0) {
      return { text: '没有可关闭的标签页，请先使用 o 命令打开网页' };
    }

    const targetPage = pageId
      ? this.pages.find(p => p.id === pageId)?._page
      : this.currentPage;

    if (!targetPage) {
      throw new Error('找不到指定的页面');
    }

    if (this.pages.length === 1) {
      await targetPage.goto('about:blank');
      return { text: '已重置页面' };
    }

    await targetPage.close();
    await this.refreshPages();

    if (targetPage === this.currentPage && this.pages.length > 0) {
      this.currentPage = this.pages[0]._page;
    }
  }

  async switchPage(pageId) {
    const page = this.pages.find(p => p.id === pageId);
    if (!page) {
      throw new Error(`标签页 ${pageId} 不存在`);
    }
    this.currentPage = page._page;
    await this.refreshPages();
  }

  getCurrentPage() {
    return this.currentPage;
  }

  getPages() {
    return this.pages.map(p => ({
      id: p.id,
      url: p.url,
      title: p.title,
      selected: p.selected,
    }));
  }

  isRunning() {
    return this.browser !== null && this.browser.connected;
  }
}

module.exports = { BrowserManager };
