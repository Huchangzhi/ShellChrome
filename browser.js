/**
 * 基于 Puppeteer 的控制台浏览器类
 * 支持打开/关闭/切换标签页、查看元素、点击按钮、输入文本等功能
 */

const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');

class ConsoleBrowser {
  constructor(options = {}) {
    this.browser = null;
    this.currentPage = null;
    this.pages = [];
    this.lastSnapshot = null;
    this.snapshotIdToNode = new Map();
    this.nextUid = 1;
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
   * 启动浏览器
   */
  async start() {
    const channel = 'chrome';
    
    // 查找 Chrome 路径
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
      args: [
        '--hide-crash-restore-bubble',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    // 监听页面关闭事件
    this.browser.on('targetdestroyed', async (target) => {
      await this.refreshPages();
    });

    await this.refreshPages();
    return this;
  }

  /**
   * 关闭浏览器
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.currentPage = null;
      this.pages = [];
    }
  }

  /**
   * 刷新页面列表
   */
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

  /**
   * 从文本中解析页面列表
   */
  parsePagesFromText(text) {
    const pages = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const match = line.match(/^(\d+):\s*(\S+)(?:\s*\[selected\])?/i);
      if (match) {
        const id = parseInt(match[1]);
        const url = match[2];
        const selected = line.includes('[selected]');
        pages.push({ id, url, title: url, selected });
      }
    }

    return pages;
  }

  /**
   * 打开新标签页
   */
  async openPage(url) {
    const fullUrl = this.normalizeUrl(url);
    const page = await this.browser.newPage();
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.refreshPages();
    this.currentPage = page;
    return { text: `已打开 ${fullUrl}` };
  }

  /**
   * 自动补充协议
   */
  normalizeUrl(url) {
    if (!url) return 'about:blank';
    if (/^https?:\/\//i.test(url) || /^about:/i.test(url) || /^file:/i.test(url)) {
      return url;
    }
    return 'https://' + url;
  }

  /**
   * 导航到指定 URL
   */
  async navigate(url) {
    const fullUrl = this.normalizeUrl(url);
    if (!this.currentPage) {
      throw new Error('没有选中的页面');
    }
    await this.currentPage.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.refreshPages();
  }

  /**
   * 关闭标签页
   */
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
      // 最后一个页面不能关闭，打开 about:blank
      await targetPage.goto('about:blank');
      return { text: '已重置页面' };
    }

    await targetPage.close();
    await this.refreshPages();
    
