'use strict';
const assets=require('./priority-three-assets'),{CHILD_MODEL}=require('./character-rig');
const sole={'stand-wave':1180,'hands-flower-open':1174,'barefoot-stand':1130,'barefoot-step':1147,'crouch-book':959,'carry-play':1175};
const scene=(background,pose,x,ground,scale,beat,extra={})=>({background,pose,placement:pose?{x,y:ground-sole[pose]/CHILD_MODEL.sourcePixelsPerUnit*scale,scale}:null,camera:{x:0,y:0,width:1000,height:1000},world:{width:1000,height:1000},priorityThree:true,beat,...extra});
const BOOKS={
 'snow-revision':{pages:[
  scene('snow-window','stand-wave',385,960,.69,'snow-outside-window',{snow:7,window:true}),
  scene('snow-air',null,0,0,1,'four-snowflakes',{snow:4}),
  scene('snow-air',null,0,0,1,'eight-snowflakes',{snow:8}),
  scene('snow-grass',null,0,0,1,'eleven-snowflakes-over-grass',{snow:11,closeGrass:true}),
  scene('snow-grass',null,0,0,1,'snow-disappears-in-grass')
 ]},
 'insect-revision':{pages:[
  scene('insect-stone','barefoot-stand',735,955,.64,'bug-on-stone',{bug:{x:235,ground:630,width:46}}),
  scene('insect-stone','barefoot-step',590,955,.64,'approach-the-stone',{bug:{x:382,ground:684,width:42}}),
  scene('insect-ground',null,0,0,1,'stone-is-empty'),
  scene('insect-empty-close',null,0,0,1,'where-is-the-bug'),
  scene('insect-ground','barefoot-stand',700,955,.78,'bug-revealed-on-foot',{bugOnFoot:true}),
  scene('insect-stone','barefoot-step',660,955,.68,'take-bug-along',{bugOnFoot:true})
 ]},
 'ball-revision':{pages:[
  scene('revision-room','stand-wave',410,950,.70,'want-to-find-the-ball'),
  scene('revision-wagon-overlook','crouch-book',230,948,.68,'look-inside-empty-cart',{wagon:{x:430,ground:950,width:440},search:'inside'}),
  scene('revision-wagon-room','crouch-book',818,950,.61,'look-in-front-empty',{wagon:{x:250,ground:950,width:440},search:'front'}),
  scene('revision-wagon-room','crouch-book',165,950,.61,'look-behind-empty',{wagon:{x:350,ground:950,width:440},search:'behind'}),
  scene('ball-door','hands-flower-open',710,950,.68,'ball-revealed-behind-door',{ball:{x:89,ground:658,width:90},search:'door'}),
  scene('ball-door','carry-play',700,950,.78,'found-and-picked-up',{ballInHands:true})
 ]}
};
function owns(key){return !!assets[key];}
function imageUrl(key){return assets[key]?.url;}
function assetKeys(p){return [p.background,...(p.bug||p.bugOnFoot?['little-bug']:[]),...(p.wagon?['revision-wagon']:[]),...(p.ball||p.ballInHands?['revision-ball']:[])];}
function cover(id){return {...BOOKS[id].pages[0],beat:'cover'};}
function prop(c,key,a,p){const [l,t,r,b]=assets[key].bounds,h=p.width*(b-t)/(r-l);c.drawImage(a[key],l,t,r-l,b-t,p.x,p.ground-h,p.width,h);}
function flakes(c,p){
 const points=p.window?[[530,100],[630,135],[705,200],[560,245],[730,300],[635,345],[775,370]]:p.closeGrass?[[100,65],[270,110],[445,40],[625,105],[800,60],[900,195],[720,260],[530,210],[350,275],[180,220],[610,350]]:[[220,120],[430,210],[635,110],[820,285],[275,370],[510,430],[750,490],[870,580]];
 c.save();if(p.window){c.beginPath();c.rect(505,0,280,414);c.clip();}c.fillStyle='#fffef9';c.shadowColor='rgba(117,148,160,.25)';c.shadowBlur=1;
 for(const [i,[x,y]]of points.slice(0,p.snow).entries()){const r=p.window?4.2:9+i%3;c.beginPath();c.ellipse(x,y,r*.77,r,((i*31)%80)/100,0,Math.PI*2);c.fill();c.globalAlpha=.8;c.beginPath();c.ellipse(x-r*.4,y+r*.1,r*.6,r*.6,0,0,Math.PI*2);c.fill();c.globalAlpha=1;}c.restore();
}
function beforeActor(c,p,a){if(p.snow)flakes(c,p);if(p.bug)prop(c,'little-bug',a,p.bug);if(p.wagon)prop(c,'revision-wagon',a,p.wagon);if(p.ball)prop(c,'revision-ball',a,p.ball);}
function attachment(p,name,model,library){const pose=library[p.pose],a=pose.attachments[name],s=p.placement.scale/model.sourcePixelsPerUnit;return {x:p.placement.x+(a.x-pose.collar.x)*s,y:p.placement.y+(a.y-pose.collar.y)*s};}
function afterActor(c,p,a,model,library){
 if(p.bugOnFoot){const q=attachment(p,'rightInstep',model,library),width=52*p.placement.scale;prop(c,'little-bug',a,{x:q.x-width/2,ground:q.y,width});}
 if(p.ballInHands){const q=attachment(p,'leftPalm',model,library);prop(c,'revision-ball',a,{x:q.x-44,ground:q.y+12,width:88});}
}
module.exports={BOOKS,owns,imageUrl,assetKeys,cover,beforeActor,afterActor};
