const os = require('os');
const path = require('path');

function getSocketPath() {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\shellchrome';
  }
  return path.join(os.tmpdir(), 'shellchrome.sock');
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
