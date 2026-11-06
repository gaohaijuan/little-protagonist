'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../output/level3-book6-20261104'),html=path.join(root,'雪人住我家-插画校样.html');
const server=http.createServer(async(req,res)=>{
 try{
  if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(html));return;}
  if(req.method==='POST'&&['/save','/proof'].includes(req.url)){
   if(req.headers.origin!=='http://127.0.0.1:4196'){res.writeHead(403).end();return;}
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16000000){res.writeHead(413).end();return;}chunks.push(chunk)}
   const body=JSON.parse(Buffer.concat(chunks).toString());
   if(req.url==='/proof')fs.writeFileSync(path.join(root,'浏览器检查记录.json'),JSON.stringify(body,null,2));
   else{if(!/^(page-0[0-9]|contact-sheet)\.png$/.test(body.name)||!body.data.startsWith('data:image/png;base64,'))throw Error('Invalid output');fs.writeFileSync(path.join(root,body.name),Buffer.from(body.data.split(',')[1],'base64'));}
   res.end('ok');return;
  }res.writeHead(404).end();
 }catch(e){res.writeHead(400).end(e.message)}
});
server.listen(4196,'127.0.0.1',()=>console.log('Book 6 proof: http://127.0.0.1:4196/'));
