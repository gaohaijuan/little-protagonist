'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { draw } = require('../miniprogram/lib/story-art.js');
const { canUsePhoto } = require('../miniprogram/lib/family.js');

function mockCanvas(onCall) {
  const methods = ['beginPath', 'closePath', 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'ellipse', 'fill', 'stroke', 'save', 'restore', 'translate', 'scale', 'rotate', 'clip', 'drawImage', 'setTransform', 'clearRect', 'fillRect'];
  const trackedStyles = ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'globalAlpha'];
  const calls = [];
  const fills = new Map();
  const stack = [];
  const context = { globalAlpha: 1 };
  for (const method of methods) {
    context[method] = (...args) => {
      for (const arg of args) {
        if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `${method} received ${arg}`);
      }
      calls.push([method, ...args]);
      if (method === 'fill') fills.set(context.fillStyle, (fills.get(context.fillStyle) || 0) + 1);
      if (method === 'save') stack.push(Object.fromEntries(trackedStyles.map(key => [key, context[key]])));
      if (method === 'restore') {
        assert.ok(stack.length > 0, 'restore must have a matching save');
        Object.assign(context, stack.pop());
      }
      if (onCall) onCall(method, args);
    };
  }
  const canvas = { width: 0, height: 0, getContext: type => type === '2d' ? context : null };
  return { canvas, calls, fills, stack };
}

const books = { intro: 6, flower: 6, family: 8 };
const wxAvatar = { width: 800, height: 600 };
test('family fallback follows included member IDs and keeps duplicate siblings distinct',()=>{
  const mock=mockCanvas(),one={width:540,height:570},two={width:540,height:570};
  draw(mock.canvas,{book:'family',members:[{id:'child',role:'child',included:true},{id:'mom',role:'mom',included:false},{id:'olderBrother',role:'olderBrother',included:true},{id:'member-second',role:'olderBrother',included:true}],familyScene:{kind:'member',memberIds:['olderBrother','member-second']},avatars:{olderBrother:{image:one,kind:'cutout'},'member-second':{image:two,kind:'cutout'}}});
  assert.deepEqual(mock.calls.filter(call=>call[0]==='drawImage').map(call=>call[1]),[one,two]);
  assert.equal(mock.fills.get('#d99c8c'),undefined,'excluded mother is not painted');
});
test('an additional sibling uses their own head in the settings thumbnail',()=>{
  const mock=mockCanvas(),photo={width:540,height:570};
  draw(mock.canvas,{framing:'avatar',characterRole:'olderSister',characterId:'member-second',avatars:{'member-second':{image:photo,kind:'cutout'}}});
  assert.equal(mock.calls.find(call=>call[0]==='drawImage')[1],photo);
});
for (const [book, pages] of Object.entries(books)) {
  for (let page = 0; page < pages; page++) {
    for (const withPhoto of [false, true]) {
      test(`${book} page ${page + 1}, ${withPhoto ? 'WeChat photo' : 'placeholder'}`, () => {
        const mock = mockCanvas();
        draw(mock.canvas, { width: 480, height: 344, pixelRatio: 2, book, page, avatar: withPhoto ? wxAvatar : undefined });
        assert.equal(mock.canvas.width, 960);
        assert.equal(mock.canvas.height, 688);
        assert.equal(mock.stack.length, 0);
        assert.ok(mock.calls.some(call => call[0] === 'bezierCurveTo'), 'the story illustration was drawn');
        assert.deepEqual(mock.calls.at(-1), ['setTransform', 1, 0, 0, 1, 0, 0]);
        if (book === 'flower') {
          assert.equal((mock.fills.get('#ebb2a3') || 0) + (mock.fills.get('#e5a095') || 0), 11, 'every flower scene retains its eleven petals');
        }
        if (book === 'family' && [0, 6, 7].includes(page)) {
          for (const color of ['#baab88', '#94a68b', '#94adb0', '#d99c8c', '#e7ba57']) {
            assert.equal(mock.fills.get(color), 1, `one family member with clothes ${color}`);
          }
        }
      });
    }
  }
  test(`${book} portrait cover`, () => {
    const mock = mockCanvas();
    draw(mock.canvas, { width: 120, height: 168, book, cover: true, avatar: wxAvatar });
    assert.equal(mock.stack.length, 0);
    assert.equal(mock.canvas.width, 120);
    assert.equal(mock.canvas.height, 168);
    const transform = mock.calls.find(call => call[0] === 'setTransform' && call[1] !== 1);
    assert.ok(transform[5] < 0, 'portrait cover uses the approved centered crop');
    if (book === 'family') {
      for (const color of ['#baab88', '#94a68b', '#94adb0', '#d99c8c', '#e7ba57']) assert.equal(mock.fills.get(color), 1);
    }
  });
}

