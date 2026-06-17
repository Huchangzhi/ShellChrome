class ActionExecutor {
  constructor(browserManager, snapshotManager) {
    this.browserManager = browserManager;
    this.snapshotManager = snapshotManager;
  }

  async click(uid) {
    if (!this.snapshotManager.getLastSnapshot() || !this.snapshotManager.getNodeByUid(uid)) {
      await this.snapshotManager.takeSnapshot();
    }

    const handle = await this.snapshotManager.getElementByUid(uid);
    const page = this.browserManager.getCurrentPage();

    try {
      await handle.evaluate(el => el.scrollIntoView({ behavior: 'auto', block: 'center' }));
      await new Promise(resolve => setTimeout(resolve, 100));

      const isLink = await handle.evaluate(el => el.tagName === 'A');
      const target = await handle.evaluate(el => el.target);
      const isOpenInNewTab = target === '_blank';

      try {
        await handle.evaluate(el => el.click());
      } catch (e1) {
        try {
          await handle.click();
        } catch (e2) {
          const box = await handle.boundingBox();
          if (box) {
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          } else {
            throw e2;
          }
        }
      }

      if (isLink && isOpenInNewTab) {
        await new Promise(resolve => setTimeout(resolve, 500));
        await this.browserManager.refreshPages();
        const pages = this.browserManager.pages;
        if (pages.length > 1) {
          this.browserManager.currentPage = pages[pages.length - 1]._page;
        }
      }

      return { text: `已点击元素 ${uid}`, uid };
    } finally {
      await handle.dispose();
    }
  }

  async fill(uid, text) {
    if (!this.snapshotManager.getLastSnapshot() || !this.snapshotManager.getNodeByUid(uid)) {
      await this.snapshotManager.takeSnapshot();
    }

    const handle = await this.snapshotManager.getElementByUid(uid);
    try {
      await handle.evaluate(el => {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          el.value = '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await new Promise(resolve => setTimeout(resolve, 50));
      await handle.type(text, { delay: 10 });
      return { text: `已输入文本到元素 ${uid}`, uid };
    } finally {
      await handle.dispose();
    }
  }

  async pressKey(key) {
    const page = this.browserManager.getCurrentPage();
    await page.keyboard.press(key);
    return { text: `已按下按键 ${key}`, key };
  }

  async hover(uid) {
    if (!this.snapshotManager.getLastSnapshot() || !this.snapshotManager.getNodeByUid(uid)) {
      await this.snapshotManager.takeSnapshot();
    }

    const handle = await this.snapshotManager.getElementByUid(uid);
    try {
      await handle.hover();
      return { text: `已悬停在元素 ${uid} 上`, uid };
    } finally {
      await handle.dispose();
    }
  }

  async waitFor(text, timeout = 10000) {
    const page = this.browserManager.getCurrentPage();
    await page.waitForFunction(
      (txt) => document.body.innerText.includes(txt),
      { timeout },
      text
    );
    return { text: `已找到文本 "${text}"` };
  }

  async evaluate(code) {
    const page = this.browserManager.getCurrentPage();
    const result = await page.evaluate(code);
    return { result };
  }

  async screenshot(filePath) {
    const page = this.browserManager.getCurrentPage();
    const params = filePath ? { path: filePath, type: 'png' } : { type: 'png' };
    const buffer = await page.screenshot(params);
    return { buffer, filePath };
  }

  async screenshotBuffer() {
    const page = this.browserManager.getCurrentPage();
    return await page.screenshot({ type: 'png' });
  }

  async getConsoleMessages() {
    return [];
  }

  async getNetworkRequests() {
    return [];
  }
}

module.exports = { ActionExecutor };
