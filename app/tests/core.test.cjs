'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assets = path.join(process.env.CHARACTER_ATELIER_HOME || 'D:/CharacterEditor', 'artifacts', 'assets');
const manifest = JSON.parse(fs.readFileSync(path.join(assets, 'manifest.json')));
const catalog = import(pathToFileURL(path.join(__dirname, '../src/catalog.js')).href);

test('Every origin round-trips as a complete, independently editable character', async () => {
  const { PRESETS, makeCharacter, validateCharacter } = await catalog;
  for (const preset of PRESETS) {
    const original = makeCharacter(manifest, preset.id);
    const restored = validateCharacter(JSON.parse(JSON.stringify(original)), manifest);
    assert.deepEqual(restored, original);
    restored.shapes.arbitrary = 1;
    assert.equal(original.shapes.arbitrary, undefined);
  }
});

test('Corrupted, nonfinite, out-of-range and unknown-asset character files are rejected', async () => {
  const { makeCharacter, validateCharacter } = await catalog;
  for (const [key,value] of [['weight',Infinity],['height',0],['skin','../private'],['hair','missing'],['pose','missing'],['skinTint','url(bad)']]) {
    const state = makeCharacter(manifest);state[key] = value;
    assert.throws(()=>validateCharacter(state,manifest),undefined,key);
  }
  const state = makeCharacter(manifest);state.shapes['unknown/control']=.5;
  assert.throws(()=>validateCharacter(state,manifest),/Unknown shape/);
});

test('Undo, redo and branching preserve independent complete character states', async () => {
  const { makeCharacter, History } = await catalog;
  const first=makeCharacter(manifest), history=new History(first);
  const second=structuredClone(first);second.weight=.8;history.push(second);
  const undone=history.undo();assert.equal(undone.weight,first.weight);
  undone.weight=.1;assert.equal(history.redo().weight,.8);
  history.undo();const third=structuredClone(first);third.weight=.3;history.push(third);
  assert.equal(history.redo().weight,.3);assert.equal(history.items.length,2);
});

test('Every exposed detail is bound to actual nonzero renderable mesh displacements', () => {
  const body=JSON.parse(fs.readFileSync(path.join(assets,'body.json')));
  const morphs=JSON.parse(fs.readFileSync(path.join(assets,'morphs.json')));
  const rendered=new Set(body.vertexMap);
  assert.ok(manifest.controls.length>150);
  for(const control of manifest.controls){
    assert.ok(Object.keys(control.targets).length>0,control.id);
    for(const targetName of Object.values(control.targets)){
      const target=morphs[targetName];assert.ok(target,targetName);
      assert.equal(target.d.length,target.i.length*3);
      assert.ok(target.i.some((vertex,index)=>rendered.has(vertex)&&Math.hypot(...target.d.slice(index*3,index*3+3))>1e-8),targetName);
    }
  }
});

test('Body topology and all skin weights use valid bounded indices and normalized influences', () => {
  const body=JSON.parse(fs.readFileSync(path.join(assets,'body.json')));
  const vertexCount=body.positions.length/3;
  assert.equal(body.skinIndices.length,vertexCount*4);assert.equal(body.skinWeights.length,vertexCount*4);
  assert.ok(body.index.every(index=>Number.isInteger(index)&&index>=0&&index<body.vertexMap.length));
  assert.ok(body.vertexMap.every(index=>index>=0&&index<vertexCount));
  assert.ok(body.positions.every(Number.isFinite));
  for(let vertex=0;vertex<vertexCount;vertex++){
    const weights=body.skinWeights.slice(vertex*4,vertex*4+4);
    assert.ok(Math.abs(weights.reduce((a,b)=>a+b,0)-1)<1e-5,`vertex ${vertex}`);
    assert.ok(body.skinIndices.slice(vertex*4,vertex*4+4).every(index=>index>=0&&index<body.boneNames.length));
  }
});

test('Hair and body parts have a complete three-vertex fitting map on the admitted body', () => {
  for(const asset of manifest.attachments){
    const data=JSON.parse(fs.readFileSync(path.join(assets,asset.file)));
    assert.equal(data.bindings.length,data.positions.length/3,asset.id);
    for(const row of data.bindings){
      assert.equal(row.length,9);assert.ok(row.every(Number.isFinite));
      assert.ok(row.slice(0,3).every(index=>Number.isInteger(index)&&index>=0&&index<manifest.counts.baseVertices));
      assert.ok(Math.abs(row[3]+row[4]+row[5]-1)<.0001,asset.id);
    }
    if(asset.kind==='hair'){
      assert.ok(data.detail&&data.detail.index.length>data.index.length*3,asset.id);
      assert.ok(data.detail.skinWeights.every(Number.isFinite),asset.id);
      assert.ok(data.detail.index.every(i=>i>=0&&i<data.detail.vertexMap.length),asset.id);
      for(const row of data.detail.stencils){let sum=0;for(let k=0;k<row.length;k+=2){assert.ok(row[k]>=0&&row[k]<data.bindings.length);sum+=row[k+1];}assert.ok(Math.abs(sum-1)<1e-6);}
    }
  }
});

