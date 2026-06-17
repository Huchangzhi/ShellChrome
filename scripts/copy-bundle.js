const fs = require('fs');

const isCli = process.argv[2] === 'cli';

if (isCli) {
  fs.copyFileSync('dist/bundle-cli.cjs', 'bundle-cli.cjs');
  console.log('已复制 bundle-cli.cjs');
} else {
  fs.copyFileSync('dist/bundle.cjs', 'bundle.cjs');
  console.log('已复制 bundle.cjs');
}
