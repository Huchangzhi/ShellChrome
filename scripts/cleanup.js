const fs = require('fs');

const isCli = process.argv[2] === 'cli';

if (isCli) {
  if (fs.existsSync('bundle-cli.cjs')) {
    fs.unlinkSync('bundle-cli.cjs');
    console.log('已清理 bundle-cli.cjs');
  }
} else {
  if (fs.existsSync('bundle.cjs')) {
    fs.unlinkSync('bundle.cjs');
    console.log('已清理 bundle.cjs');
  }
}
