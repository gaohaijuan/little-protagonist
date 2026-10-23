const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const mini = path.join(root, 'miniprogram');
const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
const app = JSON.parse(fs.readFileSync(path.join(mini, 'app.json'), 'utf8'));
function assert(value, message) {if (!value) throw new Error(message);}
function walk(dir) {return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);}
assert(project.miniprogramRoot === 'miniprogram/', '项目源码目录不匹配');
for (const page of app.pages) {
  for (const ext of ['js', 'json', 'wxml', 'wxss']) assert(fs.existsSync(path.join(mini, page + '.' + ext)), '缺少页面文件：' + page + '.' + ext);
}
let count = 0;
for (const filename of walk(mini)) {
  if (filename.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', filename], {encoding: 'utf8'});
    assert(result.status === 0, result.stderr); count++;
  }
  if (filename.endsWith('.json')) {
    const config = JSON.parse(fs.readFileSync(filename, 'utf8'));
    for (const target of Object.values(config.usingComponents || {})) {
      const base = target.startsWith('/') ? path.join(mini, target.slice(1)) : path.resolve(path.dirname(filename), target);
      for (const ext of ['js','json','wxml','wxss']) assert(fs.existsSync(base + '.' + ext), '组件文件不存在：' + target + '.' + ext);
    }
  }
  if (filename.endsWith('.wxml')) {
    const template = fs.readFileSync(filename, 'utf8');
    for (const match of template.matchAll(/wx:(?:if|elif|for)="([^"]*)"/g)) {
      assert(match[1].includes('{{') && match[1].includes('}}'), '动态 WXML 指令缺少数据绑定：' + filename + ' ' + match[0]);
    }
  }
}
console.log('PASS: ' + app.pages.length + ' 个页面、组件路径、JSON 与 ' + count + ' 个 JavaScript 文件。此检查不替代微信编译器。');
