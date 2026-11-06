  const exportLibraries=new Map();
  let downloadUrl=null;
  function loadExportLibrary(name,url){
    if(window[name])return Promise.resolve(window[name]);if(exportLibraries.has(name))return exportLibraries.get(name);
    const pending=new Promise((resolve,reject)=>{const script=document.createElement('script'),timer=setTimeout(()=>finish(Error('下载工具加载超时，请重试。')),20000);
      function finish(error){clearTimeout(timer);script.onload=script.onerror=null;if(error){script.remove();exportLibraries.delete(name);reject(error);}else resolve(window[name]);}
      script.onload=()=>finish(window[name]?null:Error('下载工具暂时无法打开。'));script.onerror=()=>finish(Error('下载工具暂时无法打开。'));script.src=url;document.head.appendChild(script);
    });exportLibraries.set(name,pending);return pending;
  }
  function clearDownload(){if(downloadUrl){URL.revokeObjectURL(downloadUrl);downloadUrl=null;}root.querySelectorAll('.ls-download-result').forEach(n=>n.remove());}
  function offerDownload(bytes,type,name){
    clearDownload();downloadUrl=URL.createObjectURL(new Blob([bytes],{type}));
    const holder=root.querySelector('.ls-print-controls')||root,box=document.createElement('p');box.className='ls-download-result';
    const link=document.createElement('a');link.href=downloadUrl;link.download=name;link.textContent='文件已准备好，点此保存：'+name;box.appendChild(link);holder.appendChild(box);link.click();
  }
  function exportWords(c,text,width){
    const lines=[];let line='';
    for(const letter of Array.from(text)){
      if(line&&c.measureText(line+letter).width>width){
        if(/[，。！？、：；）”]/.test(letter)&&Array.from(line).length>1){const chars=Array.from(line),last=chars.pop();lines.push(chars.join(''));line=last+letter;}
        else{lines.push(line);line=letter;}
      }else line+=letter;
    }if(line)lines.push(line);return lines;
  }
  function exportFont(c,size){c.font=size+'px "LittleStoryPrint","KaiTi","Kaiti SC","STKaiti","Microsoft YaHei","PingFang SC",sans-serif';}
  function exportText(c,text,x,y,width,size,lineHeight=size*1.6,align='left'){
    exportFont(c,size);c.textAlign=align;c.textBaseline='alphabetic';const lines=exportWords(c,String(text),width);
    lines.forEach((line,i)=>{const overhang=align==='left'?Math.max(0,c.measureText(line).actualBoundingBoxLeft||0):0;c.fillText(line,x+overhang,y+i*lineHeight);});return lines.length*lineHeight;
  }
  function containExportImage(c,image,x,y,width,height){const s=Math.min(width/image.width,height/image.height),w=image.width*s,h=image.height*s;c.drawImage(image,x+(width-w)/2,y+(height-h)/2,w,h);}
  async function readingProof(doc,check){
    const output=await window.PDFLib.PDFDocument.create(),mm=shared.printPlan.MM_TO_PT,pages=doc.getPages();
    const embedded=await output.embedPages(pages,pages.map(p=>{const t=p.getTrimBox();return {left:t.x,bottom:t.y,right:t.x+t.width,top:t.y+t.height};}));
    for(const image of embedded){check();output.addPage([148*mm,210*mm]).drawPage(image,{x:0,y:0,width:148*mm,height:210*mm});}
    output.setTitle(doc.getTitle());output.setSubject('A5 148x210mm reading order; one image and short text per story page; one shared cover; NOT press imposed; RGB proof; embedded Chinese vector text');return output;
  }
  async function editionOuter(doc,check){
    const {PDFDocument,rgb}=window.PDFLib,output=await PDFDocument.create(),mm=shared.printPlan.MM_TO_PT,specs=shared.printPlan.A4_SPREAD,boxes=shared.printPlan.pageBoxes(specs),n=doc.getPageCount();
    // Page 1 is the outside (back | front). Page 2 is the reverse
    // (inside front | inside back). The contents and last summary reuse it.
    for(const indices of [[n-1,0],[1,n-2]]){
      const source=indices.map(i=>doc.getPage(i)),embedded=await output.embedPages(source,source.map(p=>{const t=p.getTrimBox();return {left:t.x,bottom:t.y,right:t.x+t.width,top:t.y+t.height};}));check();
      const page=output.addPage([boxes.media[2],boxes.media[3]]);page.drawRectangle({x:0,y:0,width:page.getWidth(),height:page.getHeight(),color:rgb(251/255,246/255,233/255)});
      embedded.forEach((image,i)=>page.drawPage(image,{x:(3+.25+i*148.5)*mm,y:3*mm,width:148*mm,height:210*mm}));page.setTrimBox(...boxes.trim);page.setBleedBox(...boxes.bleed);
    }
    output.setTitle(doc.getTitle()+' · 封面正反两面');output.setSubject('A4 cover outside back|front; reverse inside-front|inside-back; trim 297x210mm, 3mm bleed; no assumed spine; RGB proof');return output;
  }
  async function downloadPrintFiles(scope,{collectOnly=false,format='proof',volume=null,volumeCount=1,sample=true}={}){
    if(scope==='level'&&!volume){
      const service=printServicePlan(1);
      sample=service.sample;
      if(service.volumes.length>1){
        if(!collectOnly){printStatus('请在书架选择要下载的分册。');return;}
        const files=[];
        for(const part of service.volumes){
          const result=await downloadPrintFiles(scope,{collectOnly:true,volume:part,volumeCount:service.volumeCount,sample:service.sample});
          if(!result?.length)return;files.push(...result);
        }
        return files;
      }
    }
    if(printBusy)return;const revision=++printRevision,profile={...state.profile},members=state.members.map(m=>({...m})),avatars={...state.avatars};
    const catalog=listBooks(profile,members,browserCatalog),selected=volume?volume.books:scope==='level'?catalog:catalog.filter(b=>b.id===state.book),plan=shared.printPlan.createEditionPlan(selected,{scope,volumeNumber:volume?.number||1,volumeCount,sample}),specs=shared.printPlan.A5_PAGE,manifest=shared.printPlan.editionManifest(plan);
    printBusy=true;printStatus('正在准备'+(plan.collection?'合集':'故事')+'与中文字体…');clearDownload();
    const check=()=>{if(revision!==printRevision)throw Object.assign(Error('已取消下载准备。'),{name:'AbortError'});};
    try{
      const {PDFDocument}=await loadExportLibrary('PDFLib','./vendor/pdf-lib/pdf-lib.min.js');await preparePrintType();check();
      const doc=await PDFDocument.create(),font=await embedPrintType(doc,profile.name+plan.title+selected.map(b=>b.title+b.pages.flat().join('')).join('')),boxes=shared.printPlan.pageBoxes(specs);
      doc.setTitle(profile.name+'的'+plan.title+(plan.collection?' · '+plan.storyCount+'个故事'+(plan.sample?'样册':''):''));doc.setCreator('小小主角 · 本机导出');
      const painter=createEditionPainter(plan,{profile,members,avatars,check,dpi:specs.dpi});
      try{for(const leaf of plan.pages){
        check();printStatus('正在生成'+(plan.collection?'合集':'故事')+'：'+leaf.number+' / '+plan.pageCount+' 页…');
        // Encode the final 300dpi illustration layer, keeping text vector-based
        // and leaving the original saved portrait and source artwork untouched.
        const {canvas,textRuns}=await painter.render(leaf,{vector:true});check();const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.90));if(!blob)throw Error('页面生成失败，请重试。');
        const image=await doc.embedJpg(await blob.arrayBuffer());canvas.width=canvas.height=1;
        const page=doc.addPage([boxes.media[2],boxes.media[3]]);page.drawImage(image,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});drawVectorText(page,textRuns,font);page.setTrimBox(...boxes.trim);page.setBleedBox(...boxes.bleed);
        await new Promise(r=>setTimeout(r,0));
      }}finally{painter.dispose();}
      const minimum=Math.min(...painter.quality.map(p=>p.backgroundEffectivePpi)),stats=shared.literacy.summarizeBooks(listBooks({...profile,name:'CHILD'},members,browserCatalog));
      const completeLayerAudit=painter.quality.every(p=>p.completeLayerAudit),knownSources=painter.quality.every(p=>p.layers.every(l=>l.nativeEffectivePpi!==null)),minimumMeasuredPpi=Math.min(minimum,...painter.quality.flatMap(p=>p.layers.map(l=>l.nativeEffectivePpi??l.encodedPixelPpi)));
      manifest.sourceQuality={pages:painter.quality,minimumBackgroundPpi:minimum,minimumMeasuredPpi,completeLayerAudit,native300Ppi:completeLayerAudit&&knownSources&&minimumMeasuredPpi>=300};manifest.literacy=stats.filter(s=>selected.some(b=>b.id===s.id));manifest.text='Embedded Chinese vector text';
      doc.setSubject('A5 reading order; one shared cover; NOT press imposed; 3mm bleed; embedded Chinese vector text; RGB proof; NOT certified PDF/X; minimum available background detail '+minimum+'ppi');
      const bytes=await doc.save();check();if(bytes.length>96*1024*1024)throw Error('文件超过96MiB，暂时无法在当前浏览器完成，请联系运营方。');
      const title=plan.title+(plan.collection?'（'+(plan.sample?'现有':'')+plan.storyCount+'个故事'+(plan.sample?'样册':'')+'）':'');
      if(collectOnly)return [{bytes,bookId:plan.id,title}];
      const frozen=await PDFDocument.load(bytes),stem=shared.printPlan.fileName(profile.name+'-'+title);
      if(format==='package'){
        const Zip=await loadExportLibrary('JSZip','./vendor/jszip/jszip.min.js'),zip=new Zip(),outer=await editionOuter(frozen,check),interior=await PDFDocument.create();
        const pages=await interior.copyPages(frozen,Array.from({length:plan.interiorPageCount},(_,i)=>i+2));pages.forEach(p=>interior.addPage(p));interior.setTitle(title+' · 内页');interior.setSubject(doc.getSubject());
        zip.file(manifest.files.outer,await outer.save());zip.file(manifest.files.interior,await interior.save());zip.file('清单.json',JSON.stringify(manifest,null,2));
        zip.file('印刷说明.txt','这是一册'+(plan.collection?'第1级阅读合集，含'+plan.storyCount+'个故事，'+(plan.completeLevel?'包含当前第1级全部15篇；仍需印厂实物打样。':'为历史样册。')+'':'单故事校样。')+'\n每个竖版A5成品页148×210mm，上图下短句，故事后保留识字小结；合集只有一套封面，目录及页码连续，不为小故事重复封面。\n书芯按阅读顺序，每个PDF页一个A5页；各边3mm出血，文件154×216mm。封面文件含正反两面：第1页左封底右封面，第2页左封面内侧（合集目录）右封底内侧（末篇小结）；单故事对应首末正文。书芯已扣除这两页，不能重复印。封面横向A4裁切297×210mm、文件303×216mm，两幅完整148mm封面居中放置，中间留0.5mm纸色间隔，不虚构胶装书脊。\n这些是阅读顺序原稿，不是印机拼版。请印厂按最终总页数、纸厚确定装订方式，核对封面正反面、书芯生产拼版、必要空白、爬移及裁切；需先实物打样。不得直接把阅读顺序的相邻页当作生产正反面拼版。\n本次不人为添加故事扉页或填充页。清单中的页数为文件内容页，不等于物理纸张张数。当前阅读文件'+plan.pageCount+'页；如选择骑马订，需要'+((4-plan.pageCount%4)%4)+'个必要补齐空白面（清单saddleStitch），尚未套用；其他工艺按印厂模板审稿确定。\n中文字为嵌入字体的矢量文字。插画有效ppi按实际取景记录，300dpi输出不能增加原图细节。RGB校样，未认证PDF/X。\n下载只在本机生成，不上传、不自动下印刷订单。');
        const result=await zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:3},streamFiles:true},check);check();if(result.length>96*1024*1024)throw Error('打印包超过96MiB，请下载合集PDF后联系运营方。');offerDownload(result,'application/zip',stem+'-印厂包.zip');
      }else{const proof=await readingProof(frozen,check);check();offerDownload(await proof.save(),'application/pdf',stem+'-A5阅读校样.pdf');}
      printStatus((plan.collection?'本册含 '+plan.storyCount+' 个故事，共用一套封面。':'本故事文件已准备好。')+' 共 '+plan.pageCount+' 个A5内容页（含封面封底），内页 '+plan.interiorPageCount+' 页；装订由印厂审稿确定。已测素材最低约 '+minimumMeasuredPpi+'ppi'+(!completeLayerAudit?'（部分旧场景尚未完成逐层检查）':!knownSources?'（部分旧头像原始细节未知）':'')+'，文件未上传。');
    }catch(error){if(error.name!=='AbortError')printStatus((error.message||'下载准备失败。')+' 可重试。');}
    finally{printBusy=false;printStatusButtons();}
  }
