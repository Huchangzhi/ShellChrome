const net = require('net');
const fs = require('fs');
const path = require('path');
const { BrowserManager } = require('../core/browser-manager');
const { SnapshotManager } = require('../core/snapshot');
const { ActionExecutor } = require('../core/actions');
const { AutomationManager } = require('../core/automation');
const { CommandDispatcher } = require('../core/commands');
const { getSocketPath, getPidPath, encodeMessage, decodeMessages } = require('./protocol');

class CommandQueue {
  constructor() {
    this._queue = [];
    this._running = false;
  }

  async enqueue(fn) {
    return new Promise((resolve, reject) => {
      this._queue.push({ fn, resolve, reject });
      this._process();
    });
  }

  async _process() {
    if (this._running || this._queue.length === 0) return;
    this._running = true;
    while (this._queue.length > 0) {
      const { fn, resolve, reject } = this._queue.shift();
      try {
        resolve(await fn());
      } catch (e) {
        reject(e);
      }
    }
    this._running = false;
  }
}

class Daemon {
  constructor() {
    this.browserManager = null;
    this.snapshotManager = null;
    this.actionExecutor = null;
    this.automationManager = null;
    this.dispatcher = null;
    this.server = null;
    this.queue = new CommandQueue();
    this.startedAt = null;
    this.restartAttempts = 0;
    this.maxRestarts = 3;
  }

  async start() {
    const headless = process.argv.includes('--headless') || !process.argv.includes('--no-headless');

    this.browserManager = new BrowserManager({ headless });
    this.snapshotManager = new SnapshotManager(this.browserManager);
    this.actionExecutor = new ActionExecutor(this.browserManager, this.snapshotManager);
    this.automationManager = new AutomationManager();
    this.dispatcher = new CommandDispatcher(
      this.browserManager,
      this.snapshotManager,
      this.actionExecutor,
      this.automationManager
    );

    await this.browserManager.start();
    this.startedAt = new Date().toISOString();
    this.restartAttempts = 0;

    this.browserManager.on('disconnected', () => {
      console.log('[daemon] Browser disconnected, attempting restart...');
      this.autoRestart();
    });

    const socketInfo = getSocketPath();
    if (socketInfo.type === 'unix') {
      try { fs.unlinkSync(socketInfo.path); } catch (e) {}
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        this.server = net.createServer((socket) => this.handleConnection(socket));
        await new Promise((resolve, reject) => {
          this.server.once('error', reject);
          if (socketInfo.type === 'tcp') {
            this.server.listen(socketInfo.port, socketInfo.host, () => {
              this.server.removeListener('error', reject);
              setTimeout(resolve, 500);
            });
          } else {
            this.server.listen(socketInfo.path, () => {
              this.server.removeListener('error', reject);
              setTimeout(resolve, 500);
            });
          }
        });
        break;
      } catch (err) {
        if (err.code === 'EADDRINUSE' && attempt < 3) {
          console.log(`[daemon] Address busy, retry ${attempt}/3...`);
          try { this.server.close(); } catch (e) {}
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          throw err;
        }
      }
    }

    this.writePidFile();
    const addr = socketInfo.type === 'tcp' ? `${socketInfo.host}:${socketInfo.port}` : socketInfo.path;
    console.log(`[daemon] Started (PID: ${process.pid}, addr: ${addr})`);

    process.on('SIGTERM', () => this.stop());
    process.on('SIGINT', () => this.stop());
  }

  writePidFile() {
    const pidData = {
      pid: process.pid,
      socketPath: getSocketPath(),
      startedAt: this.startedAt,
      headless: this.browserManager.headless,
    };
    fs.writeFileSync(getPidPath(), JSON.stringify(pidData, null, 2), 'utf-8');
  }

  removePidFile() {
    try { fs.unlinkSync(getPidPath()); } catch (e) {}
  }

  handleConnection(socket) {
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();
      const { messages, remainder } = decodeMessages(buffer);
      buffer = remainder;

      for (const msg of messages) {
        this.handleMessage(socket, msg);
      }
    });

    socket.on('error', () => {});
  }

  async handleMessage(socket, msg) {
    if (msg.type === 'health') {
      const response = {
        type: 'health',
        status: 'ok',
        uptime: Math.floor((Date.now() - new Date(this.startedAt).getTime()) / 1000),
        pages: this.browserManager.pages.length,
        currentUrl: this.browserManager.getCurrentPage()?.url() || 'none',
        pid: process.pid,
      };
      socket.write(encodeMessage(response));
      return;
    }

    if (msg.type === 'shutdown') {
      socket.write(encodeMessage({ type: 'shutdown', status: 'stopping' }));
      socket.end();
      await this.stop();
      return;
    }

    if (msg.type === 'command') {
      try {
        const result = await this.queue.enqueue(() =>
          this.dispatcher.dispatch(`${msg.command} ${msg.args.join(' ')}`.trim())
        );
        const response = { id: msg.id, ...result };
        socket.write(encodeMessage(response));
      } catch (error) {
        socket.write(encodeMessage({
          id: msg.id,
          success: false,
          error: error.message,
          displayType: 'error',
        }));
      }
      return;
    }

    socket.write(encodeMessage({ error: 'Unknown message type' }));
  }

  async autoRestart() {
    if (this.restartAttempts >= this.maxRestarts) {
      console.log(`[daemon] Max restart attempts (${this.maxRestarts}) reached, giving up`);
      return;
    }

    this.restartAttempts++;
    const delay = Math.min(2000 * Math.pow(2, this.restartAttempts - 1), 10000);

    console.log(`[daemon] Restart attempt ${this.restartAttempts}/${this.maxRestarts} in ${delay}ms...`);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.browserManager.start();
      this.restartAttempts = 0;
      console.log('[daemon] Browser restarted successfully');
    } catch (error) {
      console.log(`[daemon] Restart failed: ${error.message}`);
      this.autoRestart();
    }
  }

  async stop() {
    console.log('[daemon] Stopping...');

    if (this.server) {
      this.server.close();
      this.server = null;
    }

    if (this.browserManager) {
      try {
        await this.browserManager.close();
      } catch (e) {}
    }

    this.removePidFile();

    const socketInfo = getSocketPath();
    if (socketInfo.type === 'unix') {
      try { fs.unlinkSync(socketInfo.path); } catch (e) {}
    }

    console.log('[daemon] Stopped');
    process.exit(0);
  }
}

if (require.main === module || process.argv[1]?.endsWith('daemon.js') || process.argv.includes('--daemon')) {
  const daemon = new Daemon();
  daemon.start().catch(err => {
    console.error('[daemon] Failed to start:', err.message);
    process.exit(1);
  });
}

module.exports = { Daemon };
