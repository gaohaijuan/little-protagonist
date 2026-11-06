'use strict';
const assets=require('./complete-four-assets');
// Reuse the existing finished layers, poses and portrait geometry verbatim.
const sourceIds={'intro-complete':'intro','stone-complete':'stone','car-complete':'car','catball-complete':'catball'};
function build(base){
 const pick=(id,indices)=>({pages:indices.map(i=>({...base[id].pages[i]}))});
 const cars=pick('car',[0,1,4,5,7]);cars.pages[2]={...cars.pages[2],route:false,carInFront:true};
 const stones=pick('stone',[0,1,2,3,4,5,6,7]);
 // Both detail beats show the same home. Use native closeup pixels, not a 440px crop.
 for(const i of [1,6])stones.pages[i]={...stones.pages[i],background:'stone-home-close',camera:{x:0,y:0,width:1000,height:1000},world:{width:1000,height:1000}};
 return {'intro-complete':pick('intro',[0,1,2,3,4,5]),'stone-complete':stones,'car-complete':cars,'catball-complete':{pages:[0,1,2,4,5,6,7].map(i=>({...base.catball.pages[i],rolling:false}))}};
}
module.exports={sourceIds,build,owns:key=>!!assets[key],imageUrl:key=>assets[key]?.url};
