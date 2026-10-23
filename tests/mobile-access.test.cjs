'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {isPrivateIPv4,networkAddress}=require('../server/start-mobile.cjs');
const {lanAccess}=require('../server/lan-access.cjs');
const {createApplication}=require('../server/app.cjs');
test('mobile test entry accepts private LAN addresses only',()=>{
  for(const value of ['10.0.0.2','172.16.0.2','172.31.255.1','192.168.1.22'])assert.equal(isPrivateIPv4(value),true,value);
  for(const value of ['0.0.0.0','127.0.0.1','198.18.0.1','8.8.8.8','169.254.1.1','172.32.1.1','192.168.999.1','localhost','::1','192.168.1.22.example.com',null])assert.equal(isPrivateIPv4(value),false,String(value));
  assert.throws(()=>networkAddress('8.8.8.8'),/本机/);
});
test('simple LAN passwords require explicit test mode and a real local network address',()=>{
  for(const publicOrigin of ['http://8.8.8.8:4181','http://0.0.0.0:4181','https://reader.example.com'])assert.throws(()=>createApplication({lanDevelopment:true,publicOrigin,adminPassword:'111'}),/本机私有IPv4/);
  assert.throws(()=>createApplication({adminPassword:'111',publicOrigin:'http://192.168.1.22:4181'}),/至少12位/);
});
test('LAN guard allows local subnet peers only',t=>{
  let host;try{host=networkAddress();}catch(_){t.skip('No unique LAN network');return;}
  const allowed=lanAccess('http://'+host+':4181');assert.equal(allowed(host),true);assert.equal(allowed('::ffff:'+host),true);assert.equal(allowed('127.0.0.1'),true);
  for(const address of ['8.8.8.8','198.18.0.1','::ffff:8.8.8.8','invalid'])assert.equal(allowed(address),false,address);
});
