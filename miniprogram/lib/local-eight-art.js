'use strict';
const first=require('./first-ten-art'),next=require('./books-eleven-thirteen-art'),last=require('./books-seventeen-nineteen-art'),assets=require('./local-eight-assets');
const cp=(p,beat,extra={})=>({...p,camera:{...p.camera},placement:p.placement?{...p.placement}:null,localEight:true,beat,...extra});
const landscape=(background,pose,x,y,scale,beat,extra={})=>({background,pose,placement:pose?{x,y,scale}:null,camera:{x:120,y:0,width:985,height:941},localEight:true,beat,...extra});
const hands=(pose,beat,scale=.83)=>landscape('hands-room',pose,600,900-1174/1.8375*scale,scale,beat,{camera:{x:160,y:0,width:960,height:941},handState:pose==='hands-flower-closed'?'closed':'open'});
const mountain=(pose,beat,clouds,wind=false)=>({background:'mountain-empty-sky',pose,placement:{x:270,y:660,scale:.42},camera:{x:0,y:0,width:1000,height:1000},world:{width:1000,height:1000},firstTen:true,foreground:true,localEight:true,beat,localClouds:clouds,wind});
const smallClouds=[{x:470,y:70,width:220},{x:735,y:110,width:200}];
const nearClouds=[{x:-130,y:85,width:1430},{x:650,y:85,width:1430}];
const goneClouds=[{x:1500,y:85,width:1430},{x:2280,y:85,width:1430}];
const tree=next.BOOKS.tree.pages,call=next.BOOKS.calling.pages,water=first.BOOKS.water.pages,bed=last.BOOKS.catbed.pages;
const sharedUmbrella={x:100,y:40,scale:.86,rotation:0,anchor:{x:0,y:0}};
const dryBed=(p,beat,extra={})=>cp(p,beat,{bedInventory:[],ball:undefined,car:undefined,...extra});
const bothToys={ball:{at:[500,905]},car:{x:590,ground:905,width:145},bedInventory:['ball','car']};
const BOOKS={
 'hands-revision':{pages:[
  hands('hands-flower-open','two-little-hands',.76),
  hands('hands-flower-closed','learn-a-hand-flower',.76),
  hands('hands-flower-open','make-another-hand-flower',.80),
  hands('hands-flower-open','hands-open-flower-opens',.88),
  hands('hands-flower-closed','hands-close-flower-hides',.88),
  hands('hands-flower-open','hands-open-again',.88),
  hands('hands-flower-open','invite-reader-to-open',.80)
 ]},
 'mountain-revision':{pages:[
  mountain('stand-wave','exactly-two-clouds',smallClouds),
  mountain('stand-wave','two-clouds-hide-mountain',nearClouds),
  mountain('hands-flower-open','ask-where-mountain-went',nearClouds),
  mountain('stand-wave','wind-carries-same-clouds',[{x:820,y:85,width:1430},{x:1600,y:85,width:1430}],true),
  mountain('hands-flower-open','same-mountain-is-revealed',goneClouds),
  mountain('stand-wave','mountain-stayed-clouds-moved',goneClouds)
 ]},
 'rain-revision':{pages:[
  landscape('rain-sky',null,0,0,1,'heavy-rain',{heavyRain:true}),
  landscape('rain-alone','sit-read',480,565,.55,'sit-under-open-umbrella',{umbrella:'shared',umbrellaTransform:{x:-30,y:120,scale:.69,rotation:0,anchor:{x:0,y:0}},seated:true}),
  {background:'rain-flower-close',pose:null,placement:null,camera:{x:0,y:0,width:1000,height:1000},world:{width:1000,height:1000},localEight:true,beat:'flower-still-in-rain'},
  {background:'rain-flower-close',pose:null,placement:null,camera:{x:0,y:0,width:1000,height:1000},world:{width:1000,height:1000},localEight:true,beat:'flower-cannot-come'},
  landscape('rain-walk','hold-umbrella',650,445,.55,'child-goes-to-flower',{umbrella:'held'}),
  landscape('rain-shelter','crouch-book',515,560,.60,'both-under-umbrella',{umbrella:'shared'}),
  landscape('rain-shelter','crouch-book',515,560,.60,'rain-above-child-and-flower-below',{umbrella:'shared'}),
  landscape('rain-shelter','sit-read',495,565,.55,'enjoy-rain-together',{umbrella:'shared',umbrellaTransform:sharedUmbrella,seated:true})
 ]},
 'tree-revision':{pages:[
  cp(tree[0],'greet-small-tree'),
  cp(tree[2],'compare-child-and-tree'),
  cp(tree[2],'tree-a-little-taller'),
  cp(tree[3],'step-onto-low-stone'),
  cp(tree[3],'now-child-is-taller'),
  cp(tree[4],'step-down-tree-taller-again'),
  cp(tree[2],'look-at-the-little-stone',{pose:'crouch-book',placement:{x:390,y:920-959/1.8375*.60,scale:.60}}),
  cp(tree[5],'promise-to-compare-next-year')
 ]},
 'water-revision':{pages:[
  cp(water[1],'sky-clouds-and-my-reflection'),
  cp(water[3],'same-smile-in-water'),
  cp(water[2],'walk-and-reflection-follows'),
  cp(water[3],'stop-and-reflection-stops',{placement:{...water[3].placement,x:water[2].placement.x}}),
  cp(water[7],'greet-the-same-me',{pose:'hands-flower-open'})
 ]},
 'calling-revision':{pages:[
  cp(call[0],'listen-to-a-call'),
  cp(call[1],'bird-singing-on-branch'),
  cp(call[2],'invite-bird-down'),
  cp(call[3],'bird-quiet-another-call'),
  cp(call[4],'cat-calling-under-tree'),
  cp(call[5],'invite-the-cat',{cat:'call-cat'}),
  cp(call[6],'bird-flies-out-branch-empty',{cat:'call-cat',flight:{x:600,ground:480,width:145}}),
  cp(call[7],'bird-discovered-on-car',{cat:'call-cat'}),
  cp(call[7],'bird-has-come-to-play',{cat:'call-cat',pose:'crouch-book',placement:{x:350,y:930-959/1.8375*.56,scale:.56}})
 ]},
 'catbed-revision':{pages:[
  cp(bed[0],'cat-bed-has-both-toys',{...bothToys}),
  cp(bed[1],'drowsy-cat-waits-for-bed',{...bothToys}),
  cp(bed[3],'take-ball-out-first',{ball:{at:'rightPalm'},car:bothToys.car,bedInventory:['car']}),
  cp(bed[6],'take-car-out-next',{ball:{at:[230,950]},car:{at:'rightPalm',width:145},bedInventory:[]}),
  dryBed(bed[3],'both-toys-put-away',{ball:{at:[220,950]},car:{x:280,ground:950,width:145}}),
  dryBed(bed[0],'invite-cat-into-empty-bed',{cat:{key:'bed-cat-awake',x:750,ground:950,width:165},ball:{at:[220,950]},car:{x:280,ground:950,width:145}}),
  dryBed(bed[7],'cat-sleeps-toys-stay-on-floor',{ball:{at:[200,950]},car:{x:85,ground:950,width:145}})
 ]}
};
function owns(key){return !!assets[key];}
function imageUrl(key){return assets[key]?.url;}
function assetKeys(p){
 const base=p.firstTen?first.assetKeys(p):p.elevenThirteen?next.assetKeys(p):p.seventeenNineteen?last.assetKeys(p):[p.background,...(p.umbrella?['umbrella']:[])];
 return [...new Set([...base,...(p.localClouds?['mountain-cloud']:[]),...(p.flight?['call-flying-bird']:[])])];
}
function cover(id){return {...BOOKS[id].pages[0],beat:'cover'};}
function beforeActor(c,p,images){
 if(p.heavyRain){c.save();c.strokeStyle='rgba(225,239,242,.8)';c.lineWidth=2;for(let i=0;i<170;i++){const x=110+(i*79)%1010,y=(i*137)%950;c.beginPath();c.moveTo(x,y);c.lineTo(x-10,y+26);c.stroke();}c.restore();}
 if(p.localClouds)for(const a of p.localClouds){const im=images['mountain-cloud'];c.drawImage(im,a.x,a.y,a.width,a.width*im.height/im.width);}
 if(p.flight){const a=p.flight,[l,t,r,b]=assets['call-flying-bird'].bounds,h=a.width*(b-t)/(r-l);c.drawImage(images['call-flying-bird'],l,t,r-l,b-t,a.x,a.ground-h,a.width,h);}
 if(p.wind){c.save();c.strokeStyle='rgba(224,235,227,.9)';c.lineWidth=3;for(let j=0;j<3;j++){c.beginPath();c.moveTo(440,120+j*32);c.bezierCurveTo(510,110+j*32,540,145+j*32,590,130+j*32);c.stroke();}c.restore();}
}
function proof(p){return {beat:p.beat,handState:p.handState||null,cloudCount:p.localClouds?.length||0,seated:!!p.seated,flight:!!p.flight,bedInventory:p.bedInventory||null,reflection:!!p.reflection,ripples:!!p.ripples};}
module.exports={BOOKS,owns,imageUrl,assetKeys,cover,beforeActor,proof};

