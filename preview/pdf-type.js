  let printTypePromise,fullPrintTypePromise;
  async function readPrintType(file){
    const kit=await loadExportLibrary('fontkit','./vendor/pdf-lib/fontkit.umd.min.js'),response=await fetch('./vendor/pdf-lib/fonts/'+file);
    if(!response.ok)throw Error('打印字体暂时没有打开，请重试。');
    const bytes=new Uint8Array(await response.arrayBuffer()),characters=new Set(kit.create(bytes).characterSet),face=new FontFace('LittleStoryPrint',bytes,{weight:'400'});await face.load();document.fonts.add(face);return {kit,bytes,characters};
  }
  async function preparePrintType(text=''){
    if(!printTypePromise)printTypePromise=readPrintType('NotoSerifSC-Reading.ttf').catch(e=>{printTypePromise=null;throw e;});
    const type=await printTypePromise;if(Array.from(text).every(c=>type.characters.has(c.codePointAt(0))||/\s/.test(c)))return type;
    if(!fullPrintTypePromise)fullPrintTypePromise=readPrintType('NotoSerifSC-Regular.ttf').catch(e=>{fullPrintTypePromise=null;throw e;});return fullPrintTypePromise;
  }
  async function embedPrintType(doc,text){const type=await preparePrintType(text);doc.registerFontkit(type.kit);return doc.embedFont(type.bytes,{subset:false});}
  function installVectorText(c,canvas,widthMm,heightMm){
    const runs=[],original=c.fillText;
    c.fillText=function(text,x,y){
      const current=c.measureText(text),baseline=c.textBaseline;c.textBaseline='alphabetic';const alphabetic=c.measureText(text);c.textBaseline=baseline;
      const m=c.getTransform(),yy=y+alphabetic.actualBoundingBoxAscent-current.actualBoundingBoxAscent;
      runs.push({text:String(text),x:(m.a*x+m.c*yy+m.e)/canvas.width*widthMm,y:(m.b*x+m.d*yy+m.f)/canvas.height*heightMm,size:parseFloat(c.font)*Math.hypot(m.a,m.b)/canvas.width*widthMm,align:c.textAlign,color:c.fillStyle});
    };
    return {runs,restore(){c.fillText=original;}};
  }
  function drawVectorText(page,runs,font){
    const {rgb}=window.PDFLib,mm=shared.printPlan.MM_TO_PT,characters=new Set(font.getCharacterSet());
    for(const run of runs){
      const missing=Array.from(run.text).filter(c=>!characters.has(c.codePointAt(0)));if(missing.length)throw Error('打印字体暂不支持这些字符：'+[...new Set(missing)].join(''));
      const size=run.size*mm,width=font.widthOfTextAtSize(run.text,size),align=run.align;
      const x=run.x*mm-(align==='center'?width/2:align==='right'||align==='end'?width:0),hex=/^#([0-9a-f]{6})$/i.exec(run.color);
      const color=hex?rgb(parseInt(hex[1].slice(0,2),16)/255,parseInt(hex[1].slice(2,4),16)/255,parseInt(hex[1].slice(4,6),16)/255):rgb(.204,.275,.216);
      page.drawText(run.text,{x,y:page.getHeight()-run.y*mm,size,font,color});
    }
  }

