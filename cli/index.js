#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getPidPath, getSocketPath, encodeMessage } = require('./protocol');
const { runClient, runHealthCheck, isDaemonRunning, getPidData } = require('./client');

async function main() {
  const [, , subcommand, ...rest] = process.argv;

  if (!subcommand) {
    printUsage();
    process.exit(0);
  }

  const jsonFlag = rest.includes('--json');
  const filteredArgs = rest.filter(a => a !== '--json');

  switch (subcommand) {
    case 'start':
      await startDaemon(filteredArgs);
      break;
    case 'stop':
      await stopDaemon();
      break;
    case 'status':
      await runHealthCheck();
      break;
    case 'help':
    case '-h':
    case '--help':
      printUsage();
      break;
    case '--version':
    case '-v':
      console.log('1.2.1');
      break;
    default:
      const exitCode = await runClient(subcommand, filteredArgs, { json: jsonFlag });
      process.exit(exitCode);
  }
}

function printUsage() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║       ShellChrome CLI v1.2.1 - 命令行浏览器控制工具         ║
╚══════════════════════════════════════════════════════════════╝

概述：
  CLI 模式通过守护进程控制浏览器，每条命令执行一次后退出，
  适合 AI 代理或脚本自动化使用。所有输出结构化、可解析。

━━━━ 守护进程管理 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  shellchrome-cli start [--no-headless]  启动守护进程（后台运行浏览器）
  shellchrome-cli stop                   停止守护进程（关闭浏览器）
  shellchrome-cli status                 查看守护进程状态

  --no-headless   启动时显示浏览器窗口（默认无头模式）

━━━━ 标签页管理 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  shellchrome-cli o <url>       打开新标签页（自动补充 https://）
  shellchrome-cli q             关闭当前标签页
  shellchrome-cli q <id>        关闭指定标签页
  shellchrome-cli p             列出所有标签页
  shellchrome-cli w <id>        切换到指定标签页
  shellchrome-cli n <url>       在当前标签页导航到新地址
  shellchrome-cli ba            返回上一页

  示例：
    shellchrome-cli o baidu.com          打开百度
    shellchrome-cli o https://github.com 打开 GitHub
    shellchrome-cli p                    查看标签页列表
    shellchrome-cli w 2                  切到第2个标签页

━━━━ 页面查看 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  shellchrome-cli l              列出页面元素（默认前50个）
  shellchrome-cli l --all        列出全部元素
  shellchrome-cli l --page 2     第2页元素
  shellchrome-cli l --page-size 20  每页20个元素
  shellchrome-cli lc             列出可交互元素（按钮/输入框/链接）
  shellchrome-cli lc --all       列出全部可交互元素
  shellchrome-cli s [路径]       截图保存（默认 ./image.png）
  shellchrome-cli sp             截图并在终端显示彩色色块
  shellchrome-cli st             截图并显示色块+文字叠加
  shellchrome-cli sa             截图并显示 ASCII 艺术

  说明：
    l/lc 输出的每个元素带 [uid_N] 标识，用于后续点击/输入操作
    --all 输出所有元素，适合 AI 一次性分析页面结构
    --page N --page-size M 用于分页查看大量元素

━━━━ 交互操作 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  shellchrome-cli c <uid>           点击元素
  shellchrome-cli t <uid> <text>    向输入框输入文本
  shellchrome-cli fc <文字> [编号]  点击包含指定文字的元素
  shellchrome-cli ft <文字> <文本>  向包含指定文字的输入框输入
  shellchrome-cli k <key>           发送键盘按键
  shellchrome-cli sl <秒>           停顿指定秒数
  shellchrome-cli wait <文字> [ms]  等待页面出现指定文字
  shellchrome-cli hover <uid>       悬停在元素上

  示例：
    shellchrome-cli c uid_5              点击 uid_5 元素
    shellchrome-cli t uid_3 hello        向 uid_3 输入 hello
    shellchrome-cli fc 登录              点击包含"登录"的按钮
    shellchrome-cli fc 登录 2            点击第2个包含"登录"的元素
    shellchrome-cli ft 用户名 admin      向"用户名"输入框输入 admin
    shellchrome-cli k Enter              按下回车键
    shellchrome-cli k Control+A          全选
    shellchrome-cli sl 2                 停顿2秒
    shellchrome-cli wait 加载完成 5000   等待"加载完成"出现（最多5秒）

