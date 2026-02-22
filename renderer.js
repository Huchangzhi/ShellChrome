/**
 * 终端截图渲染器
 * 将截图转换为彩色 ASCII 艺术在终端显示
 */

// ANSI 颜色代码
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // 前景色
  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
  },

  // 背景色
  bg: {
    black: '\x1b[40m',
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    blue: '\x1b[44m',
    magenta: '\x1b[45m',
    cyan: '\x1b[46m',
    white: '\x1b[47m',
  },

  // 256 色背景
  bg256: (n) => `\x1b[48;5;${n}m`,
  // 256 色前景
  fg256: (n) => `\x1b[38;5;${n}m`,

  // RGB 真彩色
  bgRGB: (r, g, b) => `\x1b[48;2;${r};${g};${b}m`,
  fgRGB: (r, g, b) => `\x1b[38;2;${r};${g};${b}m`,
};

// 字符密度图（从稀疏到密集）
const ASCII_CHARS = ' .:-=+*#%@';

/**
 * 延迟加载 jimp 模块
 */
let _jimp = null;
async function loadJimp() {
  if (!_jimp) {
    const { Jimp } = require('jimp');
    _jimp = Jimp;
  }
  return _jimp;
}

/**
 * 将 RGB 颜色转换为最接近的 ANSI 颜色
 */
function getClosestAnsiColor(r, g, b) {
  // 计算灰度值
  const gray = Math.round((r + g + b) / 3);
  
  // 检查是否为灰度色
  const isGray = Math.abs(r - gray) < 30 && Math.abs(g - gray) < 30 && Math.abs(b - gray) < 30;
  
  if (isGray) {
    // 返回灰度色
    if (gray < 50) return { type: 'fg', value: COLORS.fg.black };
    if (gray < 100) return { type: 'fg', value: COLORS.fg.gray };
    if (gray < 150) return { type: 'fg', value: COLORS.fg.white };
    return { type: 'fg', value: COLORS.fg.white };
  }
  
  // 找到最接近的彩色
  const colors = [
    { name: 'red', r: 255, g: 0, b: 0 },
    { name: 'green', r: 0, g: 255, b: 0 },
    { name: 'blue', r: 0, g: 0, b: 255 },
    { name: 'yellow', r: 255, g: 255, b: 0 },
    { name: 'magenta', r: 255, g: 0, b: 255 },
    { name: 'cyan', r: 0, g: 255, b: 255 },
  ];
  
  let closest = null;
  let minDist = Infinity;
  
  for (const color of colors) {
    const dist = Math.sqrt(
      Math.pow(r - color.r, 2) +
      Math.pow(g - color.g, 2) +
      Math.pow(b - color.b, 2)
    );
    if (dist < minDist) {
      minDist = dist;
      closest = color;
    }
  }
  
  return { type: 'fg', value: COLORS.fg[closest.name] };
}

/**
 * 获取适合背景色的前景字符颜色
 */
function getContrastChar(bgR, bgG, bgB) {
  // 计算背景亮度
  const brightness = (bgR * 299 + bgG * 587 + bgB * 114) / 1000;
  
  // 根据亮度选择字符
  if (brightness > 200) {
    return { char: '█', color: COLORS.fg.gray };
  } else if (brightness > 150) {
    return { char: '▓', color: COLORS.fg.black };
  } else if (brightness > 100) {
    return { char: '▒', color: COLORS.fg.white };
  } else if (brightness > 50) {
    return { char: '░', color: COLORS.fg.white };
  } else {
    return { char: ' ', color: COLORS.fg.black };
  }
}

/**
 * 将图像数据转换为终端可显示的彩色 ASCII 艺术（纯彩色块，无文字）
 * @param {Buffer} imageData - PNG 图像数据
 * @param {number} maxWidth - 最大宽度（字符数）
 * @param {number} maxHeight - 最大高度（行数）
 */