test('avatar framing accepts loaded WeChat images without complete or naturalWidth', () => {
  const mock = mockCanvas();
  draw(mock.canvas, { width: 96, height: 96, framing: 'avatar', avatar: wxAvatar });
  const image = mock.calls.find(call => call[0] === 'drawImage');
  assert.equal(image[1], wxAvatar);
  const [, , sx, sy, sw, sh, dx, dy, dw, dh] = image;
  assert.ok(sx >= 0 && sy >= 0 && sx + sw <= wxAvatar.width && sy + sh <= wxAvatar.height);
  assert.ok(Math.abs(sw / sh - dw / dh) < 1e-12, 'the face is cropped without stretching');
  assert.ok(dx < 0 && dy < 0);
  assert.equal(mock.stack.length, 0);
});

test('browser natural dimensions take precedence over CSS display dimensions', () => {
  const mock = mockCanvas();
  const avatar = { naturalWidth: 600, naturalHeight: 900, width: 120, height: 120, complete: false };
  draw(mock.canvas, { framing: 'avatar', avatar });
  const image = mock.calls.find(call => call[0] === 'drawImage');
  assert.equal(image[4], 600);
  assert.ok(image[5] > 600);
  assert.ok(Math.abs(image[4] / image[5] - image[8] / image[9]) < 1e-12);
});

test('invalid avatar dimensions render the placeholder instead of drawImage', () => {
  for (const avatar of [{ width: 0, height: 600 }, { width: 800, height: NaN }, null]) {
    const mock = mockCanvas();
    draw(mock.canvas, { framing: 'avatar', avatar });
    assert.ok(!mock.calls.some(call => call[0] === 'drawImage'));
  }
});

test('hero framing preserves the right-side figure composition', () => {
  const mock = mockCanvas();
  draw(mock.canvas, { width: 350, height: 190, framing: 'hero' });
  const transform = mock.calls[3];
  assert.equal(transform[0], 'setTransform');
  assert.equal(transform[1], 190 / 430);
  assert.ok(Math.abs(transform[5] - (350 * 0.75 - 300 * 190 / 430)) < 1e-10);
  assert.equal(transform[6], 0);
});

test('logical dimensions and pixel ratios are normalized', () => {
  for (const [options, expected] of [
    [{}, [600, 430]],
    [{ width: 100.5, height: 90.25, pixelRatio: 2 }, [201, 181]],
    [{ width: 100, height: 80, pixelRatio: 8 }, [300, 240]],
    [{ width: -1, height: Infinity, pixelRatio: -2 }, [600, 430]],
    [{ width: 0.1, height: 0.1, pixelRatio: 0.5 }, [1, 1]],
  ]) {
    const mock = mockCanvas();
    draw(mock.canvas, { ...options, framing: 'avatar' });
    assert.deepEqual([mock.canvas.width, mock.canvas.height], expected);
  }
});

test('nested drawing cannot redirect the outer canvas context', () => {
  const baseline = mockCanvas();
  draw(baseline.canvas, { book: 'flower', page: 3 });
  const inner = mockCanvas();
  let nested = false;
  const outer = mockCanvas(method => {
    if (method === 'fill' && !nested) {
      nested = true;
      draw(inner.canvas, { framing: 'avatar', avatar: wxAvatar });
    }
  });
  draw(outer.canvas, { book: 'flower', page: 3 });
  assert.ok(nested);
  assert.deepEqual(outer.calls, baseline.calls);
  assert.ok(inner.calls.some(call => call[0] === 'drawImage'));
  assert.equal(inner.stack.length, 0);
  assert.equal(outer.stack.length, 0);
});

test('missing canvases or unavailable contexts safely skip drawing', () => {
  assert.doesNotThrow(() => draw(null));
  assert.doesNotThrow(() => draw({}));
  assert.doesNotThrow(() => draw({ getContext: () => null }));
});