    if (targetPage === this.currentPage && this.pages.length > 0) {
      this.currentPage = this.pages[0]._page;
    }
  }

  /**
   * 切换到指定标签页
   */
  async switchPage(pageId) {
    const page = this.pages.find(p => p.id === pageId);
    if (!page) {
      throw new Error(`标签页 ${pageId} 不存在`);
    }
    this.currentPage = page._page;
    await this.refreshPages();
  }

  /**
   * 构建 accessibility tree 并分配 UID
   */
  buildAXTree(node, parentUid = null) {
    if (!node) return null;

    const uid = `uid_${this.nextUid++}`;
    const tree = {
      uid,
      role: node.role?.value || 'unknown',
      name: node.name?.value || '',
      description: node.description?.value || '',
      value: node.value?.value || '',
      bounds: node.bounds || null,
      children: [],
      parentUid,
      backendNodeId: node.backendDOMNodeId,
    };

    this.snapshotIdToNode.set(uid, { ...tree, _node: node });

    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const childTree = this.buildAXTree(child, uid);
        if (childTree) {
          tree.children.push(childTree);
        }
      }
    }

    return tree;
  }

  /**
   * 获取页面快照（查看元素）
   */
  async takeSnapshot() {
    if (!this.currentPage) {
      throw new Error('没有选中的页面');
    }

    // 重置 UID 计数器
    this.nextUid = 1;
    this.snapshotIdToNode.clear();
    
    try {
      // 使用 Puppeteer 的 accessibility API
      const snapshot = await this.currentPage.accessibility.snapshot({ interestingOnly: true });
      
      if (!snapshot) {
        this.lastSnapshot = '未找到可访问的元素';
        return this.lastSnapshot;
      }
      
      // 递归格式化树
      this.lastSnapshot = this.formatAccessibilityTree(snapshot, 0);
      return this.lastSnapshot;
    } catch (error) {
      // 回退到 CDP 方式
      console.log('accessibility API 失败，使用 CDP:', error.message);
      return await this.takeSnapshotCDP();
    }
  }

  /**
   * 递归格式化 accessibility 树
   */
  formatAccessibilityTree(node, depth) {
    if (!node) return '';

    const indent = '  '.repeat(depth);
    const uid = `uid_${this.nextUid++}`;

    // 保存节点信息（包含原始的 SerializedAXNode 引用）
    this.snapshotIdToNode.set(uid, {
      uid,
      role: node.role || 'unknown',
      name: node.name || '',
      bounds: node.bounds,
      backendNodeId: node.backendDOMNodeId,
      _axNode: node,  // 保存原始节点引用，用于 elementHandle()
    });

    // 构建描述
    const parts = [];
    if (node.name) parts.push(node.name);
    if (node.value && node.value !== node.name) parts.push(`value: ${node.value}`);
    if (node.description) parts.push(node.description);

    const desc = parts.join(' ') || node.role || 'unknown';
    const bounds = node.bounds ? ` [${node.bounds.x},${node.bounds.y} ${node.bounds.width}x${node.bounds.height}]` : '';

    // 对于 link 元素，尝试获取 href
    let extraInfo = '';
    if (node.role === 'link' && node._axNode) {
      // 通过 CDP 获取 href 属性
      try {
        // 这里无法直接获取，在 showElements 中处理
      } catch (e) {}
    }

    let text = `${indent}[${uid}] ${node.role || 'unknown'}: ${desc}${bounds}${extraInfo}\n`;

    // 处理子节点
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        text += this.formatAccessibilityTree(child, depth + 1);
      }
    }

    return text;
  }

  /**
   * 使用 CDP 方式获取快照（回退方案）
   */
  async takeSnapshotCDP() {
    const client = await this.currentPage.target().createCDPSession();
    
    try {
      await client.send('Accessibility.enable');
      const result = await client.send('Accessibility.getFullAXTree');
      
      this.nextUid = 1;
      this.snapshotIdToNode.clear();
      
      if (!result.nodes || result.nodes.length === 0) {
        return '未找到可访问的元素';
      }
      
      // 尝试使用 childIdRefs 而不是 childIds
      const nodeMap = new Map();
      const childrenMap = new Map();
      
      for (const node of result.nodes) {
        const id = node.nodeId || node.backendDOMNodeId;
        if (id) {
          nodeMap.set(id, node);
        }
        // 尝试不同的子节点引用格式
        const childRefs = node.childIds || node.childIdRefs || [];
        if (childRefs.length > 0) {
          childrenMap.set(id, childRefs);
        }
      }
      
      let rootNode = result.nodes.find(n => n.role?.value === 'RootWebArea');
      if (!rootNode) {
        rootNode = result.nodes[0];
      }
      
      const rootId = rootNode.nodeId || rootNode.backendDOMNodeId;
      this.lastSnapshot = this.formatAXNode(rootNode, nodeMap, childrenMap, 0);
      return this.lastSnapshot;
    } catch (error) {
      return `获取快照失败：${error.message}`;
    } finally {
      await client.detach();
    }
  }

  /**
   * 格式化 AX 节点为文本
   */
  formatAXNode(node, nodeMap, childrenMap, depth) {
    if (!node) return '';
    
    const indent = '  '.repeat(depth);
    const uid = `uid_${this.nextUid++}`;
    
    // 保存节点信息
    this.snapshotIdToNode.set(uid, { 
      uid,
      role: node.role?.value || 'unknown',
      name: node.name?.value || '',
      backendNodeId: node.backendDOMNodeId,
      bounds: node.bounds,
    });
    
    // 构建描述
    const parts = [];
    if (node.name?.value) parts.push(node.name.value);
    if (node.value?.value && node.value.value !== node.name?.value) parts.push(`value: ${node.value.value}`);
    if (node.description?.value) parts.push(node.description.value);
    
    const desc = parts.join(' ') || node.role?.value || 'unknown';
    const bounds = node.bounds ? ` [${node.bounds.x},${node.bounds.y} ${node.bounds.width}x${node.bounds.height}]` : '';
    
    let text = `${indent}[${uid}] ${node.role?.value || 'unknown'}: ${desc}${bounds}\n`;
    
    // 处理子节点
    const childIds = childrenMap.get(node.backendDOMNodeId);
    if (childIds && childIds.length > 0) {
      for (const childId of childIds) {
        const childNode = nodeMap.get(childId);
        if (childNode) {
          text += this.formatAXNode(childNode, nodeMap, childrenMap, depth + 1);
        }
      }
    }
    
    return text;
  }

  /**
   * 格式化快照为文本
   */
  formatSnapshotText(node, depth) {
    if (!node) return '';
    
    const indent = '  '.repeat(depth);
    let text = '';
    
    // 跳过无意义的节点
    const skipRoles = ['generic', 'none', 'InlineTextBox'];
    if (skipRoles.includes(node.role)) {
      // 继续处理子节点
      for (const child of node.children) {
        text += this.formatSnapshotText(child, depth);
      }
      return text;
    }
    
    // 构建描述
    const parts = [];
    if (node.name) parts.push(node.name);
    if (node.value && node.value !== node.name) parts.push(`value: ${node.value}`);
    if (node.description) parts.push(node.description);
    
    const desc = parts.join(' ') || node.role;
    const bounds = node.bounds ? ` [${node.bounds.x},${node.bounds.y} ${node.bounds.width}x${node.bounds.height}]` : '';
    
    text += `${indent}[${node.uid}] ${node.role}: ${desc}${bounds}\n`;
    
    for (const child of node.children) {
      text += this.formatSnapshotText(child, depth + 1);
    }
    
    return text;
  }

  /**
   * 显示快照中的元素列表（带 link 的 href）
   */
  async showElements() {
    if (!this.lastSnapshot) {
      console.log('请先获取页面快照（使用 l 命令）');
      return;
    }

    // 获取所有 link 元素的 href
    const linkHrefs = await this.currentPage.evaluate(() => {
      const hrefs = {};
      document.querySelectorAll('a[href]').forEach((el) => {
        const text = el.textContent?.trim() || el.getAttribute('aria-label') || '';
        if (text) {
          hrefs[text] = el.href;
        }
      });
      return hrefs;
    });

    // 显示快照，为 link 添加 href
    const lines = this.lastSnapshot.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        let output = line;
        // 如果是 link 行，尝试添加 href
        const linkMatch = line.match(/link:\s*([^\[\n]+)/);
        if (linkMatch) {
          const linkText = linkMatch[1].trim();
          const href = linkHrefs[linkText];
          if (href) {
            // 缩短过长的 URL
            const shortHref = href.length > 50 ? href.substring(0, 47) + '...' : href;
            output = line + ` → ${shortHref}`;
          }
        }
        console.log(output);
      }
    }
  }

  /**
   * 获取用于 OCR 匹配的元素列表
   */
  async getElementsForOCR() {
    if (!this.currentPage) return [];

    // 重置 UID 计数器
    this.nextUid = 1;
    this.snapshotIdToNode.clear();

    return await this.currentPage.evaluate(() => {
      // 生成 XPath 的辅助函数
      function getXPath(element) {
        if (element.id) {
          return `//*[@id="${element.id}"]`;
        }
        
        const paths = [];
        let current = element;
        
        while (current && current.nodeType === Node.ELEMENT_NODE) {
          let index = 1;
          let sibling = current.previousSibling;
          
          while (sibling) {
            if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === current.nodeName) {
              index++;
            }
            sibling = sibling.previousSibling;
          }
          
          const tagName = current.nodeName.toLowerCase();
          const pathIndex = index > 1 ? `[${index}]` : '';
          paths.unshift(`${tagName}${pathIndex}`);
          
          current = current.parentNode;
        }
        
        return paths.length ? '/' + paths.join('/') : null;
      }

      // 获取控件类型的辅助函数
      function getControlType(el) {
        const tagName = el.tagName.toLowerCase();
        const type = el.type || '';
        const role = el.getAttribute('role') || '';
        
        if (tagName === 'button') return 'button';
        if (tagName === 'a') return 'link';
        if (tagName === 'input') {
          if (type === 'text' || type === 'search' || type === 'password' || type === 'email' || type === 'number') return 'textbox';
          if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
          if (type === 'checkbox') return 'checkbox';
          if (type === 'radio') return 'radio';
          return `input[${type}]`;
        }
        if (tagName === 'select') return 'combobox';
        if (tagName === 'textarea') return 'textbox';
        if (tagName === 'label') return 'label';
        if (role) return role;
        return tagName;
      }

      const results = [];
      const selectors = [
        'button', 'input[type="text"]', 'input[type="search"]',
        'input[type="submit"]', 'input[type="button"]', 'a', 'label',
        'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div',
        '[role="button"]', '[role="link"]', '[role="heading"]', '[role="text"]',
      ];

      const elements = document.querySelectorAll(selectors.join(', '));

      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        let text = '';
        const tagName = el.tagName.toLowerCase();

        if (tagName === 'input') {
          text = el.placeholder || el.value || '';
        } else if (tagName === 'button' || tagName === 'a') {
          text = el.textContent.trim();
        } else {
          text = Array.from(el.childNodes)
            .filter(n => n.nodeType === 3)
            .map(n => n.textContent.trim())
            .join(' ');
        }

        if (!text || text.length < 1 || text.length > 50) continue;
        if (/^\d+$/.test(text)) continue;

        results.push({
          uid: `ocr_${results.length + 1}`,
          type: getControlType(el),
          text,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          // 保存 XPath 以便后续查找
          xpath: getXPath(el),
        });
      }

      results.sort((a, b) => {
        const yDiff = Math.round(a.y / 10) - Math.round(b.y / 10);
        if (yDiff !== 0) return yDiff;
        return a.x - b.x;
      });

      return results;
    });
  }

  /**
   * 通过 UID 获取元素句柄
   */
  async getElementByUid(uid) {
    // 如果是 OCR UID，通过 XPath 查找
    if (uid.startsWith('ocr_')) {
      const index = parseInt(uid.substring(4)) - 1;
      const elements = await this.getElementsForOCR();
      if (index < 0 || index >= elements.length) {
        throw new Error(`元素 ${uid} 不存在`);
      }
      const elementInfo = elements[index];

      // 通过 XPath 获取元素
      const handle = await this.currentPage.evaluateHandle((xpath) => {
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return result.singleNodeValue;
      }, elementInfo.xpath);

      return handle.asElement();
    }

    // 如果是 snapshot UID，从快照中查找
    const nodeInfo = this.snapshotIdToNode.get(uid);
    if (!nodeInfo) {
      throw new Error(`元素 ${uid} 不存在，请先获取快照`);
    }

    // 优先使用 SerializedAXNode.elementHandle() 方法
    if (nodeInfo._axNode && typeof nodeInfo._axNode.elementHandle === 'function') {
      try {
        const handle = await nodeInfo._axNode.elementHandle();
        if (handle) {
          return handle;
        }
      } catch (error) {
        // 回退到其他方法
      }
    }

    // 使用 JavaScript 在页面中查找元素
    // 通过角色、名称和边界框综合匹配
    const handle = await this.currentPage.evaluateHandle(
      ({ role, name, bounds }) => {
        const allElements = document.querySelectorAll('*');
        let bestMatch = null;
        let bestScore = 0;

        for (const el of allElements) {
          let score = 0;

          // 检查角色匹配
          const elRole = el.getAttribute('role') || el.tagName.toLowerCase();
          if (elRole === role) {
            score += 10;
          } else if (role === 'link' && el.tagName === 'A') {
            score += 10;
          } else if (role === 'button' && (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button')) {
            score += 10;
          } else if (role === 'textbox' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
            score += 10;
          }

          // 检查文本内容匹配
          const elText = el.textContent?.trim() || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
          if (name && elText) {
            if (elText === name) {
              score += 20;
            } else if (elText.includes(name)) {
              score += 15;
            } else if (name.includes(elText)) {
              score += 10;
            }
          }

          // 检查边界框匹配（如果有）
          if (bounds) {
            const rect = el.getBoundingClientRect();
            const xMatch = Math.abs(rect.left - bounds.x) < 10;
            const yMatch = Math.abs(rect.top - bounds.y) < 10;
            if (xMatch && yMatch) {
              score += 30;
            }
          }

          // 更新最佳匹配
          if (score > bestScore) {
            bestScore = score;
            bestMatch = el;
          }
        }

        return bestMatch;
      },
      { role: nodeInfo.role, name: nodeInfo.name, bounds: nodeInfo.bounds }
    );

    const element = handle.asElement();
    if (!element) {
      throw new Error(`找不到元素 ${uid} 对应的 DOM 节点`);
    }

    return element;
  }

  /**
   * 点击元素
   */
  async click(uid) {
    const handle = await this.getElementByUid(uid);
    try {
      // 先滚动到元素位置
      await handle.evaluate(el => el.scrollIntoView({ behavior: 'auto', block: 'center' }));
      // 等待一小段时间让滚动完成
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 检查是否是链接（可能在新标签页打开）
      const isLink = await handle.evaluate(el => el.tagName === 'A');
      const target = await handle.evaluate(el => el.target);
      const isOpenInNewTab = target === '_blank';
      
      // 尝试多种点击方式（按优先级）
      try {
        // 方式 1：使用 evaluate 触发点击事件（最直接）
        await handle.evaluate(el => el.click());
      } catch (e1) {
        try {
          // 方式 2：使用 Puppeteer 原生 click()
          await handle.click();
        } catch (e2) {
          // 方式 3：使用鼠标点击（模拟真实用户）
          const box = await handle.boundingBox();
          if (box) {
            await this.currentPage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          } else {
            throw e2;
          }
        }
      }
      
      // 如果是新标签页打开的链接，等待并切换到新标签页
      if (isLink && isOpenInNewTab) {
        await new Promise(resolve => setTimeout(resolve, 500));
        await this.refreshPages();
        if (this.pages.length > 1) {
          // 切换到最新的标签页
          const newPage = this.pages[this.pages.length - 1]._page;
          this.currentPage = newPage;
        }
      }
      
      return { text: `已点击元素 ${uid}` };
    } finally {
      await handle.dispose();
    }
  }

  /**
   * 输入文本（先清空再输入）
   */
  async fill(uid, text) {
    const handle = await this.getElementByUid(uid);
    try {
      // 先清空输入框
      await handle.evaluate(el => {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          el.value = '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      // 等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 50));
      // 输入新文本
      await handle.type(text, { delay: 10 });
      return { text: `已输入文本到元素 ${uid}` };
    } finally {
      await handle.dispose();
    }
  }

  /**
   * 按下键盘按键
   */
  async pressKey(key) {
    await this.currentPage.keyboard.press(key);
    return { text: `已按下按键 ${key}` };
  }

  /**
   * 悬停在元素上
   */
  async hover(uid) {
    const handle = await this.getElementByUid(uid);
    try {
      await handle.hover();
      return { text: `已悬停在元素 ${uid} 上` };
    } finally {
      await handle.dispose();
    }
  }

  /**
   * 等待文本出现
   */
  async waitFor(text, timeout = 10000) {
    await this.currentPage.waitForFunction(
      (txt) => document.body.innerText.includes(txt),
      { timeout },
      text
    );
    return { text: `已找到文本 "${text}"` };
  }

  /**
   * 执行 JavaScript 代码
   */
  async evaluate(code) {
    const result = await this.currentPage.evaluate(code);
    return { result };
  }

  /**
   * 截图
   */
  async screenshot(filePath) {
    const params = filePath ? { path: filePath, type: 'png' } : { type: 'png' };
    const buffer = await this.currentPage.screenshot(params);
    return { buffer };
  }

  /**
   * 截图并返回 Buffer
   */
  async screenshotBuffer() {
    const buffer = await this.currentPage.screenshot({ type: 'png' });
    return buffer;
  }

  /**
   * 获取控制台消息
   */
  async getConsoleMessages() {
    // Puppeteer 需要预先监听，这里返回空数组
    return [];
  }

  /**
   * 获取网络请求列表
   */
  async getNetworkRequests() {
    // 需要预先监听，返回空数组
    return [];
  }

  /**
   * 调用 MCP 工具（兼容接口）
   */
  async callTool(name, params) {
    switch (name) {
      case 'list_pages':
        return { pages: this.pages.filter(p => !p._page).map(p => ({ id: p.id, url: p.url, selected: p.selected })) };
      case 'new_page':
        return await this.openPage(params.url);
      case 'navigate_page':
        return await this.navigate(params.url);
      case 'close_page':
        return await this.closePage(params.pageId);
      case 'select_page':
        return await this.switchPage(params.pageId);
      case 'take_snapshot':
        return { text: await this.takeSnapshot() };
      case 'click':
        return await this.click(params.uid);
      case 'fill':
        return await this.fill(params.uid, params.value);
      case 'press_key':
        return await this.pressKey(params.key);
      case 'hover':
        return await this.hover(params.uid);
      case 'wait_for':
        return await this.waitFor(params.text, params.timeout);
      case 'evaluate_script':
        return await this.evaluate(params.function);
      case 'take_screenshot':
        return await this.screenshot(params.filePath);
      case 'list_console_messages':
        return { messages: await this.getConsoleMessages() };
      case 'list_network_requests':
        return { requests: await this.getNetworkRequests() };
      default:
        throw new Error(`未知工具：${name}`);
    }
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
        // 直接使用 currentPage 判断，而不是 selected 属性
        const current = (page._page === this.currentPage) ? ' [当前]' : '';
        console.log(`[${page.id}] ${page.url}${current}`);
      }
    }
    console.log('===============================\n');
  }
}

module.exports = { ConsoleBrowser };
