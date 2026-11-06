'use strict';
// Isolated production proof: shared source files are read, never rewritten.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function replaceOnce(source,needle,replacement){assert.equal(source.split(needle).length,2,'Shared integration anchor changed: '+needle);return source.replace(needle,replacement);}
function extendLayered(source){
 source=replaceOnce(source,"const actionFix=require('./action-fixes-art');","const actionFix=require('./action-fixes-art');\nconst level2Last=require('./level2-last-three-art');");
 source=replaceOnce(source,'Object.assign(BOOKS,level2Fourth.BOOKS);','Object.assign(BOOKS,level2Fourth.BOOKS);\nObject.assign(BOOKS,level2Last.BOOKS);');
 source=replaceOnce(source,'function imageUrl(key){','function imageUrl(key){if(level2Last.owns(key))return level2Last.imageUrl(key);');
 source=replaceOnce(source,'if(level2Fourth.BOOKS[id])return level2Fourth.cover(id);','if(level2Last.BOOKS[id])return level2Last.cover(id);\n    if(level2Fourth.BOOKS[id])return level2Fourth.cover(id);');
 source=replaceOnce(source,'function baseAssetKeys(plan){return ','function baseAssetKeys(plan){return plan.level2Last?level2Last.assetKeys(plan):');
 source=replaceOnce(source,'if(plan.level2Fourth)level2Fourth.beforeActor(c,plan,assets);','if(plan.level2Last)level2Last.beforeActor(c,plan,assets);\n  if(plan.level2Fourth)level2Fourth.beforeActor(c,plan,assets);');
 source=replaceOnce(source,'if(plan.level2Fourth)level2Fourth.afterActor(c,plan,o);','if(plan.level2Last)level2Last.afterActor(c,plan,o);\n  if(plan.level2Fourth)level2Fourth.afterActor(c,plan,o);');
 source=replaceOnce(source,'if(canvas.dataset&&plan.level2Fourth)canvas.dataset.level2FourthProof=JSON.stringify(level2Fourth.proof(plan));','if(canvas.dataset&&plan.level2Last)canvas.dataset.level2LastProof=JSON.stringify(level2Last.proof(plan));\n  if(canvas.dataset&&plan.level2Fourth)canvas.dataset.level2FourthProof=JSON.stringify(level2Fourth.proof(plan));');
 return source;
}
const entries={layeredArt:'layered-art',familyArt:'family-art',family:'family',profile:'profile',characterRig:'character-rig',characterSession:'character-session',revisedEdition:'revised-edition',level2LastManuscripts:'level2-last-three-manuscripts'};
const sources=new Map();
function collect(filename){
 if(sources.has(filename))return;
 let source=read('miniprogram/lib/'+filename+'.js');
 if(filename==='layered-art')source=extendLayered(source);
 sources.set(filename,source);
 for(const m of source.matchAll(/require\(['"]\.\/([a-zA-Z0-9_-]+)(?:\.js)?['"]\)/g))collect(m[1]);
}
Object.values(entries).forEach(collect);
const factories=[...sources].map(([name,source])=>JSON.stringify(name)+':function(module,exports,require){\n'+source+'\n}').join(',\n');
const shared='const shared=(()=>{const factories={'+factories+'};const cache={};function load(name){if(Object.prototype.hasOwnProperty.call(cache,name))return cache[name];if(!factories[name])throw Error("Unknown shared module: "+name);const module={exports:{}};cache[name]=module.exports;factories[name](module,module.exports,p=>load(p.replace(/^\\.\\//,"").replace(/\\.js$/,"")));return cache[name]=module.exports;}return Object.fromEntries(Object.entries('+JSON.stringify(entries)+').map(([name,file])=>[name,load(file)]));})();';
const library=JSON.parse(read('content/child-pose-library.json'));
const registration=JSON.parse(read('content/level2-last-three-pose-registration.json'));
assert.ok(registration.poses&&typeof registration.poses==='object','Separate pose registration needs {poses:{...}}');
for(const [id,pose]of Object.entries(registration.poses)){assert.equal(id,pose.id);assert.ok(!library.poses[id],'Independent action must not overwrite existing pose '+id);library.poses[id]=pose;}
let review=read('preview/priority-three-review.js');
review=replaceOnce(review,"const twelve=new URLSearchParams(location.search).get('view')==='level2-first-twelve';","const last=true;\n const twelve=false;");
review=replaceOnce(review,'level2=twelve||nine||six||','level2=last||twelve||nine||six||');
review=replaceOnce(review,'edition=twelve?shared.level2TwelveManuscripts:','edition=last?shared.level2LastManuscripts:twelve?shared.level2TwelveManuscripts:');
review=replaceOnce(review,'if(twelve){root.querySelector(\'h1\')','if(last){root.querySelector(\'h1\').textContent=\'第二级 · 最后三本绘本校样\';root.querySelector(\'h1\').nextElementSibling.textContent=\'《我跳过去了》《小火车》《小鱼的新家》，第二级第13—15本，总篇号28—30。22页正文原文保留，每篇独立封面和识字小结，竖版A5图文同页。\';}\n else if(twelve){root.querySelector(\'h1\')');
review=replaceOnce(review,"(twelve?'27':nine?'24':six?'21':'18')","(last?'30':twelve?'27':nine?'24':six?'21':'18')");
review=replaceOnce(review,'/* PRIORITY_POSES */',JSON.stringify(library));
review=replaceOnce(review,'<a href="./">‹ 返回原书架</a>','<a href="http://127.0.0.1:4173/">‹ 返回原书架</a>');
review=replaceOnce(review,'当前显示原有默认人物；在原书架保存小主角头像后，此页会沿用。','此独立校样显示统一默认人物；原书架与此页端口不同，头像资料不会自动跨端口读取。');
const bundle=shared+'\n'+read('preview/family-art-loader.js')+'\n'+read('preview/family-character-loader.js')+'\n'+review;
new vm.Script(bundle,{filename:'level2-last-three-bundle.js'});
const template=read('preview/template.html').replace('<title>小小主角 · 本地开发版</title>','<title>第二级最后三本 · 小小主角</title>');
const html=template.replace('/* BUNDLE */',bundle.replace(/<\/script/gi,'<\\/script'));
fs.writeFileSync(path.join(root,'preview/level2-last-three.html'),html,'utf8');
console.log('Built independent proof: preview/level2-last-three.html ('+sources.size+' shared modules; '+Object.keys(registration.poses).length+' separate poses).');