async function renderImageToTerminal(imageData, maxWidth = 100, maxHeight = 50) {
  try {
    const Jimp = await loadJimp();

    // 读取图像
    const image = await Jimp.fromBuffer(imageData);
    const origWidth = image.bitmap.width;
    const origHeight = image.bitmap.height;
    const aspectRatio = origWidth / origHeight;

    // 计算保持比例的缩放尺寸
    // 终端字符宽高比约 0.5（字符高度是宽度的 2 倍），所以高度要乘以 2 来保持视觉比例
    const visualAspectRatio = aspectRatio * 2;

    let targetWidth, targetHeight;
    if (visualAspectRatio > maxWidth / maxHeight) {
      // 图像更宽，按宽度缩放
      targetWidth = maxWidth;
      targetHeight = Math.round(maxWidth / visualAspectRatio);
    } else {
      // 图像更高，按高度缩放
      targetHeight = maxHeight;
      targetWidth = Math.round(targetHeight * visualAspectRatio);
    }

    // 确保不超过最大尺寸
    targetWidth = Math.min(targetWidth, maxWidth);
    targetHeight = Math.min(targetHeight, maxHeight);

    // 调整图像大小
    await image.resize({ w: targetWidth, h: targetHeight });

    let output = '';

    // 遍历每个像素，只显示色块
    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        const pixel = image.getPixelColor(x, y);
        const r = (pixel >> 24) & 0xff;
        const g = (pixel >> 16) & 0xff;
        const b = (pixel >> 8) & 0xff;
        const a = pixel & 0xff;

        if (a < 128) {
          // 透明像素
          output += '  ';
        } else {
          // 显示色块
          output += `\x1b[48;2;${r};${g};${b}m  \x1b[0m`;
        }
      }
      output += '\n';
    }

    return output;
  } catch (error) {
    return `渲染失败：${error.message}\n`;
  }
}

/**
 * 渲染图像（彩色块状 + 文字叠加）
 * 使用元素位置信息直接渲染文字，而不是 OCR
 * @param {Buffer} imageData - PNG 图像数据
 * @param {number} maxWidth - 最大宽度（字符数）
 * @param {number} maxHeight - 最大高度（行数）
 * @param {Array} elements - 页面元素列表（带位置信息）
 */
async function renderImageWithText(imageData, maxWidth = 100, maxHeight = 50, elements = []) {
  try {
    const Jimp = await loadJimp();

    // 读取图像
    const image = await Jimp.fromBuffer(imageData);
    const origWidth = image.bitmap.width;
    const origHeight = image.bitmap.height;
    const aspectRatio = origWidth / origHeight;

    // 计算保持比例的缩放尺寸
    // 终端字符宽高比约 0.5（字符高度是宽度的 2 倍），所以高度要乘以 2 来保持视觉比例
    const visualAspectRatio = aspectRatio * 2;

    let targetWidth, targetHeight;
    if (visualAspectRatio > maxWidth / maxHeight) {
      // 图像更宽，按宽度缩放
      targetWidth = maxWidth;
      targetHeight = Math.round(maxWidth / visualAspectRatio);
    } else {
      // 图像更高，按高度缩放
      targetHeight = maxHeight;
      targetWidth = Math.round(targetHeight * visualAspectRatio);
    }

    // 确保不超过最大尺寸
    targetWidth = Math.min(targetWidth, maxWidth);
    targetHeight = Math.min(targetHeight, maxHeight);

    // 调整图像大小
    await image.resize({ w: targetWidth, h: targetHeight });

    // 计算缩放比例
    const scaleX = targetWidth / origWidth;
    const scaleY = targetHeight / origHeight;

    // 创建文字位置映射
    const textMap = createTextMapFromElements(elements, targetWidth, targetHeight, scaleX, scaleY);
    console.log(`[渲染 ${Object.keys(textMap).length} 行文字]`);

    let output = '';

    // 遍历每个像素
    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        const pixel = image.getPixelColor(x, y);
        const r = (pixel >> 24) & 0xff;
        const g = (pixel >> 16) & 0xff;
        const b = (pixel >> 8) & 0xff;
        const a = pixel & 0xff;

        // 检查这个位置是否有文字
        const textChar = textMap[y]?.[x];

        if (textChar) {
          // 有文字，显示文字（带背景色和对比色前景）
          output += `\x1b[48;2;${r};${g};${b}m\x1b[38;2;${contrastColor(r, g, b)}m${textChar}\x1b[0m`;
        } else if (a < 128) {
          // 透明像素
          output += '  ';
        } else {
          // 无文字，显示色块
          output += `\x1b[48;2;${r};${g};${b}m  \x1b[0m`;
        }
      }
      output += '\n';
    }

    return output;
  } catch (error) {
    return `渲染失败：${error.message}\n`;
  }
}

