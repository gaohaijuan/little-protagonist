'use strict';
const assets=require('./books-14-16-assets'),{CHILD_MODEL}=require('./character-rig');
const sole={'stand-wave':1180,'hands-flower-open':1174,'barefoot-stand':1130,'barefoot-step':1147,'step-own-shoes':1171,'water-pour':1132,'crouch-book':959,'crouch-touch':920,'push-cart':1175};
const scene=(background,pose,x,ground,scale,beat,extra={})=>({background,pose,placement:pose?{x,y:ground-sole[pose]/CHILD_MODEL.sourcePixelsPerUnit*scale,scale}:null,camera:{x:0,y:0,width:1000,height:1000},world:{width:1000,height:1000},fourteenSixteen:true,beat,...extra});
const shoes=(bg,pose,x,ground,beat,extra={})=>scene(bg,pose,x,ground,.70,beat,extra);
const water=(bg,pose,beat,extra={})=>scene(bg,pose,350,930,.68,beat,extra);
const wagon=(bg,pose,x,beat,cartX,ballX,where,extra={})=>scene(bg,pose,x,930,.55,beat,{wagon:{x:cartX,ground:940,width:360},ball:{x:ballX,y:where==='inside'?810:908,where},...extra});
const BOOKS={
 shoes:{pages:[
  shoes('shoes-bench','barefoot-stand',400,930,'my-small-shoes',{smallShoes:{x:620,ground:930,width:190}}),
  shoes('shoes-comparison',null,0,0,'big-and-small-shoes'),
  shoes('shoes-try','barefoot-stand',500,875,'feet-inside-big-shoes',{bigShoes:{x:350,ground:954,width:300},wearing:'big'}),
  shoes('shoes-try','barefoot-step',720,930,'one-step-shoes-stay',{bigShoes:{x:350,ground:954,width:300},wearing:'none'}),
  shoes('shoes-out','barefoot-stand',650,935,'feet-are-out'),
  shoes('shoes-end','step-own-shoes',650,930,'own-shoes-walk-together',{wearing:'own'})
 ]},
 watering:{pages:[
  water('water-greet','barefoot-stand','ask-the-flower'),
  scene('water-pour-scene','water-pour',400,820,.68,'water-the-soil',{can:true,streamTo:[735,545]}),
  water('water-drops',null,'a-little-more'),
  scene('water-runoff','barefoot-stand',470,950,.68,'water-reaches-my-feet'),
  water('water-feet','barefoot-stand','do-feet-drink-water'),
  water('wash-corner','barefoot-stand','feet-need-washing',{basin:{x:275,ground:966,width:280}}),
  water('wash-close','barefoot-stand','flower-water-and-foot-wash',{basin:{x:275,ground:966,width:280}}),
  water('water-end','barefoot-stand','flower-and-feet-finished',{basin:{x:275,ground:966,width:280}})
 ]},
 wagon:{pages:[
  wagon('wagon-side','crouch-touch',750,'ball-in-front',210,625,'front'),
  wagon('wagon-side','push-cart',268,'push-and-ball-rolls',300,800,'front',{motion:true}),
  wagon('wagon-side','crouch-touch',250,'ball-behind',210,174,'behind'),
  wagon('wagon-side','push-cart',388,'cart-goes-ball-stays',420,174,'behind',{motion:true}),
  wagon('wagon-call-door','hands-flower-open',260,'call-the-cart-back',550,174,'behind'),
  wagon('wagon-loading','crouch-book',320,'put-ball-in-the-cart',210,410,'inside'),
  wagon('wagon-side','push-cart',388,'cart-and-ball-go-together',420,620,'inside',{motion:true}),
  wagon('wagon-home','push-cart',388,'go-home-together',420,620,'inside',{motion:true})
 ]}
};
function owns(key){return !!assets[key];}
function imageUrl(key){return assets[key]?.url;}
function assetKeys(p){return [p.background,...(p.smallShoes?['small-shoes']:[]),...(p.bigShoes?['large-shoes']:[]),...(p.can?['pour-can']:[]),...(p.basin?['wash-basin']:[]),...(p.wagon?['push-wagon','wagon-ball']:[])];}
function cover(id){const p=BOOKS[id].pages[0];return {...p,pose:'stand-wave',placement:{x:id==='wagon'?200:350,y:930-1180/CHILD_MODEL.sourcePixelsPerUnit*.60,scale:.60},beat:'cover'};}
function prop(c,key,images,p){const b=assets[key].bounds,[l,t,r,bottom]=b,s=p.width/(r-l),h=(bottom-t)*s,y=p.ground-h;c.drawImage(images[key],l,t,r-l,bottom-t,p.x,y,p.width,h);return {x:p.x,y,s,b};}
function foreground(c,key,images,p,polygon){const b=assets[key].bounds,s=p.width/(b[2]-b[0]),y=p.ground-(b[3]-b[1])*s;c.save();c.beginPath();polygon.forEach(([x,yy],i)=>{const xx=p.x+(x-b[0])*s,yyy=y+(yy-b[1])*s;i?c.lineTo(xx,yyy):c.moveTo(xx,yyy);});c.clip();prop(c,key,images,p);c.restore();}
function point(p,key,model,library){const pose=library[p.pose],a=pose.attachments[key],s=p.placement.scale/model.sourcePixelsPerUnit;return {x:p.placement.x+(a.x-pose.collar.x)*s,y:p.placement.y+(a.y-pose.collar.y)*s};}
function beforeActor(c,p,images){if(p.smallShoes)prop(c,'small-shoes',images,p.smallShoes);if(p.basin)prop(c,'wash-basin',images,p.basin);if(p.wagon)prop(c,'push-wagon',images,p.wagon);}
function afterActor(c,p,images,model,library){
 if(p.bigShoes)prop(c,'large-shoes',images,p.bigShoes);
 if(p.basin)foreground(c,'wash-basin',images,p.basin,[[20,500],[300,590],[770,650],[1200,590],[1510,500],[1536,1024],[0,1024]]);
 if(p.can){const g=point(p,'grip',model,library),b=assets['pour-can'].bounds,s=220/(b[2]-b[0]),x=g.x-430*s,y=g.y-250*s;c.drawImage(images['pour-can'],0,0,assets['pour-can'].size[0],assets['pour-can'].size[1],x,y,assets['pour-can'].size[0]*s,assets['pour-can'].size[1]*s);
  const start={x:x+1430*s,y:y+440*s},[tx,ty]=p.streamTo;c.save();c.strokeStyle='rgba(145,190,190,.84)';c.lineWidth=2.3;c.setLineDash([3,7]);for(let j=-1;j<=1;j++){c.beginPath();c.moveTo(start.x+j*4,start.y);c.bezierCurveTo(start.x+30,start.y+35,tx+j*6,ty-50,tx+j*6,ty);c.stroke();}c.restore();
 }
 if(p.ball){prop(c,'wagon-ball',images,{x:p.ball.x-32,ground:p.ball.y+32,width:64});if(p.ball.where==='inside')foreground(c,'push-wagon',images,p.wagon,[[230,530],[1100,735],[1450,570],[1510,800],[1100,950],[240,700]]);}
 if(p.motion){c.save();c.strokeStyle='#af8b55';c.lineWidth=2;c.beginPath();c.moveTo(p.wagon.x-40,963);c.lineTo(p.wagon.x+140,963);c.lineTo(p.wagon.x+128,954);c.moveTo(p.wagon.x+140,963);c.lineTo(p.wagon.x+128,972);c.stroke();c.restore();}
}
function proof(p){return {wearing:p.wearing||null,bigShoes:p.bigShoes||null,basin:p.basin||null,wagon:p.wagon?{...p.wagon,front:p.wagon.x+p.wagon.width,back:p.wagon.x}:null,ball:p.ball||null};}
module.exports={BOOKS,owns,imageUrl,assetKeys,cover,beforeActor,afterActor,proof};