test('transparent heads retain their full silhouette without a cartoon underlay or frame', () => {
  const mock = mockCanvas();
  const avatar = { naturalWidth: 540, naturalHeight: 570 };
  draw(mock.canvas, { framing: 'avatar', avatar, avatarKind: 'cutout' });
  assert.deepEqual(mock.calls.find(call => call[0] === 'drawImage'),
    ['drawImage', avatar, 0, 0, 540, 570, -64, 57-570*128/540, 128, 570*128/540]);
  for (const method of ['clip', 'ellipse', 'fill', 'stroke']) {
    assert.ok(!mock.calls.some(call => call[0] === method), `cutout must not add ${method}`);
  }
  assert.equal(mock.stack.length, 0);
});

test('nonstandard transparent heads fit without stretching or cutting off hair', () => {
  for (const avatar of [{ width: 800, height: 600 }, { width: 600, height: 900 }]) {
    const mock = mockCanvas();
    draw(mock.canvas, { framing: 'avatar', avatar, avatarKind: 'cutout' });
    const [, , sx, sy, sw, sh, dx, dy, dw, dh] = mock.calls.find(call => call[0] === 'drawImage');
    assert.deepEqual([sx, sy, sw, sh], [0, 0, avatar.width, avatar.height]);
    assert.ok(Math.abs(sw / sh - dw / dh) < 1e-12);
    assert.ok(dw <= 128 + 1e-12 && dh <= 144 + 1e-12);
    assert.ok(Math.abs(dx + dw / 2) < 1e-12);
    assert.ok(Math.abs(dy + dh - 57) < 1e-12, 'head bottom stays at the collar');
  }
});

test('cutout mode reaches every book and cover while preserving adult drawings', () => {
  const avatar = { width: 540, height: 570 };
  for (const book of Object.keys(books)) {
    for (const cover of [false, true]) {
      const legacy = mockCanvas();
      const cutout = mockCanvas();
      draw(legacy.canvas, { book, cover, avatar });
      draw(cutout.canvas, { book, cover, avatar, avatarKind: 'cutout' });
      const imageCall = cutout.calls.find(call => call[0] === 'drawImage');
      const [sx,sy,sw,sh,dx,dy,dw,dh]=imageCall.slice(2);
      assert.deepEqual([sx,sy,sw,sh],[0,0,540,570]);
      assert.ok(Math.abs(dw/sw-dh/sh)<1e-12,'the complete photograph remains isotropic');
      assert.ok(Math.abs(dy+dh-57)<1e-10,'the chin stays attached to the doll collar');
      assert.ok(dh<=114+1e-10,'the portrait stays within the painted doll head height');
      assert.ok(!cutout.calls.some(call => call[0] === 'clip'));
      // The head begins after the last matching call. Earlier drawing includes
      // all adult family members, the same large doll body and its collar.
      const firstDifference = legacy.calls.findIndex((call, index) =>
        JSON.stringify(call) !== JSON.stringify(cutout.calls[index]));
      assert.ok(firstDifference > 0);
      assert.deepEqual(legacy.calls[firstDifference - 1], ['translate', 0, -124]);
      assert.equal(cutout.stack.length, 0);
    }
  }
});

test('cutout mode with a missing or invalid image retains the default doll', () => {
  for (const avatar of [null, { width: 0, height: 570 }, { width: 540, height: NaN }]) {
    const legacy = mockCanvas();
    const cutout = mockCanvas();
    draw(legacy.canvas, { framing: 'avatar', avatar });
    draw(cutout.canvas, { framing: 'avatar', avatar, avatarKind: 'cutout' });
    assert.deepEqual(cutout.calls, legacy.calls);
  }
});

test('transparent padding does not make a real head smaller than the same tight head', () => {
  const tight = {width:300,height:400};
  const padded = {width:900,height:1000};
  const examples = [
    {image:tight,metrics:{bounds:{left:0,top:0,right:300,bottom:400},chin:{x:150,y:400}}},
    {image:padded,metrics:{bounds:{left:230,top:180,right:530,bottom:580},chin:{x:380,y:580}}},
  ];
  const visible = examples.map(item => {
    const mock = mockCanvas();
    draw(mock.canvas,{framing:'character',avatars:{child:{...item,kind:'cutout'}}});
    const [, , sx, sy, sw, sh, dx, dy, dw, dh] = mock.calls.find(call=>call[0]==='drawImage');
    assert.deepEqual([sx,sy,sw,sh],[0,0,item.image.width,item.image.height], 'every source pixel remains available');
    const b=item.metrics.bounds, scale=dw/sw;
    assert.ok(Math.abs(scale-dh/sh)<1e-12,'source proportions are retained');
    return [dx+b.left*scale,dy+b.top*scale,(b.right-b.left)*scale,(b.bottom-b.top)*scale];
  });
  visible[0].forEach((value,index)=>assert.ok(Math.abs(value-visible[1][index])<1e-10));
  assert.ok(visible[0][3]>=100&&visible[0][3]<=114,'real head fits the painted body without a taller photographic head');
});

