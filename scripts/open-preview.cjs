const path = require('node:path');
const http = require('node:http');
const {spawn,spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
function check() {
  return new Promise(resolve => {
    const request = http.get('http://127.0.0.1:4173/', response => {
      let text = ''; response.setEncoding('utf8');
      response.on('data', chunk => {if(text.length < 2048) text += chunk;});
      response.on('end', () => resolve(response.statusCode === 200 && text.includes('小小主角')));
    });
    request.setTimeout(1000, () => request.destroy()); request.on('error', () => resolve(false));
  });
}
(async () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'build-preview.cjs')], {cwd:root,stdio:'inherit',windowsHide:true});
  if(result.status !== 0) throw new Error('本地版本构建失败');
  if(!await check()) {
    const server = spawn(process.execPath, [path.join(__dirname, 'serve-preview.cjs')], {cwd:root,detached:true,stdio:'ignore',windowsHide:true});
    server.unref();
    for(let attempt=0;attempt<12;attempt++) {if(await check()) break; await new Promise(resolve=>setTimeout(resolve,250));}
    if(!await check()) throw new Error('本地预览无法启动，请检查 4173 端口是否被占用。');
  }
  const open = spawn('rundll32.exe',['url.dll,FileProtocolHandler','http://127.0.0.1:4173'],{detached:true,stdio:'ignore',windowsHide:true});
  open.unref();
})().catch(error=>{console.error(error.message);process.exitCode=1;});
