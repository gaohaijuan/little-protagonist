 'use strict';
const MM_TO_PT=72/25.4;
const A5_PAGE=Object.freeze({id:'a5-reading-page',widthMm:148,heightMm:210,bleedMm:3,innerMm:12,outerMm:8,dpi:300});
const A4_SPREAD=Object.freeze({id:'a4-cover-spread',widthMm:297,heightMm:210,foldMm:148.5,foldSafeMm:12,bleedMm:3,safeMm:8,dpi:300});
function leafLayout(number,profile=A5_PAGE){
  const left=number%2?profile.innerMm:profile.outerMm,right=number%2?profile.outerMm:profile.innerMm,w=profile.widthMm-left-right;
  return {left,right,width:w,center:left+w/2,innerEdge:number%2?'left':'right',art:{x:left,y:24,width:w,height:131},text:{x:left,y:162,width:w,height:29},footerY:199};
}
function createEditionPlan(books,{scope='level',volumeNumber=1,volumeCount=1,sample=true}={}){
  if(!Array.isArray(books)||!books.length||books.some(b=>!b.id||!Array.isArray(b.pages)||!b.pages.length))throw Error('Cannot print unfinished stories');
  if(scope==='book'&&books.length!==1)throw Error('Single-story edition requires one story');
  const collection=scope==='level',current=require('./current-edition'),isCurrent=collection&&current.matches(books);
  if(isCurrent)sample=false;
  const contentsCount=collection?(isCurrent?1:Math.ceil(books.length/12)):0;
  const pages=[{kind:'front',bookId:books[0].id}];
  for(let i=0;i<contentsCount;i++)pages.push({kind:'contents',part:i});
  const chapters=[],chapterCovers=isCurrent;
  for(const [index,b] of books.entries()){
    const startPage=pages.length+1,startFolio=pages.length-contentsCount;
    if(chapterCovers)pages.push({kind:'story-cover',bookId:b.id,chapter:b.number||index+1});
    chapters.push({bookId:b.id,title:b.title,number:b.number||index+1,startPage,startFolio,bodyStartPage:pages.length+1,storyPages:b.pages.length});
    b.pages.forEach((_,page)=>pages.push({kind:'story',bookId:b.id,page,chapter:b.number||index+1}));
    if(collection)pages.push({kind:'summary',bookId:b.id,chapter:b.number||index+1});
  }
  pages.push({kind:collection?'collection-back':'summary',bookId:books.at(-1).id,back:true});
  pages.forEach((p,i)=>{p.number=i+1;p.folio=i>0&&i<pages.length-1&&p.kind!=='contents'?i-contentsCount:null;});
  return {edition:isCurrent?current.EDITION:null,completeLevel:isCurrent,id:isCurrent?current.PRINT_ID:collection?'level-1'+(volumeCount>1?'-volume-'+volumeNumber:''):books[0].id,scope,collection,volumeNumber,volumeCount,books,chapters,pages,leaves:pages,pageCount:pages.length,readingContentPageCount:pages.length-2,coverFaceCount:Math.min(4,pages.length),interiorPageCount:Math.max(0,pages.length-4),storyCount:books.length,storyPageCount:books.reduce((n,b)=>n+b.pages.length,0),summaryCount:books.length,storyCoverCount:chapterCovers?books.length:0,contentsCount,blankCount:0,imposed:false,title:collection?'第1级阅读故事集'+(volumeCount>1?' · 第'+volumeNumber+'册':''):books[0].title,sample:collection&&sample,binding:'printer-imposition-required'};
}
function createBookPlan(book){return createEditionPlan([book],{scope:'book'});}
function pageBoxes(profile=A5_PAGE,{bleed=true}={}){
  const b=bleed?profile.bleedMm:0,w=profile.widthMm,h=profile.heightMm;
  return {media:[0,0,(w+b*2)*MM_TO_PT,(h+b*2)*MM_TO_PT],trim:[b*MM_TO_PT,b*MM_TO_PT,w*MM_TO_PT,h*MM_TO_PT],bleed:[0,0,(w+b*2)*MM_TO_PT,(h+b*2)*MM_TO_PT],widthPx:Math.round((w+b*2)/25.4*profile.dpi),heightPx:Math.round((h+b*2)/25.4*profile.dpi)};
}
function fileName(text){return String(text).replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').replace(/[. ]+$/,'').slice(0,100)||'绘本';}
function editionManifest(plan){
  return {version:5,level:1,scope:plan.collection?(plan.sample?'level-collection-sample':'level-collection-volume'):'single-story',volumeNumber:plan.volumeNumber,volumeCount:plan.volumeCount,bookCount:1,storyCount:plan.storyCount,completeLevel:!!plan.completeLevel,edition:plan.edition,title:plan.title,format:{...A5_PAGE},coverFormat:{...A4_SPREAD},pageCount:plan.pageCount,interiorPageCount:plan.interiorPageCount,readingContentPageCount:plan.readingContentPageCount,coverFaceCount:plan.coverFaceCount,storyPageCount:plan.storyPageCount,summaryPages:plan.summaryCount,storyCoverPages:plan.storyCoverCount||0,contentsPages:plan.contentsCount,chapters:plan.chapters,sequence:plan.pages.map(({kind,bookId,page,number,folio})=>({kind,bookId,page,number,folio})),blankPages:0,saddleStitch:{productionPageCount:Math.ceil(plan.pageCount/4)*4,necessaryAdditionalFaces:(4-plan.pageCount%4)%4,applied:false},imposed:false,files:{outer:'封面-外侧与内侧.pdf',interior:'书芯-A5按阅读顺序.pdf'},binding:'Printer must select binding for final page count and stock, arrange cover reverse, duplex imposition and any necessary blank sides. These are reading-order masters, not a ready-imposed booklet.',color:'RGB proof; printer must approve color conversion',conformance:'Not certified PDF/X'};
}
function levelManifest(books){return editionManifest(createEditionPlan(books));}
module.exports={A5_PAGE,A4_SPREAD,MM_TO_PT,leafLayout,createEditionPlan,createBookPlan,pageBoxes,fileName,editionManifest,levelManifest};