test('head layout covers the full movement and size range without changing the source crop', () => {
  const avatar={width:300,height:400};
  const drawAt=layout=>{
    const mock=mockCanvas();
    draw(mock.canvas,{framing:'character',avatar,avatarKind:'cutout',avatarLayout:layout});
    assert.ok(!mock.calls.some(call=>call[0]==='clip'));
    return mock.calls.find(call=>call[0]==='drawImage');
  };
  const low=drawAt({scale:1,x:-35,y:-35}), high=drawAt({scale:1,x:35,y:35});
  assert.deepEqual(low.slice(2,6),[0,0,300,400]);
  assert.deepEqual(high.slice(2,6),[0,0,300,400]);
  assert.equal(high[6]-low[6],70,'all horizontal travel is applied');
  assert.equal(high[7]-low[7],70,'all vertical travel is applied');
  const small=drawAt({scale:.6}),large=drawAt({scale:1.6});
  assert.ok(Math.abs(large[8]/small[8]-1.6/.6)<1e-12,'enlargement is not stopped by export-canvas bounds');
});

test('avatar thumbnails retain the full head regardless of saved body placement', () => {
  const avatar={width:540,height:570};
  const centered=mockCanvas(),moved=mockCanvas();
  draw(centered.canvas,{framing:'avatar',avatar,avatarKind:'cutout'});
  draw(moved.canvas,{framing:'avatar',avatar,avatarKind:'cutout',avatarLayout:{scale:1.6,x:35,y:-35}});
  assert.deepEqual(moved.calls,centered.calls);
});

test('face landmarks keep long-haired and short-haired portraits at the same facial scale', () => {
  const photo={width:600,height:1000}, faceBounds={left:160,top:150,right:440,bottom:510},chin={x:300,y:510};
  const rendered=[];
  for(const bottom of [520,990]){
    const mock=mockCanvas();
    draw(mock.canvas,{framing:'character',avatar:photo,avatarKind:'cutout',avatarMetrics:{bounds:{left:40,top:10,right:560,bottom},faceBounds,chin}});
    const image=mock.calls.find(call=>call[0]==='drawImage');
    rendered.push(image);
    assert.deepEqual(image.slice(2,6),[0,0,600,1000]);
  }
  assert.deepEqual(rendered[0],rendered[1],'hair length cannot shrink the face');
});

test('long-haired avatar thumbnails center the full hair silhouette above and below the chin', () => {
  const photo={width:600,height:1000},bounds={left:40,top:10,right:560,bottom:990};
  const mock=mockCanvas();
  draw(mock.canvas,{width:96,height:96,framing:'avatar',avatar:photo,avatarKind:'cutout',avatarMetrics:{bounds,faceBounds:{left:160,top:150,right:440,bottom:510},chin:{x:300,y:510}},avatarLayout:{scale:1.6,x:35,y:35}});
  const [, , , ,sw,sh,dx,dy,dw,dh]=mock.calls.find(call=>call[0]==='drawImage');
  assert.ok(Math.abs(dw/sw-dh/sh)<1e-12);
  assert.ok(Math.abs(dx+(bounds.left+bounds.right)/2*dw/sw)<1e-12);
  assert.ok(Math.abs(dy+(bounds.top+bounds.bottom)/2*dh/sh+11)<1e-12);
  assert.ok((bounds.bottom-bounds.top)*dh/sh<=144+1e-12);
});

test('family fallback retains the child photo and always draws cartoon adults', () => {
  const child={width:300,height:400},dad={width:400,height:500},mom={width:500,height:600};
  const mock=mockCanvas();
  draw(mock.canvas,{book:'family',page:0,avatar:child,avatarKind:'cutout',avatars:{dad:{image:dad,kind:'cutout'},mom:{image:mom,kind:'cutout'}}});
  const images=mock.calls.filter(call=>call[0]==='drawImage').map(call=>call[1]);
  assert.deepEqual(images,[child]);
  for (const color of ['#baab88','#94a68b','#94adb0','#d99c8c','#e7ba57']) assert.equal(mock.fills.get(color),1);
});

