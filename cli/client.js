const net = require('net');
const fs = require('fs');
const crypto = require('crypto');
const { getSocketPath, getPidPath, encodeMessage, decodeMessages } = require('./protocol');
const { formatResult } = require('./output');

function createConnection(callback) {
  const info = getSocketPath();
  if (info.type === 'tcp') {
    return net.createConnection(info.port, info.host, callback);
  }
  return net.createConnection(info.path, callback);
}

function isDaemonRunning() {
  const pidPath = getPidPath();
  if (!fs.existsSync(pidPath)) return false;

  try {
    const pidData = JSON.parse(fs.readFileSync(pidPath, 'utf-8'));
    try {
      process.kill(pidData.pid, 0);
      return true;
    } catch (e) {
      fs.unlinkSync(pidPath);
      return false;
    }
  } catch (e) {
    return false;
  }
}

function getPidData() {
  const pidPath = getPidPath();
  if (!fs.existsSync(pidPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pidPath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

async function runClient(command, args, options = {}) {
  if (!isDaemonRunning()) {
    console.error('ERROR: Daemon not running. Start it with: shellchrome-cli start');
    process.exit(1);
  }

  const timeout = options.timeout || 30000;
  const id = crypto.randomUUID();

  return new Promise((resolve) => {
    const socket = createConnection(() => {
      const message = { id, type: 'command', command, args };
      socket.write(encodeMessage(message));
    });

    let buffer = '';

    const timer = setTimeout(() => {
      socket.end();
      console.error('ERROR: Request timed out');
      resolve(1);
    }, timeout);

    socket.on('data', (data) => {
      buffer += data.toString();
      const { messages, remainder } = decodeMessages(buffer);
      buffer = remainder;

      for (const msg of messages) {
        if (msg.id === id) {
          clearTimeout(timer);
          socket.end();
          const output = formatResult(msg, { json: options.json });
          console.log(output);
          resolve(msg.success ? 0 : 1);
        }
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
        console.error('ERROR: Cannot connect to daemon. Start it with: shellchrome-cli start');
      } else {
        console.error(`ERROR: ${err.message}`);
      }
      resolve(1);
    });
  });
}

async function runHealthCheck() {
  if (!isDaemonRunning()) {
    console.log('Daemon: not running');
    return false;
  }

  return new Promise((resolve) => {
    const socket = createConnection(() => {
      socket.write(encodeMessage({ type: 'health' }));
    });

    let buffer = '';

    const timer = setTimeout(() => {
      socket.end();
      console.log('Daemon: health check timed out');
      resolve(false);
    }, 5000);

    socket.on('data', (data) => {
      buffer += data.toString();
      const { messages } = decodeMessages(buffer);

      for (const msg of messages) {
        if (msg.type === 'health') {
          clearTimeout(timer);
          socket.end();
          console.log(`Daemon: running`);
          console.log(`  PID: ${msg.pid}`);
          console.log(`  Uptime: ${msg.uptime}s`);
          console.log(`  Tabs: ${msg.pages}`);
          console.log(`  Current URL: ${msg.currentUrl}`);
          resolve(true);
        }
      }
    });

    socket.on('error', () => {
      clearTimeout(timer);
      console.log('Daemon: PID file exists but cannot connect (stale?)');
      resolve(false);
    });
  });
}

module.exports = { runClient, runHealthCheck, isDaemonRunning, getPidData };
