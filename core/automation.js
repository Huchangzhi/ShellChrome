const fs = require('node:fs');
const path = require('node:path');

class AutomationManager {
  constructor(configDir) {
    this.configDir = configDir || process.cwd();
  }

  loadScripts() {
    try {
      const autoPath = path.join(this.configDir, 'auto.json');
      if (fs.existsSync(autoPath)) {
        return JSON.parse(fs.readFileSync(autoPath, 'utf-8'));
      }
    } catch (error) {
      console.error('加载自动化脚本失败:', error.message);
    }
    return [];
  }

  saveScripts(scripts) {
    try {
      const autoPath = path.join(this.configDir, 'auto.json');
      fs.writeFileSync(autoPath, JSON.stringify(scripts, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('保存自动化脚本失败:', error.message);
      return false;
    }
  }

  addScript(name, commands) {
    const scripts = this.loadScripts();
    const id = scripts.length > 0 ? Math.max(...scripts.map(s => s.id)) + 1 : 1;
    const script = { id, name, commands, createdAt: new Date().toISOString() };
    scripts.push(script);
    this.saveScripts(scripts);
    return script;
  }

  getScript(id) {
    const scripts = this.loadScripts();
    return scripts.find(s => s.id === id) || null;
  }

  listScripts() {
    return this.loadScripts().map(s => ({
      id: s.id,
      name: s.name,
      commandCount: s.commands ? s.commands.length : 0,
      createdAt: s.createdAt,
    }));
  }

  async executeScript(id, commandRunner) {
    const script = this.getScript(id);
    if (!script) {
      throw new Error(`找不到编号为 ${id} 的自动化脚本`);
    }

    const results = [];
    for (let i = 0; i < script.commands.length; i++) {
      const cmd = script.commands[i];
      try {
        const result = await commandRunner(cmd.raw);
        results.push({ index: i + 1, raw: cmd.raw, success: true, result });
      } catch (error) {
        results.push({ index: i + 1, raw: cmd.raw, success: false, error: error.message });
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return {
      scriptName: script.name,
      totalCommands: script.commands.length,
      results,
    };
  }
}

module.exports = { AutomationManager };
