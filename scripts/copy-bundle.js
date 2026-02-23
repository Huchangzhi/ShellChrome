const fs = require('fs');
fs.copyFileSync('dist/bundle.cjs', 'bundle.cjs');
console.log('已复制 bundle.cjs');