test('all optional family roles have their own standalone preview without changing story casting', () => {
  const roles=['child','dad','mom','grandpa','grandma','olderBrother','youngerBrother','olderSister','youngerSister'];
  for (const role of roles) {
    for (const framing of ['avatar','character']) {
      const image={width:300,height:400}, mock=mockCanvas();
      draw(mock.canvas,{framing,characterRole:role,avatars:{[role]:{image,kind:'cutout'}}});
      const used=mock.calls.find(call=>call[0]==='drawImage');
      if(canUsePhoto(role))assert.equal(used[1],image,`preview uses ${role}'s portrait`);
      else assert.equal(used,undefined,`adult ${role} has a cartoon avatar and body preview`);
      assert.equal(mock.stack.length,0);
      const fallback=mockCanvas();
      draw(fallback.canvas,{framing,characterRole:role});
      assert.ok(!fallback.calls.some(call=>call[0]==='drawImage'));
    }
  }
  const child={width:300,height:400},sibling={width:300,height:400}, mock=mockCanvas();
  draw(mock.canvas,{book:'family',page:0,avatars:{child:{image:child,kind:'cutout'},olderSister:{image:sibling,kind:'cutout'}}});
  assert.deepEqual(mock.calls.filter(call=>call[0]==='drawImage').map(call=>call[1]),[child],'unwritten sibling roles do not replace existing family slots');
});

test('narrow family covers retain complete heads at maximum size and movement', () => {
  const multiply=(a,b)=>[
    a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],
    a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5],
  ];
  for(const x of [-35,35])for(const y of [-35,35]){
    let transform=[1,0,0,1,0,0];
    const stack=[],images=[];
    const mock=mockCanvas((method,args)=>{
      if(method==='save')stack.push(transform.slice());
      if(method==='restore')transform=stack.pop();
      if(method==='setTransform')transform=args.slice();
      if(method==='translate')transform=multiply(transform,[1,0,0,1,...args]);
      if(method==='scale')transform=multiply(transform,[args[0],0,0,args[1],0,0]);
      if(method==='rotate')transform=multiply(transform,[Math.cos(args[0]),Math.sin(args[0]),-Math.sin(args[0]),Math.cos(args[0]),0,0]);
      if(method==='drawImage'){
        const [, , , , ,dx,dy,dw,dh]=args;
        images.push([[dx,dy],[dx+dw,dy],[dx,dy+dh],[dx+dw,dy+dh]].map(([px,py])=>[
          transform[0]*px+transform[2]*py+transform[4],transform[1]*px+transform[3]*py+transform[5],
        ]));
      }
    });
    const image={width:300,height:400},avatars={};
    for(const role of ['child','dad','mom','grandpa','grandma'])avatars[role]={image,kind:'cutout',layout:{scale:1.6,x,y}};
    draw(mock.canvas,{width:120,height:168,book:'family',cover:true,avatars});
    assert.equal(images.length,1,'adult saved photographs do not affect the cover');
    for(const corners of images)for(const [px,py] of corners){
      assert.ok(px>=0 && px<=120,`head x=${px} stays inside cover`);
      assert.ok(py>=0 && py<=168,`head y=${py} stays inside cover`);
    }
  }
});

test('adult saved photo content and adjustments cannot change fallback art or adult thumbnails',()=>{
  const adults=['dad','mom','grandpa','grandma'];
  const avatars={};for(const role of adults)avatars[role]={image:{width:540,height:570,role},kind:'cutout',metrics:{bounds:{left:0,top:0,right:540,bottom:570},faceBounds:{left:5,top:5,right:50,bottom:50},chin:{x:35,y:35}},layout:{scale:1.6,x:35,y:-35}};
  const child={width:540,height:570,role:'child'};avatars.child={image:child,kind:'cutout'};
  const modes=[...Array.from({length:8},(_,page)=>({book:'family',page})),{book:'family',cover:true},...adults.flatMap(role=>['avatar','character'].map(framing=>({framing,characterRole:role,characterId:role})))];
  for(const mode of modes){
    const old=mockCanvas(),baseline=mockCanvas();draw(old.canvas,{...mode,avatars,avatar:avatars.dad.image,avatarKind:'cutout',avatarLayout:{scale:1.6,x:-35,y:35}});
    draw(baseline.canvas,{...mode,avatars:{child:avatars.child}});
    assert.deepEqual(old.calls,baseline.calls,'adult data cannot affect rendering or framing');
    assert.equal(old.calls.some(call=>call[0]==='drawImage'&&adults.includes(call[1].role)),false);
  }
  assert.equal(Object.keys(avatars).length,5,'rendering does not delete saved adult data');
});


