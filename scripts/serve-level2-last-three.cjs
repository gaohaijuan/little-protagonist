'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../preview');
const server=http.createServer((request,response)=>{
 if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
 let pathname;try{pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);}catch{response.writeHead(400);response.end();return;}
 const isPage=['/','/index.html','/level2-last-three.html'].includes(pathname);
 const isAsset=/^\/(?:vendor\/(?:mediapipe|pdf-lib|jszip)|models|art\/(?:flower|family|intro|sequence))\/[a-zA-Z0-9_./-]+$/.test(pathname)&&!pathname.includes('..');
 const filename=isPage?path.join(root,'level2-last-three.html'):path.resolve(root,'.'+pathname);
 if(!filename.startsWith(root+path.sep)||(!isPage&&!isAsset)||!fs.existsSync(filename)||!fs.statSync(filename).isFile()){response.writeHead(404);response.end();return;}
 const types={'.html':'text/html; charset=utf-8','.mjs':'application/javascript','.js':'application/javascript','.wasm':'application/wasm','.json':'application/json','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
 response.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':isPage?'no-store':'public,max-age=3600','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});
 if(request.method==='HEAD'){response.end();return;}const stream=fs.createReadStream(filename);stream.on('error',()=>response.destroy());stream.pipe(response);
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Port 4175 is already in use.':e.message);process.exitCode=1;});
server.listen(4175,'127.0.0.1',()=>console.log('第二级最后三本独立校样: http://127.0.0.1:4175/?view=level2-last-three'));
