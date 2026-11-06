  let printBusy=false,printRevision=0;
  function printStatusButtons(){root.querySelectorAll('[data-action="print-book"],[data-action="download-book-pdf"],[data-action="download-press-pdf"],[data-action="download-level"],[data-action="download-level-package"],[data-action="print-level"],[data-action="confirm-level-print"],[data-action="select-print-level"]').forEach(node=>node.disabled=printBusy||submissionActive);refreshSubmissionButtons();}
  function printStatus(message){
    if(!root.querySelector('.ls-print-status')){const note=document.createElement('p');note.className='ls-print-status';note.setAttribute('role','status');(screen.querySelector('main')||screen).appendChild(note);}
    root.querySelectorAll('.ls-print-status').forEach(node=>node.textContent=message);
    printStatusButtons();
  }
  function removePrintBook(){document.getElementById('ls-print-book')?.remove();document.body.classList.remove('ls-printing');}
  async function printCurrentBook(scope='book',{volume=null,volumeCount=1,sample=true}={}){
    if(scope==='level'&&!volume&&printServicePlan(1).volumeCount>1){printStatus('请在书架选择要试印的分册。');return;}
    if(printBusy)return;const revision=++printRevision,id=state.book,profile={...state.profile},members=state.members.map(m=>({...m})),avatars={...state.avatars},catalog=listBooks(profile,members,browserCatalog),selected=volume?volume.books:scope==='level'?catalog:catalog.filter(b=>b.id===id),plan=shared.printPlan.createEditionPlan(selected,{scope,volumeNumber:volume?.number||1,volumeCount,sample});
    const check=()=>{if(revision!==printRevision||scope==='book'&&state.book!==id)throw Object.assign(Error('已取消试印。'),{name:'AbortError'});};
    let painter;printBusy=true;printStatus('正在准备 A5 单页校样…');removePrintBook();
    try{
      await preparePrintType(profile.name+selected.map(b=>b.title+b.pages.flat().join('')).join(''));check();painter=createEditionPainter(plan,{profile,members,avatars,check,dpi:180});const container=document.createElement('div');container.id='ls-print-book';container.setAttribute('aria-hidden','true');
      for(const leaf of plan.pages){const {canvas}=await painter.render(leaf,{bleed:false});check();const panel=document.createElement('section');panel.className='ls-paper-leaf';panel.dataset.kind=leaf.kind;panel.dataset.number=leaf.number;const image=document.createElement('img');image.src=canvas.toDataURL('image/jpeg',.96);image.alt=leaf.kind==='story'?selected.find(b=>b.id===leaf.bookId).pages[leaf.page].join(''):leaf.kind==='story-cover'?'故事封面：'+selected.find(b=>b.id===leaf.bookId).title:leaf.kind==='front'?'合集或故事封面':leaf.kind==='contents'?'故事目录':leaf.kind==='summary'?'识字小结':'合集阅读小结';panel.appendChild(image);container.appendChild(panel);canvas.width=canvas.height=1;await new Promise(r=>setTimeout(r,0));}
      check();document.body.appendChild(container);await Promise.all([...container.querySelectorAll('img')].map(i=>i.decode()));check();document.body.classList.add('ls-printing');window.addEventListener('afterprint',removePrintBook,{once:true});window.print();printStatus('A5阅读校样共'+plan.pageCount+'个内容页。正式生产请下载印厂包，由印厂安排正反面及装订。');
    }catch(error){removePrintBook();if(error.name!=='AbortError')printStatus((error.message||'打印准备失败。')+' 请重试打印。');}
    finally{painter?.dispose();printBusy=false;printStatusButtons();}
  }
