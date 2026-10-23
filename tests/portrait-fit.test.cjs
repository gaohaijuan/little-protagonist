const test=require('node:test'),assert=require('node:assert/strict');
const {frameFromReference,frameForPose,fitScale}=require('../miniprogram/lib/portrait-fit');

test('the authored body frame is independent of the default expression head asset',()=>{
  const pose={headFrame:{crownHeight:300,faceToCrown:1.7}};
  const small={bounds:{left:0,top:0,right:300,bottom:350},faceBounds:{left:30,top:70,right:270,bottom:340},chin:{x:150,y:340}};
  const large={bounds:{left:0,top:0,right:1400,bottom:1800},faceBounds:{left:100,top:800,right:1300,bottom:1750},chin:{x:700,y:1750}};
  for(const reference of [small,large,null])assert.deepEqual(frameForPose(pose,reference,{width:210,height:220}),pose.headFrame);
  assert.deepEqual(frameForPose({headFrame:{crownHeight:300}},null,null),pose.headFrame);
  for(const crownHeight of [0,-1,NaN,Infinity])assert.deepEqual(frameForPose({headFrame:{crownHeight}},small,{width:210,height:220}),frameFromReference(small,{width:210,height:220}));
});
test('the body reference, not the photo margins or hairstyle, determines a portrait facial frame',()=>{
  const frame=frameFromReference({bounds:{left:0,top:0,right:400,bottom:500},faceBounds:{left:50,top:160,right:350,bottom:490},chin:{x:200,y:490}},{width:240,height:230});
  const face={left:100,top:220,right:400,bottom:550},chin={x:250,y:550};
  const short={left:50,top:10,right:450,bottom:560},long={left:4,top:0,right:590,bottom:1400};
  assert.equal(fitScale(.8,face,short,chin,frame),fitScale(.8,face,long,chin,frame),'widening or lengthening hair does not shrink the face');
  assert.ok(fitScale(.8,face,short,chin,frame)<.8,'an excessive real head is reduced');
  assert.equal(fitScale(.1,face,short,chin,frame),.1,'an already small portrait is not enlarged');
});
test('legacy cutouts fit by crown and chin; missing reference metrics leave existing framing available',()=>{
  const b={left:0,top:10,right:300,bottom:800},chin={x:150,y:410};
  assert.equal(fitScale(1,null,b,chin,{crownHeight:250}),.625);
  assert.equal(fitScale(.6,null,b,chin,{crownHeight:250}),.6);
  assert.equal(frameFromReference({},{}),null);assert.equal(fitScale(.7,null,b,chin,null),.7);
});
