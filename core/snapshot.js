class SnapshotManager {
  constructor(browserManager) {
    this.browserManager = browserManager;
    this.lastSnapshot = null;
    this.snapshotIdToNode = new Map();
    this.nextUid = 1;
  }

  reset() {
    this.lastSnapshot = null;
    this.snapshotIdToNode.clear();
    this.nextUid = 1;
  }

  getLastSnapshot() {
    return this.lastSnapshot;
  }

  getNodeByUid(uid) {
    return this.snapshotIdToNode.get(uid);
  }

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

  async takeSnapshot() {
    const page = this.browserManager.getCurrentPage();
    if (!page) {
      throw new Error('没有选中的页面');
    }

    this.nextUid = 1;
    this.snapshotIdToNode.clear();

    try {
      const snapshot = await page.accessibility.snapshot({ interestingOnly: true });

      if (!snapshot) {
        this.lastSnapshot = '未找到可访问的元素';
        return this.lastSnapshot;
      }

      this.lastSnapshot = this.formatAccessibilityTree(snapshot, 0);
      return this.lastSnapshot;
    } catch (error) {
      return await this.takeSnapshotCDP();
    }
  }

  formatAccessibilityTree(node, depth) {
    if (!node) return '';

    const indent = '  '.repeat(depth);
    const uid = `uid_${this.nextUid++}`;

    this.snapshotIdToNode.set(uid, {
      uid,
      role: node.role || 'unknown',
      name: node.name || '',
      bounds: node.bounds,
      backendNodeId: node.backendDOMNodeId,
      _axNode: node,
    });

    const parts = [];
    if (node.name) parts.push(node.name);
    if (node.value && node.value !== node.name) parts.push(`value: ${node.value}`);
    if (node.description) parts.push(node.description);

    const desc = parts.join(' ') || node.role || 'unknown';
    const bounds = node.bounds ? ` [${node.bounds.x},${node.bounds.y} ${node.bounds.width}x${node.bounds.height}]` : '';

    let text = `${indent}[${uid}] ${node.role || 'unknown'}: ${desc}${bounds}\n`;

    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        text += this.formatAccessibilityTree(child, depth + 1);
      }
    }

    return text;
  }

  async takeSnapshotCDP() {
    const page = this.browserManager.getCurrentPage();
    const client = await page.target().createCDPSession();

    try {
      await client.send('Accessibility.enable');
      const result = await client.send('Accessibility.getFullAXTree');

      this.nextUid = 1;
      this.snapshotIdToNode.clear();

      if (!result.nodes || result.nodes.length === 0) {
        return '未找到可访问的元素';
      }

      const nodeMap = new Map();
      const childrenMap = new Map();

      for (const node of result.nodes) {
        const id = node.nodeId || node.backendDOMNodeId;
        if (id) {
          nodeMap.set(id, node);
        }
        const childRefs = node.childIds || node.childIdRefs || [];
        if (childRefs.length > 0) {
          childrenMap.set(id, childRefs);
        }
      }

      let rootNode = result.nodes.find(n => n.role?.value === 'RootWebArea');
      if (!rootNode) {
        rootNode = result.nodes[0];
      }

      this.lastSnapshot = this.formatAXNode(rootNode, nodeMap, childrenMap, 0);
      return this.lastSnapshot;
    } catch (error) {
      return `获取快照失败：${error.message}`;
    } finally {
      await client.detach();
    }
  }

  formatAXNode(node, nodeMap, childrenMap, depth) {
    if (!node) return '';

    const indent = '  '.repeat(depth);
    const uid = `uid_${this.nextUid++}`;

    this.snapshotIdToNode.set(uid, {
      uid,
      role: node.role?.value || 'unknown',
      name: node.name?.value || '',
      backendNodeId: node.backendDOMNodeId,
      bounds: node.bounds,
    });

    const parts = [];
    if (node.name?.value) parts.push(node.name.value);
    if (node.value?.value && node.value.value !== node.name?.value) parts.push(`value: ${node.value.value}`);
    if (node.description?.value) parts.push(node.description.value);

    const desc = parts.join(' ') || node.role?.value || 'unknown';
    const bounds = node.bounds ? ` [${node.bounds.x},${node.bounds.y} ${node.bounds.width}x${node.bounds.height}]` : '';

    let text = `${indent}[${uid}] ${node.role?.value || 'unknown'}: ${desc}${bounds}\n`;

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

  formatSnapshotText(node, depth) {
    if (!node) return '';

    const indent = '  '.repeat(depth);
    let text = '';

    const skipRoles = ['generic', 'none', 'InlineTextBox'];
    if (skipRoles.includes(node.role)) {
      for (const child of node.children) {
        text += this.formatSnapshotText(child, depth);
      }
      return text;
    }

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

  async getSnapshotLines() {
    if (!this.lastSnapshot) return [];

    const page = this.browserManager.getCurrentPage();
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

    const lines = this.lastSnapshot.split('\n').filter(line => line.trim());
    return lines.map(line => {
      let output = line;
      const linkMatch = line.match(/link:\s*([^\[\n]+)/);
      if (linkMatch) {
        const linkText = linkMatch[1].trim();
        const href = linkHrefs[linkText];
        if (href) output += ` → ${href}`;
      }
      return output;
    });
  }

  getInteractiveElements() {
    if (!this.lastSnapshot) return [];

    const interactiveTypes = [
      'button:', 'textbox:', 'link:', 'checkbox:', 'radio:',
      'combobox:', 'listbox:', 'menuitem:', 'option:', 'tab:',
      'treeitem:', 'menu:', 'menubar:', 'toolbar:', 'searchbox:',
      'spinbutton:', 'slider:', 'switch:'
    ];

    const lines = this.lastSnapshot.split('\n');
    const results = [];

    for (const line of lines) {
      if (line.trim()) {
        const match = line.match(/\[uid_(\d+)\]/i);
        if (match) {
          const uid = `uid_${match[1]}`;
          for (const type of interactiveTypes) {
            if (line.includes(type)) {
              let desc = line.replace(/\[uid_\d+\]\s*/i, '').trim();
              results.push({ uid, type: type.replace(':', ''), desc, raw: line });
              break;
            }
          }
        }
      }
    }

    return results;
  }

  async getElementsForOCR() {
    const page = this.browserManager.getCurrentPage();
    if (!page) return [];

    this.nextUid = 1;
    this.snapshotIdToNode.clear();

    return await page.evaluate(() => {
      function getXPath(element) {
        if (element.id) return `//*[@id="${element.id}"]`;

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

  async getElementByUid(uid) {
    const page = this.browserManager.getCurrentPage();

    if (uid.startsWith('ocr_')) {
      const index = parseInt(uid.substring(4)) - 1;
      const elements = await this.getElementsForOCR();
      if (index < 0 || index >= elements.length) {
        throw new Error(`元素 ${uid} 不存在`);
      }
      const elementInfo = elements[index];

      const handle = await page.evaluateHandle((xpath) => {
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return result.singleNodeValue;
      }, elementInfo.xpath);

      return handle.asElement();
    }

    const nodeInfo = this.snapshotIdToNode.get(uid);
    if (!nodeInfo) {
      throw new Error(`元素 ${uid} 不存在，请先获取快照`);
    }

    if (nodeInfo._axNode && typeof nodeInfo._axNode.elementHandle === 'function') {
      try {
        const handle = await nodeInfo._axNode.elementHandle();
        if (handle) return handle;
      } catch (error) {}
    }

    const handle = await page.evaluateHandle(
      ({ role, name, bounds }) => {
        const allElements = document.querySelectorAll('*');
        let bestMatch = null;
        let bestScore = 0;

        for (const el of allElements) {
          let score = 0;

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

          if (bounds) {
            const rect = el.getBoundingClientRect();
            const xMatch = Math.abs(rect.left - bounds.x) < 10;
            const yMatch = Math.abs(rect.top - bounds.y) < 10;
            if (xMatch && yMatch) score += 30;
          }

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

  async findElementByText(text, index = 1, type = 'click') {
    if (!this.lastSnapshot || this.snapshotIdToNode.size === 0) {
      await this.takeSnapshot();
    }

    const targetRoles = type === 'fill'
      ? ['textbox', 'searchbox', 'combobox', 'listbox']
      : ['button', 'link', 'menuitem', 'tab', 'treeitem', 'checkbox', 'radio', 'switch'];

    const matches = [];

    for (const [uid, info] of this.snapshotIdToNode) {
      const name = info.name || '';
      if (name && name.includes(text)) {
        const role = info.role || '';
        if (type === 'fill') {
          if (targetRoles.includes(role) || role === 'textbox' || role === 'searchbox') {
            matches.push({ uid, name, role, length: name.length });
          }
        } else {
          if (targetRoles.includes(role)) {
            matches.push({ uid, name, role, length: name.length, priority: 1 });
          } else if (name === text) {
            matches.push({ uid, name, role, length: name.length, priority: 2 });
          } else {
            matches.push({ uid, name, role, length: name.length, priority: 0 });
          }
        }
      }
    }

    if (matches.length === 0) {
      const lowerText = text.toLowerCase();
      for (const [uid, info] of this.snapshotIdToNode) {
        const name = (info.name || '').toLowerCase();
        if (name && name.includes(lowerText)) {
          const role = info.role || '';
          if (type === 'fill') {
            if (targetRoles.includes(role) || role === 'textbox' || role === 'searchbox') {
              matches.push({ uid, name: info.name || '', role, length: (info.name || '').length });
            }
          } else {
            if (targetRoles.includes(role)) {
              matches.push({ uid, name: info.name || '', role, length: (info.name || '').length, priority: 1 });
            } else if (name === lowerText) {
              matches.push({ uid, name: info.name || '', role, length: (info.name || '').length, priority: 2 });
            } else {
              matches.push({ uid, name: info.name || '', role, length: (info.name || '').length, priority: 0 });
            }
          }
        }
      }
    }

    if (matches.length === 0) {
      throw new Error(`未找到包含 "${text}" 的元素`);
    }

    if (type === 'click') {
      matches.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.length - b.length;
      });
    } else {
      matches.sort((a, b) => a.length - b.length);
    }

    const idx = Math.min(Math.max(1, index), matches.length);
    const selected = matches[idx - 1];

    return {
      uid: selected.uid,
      matchCount: matches.length,
      selectedIndex: idx,
      matchName: selected.name,
    };
  }
}

module.exports = { SnapshotManager };
