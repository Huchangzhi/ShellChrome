const { BrowserManager } = require('./core/browser-manager');

class ConsoleBrowser extends BrowserManager {
  constructor(options = {}) {
    super(options);
  }

  addAutoScript(name, commands) {
    const { AutomationManager } = require('./core/automation');
    const am = new AutomationManager(this.configDir);
    return am.addScript(name, commands);
  }

  loadAutoScripts() {
    const { AutomationManager } = require('./core/automation');
    const am = new AutomationManager(this.configDir);
    return am.loadScripts();
  }

  showPages() {
    console.log('\n========== 标签页列表 ==========');
    if (this.pages.length === 0) {
      console.log('（无标签页）');
      console.log('提示：使用 "o <url>" 命令打开网页，例如：o baidu.com');
    } else {
      for (const page of this.pages) {
        const current = (page._page === this.currentPage) ? ' [当前]' : '';
        console.log(`[${page.id}] ${page.url}${current}`);
      }
    }
    console.log('===============================\n');
  }

  async showElements() {
    const { SnapshotManager } = require('./core/snapshot');
    const sm = new SnapshotManager(this);
    sm.lastSnapshot = this.lastSnapshot;
    sm.snapshotIdToNode = this.snapshotIdToNode;
    sm.nextUid = this.nextUid;
    await sm.getSnapshotLines();
  }
}

module.exports = { ConsoleBrowser };
