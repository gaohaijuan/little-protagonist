'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=__dirname,root=path.resolve(dir,'../../..');
const checks=JSON.parse(fs.readFileSync(path.join(dir,'validation.json'),'utf8'));
const pages=[['page-02-weather.png','黑云来了，','下雨了。'],['page-03-umbrella.png','小伞开了。','我在伞下。'],['page-07-share.png','我和小花，','都在伞下。']];
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>下雨了 · 3页插画样图</title><style>body{margin:0;background:#e8e7db;color:#344c3b;font:15px/1.85 sans-serif}main{max-width:740px;margin:auto;padding:20px 12px 40px}a{color:#365d43}h1{font:30px/1.5 KaiTi,STKaiti,serif;margin:14px 0}figure{position:relative;margin:24px 0;background:#fbf5e9;box-shadow:0 3px 18px #0002}img{display:block;width:100%;height:auto}figcaption{position:absolute;bottom:3.5%;left:8%;right:8%;text-align:center;font:clamp(21px,4vw,34px)/1.7 KaiTi,STKaiti,serif}figcaption p{margin:0}.note{background:#f8f5e9;padding:12px 16px;border-radius:10px;color:#62735a;font-size:13px}.label{color:#708163;font-size:12px}.label:before{content:'· '}</style></head><body><main><a href="../../">‹ 返回手机文稿</a><h1>《下雨了》<br>3页插画样图</h1><p>先看雨落下，再看孩子自己撑伞，最后走近小花，一起留在伞下。人物、伞和花园分层制作，两张人物画面复用同一个完整人物。</p><p class="note">当前使用项目默认人物确认画风，尚未放入任何孩子的真人照片。原生图片${checks.width}×${checks.height}像素；按A5铺满约${Math.floor(checks.backgroundNativePpiAtA5)}ppi，这是画风与合成校样，尚不是300ppi印刷成品。</p>${pages.map((p,i)=>`<p class="label">故事正文第${[2,3,7][i]}页</p><figure><img src="${p[0]}" width="${checks.width}" height="${checks.height}" alt="${p[1]+p[2]}" loading="${i?'lazy':'eager'}" decoding="async"><figcaption><p>${p[1]}</p><p>${p[2]}</p></figcaption></figure>`).join('')}<p>正式真人版继续保留原照片的五官和完整发型；本轮样图未替换线上成品绘本。</p><a href="../../">返回30篇手机文稿 ↑</a></main></body></html>`;
fs.writeFileSync(path.join(dir,'index.html'),html);
const renderer=path.join(root,'scripts/render-personalized-manuscript.cjs');
let code=fs.readFileSync(renderer,'utf8');
const needle='<a class="quick" href="#settings">修改孩子和家人 ↓</a>';
if(!code.includes('href="illustration-samples/rain-v1/"')){assert.ok(code.includes(needle));code=code.replace(needle,needle+'<a class="quick" href="illustration-samples/rain-v1/">插画样图 ↓</a>');fs.writeFileSync(renderer,code);}
const dest=path.join(root,'sites/manuscript-review/dist/illustration-samples/rain-v1');fs.mkdirSync(dest,{recursive:true});
for(const file of ['index.html',...pages.map(p=>p[0])])fs.copyFileSync(path.join(dir,file),path.join(dest,file));
console.log(JSON.stringify({copied:4,destination:dest}));
