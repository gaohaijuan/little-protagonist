'use strict';
const assets=require('./level2-next-three-assets'),garden=require('./books-fourteen-sixteen-art'),bugAssets=require('./priority-three-assets'),gardenAssets=require('./books-14-16-assets');
const {CHILD_MODEL}=require('./character-rig');
const soles={'barefoot-stand':1130,'barefoot-step':1147,'drink-water':1130,'water-pour':1132};
const scene=(background,pose,x,ground,scale,beat,extra={})=>({background,pose,placement:pose?{x,y:ground-soles[pose]/CHILD_MODEL.sourcePixelsPerUnit*scale,scale}:null,world:{width:1000,height:1000},camera:{x:0,y:0,width:1000,height:1000},level2Next:true,beat,...extra});
const clone=(p,beat,extra={})=>({...p,camera:{...p.camera},placement:p.placement?{...p.placement}:null,level2Next:true,beat,...extra});
const tableCup={x:660,ground:485,width:120};
const wagon=garden.BOOKS.wagon.pages;
const BOOKS={
 'level2-hot-water':{pages:[
  scene('warm-water-room','barefoot-stand',300,945,.72,'thirsty-after-play',{cup:tableCup,steam:true}),
  scene('warm-water-table-close',null,0,0,1,'cup-is-too-hot',{cup:{x:360,ground:760,width:370},steam:true}),
  scene('warm-water-room','water-pour',580,859,.77,'cup-set-down-wait',{cup:tableCup,cupAfter:true,steam:true}),
  scene('warm-water-room','barefoot-step',230,945,.72,'still-waiting',{cup:tableCup,steam:true}),
  scene('warm-water-table-close',null,0,0,1,'touch-cup-side-not-hot',{cup:{x:360,ground:760,width:370},touchCup:{target:[380,665]}}),
  scene('warm-water-room','barefoot-stand',365,945,.72,'lift-the-cooled-cup',{cup:{at:'palm',width:100}}),
  scene('warm-water-room','drink-water',365,945,.72,'sip-then-sip-again',{cup:{at:'cup',width:94,drink:true}}),
  scene('warm-water-room','barefoot-stand',365,945,.72,'enjoy-the-water',{cup:{at:'palm',width:100}})
 ]},
 'level2-flower-water':{pages:[
  scene('water-pour-scene','water-pour',400,820,.68,'take-the-small-watering-can',{holdCan:true}),
  scene('water-pour-scene','water-pour',400,820,.68,'water-flower-soil',{fourteenSixteen:true,can:true,streamTo:[735,545]}),
  scene('water-drops',null,0,0,1,'a-little-then-a-little'),
  scene('flower-leaf-shelter',null,0,0,1,'bug-crawls-under-the-leaf',{bug:{x:490,ground:440,width:110,hidden:true}}),
  scene('flower-leaf-shelter',null,0,0,1,'tell-bug-its-raining',{bug:{x:490,ground:440,width:110,hidden:true},pointLeaf:{target:[480,460]}}),
  scene('water-greet','barefoot-stand',350,945,.63,'put-can-down-and-wait'),
  scene('flower-leaf-shelter',null,0,0,1,'bug-crawls-out-again',{bug:{x:580,ground:548,width:155}}),
  scene('water-greet','barefoot-stand',420,945,.63,'invite-bug-after-the-rain',{bug:{x:762,ground:540,width:45}})
 ]},
 'level2-ball-wagon':{pages:[
  clone(wagon[0],'place-ball-in-front'),
  clone(wagon[1],'child-pushes-cart-which-pushes-ball',{ball:{x:690,y:908,where:'front'},motion:false}),
  clone(wagon[2],'place-ball-behind'),
  clone(wagon[3],'cart-moves-ball-stays-put',{motion:false}),
  clone(wagon[5],'bring-cart-back-and-load-the-ball'),
  clone(wagon[7],'push-cart-with-ball-inside',{motion:false})
 ]}
};
function owns(k){return !!assets[k];}
function imageUrl(k){return assets[k]?.url;}
function assetKeys(p){return [...new Set([...(p.fourteenSixteen?garden.assetKeys(p):[p.background]),...(p.cup?['warm-water-cup']:[]),...(p.touchCup||p.pointLeaf?['warm-water-hand']:[]),...(p.bug?['little-bug']:[]),...(p.holdCan?['pour-can']:[])])];}
function cover(id){const p=BOOKS[id].pages[0];return {...p,beat:'cover'};}
function prop(c,key,images,p,metadata=assets[key]){const [l,t,r,b]=metadata.bounds,h=p.width*(b-t)/(r-l);c.drawImage(images[key],l,t,r-l,b-t,p.x,p.ground-h,p.width,h);return {...p,height:h};}
function hand(c,images,target){const im=images['warm-water-hand'],[x,y]=target,s=(1000-y)/(im.height-130);c.drawImage(im,x-1140*s,y-130*s,im.width*s,im.height*s);}
function resolvedCup(p,model,library){if(!p.cup?.at)return p.cup;const pose=library[p.pose],q=pose.attachments[p.cup.at],s=p.placement.scale/model.sourcePixelsPerUnit,x=p.placement.x+(q.x-pose.collar.x)*s,y=p.placement.y+(q.y-pose.collar.y)*s;return {...p.cup,x:x-(p.cup.drink?20:p.cup.width*.45),ground:y+(p.cup.drink?12:4)};}
function steam(c,cup){const s=cup.width/120,baseY=cup.ground-cup.height*.88;c.save();c.strokeStyle='rgba(172,176,159,.75)';c.lineWidth=2*s;c.lineCap='round';for(let i=0;i<3;i++){const x=cup.x+cup.width*(.24+i*.18);c.beginPath();c.moveTo(x,baseY);c.bezierCurveTo(x-12*s,baseY-15*s,x+14*s,baseY-30*s,x,baseY-49*s);c.stroke();}c.restore();}
function beforeActor(c,p,images){if(p.cup&&!p.cup.at&&!p.cupAfter){const q=prop(c,'warm-water-cup',images,p.cup);if(p.steam)steam(c,q);}}
function afterActor(c,p,o){
 const images=o.assets;
 if(p.cup?.at)prop(c,'warm-water-cup',images,resolvedCup(p,o.model,o.poseLibrary));
 if(p.cupAfter){const q=prop(c,'warm-water-cup',images,p.cup);if(p.steam)steam(c,q);}
 if(p.touchCup)hand(c,images,p.touchCup.target);
 if(p.bug){prop(c,'little-bug',images,p.bug,bugAssets['little-bug']);if(p.bug.hidden){c.save();c.beginPath();[[243,514],[290,390],[440,286],[650,264],[802,285],[720,350],[550,385],[400,450]].forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.clip();const im=images[p.background];c.drawImage(im,0,0,im.width,im.height,0,0,1000,1000);c.restore();}}
 if(p.pointLeaf)hand(c,images,p.pointLeaf.target);
 if(p.holdCan){const pose=o.poseLibrary[p.pose],a=pose.attachments.grip,u=p.placement.scale/o.model.sourcePixelsPerUnit,g={x:p.placement.x+(a.x-pose.collar.x)*u,y:p.placement.y+(a.y-pose.collar.y)*u},m=gardenAssets['pour-can'],s=220/(m.bounds[2]-m.bounds[0]);c.drawImage(images['pour-can'],0,0,m.size[0],m.size[1],g.x-430*s,g.y-250*s,m.size[0]*s,m.size[1]*s);}
}
function proof(p){return {beat:p.beat,cup:p.cup||null,steam:!!p.steam,touchCupSide:!!p.touchCup,bug:p.bug||null,waterToSoil:p.streamTo||null,canOnGround:p.background==='water-greet',wagon:p.wagon||null,ball:p.ball||null};}
module.exports={BOOKS,owns,imageUrl,assetKeys,cover,beforeActor,afterActor,proof};