test('HD subdivision is a complete watertight-by-identity refinement with normalized rig weights',()=>{
  const base=JSON.parse(fs.readFileSync(path.join(assets,'body.json')));
  const fine=JSON.parse(fs.readFileSync(path.join(assets,manifest.bodyDetail)));
  assert.equal(fine.index.length,base.index.length*4);
  assert.equal(fine.parentFaces.length,fine.index.length/3);
  assert.ok(fine.index.every(i=>Number.isInteger(i)&&i>=0&&i<fine.vertexMap.length));
  assert.ok(fine.vertexMap.every(i=>Number.isInteger(i)&&i>=0&&i<fine.stencils.length));
  assert.ok(fine.parentFaces.every(i=>i>=0&&i<fine.sourceFaces.length));
  for(let v=0;v<fine.stencils.length;v++){
    const row=fine.stencils[v];let sum=0;
    for(let i=0;i<row.length;i+=2){assert.ok(Number.isInteger(row[i])&&row[i]>=0&&row[i]<base.positions.length/3);assert.ok(Number.isFinite(row[i+1])&&row[i+1]>=0);sum+=row[i+1];}
    assert.ok(Math.abs(sum-1)<1e-6);
    assert.ok(Math.abs(fine.skinWeights.slice(v*4,v*4+4).reduce((a,b)=>a+b,0)-1)<1e-6);
    assert.ok(fine.skinIndices.slice(v*4,v*4+4).every(i=>i>=0&&i<53));
  }
  // UV seam copies share the same geometric vertex identity/stencil, preventing cracks.
  assert.ok(fine.vertexMap.length>new Set(fine.vertexMap).size);
});

test('Older templates receive compatible quality defaults and invalid quality is rejected',async()=>{
  const {makeCharacter,validateCharacter}=await catalog;const state=makeCharacter(manifest);
  delete state.meshQuality;delete state.renderQuality;
  const restored=validateCharacter(state,manifest);assert.equal(restored.meshQuality,'high');assert.equal(restored.renderQuality,'high');assert.deepEqual(restored.shapes,state.shapes);
  restored.renderQuality='unsupported';assert.throws(()=>validateCharacter(restored,manifest),/quality/);
});

test('All 99 profession, rank and occasion setups round-trip with independent editable wardrobes',async()=>{
  const {PROFESSIONS,OCCASIONS,wardrobePreset,WARDROBE_PRESET_COUNT}=await import(pathToFileURL(path.join(__dirname,'../src/wardrobe-data.js')).href);
  const {makeCharacter,validateCharacter}=await catalog;
  assert.deepEqual(PROFESSIONS.map(p=>p.id),['warrior','mage','civilian','bard','warlock','priest','soldier','officer','commander','ranger','rogue']);
  const states=new Set();
  for(const p of PROFESSIONS){assert.equal(p.ranks.length,3);for(let rank=0;rank<3;rank++)for(const [occasion] of OCCASIONS){
    const c=makeCharacter(manifest);c.wardrobe=wardrobePreset(p.id,rank,occasion);
    assert.deepEqual(validateCharacter(JSON.parse(JSON.stringify(c)),manifest),c);
    states.add(JSON.stringify(c.wardrobe));const independent=wardrobePreset(p.id,rank,occasion);independent.primary='#123456';assert.notEqual(independent.primary,c.wardrobe.primary);
  }}
  assert.equal(states.size,99);assert.equal(WARDROBE_PRESET_COUNT,99);
});

test('Legacy clothing is preserved and unsafe or malformed wardrobe data is rejected',async()=>{
  const {makeCharacter,validateCharacter}=await catalog;
  const legacy=makeCharacter(manifest);delete legacy.wardrobe;
  const loaded=validateCharacter(legacy,manifest);assert.equal(loaded.wardrobe.enabled,false);assert.equal(loaded.outfit,legacy.outfit);
  for(const [key,value] of [['rank',3],['rank',.5],['profession','unknown'],['occasion','unknown'],['primary','red'],['fabric','unknown'],['headpiece','unknown'],['emblemScale',Infinity],['enabled','false'],['emblemImage','https://example.com/image.png'],['emblem','image']]){
    const c=makeCharacter(manifest);c.wardrobe[key]=value;assert.throws(()=>validateCharacter(c,manifest),undefined,key);
  }
});

test('Wardrobe customization, imported emblem and undo survive serialization without aliasing',async()=>{
  const {makeCharacter,validateCharacter,History}=await catalog;const c=makeCharacter(manifest),history=new History(c);
  Object.assign(c.wardrobe,{primary:'#123456',secondary:'#abcdef',fabric:'velvet',secondaryFabric:'silk',necklace:'chain',earrings:'rings',headpiece:'circlet',emblem:'image',emblemImage:'data:image/png;base64,iVBORw0KGgo=',emblemScale:1.4});
  history.push(c);const saved=validateCharacter(JSON.parse(JSON.stringify(c)),manifest);assert.deepEqual(saved.wardrobe,c.wardrobe);
  assert.notEqual(history.undo().wardrobe.primary,c.wardrobe.primary);assert.deepEqual(history.redo().wardrobe,c.wardrobe);
  saved.wardrobe.primary='#000000';assert.equal(c.wardrobe.primary,'#123456');
});