━━━━ 高级功能 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  shellchrome-cli eval <js代码>     执行 JavaScript
  shellchrome-cli console           查看控制台消息
  shellchrome-cli network           查看网络请求（最近20个）
  shellchrome-cli ui                查看当前 UI 模式
  shellchrome-cli ui on             下次启动显示浏览器窗口
  shellchrome-cli ui off            下次启动无头模式
  shellchrome-cli status            查看浏览器状态
  shellchrome-cli h                 显示命令列表

━━━━ 自动化 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  shellchrome-cli a l               列出所有自动化脚本
  shellchrome-cli a a <编号>        执行指定编号的自动化脚本

  注意：自动化录制（a s / a e）仅在交互模式（REPL）中可用。

━━━━ 输出控制 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  --json    输出原始 JSON 格式（便于程序解析）

  示例：
    shellchrome-cli p --json           标签页列表（JSON）
    shellchrome-cli status --json      状态信息（JSON）

━━━━ 典型使用流程 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. shellchrome-cli start               启动守护进程
  2. shellchrome-cli o baidu.com         打开网页
  3. shellchrome-cli l --all             获取页面元素
  4. shellchrome-cli fc 搜索             点击搜索框
  5. shellchrome-cli t uid_5 你好        输入搜索词
  6. shellchrome-cli k Enter             按回车搜索
  7. shellchrome-cli l --all             查看搜索结果
  8. shellchrome-cli stop                关闭守护进程

━━━━ 退出码 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  0   命令执行成功
  1   命令执行失败（错误信息输出在 ERROR: 开头）
`);
}

async function startDaemon(args) {
  if (isDaemonRunning()) {
    const pidData = getPidData();
    console.log(`Daemon already running (PID: ${pidData?.pid || 'unknown'})`);
    process.exit(0);
  }

  const daemonPath = path.join(__dirname, 'daemon.js');
  const daemonArgs = [daemonPath, ...args];

  const child = spawn(process.execPath, daemonArgs, {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
  });

  child.unref();

  const pidPath = getPidPath();
  const maxWait = 60000;
  const interval = 200;
  let waited = 0;

  console.log('Starting daemon...');

  while (waited < maxWait) {
    await new Promise(resolve => setTimeout(resolve, interval));
    waited += interval;

    if (fs.existsSync(pidPath)) {
      try {
        const pidData = JSON.parse(fs.readFileSync(pidPath, 'utf-8'));
        console.log(`Daemon started (PID: ${pidData.pid})`);
        process.exit(0);
      } catch (e) {}
    }
  }

  console.error('Daemon failed to start within 60 seconds');
  console.error('Try running manually: node cli/daemon.js');
  process.exit(1);
}

async function stopDaemon() {
  if (!isDaemonRunning()) {
    console.log('Daemon is not running');
    process.exit(0);
  }

  const pidData = getPidData();
  const socketPath = getSocketPath();

  console.log(`Stopping daemon (PID: ${pidData?.pid || 'unknown'})...`);

  try {
    const net = require('net');
    await new Promise((resolve) => {
      const socket = net.createConnection(socketPath, () => {
        socket.write(encodeMessage({ type: 'shutdown' }));
      });

      socket.on('data', () => {});
      socket.on('end', resolve);
      socket.on('error', resolve);

      setTimeout(resolve, 5000);
    });
  } catch (e) {}

  const pidPath = getPidPath();
  if (fs.existsSync(pidPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(pidPath, 'utf-8'));
      try { process.kill(data.pid, 'SIGTERM'); } catch (e) {}
    } catch (e) {}

    await new Promise(resolve => setTimeout(resolve, 1000));

    if (fs.existsSync(pidPath)) {
      try { fs.unlinkSync(pidPath); } catch (e) {}
    }
  }

  console.log('Daemon stopped');
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
