  // Shared physical layout for downloads and browser proofs.
  function paintPanelSummary(c,stats,profile,id,art,layout){
    const x=layout.left,w=layout.width,center=layout.center;
    c.fillStyle='#344637';exportText(c,'识字小结',center,31,w,9,13,'center');
    containExportImage(c,art,x,40,33,29);
    exportText(c,profile.name+'的阅读足迹',x+40,48,w-40,4.5,6.5);
    exportText(c,'故事读完了，这些字我见过啦。',x+40,66,w-40,3.4,5.3);
    c.strokeStyle='#d0c6a9';c.lineWidth=.2;c.beginPath();c.moveTo(x,75);c.lineTo(x+w,75);c.moveTo(x,100);c.lineTo(x+w,100);c.stroke();
    [['本书用字',stats.count],['新出现',stats.newCount],['累计接触',stats.cumulativeCount]].forEach(([label,value],i)=>{
      const mid=x+w*(i+.5)/3;exportText(c,label,mid,82,w/3,3.7,5,'center');exportText(c,value+' 字',mid,94,w/3,7,10,'center');
    });
    exportText(c,'本书汉字',x,110,w,4.2);exportText(c,'下划线为本册新字，可圈出还想练习的字',x,117,w,3,4.5);
    let cell=10,gap=1.4,columns;
    for(;cell>=5;cell-=.25){columns=Math.floor((w+gap)/(cell+gap));if(Math.ceil(stats.characters.length/columns)*(cell+gap)-gap<=44)break;}
    if(cell<5)throw Error('本书字表超出结尾页容量，需调整版式后再导出。');
    const fresh=new Set(stats.newCharacters);exportFont(c,cell*.78);c.textAlign='center';c.textBaseline='middle';
    stats.characters.forEach((letter,i)=>{
      const xx=x+i%columns*(cell+gap),yy=122+Math.floor(i/columns)*(cell+gap);
      c.strokeStyle='#d0c6a9';c.strokeRect(xx,yy,cell,cell);c.fillText(letter,xx+cell/2,yy+cell*.48);
      if(fresh.has(letter)){c.strokeStyle='#9d7b41';c.lineWidth=.3;c.beginPath();c.moveTo(xx+cell*.2,yy+cell*.84);c.lineTo(xx+cell*.8,yy+cell*.84);c.stroke();}
    });
    if(id==='intro-complete')exportText(c,'姓名汉字另计：'+shared.literacy.uniqueHan(profile.name).join('、'),x,173,w,3,4.4);
    exportText(c,'阅读日期：________　能独立认读：____ / '+stats.count+' 字',x,183,w,3.4,5);
    exportText(c,'正文去重，含辅助字，不计书名与姓名；从第1本累计。',x,190,w,2.6,4);
    exportText(c,'重读不叠加。读过不代表掌握。',x,194,w,2.6,4);
  }
  function paintContents(c,plan,leaf,layout){
    const {left:x,width:w,center}=layout,chapters=plan.chapters.slice(leaf.part*(plan.completeLevel?15:12),(leaf.part+1)*(plan.completeLevel?15:12));
    c.fillStyle='#344637';exportText(c,'故事目录',center,31,w,8.5,12,'center');
    exportText(c,(plan.sample?'第1级 · 第'+plan.volumeNumber+'册样册 · ':'第1级 · 第'+plan.volumeNumber+'册 · ')+plan.storyCount+' 个故事',center,44,w,3.4,5,'center');
    const step=chapters.length<=8?17:chapters.length>12?7.6:10;
    chapters.forEach((chapter,i)=>{const y=64+i*step;exportText(c,String(chapter.number).padStart(2,'0'),x,y,12,3.8);let size=4.2;exportFont(c,size);size=Math.min(size,size*(w-28)/c.measureText(chapter.title).width);exportText(c,chapter.title,x+14,y,w-28,size,6);exportText(c,String(chapter.startFolio),x+w,y,12,4.2,6,'right');c.strokeStyle='#ded4ba';c.lineWidth=.15;c.beginPath();c.moveTo(x,y+5);c.lineTo(x+w,y+5);c.stroke();});
    exportText(c,'每个故事后都有识字小结。',x,183,w,3.3,5);exportText(c,plan.sample?'这是现有故事样册，完整第1级仍在陆续制作。':'本级共'+plan.volumeCount+'册，这是第'+plan.volumeNumber+'册。',x,190,w,3,4.5);
  }
  function paintCollectionBack(c,plan,profile,stats,art,layout){
    const {left:x,width:w,center}=layout;
    c.fillStyle='#344637';exportText(c,'故事读完啦',center,31,w,8,12,'center');
    containExportImage(c,art,x,42,w,61);
    exportText(c,profile.name+'的阅读足迹',center,115,w,4.4,6,'center');
    [[plan.storyCount+' 个','小故事'],[stats.cumulativeCount+' 字','累计接触'],[plan.storyPageCount+' 页','故事正文']].forEach(([value,label],i)=>{const mid=x+w*(i+.5)/3;exportText(c,value,mid,133,w/3,6,8,'center');exportText(c,label,mid,144,w/3,3.6,5,'center');});
    exportText(c,'每一页，都有故事里的你。',center,163,w,4.3,6,'center');
    exportText(c,'统计按正文汉字去重，姓名另计；重读不叠加。',x,180,w,2.9,4.5);exportText(c,'读过不代表掌握，各故事小结可记录实际认读情况。',x,187,w,2.9,4.5);exportText(c,(plan.sample?'第1级 · 第'+plan.volumeNumber+'册样册 · ':'第1级 · 第'+plan.volumeNumber+'册 · ')+plan.storyCount+'个故事',center,199,w,3,4,'center');
  }
  function createPrintPainter(selectedBook,{profile,members,avatars,check=()=>{},dpi=300,plan=shared.printPlan.createBookPlan(selectedBook)}){
    const specs={...shared.printPlan.A5_PAGE,dpi},loader=artLoaderFor(selectedBook.id,avatars,members),layout=shared.printPlan.leafLayout(1,specs);
    const artwork=selectedBook.id==='family'?shared.familyArt:shared.layeredArt;
    const allStats=shared.literacy.summarizeBooks(listBooks({...profile,name:'CHILD'},members,browserCatalog)),stats=allStats.find(s=>s.id===selectedBook.id),family=getBook('family',profile,members);
    const quality=[];let coverArt=null;loader.retry();
    async function illustration(entry,cover=false){
      check();const width=cover?1000:1400,height=cover?760:Math.round(1400*layout.art.height/layout.art.width),canvas=document.createElement('canvas'),physicalWidth=layout.width;
      const options={book:selectedBook.id,page:entry.page||0,cover,artPanel:!cover,width,height,pixelRatio:dpi/25.4*physicalWidth/width,avatars,members,familyScene:family.scenes?.[entry.page||0],reserveText:selectedBook.id==='intro-complete'&&!cover};
      const loaded=await loader.ensure(options.page,options);check();
      const context=canvas.getContext('2d'),original=context.drawImage;let sourceScale=null;const portraits=[],layers=[];
      context.drawImage=function(image,...args){
        const m=this.getTransform(),sw=args.length===8?args[2]:image.naturalWidth||image.width,sh=args.length===8?args[3]:image.naturalHeight||image.height,dw=args.length===8?args[6]:args.length===4?args[2]:sw,dh=args.length===8?args[7]:args.length===4?args[3]:sh;
        const scale={x:Math.abs(Math.hypot(m.a,m.b)*dw/sw),y:Math.abs(Math.hypot(m.c,m.d)*dh/sh)};
        if(!sourceScale)sourceScale=scale;
        const density=canvas.width/(physicalWidth/25.4),outputScale=Math.max(scale.x,scale.y);
        const compositeSources=familyCharacters.sourcesOf(image);
        if(!compositeSources){const key=Object.keys(loaded.assets).find(key=>loaded.assets[key]===image);layers.push({kind:key===shared.layeredArt.planFor(options.book,options.page,options)?.background||image===loaded.assets[loaded.manifest?.background||'courtyard']?'background':'prop',asset:key||'unknown',encodedPixelPpi:Math.floor(density/outputScale),nativeEffectivePpi:key?Math.floor(density/outputScale):null});}
        for(const source of compositeSources||[]){
          const encodedPixelPpi=density/(outputScale*source.scale),portrait=source.portrait,resolution=portrait?.metrics?.resolution,bounds=portrait?.metrics?.bounds;
          const factor=resolution?.nativeHeadPixels&&bounds?Math.min(1,resolution.nativeHeadPixels.width/(bounds.right-bounds.left),resolution.nativeHeadPixels.height/(bounds.bottom-bounds.top)):portrait?null:1;
          layers.push({kind:source.kind,encodedPixelPpi:Math.floor(encodedPixelPpi),nativeEffectivePpi:factor===null?null:Math.floor(encodedPixelPpi*factor)});
          if(portrait)portraits.push({characterId:Object.keys(avatars).find(id=>avatars[id].image===portrait.image),encodedPixelPpi:Math.floor(encodedPixelPpi),nativeEffectivePpi:factor===null?null:Math.floor(encodedPixelPpi*factor),sourceKnown:factor!==null});
        }
        for(const [id,actor] of Object.entries(avatars)){
          if(actor.kind!=='cutout'||!actor.image||window.LittlePhotoTone.originalOf(image)!==actor.image&&image!==actor.image)continue;
          const density=canvas.width/(physicalWidth/25.4),outputPpi=density/Math.max(scale.x,scale.y),resolution=actor.metrics?.resolution,bounds=actor.metrics?.bounds;
          const factor=resolution?.nativeHeadPixels&&bounds?Math.min(1,resolution.nativeHeadPixels.width/(bounds.right-bounds.left),resolution.nativeHeadPixels.height/(bounds.bottom-bounds.top)):null;
          portraits.push({characterId:id,encodedPixelPpi:Math.round(outputPpi),nativeEffectivePpi:factor===null?null:Math.round(outputPpi*factor),sourceKnown:factor!==null,note:factor===null?'Original photo detail is unknown for this earlier saved cutout.':''});
        }
        return original.call(this,image,...args);
      };
      try{if(!drawIllustration(canvas,options,loaded,artwork))throw Error('《'+selectedBook.title+'》有一页插画未能准备好。');}finally{context.drawImage=original;}
      if(sourceScale)quality.push({kind:cover?'cover':'story',page:options.page+1,backgroundEffectivePpi:Math.floor(canvas.width/(physicalWidth/25.4)/Math.max(sourceScale.x,sourceScale.y)),portraits,layers,completeLayerAudit:true,characterPipeline:'composed-actor-v1'});
      return canvas;
    }
    async function render(leaf,{bleed=true,vector=false}={}){
      check();const boxes=shared.printPlan.pageBoxes(specs,{bleed}),b=bleed?specs.bleedMm:0,canvas=document.createElement('canvas');canvas.width=boxes.widthPx;canvas.height=boxes.heightPx;
      const c=canvas.getContext('2d'),l=shared.printPlan.leafLayout(leaf.number,specs);c.fillStyle='#fbf6e9';c.fillRect(0,0,canvas.width,canvas.height);c.scale(canvas.width/(148+2*b),canvas.height/(210+2*b));c.translate(b,b);c.fillStyle='#344637';
      const capture=vector?installVectorText(c,canvas,148+2*b,210+2*b):null;
      try{
        if(leaf.kind==='front'||leaf.kind==='story-cover'){
          if(!coverArt)coverArt=await illustration({page:0},true);
          exportText(c,'小小主角 · 第1级',l.center,20,l.width,3.5,5,'center');
          const chapterCover=leaf.kind==='story-cover';
          const lines=chapterCover?[selectedBook.title]:plan.collection?['第1级','阅读故事集'+(plan.volumeCount>1?' · 第'+plan.volumeNumber+'册':'')]:selectedBook.id==='intro-complete'?['你好，','我是'+profile.name]:[selectedBook.title];
          let size=9;exportFont(c,size);size=Math.min(size,size*l.width/Math.max(...lines.map(line=>c.measureText(line).width)));
          lines.forEach((line,i)=>exportText(c,line,l.center,38+i*size*1.45,l.width,size,size*1.45,'center'));
          containExportImage(c,coverArt,l.left,66,l.width,103);
          exportText(c,chapterCover?'第1级 · 第'+leaf.chapter+'篇':plan.collection?profile.name+'的专属故事集':'成长绘本',l.center,181,l.width,4,6,'center');
          exportText(c,chapterCover?'小小主角 · 我的故事':plan.collection?(plan.sample?'现有 ':'')+plan.storyCount+' 个故事'+(plan.sample?' · 合集样册':''):'第1级 · '+selectedBook.title,l.center,195,l.width,3,4,'center');
        }else if(leaf.kind==='contents')paintContents(c,plan,leaf,l);
        else if(leaf.kind==='collection-back'){
          if(!coverArt)coverArt=await illustration({page:0},true);
          const last=allStats.find(s=>s.id===plan.books.at(-1).id);paintCollectionBack(c,plan,profile,last,coverArt,l);
        }else if(leaf.kind==='summary'){
          if(!coverArt)coverArt=await illustration({page:0},true);
          paintPanelSummary(c,stats,profile,selectedBook.id,coverArt,l);exportText(c,selectedBook.title,l.center,13,l.width,3.2,5,'center');
        }else if(leaf.kind==='story'){
          const art=await illustration(leaf),a=l.art;c.drawImage(art,a.x,a.y,a.width,a.height);art.width=art.height=1;
          exportText(c,(leaf.page===0&&plan.collection?String(leaf.chapter).padStart(2,'0')+' · ':'')+selectedBook.title,l.center,14,l.width,leaf.page===0?4.2:3.2,5,'center');
          const t=l.text;let size=9,lines,step,height;
          do{exportFont(c,size);lines=selectedBook.pages[leaf.page].flatMap(line=>exportWords(c,line,t.width));step=size*1.55;height=lines.length*step;if(height<=t.height)break;size-=.2;}while(size>=5.5);
          if(height>t.height)throw Error('正文超出A5安全区，请调整排版后导出。');
          c.textAlign='center';c.textBaseline='alphabetic';let y=t.y+(t.height-height)/2+size;lines.forEach(line=>{c.fillText(line,l.center,y);y+=step;});
        }
        if(leaf.folio!==null)exportText(c,String(leaf.folio),l.center,l.footerY,l.width,3,4,'center');
      }finally{capture?.restore();}
      check();return {canvas,boxes,textRuns:capture?.runs||[]};
    }
    return {render,quality,stats,dispose(){if(coverArt)coverArt.width=coverArt.height=1;}};
  }
  function createEditionPainter(plan,options){
    let active=null,painter=null;const quality=[];
    function dispose(){if(painter){quality.push(...painter.quality.map(q=>({...q,bookId:active})));painter.dispose();painter=null;}}
    return {quality,async render(leaf,renderOptions){const id=leaf.bookId||plan.books[0].id;if(id!==active||!painter){dispose();active=id;painter=createPrintPainter(plan.books.find(b=>b.id===id),{...options,plan});}return painter.render(leaf,renderOptions);},dispose};
  }
