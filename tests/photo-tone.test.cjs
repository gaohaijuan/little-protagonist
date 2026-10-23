'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const scope={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../preview/photo-tone.js'),'utf8'),scope);
const tone=scope.window.LittlePhotoTone;
const l=p=>.2126*p[0]+.7152*p[1]+.0722*p[2];
test('underexposed facial midtones visibly brighten while black hair, highlights and alpha are protected',()=>{
  const p=tone.parameters({l:65,reference:75,warm:.15},{l:190,warm:.15});
  const pixels=new Uint8ClampedArray([96,64,43,255,5,5,5,255,240,225,210,130,120,80,40,0]),original=new Uint8ClampedArray(pixels);tone.transform(pixels,p);
  assert.ok(l(pixels)-l(original)>35,'dark skin pixels must receive a visible exposure lift');
  assert.deepEqual(pixels.slice(4,8),original.slice(4,8),'near-black hair does not become gray');
  assert.ok(l(pixels.slice(8))-l(original.slice(8))<20,'bright highlights are not blown out');
  for(let i=3;i<pixels.length;i+=4)assert.equal(pixels[i],original[i]);assert.deepEqual(pixels.slice(12),original.slice(12));
});
test('well-exposed faces receive only a small exposure change and warm/cool scenes differ',()=>{
  for(const reference of [150,185,220]){const p=tone.parameters({l:reference,reference,warm:.12},{l:185,warm:0}),pixels=new Uint8ClampedArray([reference,reference,reference,255]);tone.transform(pixels,p);assert.ok(Math.abs(l(pixels)-reference)<7);}
  const photo={l:145,reference:150,warm:.12},warm=tone.parameters(photo,{l:185,warm:.3}),cool=tone.parameters(photo,{l:185,warm:-.2});
  const a=new Uint8ClampedArray([160,120,90,255]),b=new Uint8ClampedArray(a);tone.transform(a,warm);tone.transform(b,cool);assert.ok(a[0]>b[0]);assert.ok(a[2]<b[2]);
});
test('pointwise exposure preserves photo detail and never depends on neighboring pixels',()=>{
  const original=new Uint8ClampedArray([20,50,80,255,140,90,50,255,80,120,160,128,255,0,20,0]);
  const neutral=new Uint8ClampedArray(original);tone.transform(neutral,{gamma:1,warmth:0});assert.deepEqual(neutral,original);
  const p=tone.parameters({l:70,reference:80,warm:.12},{l:185,warm:.1}),whole=new Uint8ClampedArray(original);tone.transform(whole,p);
  for(let i=0;i<original.length;i+=4){const pixel=original.slice(i,i+4);tone.transform(pixel,p);assert.deepEqual(pixel,whole.slice(i,i+4));}
  assert.deepEqual(Object.keys(p).sort(),['gamma','warmth']);assert.ok(p.gamma>=.55&&p.gamma<=1.03);assert.ok(Math.abs(p.warmth)<=.035);
});
