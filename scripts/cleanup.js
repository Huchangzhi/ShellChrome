const fs = require('fs');
if (fs.existsSync('bundle.cjs')) {
  fs.unlinkSync('bundle.cjs');
  console.log('已清理 bundle.cjs');
}
