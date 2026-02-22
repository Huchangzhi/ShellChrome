/**
 * OCR 文本提取渲染器
 * 使用 Tesseract.js 识别截图中的文字
 */

/**
 * 从截图中提取文字
 * @param {Buffer} imageData - PNG 图像数据
 * @param {string} lang - 识别语言（eng 英文，chi_sim 简体中文）
 */
async function extractTextFromImage(imageData, lang = 'eng') {
  try {
    const TesseractModule = await new Function('return import("tesseract.js")')();
    const Tesseract = TesseractModule.default;
    const result = await Tesseract.recognize(imageData, lang, {
      logger: () => {}, // 禁用日志输出
    });

    return {
      text: result.data.text,
      lines: result.data.lines,
      words: result.data.words,
      confidence: result.data.confidence,
    };
  } catch (error) {
    throw new Error(`OCR 识别失败：${error.message}`);
  }
}

/**
 * 渲染截图为文字 + 背景混合模式
 * 文字区域显示真实文字，其他区域显示色块
 */
async function renderImageWithOCR(imageData, maxWidth = 100, maxHeight = 50) {
  try {
    // 先进行 OCR 识别
    const ocrResult = await extractTextFromImage(imageData, 'eng+chi_sim');

    // 同时渲染彩色背景
    const sharpModule = await new Function('return import("sharp")')();
    const sharp = sharpModule.default;

    const image = sharp(imageData);
    const metadata = await image.metadata();
    
    const targetWidth = Math.min(maxWidth, 100);
    const targetHeight = Math.min(Math.floor(maxHeight * 0.5), 25);
    
    const resized = await image
      .resize(targetWidth, targetHeight, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer();
    
    let output = '';
    
    // 创建文字位置映射
    const textMap = createTextMap(ocrResult.lines, targetWidth, targetHeight, metadata.width, metadata.height);
    
    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        const idx = (y * targetWidth + x) * 4;
        const r = resized[idx];
        const g = resized[idx + 1];
        const b = resized[idx + 2];
        
        // 检查这个位置是否有文字
        const text = textMap[y]?.[x];
        
        if (text) {
          // 有文字，显示文字
          output += text;
        } else {
          // 无文字，显示色块
          output += `\x1b[48;2;${r};${g};${b}m  `;
        }
      }
      output += '\x1b[0m\n';
    }
    
    return output;
  } catch (error) {
    return `渲染失败：${error.message}\n`;
  }
}

/**
 * 创建文字位置映射
 */
function createTextMap(lines, targetWidth, targetHeight, origWidth, origHeight) {
  const textMap = {};
  
  // 计算缩放比例
  const scaleX = targetWidth / origWidth;
  const scaleY = targetHeight / origHeight;
  
  for (const line of lines) {
    if (!line.bbox || !line.text || line.text.trim() === '') continue;
    
    const { x0, y0, x1, y1 } = line.bbox;
    
    // 转换到目标坐标
    const startX = Math.floor(x0 * scaleX);
    const startY = Math.floor(y0 * scaleY);
    const endX = Math.floor(x1 * scaleX);
    const endY = Math.floor(y1 * scaleY);
    
    // 在映射中标记文字区域
    for (let y = startY; y <= endY && y < targetHeight; y++) {
      if (!textMap[y]) textMap[y] = {};
      for (let x = startX; x <= endX && x < targetWidth; x++) {
        // 只在每行的第一个位置放置文字
        if (x === startX) {
          textMap[y][x] = line.text.charAt(0);
        }
      }
    }
  }
  
  return textMap;
}

/**
 * 简单模式：只显示识别出的文字
 */
async function renderTextOnly(imageData) {
  try {
    const result = await extractTextFromImage(imageData, 'eng+chi_sim');
    
    let output = '\n========== 识别结果 ==========\n';
    output += `置信度：${result.confidence.toFixed(1)}%\n\n`;
    
    if (result.text.trim()) {
      output += result.text;
    } else {
      output += '(未识别到文字)';
    }
    
    output += '\n\n================================\n';
    
    return output;
  } catch (error) {
    return `OCR 识别失败：${error.message}\n`;
  }
}

/**
 * 详细模式：显示文字和位置信息
 */
async function renderTextDetailed(imageData) {
  try {
    const result = await extractTextFromImage(imageData, 'eng+chi_sim');
    
    let output = '\n========== OCR 详细信息 ==========\n';
    output += `置信度：${result.confidence.toFixed(1)}%\n`;
    output += `识别行数：${result.lines.length}\n`;
    output += `识别词数：${result.words.length}\n\n`;
    
    if (result.lines.length > 0) {
      output += '--- 按行显示 ---\n';
      for (let i = 0; i < result.lines.length; i++) {
        const line = result.lines[i];
        output += `[${i + 1}] "${line.text}" (置信度：${line.confidence?.toFixed(1) || 'N/A'}%)\n`;
      }
      output += '\n--- 完整文本 ---\n';
      output += result.text;
    } else {
      output += '(未识别到文字)';
    }
    
    output += '\n====================================\n';

    return output;
  } catch (error) {
    return `OCR 识别失败：${error.message}\n`;
  }
}

module.exports = { extractTextFromImage, renderImageWithOCR, renderTextOnly, renderTextDetailed };