/**
 * 从元素位置创建文字映射
 */
function createTextMapFromElements(elements, targetWidth, targetHeight, scaleX, scaleY) {
  const textMap = {};
  
  for (const element of elements) {
    const { text, x, y, width, height } = element;
    
    // 转换到目标坐标
    const startX = Math.floor(x * scaleX);
    const startY = Math.floor(y * scaleY);
    const endX = Math.min(targetWidth - 1, Math.floor((x + width) * scaleX));
    const centerY = Math.floor((y + height / 2) * scaleY);
    
    // 跳过超出范围的
    if (startX >= targetWidth || startY >= targetHeight) continue;
    
    // 在映射中放置文字
    if (!textMap[centerY]) textMap[centerY] = {};
    
    const step = Math.max(1, (endX - startX + 1) / text.length);
    for (let i = 0; i < text.length; i++) {
      const xPos = Math.floor(startX + i * step);
      if (xPos >= startX && xPos <= endX && xPos < targetWidth) {
        textMap[centerY][xPos] = text[i];
      }
    }
  }
  
  return textMap;
}

/**
 * 计算对比色（黑或白）
 */
function contrastColor(r, g, b) {
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  if (brightness > 128) {
    return '0';   // 黑色
  } else {
    return '255'; // 白色
  }
}

/**
 * 简化的 ASCII 渲染（灰度字符）
 */
async function renderImageAsASCII(imageData, maxWidth = 80, maxHeight = 40) {
  try {
    const Jimp = await loadJimp();

    // 读取图像
    const image = await Jimp.fromBuffer(imageData);
    const origWidth = image.bitmap.width;
    const origHeight = image.bitmap.height;
    const aspectRatio = origWidth / origHeight;

    // 计算保持比例的缩放尺寸
    // 终端字符宽高比约 0.5（字符高度是宽度的 2 倍），所以高度要乘以 2 来保持视觉比例
    const visualAspectRatio = aspectRatio * 2;

    let targetWidth, targetHeight;
    if (visualAspectRatio > maxWidth / maxHeight) {
      // 图像更宽，按宽度缩放
      targetWidth = maxWidth;
      targetHeight = Math.round(maxWidth / visualAspectRatio);
    } else {
      // 图像更高，按高度缩放
      targetHeight = maxHeight;
      targetWidth = Math.round(targetHeight * visualAspectRatio);
    }

    // 确保不超过最大尺寸
    targetWidth = Math.min(targetWidth, maxWidth);
    targetHeight = Math.min(targetHeight, maxHeight);

    // 调整为灰度并缩小
    await image.greyscale();
    await image.resize({ w: targetWidth, h: targetHeight });

    let output = '';

    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        const pixel = image.getPixelColor(x, y);
        const r = (pixel >> 24) & 0xff;
        const gray = r;

        // 根据灰度选择字符（从暗到亮）
        const charIndex = Math.floor((gray / 255) * (ASCII_CHARS.length - 1));
        const char = ASCII_CHARS[charIndex] || ' ';

        output += char;
      }
      output += '\n';
    }

    return output;
  } catch (error) {
    return `渲染失败：${error.message}\n`;
  }
}

module.exports = { renderImageToTerminal, renderImageAsASCII, renderImageWithText, COLORS };
