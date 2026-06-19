const os = require('os');
const path = require('path');
const crypto = require('crypto');

function getSocketPath() {
  const hash = crypto.createHash('md5').update(process.cwd()).digest('hex').slice(0, 8);
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\shellchrome-${hash}`;
  }
  return path.join(os.tmpdir(), `shellchrome-${hash}.sock`);
}

function getPidPath() {
  return path.join(process.cwd(), '.shellchrome.pid');
}

function encodeMessage(obj) {
  return JSON.stringify(obj) + '\n';
}

function decodeMessages(buffer) {
  const lines = buffer.split('\n');
  const remainder = lines.pop();
  const messages = [];

  for (const line of lines) {
    if (line.trim()) {
      try {
        messages.push(JSON.parse(line));
      } catch (e) {}
    }
  }

  return { messages, remainder: remainder || '' };
}

module.exports = { getSocketPath, getPidPath, encodeMessage, decodeMessages };
