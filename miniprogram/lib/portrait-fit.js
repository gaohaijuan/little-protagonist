'use strict';

// Landmarked real faces contain less forehead than a painted doll face. Match
// their anatomical head frame to the approved body's head, not face height alone.
// Hair outside that frame is retained by the camera and never stretched/cropped.
function valid(b){return b&&['left','top','right','bottom'].every(k=>Number.isFinite(b[k]))&&b.right>b.left&&b.bottom>b.top;}
function frameFromReference(metrics,face){
  if(!metrics||!valid(metrics.bounds)||!valid(metrics.faceBounds)||!Number.isFinite(metrics.chin?.y)||!face)return null;
  const f=metrics.faceBounds,scale=Math.min(face.width/(f.right-f.left),face.height/(f.bottom-f.top));
  const crown=(metrics.chin.y-metrics.bounds.top)*scale*.92;
  return Number.isFinite(crown)&&crown>0?{crownHeight:crown,faceToCrown:1.7}:null;
}
function frameForPose(pose,metrics,face){
  const frame=pose&&pose.headFrame;
  if(frame&&Number.isFinite(frame.crownHeight)&&frame.crownHeight>0){
    return {crownHeight:frame.crownHeight,faceToCrown:Number.isFinite(frame.faceToCrown)&&frame.faceToCrown>0?frame.faceToCrown:1.7};
  }
  return frameFromReference(metrics,face);
}
function fitScale(base,face,bounds,chin,frame){
  if(!frame||!Number.isFinite(frame.crownHeight)||frame.crownHeight<=0)return base;
  // Use a facial landmark frame so ponytails/long hair do not shrink the face.
  // Older cutouts without landmarks can still fit by their crown-to-chin span.
  const reference=face?(face.bottom-face.top)*(frame.faceToCrown||1.7):chin.y-bounds.top;
  return reference>0?Math.min(base,frame.crownHeight/reference):base;
}
module.exports={frameFromReference,frameForPose,fitScale};
