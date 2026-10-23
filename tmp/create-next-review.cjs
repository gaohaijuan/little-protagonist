const fs=require('node:fs');
const src=fs.readFileSync('preview/original-style-five-review.js','utf8');
let header=src.slice(0,src.indexOf('const canvas='));
header=header.replace('FIVE_MANUSCRIPT','SIX_MANUSCRIPT').replace('FIVE_POSES','SIX_POSES').replace('original-style-five/','books-06-10/').replaceAll('前5本 · 原版画风细化样稿','第6—10本 · 插画样稿').replace('<div class="ff-compare">','<div class="ff-compare" hidden>').replace('原生横图1672×941，山景1254×1254','保留图片生成的原生素材尺寸').replace('沿用原版画风、动作、取景和 A5 图文版式。','沿用既定画风、统一人物比例和 A5 图文版式。').replace('细化稿为图片生成功能直接编辑所得，','新插画由图片生成功能直接制作，').replace('‹ 返回书架','‹ 返回书架').replace('<h1>第6—10本','<p><a href="./?view=first-five">查看第1—5本</a></p><h1>第6—10本');
const engine=src.slice(src.indexOf('async function render(){'),src.indexOf('function openBook(')).replaceAll('__fiveProof','__sixProof').replaceAll('fiveReady','sixReady');
fs.writeFileSync('preview/books-06-10-review.js',header+'\n/* SIX_SCENES */\n'+engine);
