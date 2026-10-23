  let selectedPrintLevel = 0;
  const printToolsEnabled = new URLSearchParams(location.search).get('printTools') === '1';
  function printServicePlan(level = selectedPrintLevel || 1) {
    return shared.printService.createServicePlan(listBooks(state.profile,state.members,browserCatalog),level);
  }
  function printServiceEntry() {
    return '<section class="ls-print-entry"><span class="ls-kicker">把自己的故事，带回家</span><h2>小主角的纸质绘本打印服务</h2><p>按级别选择，把故事装订成孩子的书。</p><button type="button" class="ls-primary ls-start" data-action="print-service">选择打印级别 '+icon('arrow-right')+'</button></section>';
  }
  function printService() {
    const plan = selectedPrintLevel ? printServicePlan() : null;
    const selection = '<div class="ls-print-levels" aria-label="打印级别">'+Array.from({length:10},(_,i)=>{
      const level=i+1,p=printServicePlan(level);
      return '<button type="button" class="ls-print-level-option" data-action="select-print-level" data-level="'+level+'" aria-pressed="'+(selectedPrintLevel===level)+'"><strong>第'+level+'级打印服务</strong><small>'+(p.available?'现有 '+p.storyCount+' 个故事 · '+p.volumeCount+' 册样册':'筹备中')+'</small></button>';
    }).join('')+'</div>';
    let details = '';
    if(plan){
      details = '<section id="ls-print-checklist" class="ls-print-checklist" aria-label="打印清单"><p class="ls-kicker">第'+plan.level+'级'+(plan.available?' · 本次打印清单':'')+'</p>';
      if(!plan.available)details+='<h2>故事正在准备中</h2><p>这一等级尚未开放打印，准备好后再来选吧。</p>';
      else {
        details+='<h2>'+escape(state.profile.name)+'的第'+plan.level+'级'+(plan.sample?'绘本样册':'阅读故事集')+'</h2><dl class="ls-print-totals"><div><dt>本次故事</dt><dd>'+plan.storyCount+'<small> 个</small></dd></div><div><dt>装订成书</dt><dd>'+plan.volumeCount+'<small> 册 / 套</small></dd></div></dl>';
        if(plan.sample)details+='<p class="ls-service-sample">当前只有 '+plan.storyCount+' 个故事完成插画，本次打印 '+plan.volumeCount+' 册样册，不是完整第'+plan.level+'级。</p>';
        details+=plan.volumes.map(volume=>'<section class="ls-print-volume"><h3>第'+volume.number+'册 · '+volume.storyCount+'个故事</h3><ol start="'+volume.firstStory+'">'+volume.books.map(b=>'<li>'+escape(b.title)+'</li>').join('')+'</ol></section>').join('');
        details+='<ul class="ls-print-includes"><li>竖版 A5，左右翻页，每页有图和短句。</li><li>使用当前小主角头像、名字和家人设置。</li><li>每册独立封面、目录；每个故事后有识字小结。</li></ul><p class="ls-print-rule">完整每级计划 30 个故事，每 10 个装订一册，共 3 册。这里只按已完成内容打印。</p>';
        details+='<div class="ls-print-controls">'+(operationsEnabled?'<button type="button" class="ls-primary ls-start" data-action="confirm-level-print">确认打印</button><button type="button" class="ls-secondary" data-action="retry-print-submission" '+(pendingSubmission?'':'hidden')+'>重试提交</button><button type="button" class="ls-back ls-browse" data-operations-orders>我的打印订单</button><p class="ls-print-hint">下一步填写份数和配送信息；确认后提交给运营方，价格与制作安排由运营方确认。</p>':'<button type="button" class="ls-primary ls-start" disabled>打印服务暂未开放</button><p class="ls-print-hint">此试用链接尚未连接打印收件后台，暂不能提交打印需求。</p>')+'<p class="ls-print-status" role="status" aria-live="polite"></p></div>';
      }
      details+='</section>';
    }
    return topbar('home','书架')+'<main class="ls-print-service"><p class="ls-kicker">小小主角 · 纸质阅读</p><h1>小主角的纸质绘本打印服务</h1><p class="ls-description">选一个级别，先看看这次会收到哪些故事。</p>'+selection+details+'</main>'+nav('');
  }
