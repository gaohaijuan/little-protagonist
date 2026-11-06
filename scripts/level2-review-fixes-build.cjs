'use strict';
const assert=require('node:assert/strict');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'Review repair anchor changed:'+a);return s.replace(a,b);};
function shared(name,s){
 if(name!=='layered-art')return s;
 s=once(s,"const actionFix=require('./action-fixes-art');","const actionFix=require('./action-fixes-art');\nconst reviewFix=require('./level2-review-fixes');");
 s=once(s,'Object.assign(BOOKS,actionFix.build(BOOKS));','Object.assign(BOOKS,actionFix.build(BOOKS));\nObject.assign(BOOKS,reviewFix.apply(BOOKS));');
 s=once(s,'function imageUrl(key){','function imageUrl(key){if(reviewFix.owns(key))return reviewFix.imageUrl(key);');
 s=once(s,'function baseAssetKeys(plan){return ','function baseAssetKeys(plan){return plan.reviewFix?reviewFix.assetKeys(plan):');
 s=once(s,'const plan=actionFix.resolvePlan(planFor(o.book,o.page,o),o),actor=','const plan=reviewFix.resolvePlan(actionFix.resolvePlan(planFor(o.book,o.page,o),o),o),actor=');
 s=once(s,'if(plan.level2Fourth)level2Fourth.beforeActor(c,plan,assets);','if(plan.reviewFix)reviewFix.beforeActor(c,plan,o);\n  if(plan.level2Fourth)level2Fourth.beforeActor(c,plan,assets);');
 s=once(s,'if(plan.level2Fourth)level2Fourth.afterActor(c,plan,o);','if(plan.level2Fourth)level2Fourth.afterActor(c,plan,o);\n  if(plan.reviewFix)reviewFix.afterActor(c,plan,o);');
 s=once(s,'if(canvas.dataset&&plan.level2Fourth)canvas.dataset.level2FourthProof=JSON.stringify(level2Fourth.proof(plan));','if(canvas.dataset&&plan.reviewFix)canvas.dataset.level2ReviewFixProof=JSON.stringify(reviewFix.proof(plan,o));\n  if(canvas.dataset&&plan.level2Fourth)canvas.dataset.level2FourthProof=JSON.stringify(level2Fourth.proof(plan));');
 return s;
}
function loader(s){
 s=once(s,'const personKey=identity(portrait.image);',"if(portrait===defaultPortrait&&plan?.storyPortrait){const variant=shared.level2ReviewFix.portrait(plan.storyPortrait);portrait={kind:'illustrated',image:await image(variant.url,'body'),metrics:variant.metrics};check();}\n          const storyVariant=portrait.kind==='illustrated'&&!!plan?.storyPortrait;\n          const personKey=identity(portrait.image);");
 s=once(s,'primary?scenes.dependencies(id):[pose.id]',"primary?(storyVariant&&!scenes.BOOKS[id]?.pages.some(p=>p.storyPortrait===plan.storyPortrait)?[]:scenes.dependencies(id)):[pose.id]");
 s=once(s,'return {...loaded,assets,preparedActors:actors,actorByPose,composer,model:',"return {...loaded,portraitKind:portraits.get('child')?.kind,assets,preparedActors:actors,actorByPose,composer,model:");
 return s;
}
function builder(s){
 s=once(s,"const entries={layeredArt:","const entries={level2ReviewFix:'level2-review-fixes',layeredArt:");
 s=once(s,"if(filename==='layered-art')source=extendLayered(source);","if(filename==='layered-art')source=extendLayered(source);\n source=require('./level2-review-fixes-build.cjs').shared(filename,source);");
 s=once(s,"let review=read('preview/priority-three-review.js');","const extra=JSON.parse(read('content/level2-review-fixes-poses.json'));for(const[id,p]of Object.entries(extra.poses)){assert.ok(!library.poses[id]);library.poses[id]=p;}\nlet review=read('preview/priority-three-review.js');");
 s=once(s,"read('preview/family-character-loader.js')","require('./level2-review-fixes-build.cjs').loader(read('preview/family-character-loader.js'))");
 return s;
}
module.exports={shared,loader,builder};
