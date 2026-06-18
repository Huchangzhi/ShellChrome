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
      const pagesBefore = (await page.browser().pages()).length;

      let clicked = false;

      try {
        const box = await handle.boundingBox();
        if (box && box.width > 0 && box.height > 0) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          clicked = true;
        }
      } catch (e) {}

      if (!clicked) {
        try {
          await handle.evaluate(el => el.click());
          clicked = true;
        } catch (e) {}
      }

      if (isLink) {
        await new Promise(resolve => setTimeout(resolve, 500));
        await this.browserManager.refreshPages();
        const pagesAfter = this.browserManager.pages;
        if (pagesAfter.length > pagesBefore) {
          this.browserManager.currentPage = pagesAfter[pagesAfter.length - 1]._page;
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

    if (key === 'Enter') {
      await new Promise(resolve => setTimeout(resolve, 300));

      const submitInfo = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return { found: false };
        const form = el.closest('form');
        if (!form) return { found: false };

        const btn = form.querySelector('[type="submit"]') ||
                    form.querySelector('button:not([type])');
        if (btn) {
          const rect = btn.getBoundingClientRect();
          return { found: true, method: 'standard', x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }

        const clickables = form.querySelectorAll('[role="button"], [class*="btn"], [class*="submit"]');
        for (const c of clickables) {
          const style = window.getComputedStyle(c);
          if (style.cursor === 'pointer') {
            const rect = c.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              return { found: true, method: 'custom', x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            }
          }
        }

        return { found: false };
      });

      if (submitInfo.found) {
        await page.mouse.click(submitInfo.x, submitInfo.y);
        return { text: `已按下按键 ${key}（并点击了提交按钮）`, key };
      }
    }

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
