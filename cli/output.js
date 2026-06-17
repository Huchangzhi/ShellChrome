function formatResult(result, options = {}) {
  if (options.json) {
    return JSON.stringify(result, null, 2);
  }

  if (!result.success) {
    return `ERROR: ${result.error}`;
  }

  switch (result.displayType) {
    case 'text':
      return formatText(result.data);
    case 'pages':
      return formatPages(result.data);
    case 'elements':
      return formatElements(result.data);
    case 'image':
      return formatImage(result.data);
    case 'status':
      return formatStatus(result.data);
    case 'help':
      return formatHelp(result.data);
    case 'error':
      return `ERROR: ${result.error}`;
    default:
      return result.data?.text || JSON.stringify(result.data);
  }
}

function formatText(data) {
  if (data.text) return `OK\n${data.text}`;

  if (data.scripts) {
    if (data.scripts.length === 0) return 'OK\n（没有保存的自动化脚本）';
    const lines = ['OK'];
    for (const s of data.scripts) {
      const createdAt = s.createdAt ? new Date(s.createdAt).toLocaleString('zh-CN') : '未知';
      lines.push(`[${s.id}] ${s.name} - ${s.commandCount}条命令 - ${createdAt}`);
    }
    return lines.join('\n');
  }

  if (data.scriptName) {
    const lines = [`OK - 执行自动化："${data.scriptName}" (${data.totalCommands}条命令)`];
    for (const r of data.results) {
      if (r.success) {
        lines.push(`  [${r.index}] OK ${r.raw}`);
      } else {
        lines.push(`  [${r.index}] FAIL ${r.raw} - ${r.error}`);
      }
    }
    return lines.join('\n');
  }

  if (data.messages !== undefined) {
    if (data.messages.length === 0) return 'OK\n（无控制台消息）';
    return 'OK\n' + data.messages.map(m => `[${m.type || 'log'}] ${m.text || m}`).join('\n');
  }

  if (data.requests !== undefined) {
    if (data.requests.length === 0) return 'OK\n（无网络请求）';
    const lines = [`OK (${data.total} 个请求)`];
    for (const req of data.requests) {
      lines.push(`${req.method || 'GET'} ${req.url || req}`);
    }
    if (data.total > 20) lines.push(`... 还有 ${data.total - 20} 个请求`);
    return lines.join('\n');
  }

  return `OK\n${JSON.stringify(data)}`;
}

function formatPages(data) {
  if (data.pages.length === 0) {
    return 'OK\n（无标签页）';
  }
  const lines = ['OK'];
  for (const page of data.pages) {
    const current = page.current ? ' [current]' : '';
    lines.push(`[${page.id}] ${page.url}${current}`);
  }
  return lines.join('\n');
}

function formatElements(data) {
  const header = `OK (page ${data.page}/${data.totalPages}, ${data.totalElements} elements)`;
  if (data.elements.length === 0) {
    return header + '\n（无元素）';
  }
  return header + '\n' + data.elements.join('\n');
}

function formatImage(data) {
  if (data.rendered) {
    return data.rendered;
  }
  return 'OK (image captured)';
}

function formatStatus(data) {
  const lines = [
    'OK',
    `connected: ${data.connected}`,
    `tabs: ${data.tabCount}`,
    `current_url: ${data.currentUrl}`,
  ];
  return lines.join('\n');
}

function formatHelp(data) {
  if (data.commands) {
    const lines = ['ShellChrome CLI - Commands:'];
    for (const cmd of data.commands) {
      lines.push(`  ${cmd.aliases.join(', ').padEnd(24)} ${cmd.description}`);
    }
    return lines.join('\n');
  }
  return data.text || 'OK';
}

module.exports = { formatResult };
