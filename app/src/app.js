import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mountUI } from './ui.js';
import { CharacterModel } from './model.js';
import { makeCharacter, validateCharacter, History, GROUPS, FACE_GROUPS, PRESETS, controlLabel } from './catalog.js';
import { exportImage, exportModel, exportVideo } from './exports.js';
import { PROFESSIONS, OCCASIONS, FABRICS, EMBLEMS, wardrobePreset, wardrobeLabel, WARDROBE_PRESET_COUNT } from './wardrobe-data.js';

mountUI();
const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
let manifest, character, model, history, environment;
let tab = 'origin', activeGroup = { face: 'head', body: 'torso' }, side = 'both', activeTattoo = 0;
let currentFrame = 'full', angle = 0, spinning = false, placing = false, exporting = false, cancelExport = false;
let dirty = false, updatePending = false, updateRunning = false, toastTimer;
const frameTimes = [];
const scene = new THREE.Scene(); scene.background = new THREE.Color('#191e24');
const camera = new THREE.PerspectiveCamera(32, 1, .015, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
$('#canvas-host').append(renderer.domElement);
const orbit = new OrbitControls(camera, renderer.domElement); orbit.enableDamping = true; orbit.dampingFactor = .08;
orbit.minDistance = .22; orbit.maxDistance = 6; orbit.maxPolarAngle = Math.PI * .97;
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment(); const environmentMap = pmrem.fromScene(room, .04); scene.environment = environmentMap.texture; scene.environmentIntensity = .6; room.dispose(); pmrem.dispose();
const hemisphere = new THREE.HemisphereLight('#d8e5f3', '#3c3330', .45); scene.add(hemisphere);
const key = new THREE.DirectionalLight('#ffe6cf', 1.8); key.position.set(2, 4, 3); key.castShadow = true;
key.shadow.mapSize.set(4096, 4096); key.shadow.radius=2; key.shadow.camera.left = -1.5; key.shadow.camera.right = 1.5;
key.shadow.camera.top = 3; key.shadow.camera.bottom = -1; key.shadow.bias = -.0002; key.shadow.normalBias = .003; scene.add(key);
const fill = new THREE.DirectionalLight('#abc8e8', .65); fill.position.set(-3, 2, 1); scene.add(fill);
const rim = new THREE.DirectionalLight('#d8c5a5', 1.6); rim.position.set(.4, 3, -2); scene.add(rim);
const stage = new THREE.Group(); scene.add(stage);
const platform = new THREE.Mesh(new THREE.CylinderGeometry(.75, .78, .03, 100), new THREE.MeshStandardMaterial({ color: '#0c1117', roughness: .95, metalness: 0, envMapIntensity:.15 }));
platform.position.y = .015; platform.receiveShadow = true; stage.add(platform);
const ring = new THREE.Mesh(new THREE.TorusGeometry(.765, .0012, 6, 128), new THREE.MeshBasicMaterial({ color: '#82735f', transparent: true, opacity: .55 }));
ring.rotation.x = Math.PI / 2; ring.position.y = .031; stage.add(ring);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ color: '#000000', opacity: .27 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = .001; floor.receiveShadow = true; stage.add(floor);
function qualityScale(){return {balanced:1,high:1.5,ultra:2}[character?.renderQuality]||1.5;}
const context = { renderer, scene, camera, stage, model: null, qualityScale };

function toast(message, error = false) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.toggle('error', error); $('#toast').style.display = 'block';
  toastTimer = setTimeout(() => { $('#toast').style.display = 'none'; }, error ? 10000 : 4200);
}
function handleError(error) { console.error(error); toast(error.message || String(error), true); }
window.addEventListener('unhandledrejection', event => { event.preventDefault(); handleError(event.reason); });
window.addEventListener('error', event => handleError(event.error || event.message));

function resize() {
  if (exporting) return;
  const host = $('#canvas-host'); renderer.setSize(host.clientWidth, host.clientHeight);
  camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe($('#canvas-host'));
function frameCamera(frame = currentFrame, viewAngle = angle) {
  if (exporting) return;
  currentFrame = frame; angle = viewAngle;
  const height = model?.restHeight || 1.7;
  const target = frame === 'face' ? new THREE.Vector3(0, height * .91, .035) : new THREE.Vector3(0, height * .51, 0);
  const distance = frame === 'face' ? height * .56 : height * 2.2;
  camera.position.set(target.x + Math.sin(angle) * distance, target.y + (frame === 'face' ? .035 : .04), target.z + Math.cos(angle) * distance);
  orbit.target.copy(target); orbit.update();
  document.querySelectorAll('[data-camera]').forEach(button => button.classList.toggle('active', button.dataset.camera === frame));
}
function applyStudio() {
  const ratio=Math.min(3,Math.max(1,devicePixelRatio)*qualityScale());
  if(renderer.getPixelRatio()!==ratio){renderer.setPixelRatio(ratio);resize();}
  const shadowSize=character.renderQuality==='balanced'?2048:4096;
  if(key.shadow.mapSize.x!==shadowSize){key.shadow.mapSize.set(shadowSize,shadowSize);key.shadow.map?.dispose();key.shadow.map=null;key.shadow.needsUpdate=true;}
  scene.background = new THREE.Color(character.background); renderer.toneMappingExposure = character.exposure;
  const styles = { studio: ['#ffe6cf', '#abc8e8', '#d8c5a5'], warm: ['#ffd09a', '#d7bda7', '#ffd7a8'], moonlight: ['#b9d4ff', '#7f9cd0', '#c6b3e9'] };
  const colors = styles[character.lighting]; key.color.set(colors[0]); fill.color.set(colors[1]); rim.color.set(colors[2]);
}
function updateHeader() {
  $('#character-name').value = character.name;
  $('#scene-name').textContent = character.name === 'Untitled character' ? 'A new beginning.' : character.name;
  $('#scene-subtitle').textContent = (PRESETS.find(p => p.id === character.origin)?.name || 'Custom') + (character.wardrobe?.enabled?' · '+wardrobeLabel(character.wardrobe):' · Character study');
  $('#dirty').style.visibility = dirty ? 'visible' : 'hidden';
  $('#undo').disabled = history.index === 0; $('#redo').disabled = history.index >= history.items.length - 1;
}
function changed(commit = false) {
  dirty = true; updatePending = true; applyStudio(); updateHeader();
  if (commit) { history.push(character); updateHeader(); }
  void flushUpdate();
}
async function flushUpdate() {
  if (updateRunning || exporting) return;
  updateRunning = true;
  try {
    while (updatePending) { updatePending = false; await model.update(structuredClone(character)); }
    $('#model-stats').textContent=`${manifest.counts.controls} shape controls · ${(model.bodyRenderData.index.length/3).toLocaleString('en')} body triangles`;
  } catch (error) { handleError(error); }
  finally { updateRunning = false; }
}
async function waitForUpdate() {
  await flushUpdate();
  while (updateRunning) await new Promise(resolve => setTimeout(resolve, 15));
}
async function replaceCharacter(next, commit = true) {
  character = validateCharacter(next, manifest); dirty = true;
  if (commit) history.push(character);
  applyStudio(); await model.update(character); updateHeader(); renderPanel();
}

function field(label, value, min, max, step, attribute, display = '') {
  return `<div class="field"><div class="field-head"><span>${esc(label)}</span><span class="value">${display || Math.round(value * 100)}</span></div><input aria-label="${esc(label)}" class="range" type="range" min="${min}" max="${max}" step="${step}" value="${value}" ${attribute}></div>`;
}
function selectField(label, key, options, value) {
  return `<div class="field"><div class="field-head">${esc(label)}</div><select data-property="${key}">${options.map(([id,name])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(name)}</option>`).join('')}</select></div>`;
}
function colorField(label, key, value) { return `<label class="color-field">${esc(label)}<input type="color" aria-label="${esc(label)}" data-property="${key}" value="${value}"></label>`; }
function macroField(label, key, min = 0, max = 1) { return field(label, character[key], min, max, .01, `data-property="${key}"`); }
function section(title) { return `<div class="section-title">${title}</div>`; }
function skinLabel(id) {
  const build = id.includes('female') ? 'feminine' : 'masculine';
  const tone = id.includes('african') ? 'Deep' : id.includes('asian') ? 'Warm' : 'Light';
  return `${id.includes('special_suit') ? 'Studio suit' : id.includes('middleage') ? 'Mature skin' : 'Natural skin'} · ${tone} · ${build}`;
}

function wardrobePanel(){
  const w=character.wardrobe,p=PROFESSIONS.find(p=>p.id===w.profession);
  const choose=(label,key,options)=>`<div class="field"><label class="field-head" for="wardrobe-${key}">${esc(label)}</label><select id="wardrobe-${key}" data-wardrobe="${key}">${options.map(([id,name])=>`<option value="${id}" ${w[key]===id?'selected':''}>${esc(name)}</option>`).join('')}</select></div>`;
  const color=(label,key)=>`<label class="color-field">${label}<input type="color" data-wardrobe="${key}" aria-label="${label}" value="${w[key]}"></label>`;
  let html=`<label class="wardrobe-check"><input id="wardrobe-enabled" type="checkbox" ${w.enabled?'checked':''}> Wear fantasy wardrobe</label>`;
  html+=section('Choose a setup')+`<div class="field"><label class="field-head" for="wardrobe-profession">Profession</label><select id="wardrobe-profession" data-setup="profession">${PROFESSIONS.map(x=>`<option value="${x.id}" ${w.profession===x.id?'selected':''}>${x.name}</option>`).join('')}</select></div>`;
  html+=`<div class="field"><label class="field-head" for="wardrobe-rank">Rank</label><select id="wardrobe-rank" data-setup="rank">${p.ranks.map((name,i)=>`<option value="${i}" ${w.rank===i?'selected':''}>${i+1} · ${name}</option>`).join('')}</select></div>`;
  html+=`<div class="pill-row occasion-row">${OCCASIONS.map(([id,name])=>`<button data-occasion="${id}" class="${w.occasion===id?'active':''}">${name}</button>`).join('')}</div>`;
  html+=`<div class="wardrobe-preview"><strong>${p.ranks[w.rank]}</strong><small>${p.name} · ${OCCASIONS.find(o=>o[0]===w.occasion)[1]}<br>${WARDROBE_PRESET_COUNT} modular setups · Every detail is editable</small></div>`;
  html+='<p class="hint">Choosing a setup applies its clothes and palette. Undo brings back your custom look.</p>';
  html+=section('Dyes & finishes')+`<div class="wardrobe-colors">${color('Main cloth','primary')+color('Second cloth','secondary')+color('Binding & trim','trim')+color('Metal','metal')+color('Gemstones','gem')+color('Emblem','emblemColor')}</div>`;
  html+=choose('Main fabric','fabric',FABRICS)+choose('Secondary fabric','secondaryFabric',FABRICS);
  html+='<details class="wardrobe-details"><summary>Garments & armor</summary>';
  html+=choose('Main garment','silhouette',[['tunic','Tunic'],['robe','Long robe'],['coat','Open long coat'],['doublet','Doublet']]);
  html+=choose('Sleeves','sleeves',[['short','Short'],['long','Long']])+choose('Cloak','cloak',[['none','No cloak'],['short','Short cloak'],['long','Long cloak']]);
  html+=choose('Armor','armor',[['none','No armor'],['leather','Leather cuirass & guards'],['plate','Plate cuirass & guards']])+choose('Shoulder guards','shoulders',[['none','None'],['left','Left shoulder'],['both','Both shoulders']])+'</details>';
  html+='<details class="wardrobe-details"><summary>Jewelry & regalia</summary>';
  html+=choose('Necklace','necklace',[['none','None'],['pendant','Pendant'],['chain','Ceremonial chain']])+choose('Earrings','earrings',[['none','None'],['studs','Studs'],['rings','Rings']])+choose('Headpiece','headpiece',[['none','None'],['circlet','Circlet'],['crown','Crown']])+'</details>';
  html+='<details class="wardrobe-details"><summary>Emblem & insignia</summary>';
  html+=choose('Emblem design','emblem',EMBLEMS.filter(e=>e[0]!=='image'||w.emblemImage))+choose('Placement','emblemPlacement',[['chest','Chest'],['cape','Cloak'],['both','Chest & cloak']]);
  html+=field('Emblem size',w.emblemScale,.5,1.5,.01,'data-wardrobe="emblemScale"')+'<button class="full" id="import-emblem">Import PNG / JPEG emblem</button><p class="hint">A transparent PNG gives the cleanest edge. Cloak placement needs a cloak. Emblem color tints imported artwork.</p></details>';
  html+='<button class="full" id="reset-wardrobe">Restore this setup</button><p class="hint">Garments follow the character and its skeleton. Drape is shaped into the model; cloth physics are not simulated.</p>';
  return html;
}

function bindWardrobe(){
  const apply=(profession,rank,occasion)=>{character.wardrobe=wardrobePreset(profession,rank,occasion);changed(true);renderPanel();};
  $('#wardrobe-enabled').onchange=e=>{character.wardrobe.enabled=e.target.checked;changed(true);};
  document.querySelectorAll('[data-setup]').forEach(input=>input.onchange=()=>{const w=character.wardrobe;apply(input.dataset.setup==='profession'?input.value:w.profession,input.dataset.setup==='rank'?Number(input.value):w.rank,w.occasion);});
  document.querySelectorAll('[data-occasion]').forEach(button=>button.onclick=()=>apply(character.wardrobe.profession,character.wardrobe.rank,button.dataset.occasion));
  document.querySelectorAll('[data-wardrobe]').forEach(input=>{
    input.oninput=()=>{character.wardrobe.enabled=true;$('#wardrobe-enabled').checked=true;character.wardrobe[input.dataset.wardrobe]=input.type==='range'?Number(input.value):input.value;const label=input.parentElement.querySelector('.value');if(label)label.textContent=Math.round(Number(input.value)*100);changed();};
    input.onchange=()=>changed(true);
  });
  $('#reset-wardrobe').onclick=()=>apply(character.wardrobe.profession,character.wardrobe.rank,character.wardrobe.occasion);
  $('#import-emblem').onclick=async()=>{try{const image=await window.desktop.importTattoo();if(image){Object.assign(character.wardrobe,{enabled:true,emblem:'image',emblemImage:image});changed(true);renderPanel();}}catch(error){handleError(error);}};
}
const hairNames = { afro01: 'Coils', bob01: 'Classic bob', bob02: 'Soft bob', braid01: 'Long braid', long01: 'Long layers', ponytail01: 'Ponytail', short01: 'Cropped', short02: 'Swept back', short03: 'Short layers', short04: 'Side part', none: 'No hair' };

function renderPanel() {
  document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  const headings = {
    origin: ['CHARACTER', 'Choose an origin', 'A starting point. Every detail remains yours to change.'],
    face: ['SCULPT', 'Face & features', 'Shape the individual. Explore each region, then refine the details.'],
    body: ['SCULPT', 'Body & proportions', 'Build the silhouette, then refine each limb and body region.'],
    skin: ['APPEARANCE', 'Skin & eyes', 'Natural materials, expressive colors, and the details that bring a face to life.'],
    hair: ['APPEARANCE', 'Hair studio', 'Find a silhouette. The hair follows the shape of your character.'],
    tattoos: ['DETAILS', 'Ink & markings', 'Layer your designs. Place them directly on the character.'],
    wardrobe: ['WARDROBE', 'Dress the character', 'Profession, rank and occasion. Make every fabric, color and detail your own.'],
    studio: ['PRESENTATION', 'The studio', 'Set the pose, light and atmosphere for your character study.'],
    export: ['CREATE', 'Take it with you', 'Keep an editable character, render a study, or take the model into another tool.']
  };
  const heading = headings[tab]; $('#section-kicker').textContent = heading[0]; $('#section-name').textContent = heading[1]; $('#section-description').textContent = heading[2];
  let content = '';
  if (tab === 'origin') {
    content = section('Starting points') + `<div class="choice-grid">${PRESETS.map((preset,i)=>`<button class="origin-card ${character.origin===preset.id?'active':''}" data-origin="${preset.id}"><span class="symbol">${['◈','❧','◆','☽'][i]}</span><strong>${preset.name}</strong><small>${preset.subtitle}</small></button>`).join('')}</div>`;
    content += section('Foundation') + macroField('Body blend · feminine to masculine', 'sex') + macroField('Adult age · young to mature', 'age') + macroField('Muscle definition', 'muscle') + macroField('Body weight', 'weight');
    content += selectField('Studio outfit','outfit',[['female_sportsuit01','Training wear'],['male_casualsuit04','Casual wear'],['none','No outfit']],character.outfit);
    content += `<div class="stats"><div class="stat"><strong>${manifest.counts.controls}</strong><span>Shape controls</span></div><div class="stat"><strong>${manifest.attachments.filter(a=>a.kind==='hair').length}</strong><span>Hairstyles</span></div></div><button class="full" id="variation">Create a subtle variation</button><p class="hint">Origins are editable shape presets. Save your own character to reuse it as a template.</p>`;
  } else if (tab === 'face' || tab === 'body') {
    const groups = Object.keys(GROUPS).filter(group => FACE_GROUPS.has(group) === (tab === 'face'));
    if (tab === 'body') content += section('Overall build') + macroField('Height multiplier', 'height', .7, 1.35) + macroField('Muscle definition', 'muscle') + macroField('Body weight', 'weight') + '<div class="divider"></div>';
    content += `<div class="field-head">Region</div><select id="shape-group">${groups.map(group=>`<option value="${group}" ${activeGroup[tab]===group?'selected':''}>${GROUPS[group]}</option>`).join('')}</select><div class="pill-row">${['both','left','right'].map(value=>`<button data-side="${value}" class="${side===value?'active':''}">${value==='both'?'Linked sides':value==='left'?'Left':'Right'}</button>`).join('')}</div><input type="search" id="shape-search" placeholder="Find a detail in this region…" aria-label="Find a shape control"><div class="section-title"><span id="control-count"></span><button class="quiet" id="reset-region">Reset region</button></div><div id="shape-controls"></div>`;
  } else if (tab === 'skin') {
    content = section('Surface') + selectField('Skin material', 'skin', manifest.skins.map(s=>[s.id,skinLabel(s.id)]), character.skin);
    content += colorField('Skin tint', 'skinTint', character.skinTint) + `<div class="swatches">${['#ffffff','#edd8c0','#c7a88a','#8e7058','#93a779','#a49ac2','#8199b1'].map(color=>`<button aria-label="Skin tint ${color}" class="swatch ${character.skinTint===color?'active':''}" data-tint="${color}" style="background:${color}"></button>`).join('')}</div>`;
    content += macroField('Surface roughness', 'roughness', .1, 1) + '<div class="divider"></div>' + section('Eyes') + selectField('Iris', 'eye', manifest.eyes.map(e=>[e.id,e.id.replaceAll('_',' ').replace(/^./,x=>x.toUpperCase())]), character.eye);
    content += '<p class="hint">Skin tint multiplies the chosen texture. Choose a light material for saturated fantasy colors.</p>';
  } else if (tab === 'hair') {
    content = colorField('Hair color', 'hairColor', character.hairColor) + `<div class="swatches">${['#211b18','#573e2b','#84634b','#bf9a65','#ae6e4d','#d6d0c5','#5c6583'].map(color=>`<button aria-label="Hair color ${color}" class="swatch" data-hair-color="${color}" style="background:${color}"></button>`).join('')}</div><div class="divider"></div>`;
    content += `<div class="hair-grid">${['none',...manifest.attachments.filter(a=>a.kind==='hair').map(a=>a.id)].map(id=>{const asset=manifest.attachments.find(a=>a.id===id);return `<button class="hair-card ${character.hair===id?'active':''}" data-hair="${id}">${asset?.thumbnail?`<img src="/assets/${esc(asset.thumbnail)}" alt="" style="width:74px;height:74px;object-fit:contain">`:'<span class="hair-icon">◯</span>'}${hairNames[id]||id}</button>`;}).join('')}</div>`;
  } else if (tab === 'tattoos') {
    content = `<button class="primary full" id="add-tattoo">＋ Add a tattoo layer</button>`;
    if (!character.tattoos.length) content += '<div class="empty" style="margin-top:20px">A mark, a memory, a story.<br>Add a design, then place it on the body.</div>';
    character.tattoos.forEach((layer,index)=>{ content += `<div class="layer-card ${activeTattoo===index?'active':''}"><button class="quiet" data-layer="${index}">${String(index+1).padStart(2,'0')} · ${esc(layer.design)}</button><button class="quiet" data-delete-layer="${index}" title="Delete tattoo layer">×</button></div>`; });
    const tattoo = character.tattoos[activeTattoo];
    if (tattoo) {
      content += '<div class="divider"></div><div class="field-head">Design</div><select id="tattoo-design">' + ['sun','constellation','vine','sigil','bands','diamond',...(tattoo.design==='image'?['image']:[])].map(id=>`<option ${tattoo.design===id?'selected':''}>${id}</option>`).join('') + '</select>';
      content += '<div class="pill-row"><button id="place-tattoo">⌖ Place on character</button><button id="import-tattoo">Import image</button></div>';
      content += `<p class="hint">Click “Place on character”, then click the skin where the design should appear. Use the face view for facial markings.</p>`;
      content += field('Size',tattoo.scale,.005,.25,.001,'data-tattoo="scale"') + field('Rotation',tattoo.angle,-180,180,1,'data-tattoo="angle"',tattoo.angle+'°') + field('Opacity',tattoo.opacity,0,1,.01,'data-tattoo="opacity"');
      content += `<label class="color-field">Ink color<input aria-label="Ink color" type="color" data-tattoo="color" value="${tattoo.color}"></label>`;
    }
  } else if (tab === 'wardrobe') {
    content=wardrobePanel();
  } else if (tab === 'studio') {
    content = section('Graphics quality') + selectField('Rendering', 'renderQuality', [['balanced','Balanced · 1×'],['high','High · 1.5× supersampling'],['ultra','Ultra · 2× supersampling']],character.renderQuality);
    content += selectField('Body & hair mesh','meshQuality',[['standard','Standard · 26,756 body triangles'],['high','Smooth HD · 107,024 body triangles']],character.meshQuality);
    content += '<p class="hint">Higher quality smooths fine edges and body contours. It also applies to exports and needs more GPU time. Source skin and hair textures remain native 2K.</p>';
    content += section('Pose') + selectField('Character pose', 'pose', [['relaxed','Relaxed'],['neutral','Neutral / rig pose'],['portrait','Portrait'],['hero','Hero'],['wave','Wave']],character.pose);
    content += section('Lighting') + selectField('Light setup','lighting',[['studio','Soft studio'],['warm','Golden hour'],['moonlight','Moonlight']],character.lighting) + macroField('Exposure','exposure',.3,2.5);
    content += colorField('Background','background',character.background) + '<div class="divider"></div><p class="hint">Orbit with the left mouse button, pan with the right, and zoom with the wheel. Your current view is used for image and video exports.</p>';
  } else {
    content = section('Character template') + '<button class="full" id="export-template">Save editable character</button><p class="hint">.atelier · Keeps every slider, material, tattoo and studio setting.</p><div class="divider"></div>';
    content += section('Still image') + '<select id="image-size"><option value="1920,1080">Landscape · 1920 × 1080</option><option value="1080,1920">Portrait · 1080 × 1920</option><option value="3840,2160">4K · 3840 × 2160</option></select><label class="check"><input id="transparent" type="checkbox">Transparent background</label><button class="full" id="export-image">Render PNG image</button><div class="divider"></div>';
    content += section('Short video') + '<select id="video-motion"><option value="turntable">Turntable · full rotation</option><option value="animated">Animated pose · breathing / wave</option></select><div class="pill-row"><select id="video-duration"><option value="3">3 seconds</option><option value="6" selected>6 seconds</option><option value="10">10 seconds</option><option value="15">15 seconds</option></select><select id="video-height"><option value="720">720p</option><option value="1080" selected>1080p</option></select></div><button class="full" id="export-video">Render MP4 video</button><p class="hint">30 fps · Current camera and lighting.</p><div class="divider"></div>';
    content += section('3D model') + '<button class="primary full" id="export-model">Export GLB model ↗</button><p class="hint">Current shape, 53-bone rig, hair, skin and tattoos. Shape edits are baked; keep the .atelier file to edit sliders later. Covered skin is retained with a transparent material. Restore its opacity after removing clothing in another tool.</p>';
  }
  $('#inspector-content').innerHTML = content;
  bindPanel(); if (tab==='face'||tab==='body') renderShapeControls();
}

function renderShapeControls() {
  const query = $('#shape-search')?.value.toLowerCase() || '';
  const controls = manifest.controls.filter(control=>control.group===activeGroup[tab] && controlLabel(control).toLowerCase().includes(query));
  $('#control-count').textContent = controls.length + ' DETAILS';
  $('#shape-controls').innerHTML = controls.map(control=>{
    const stored = character.shapes[control.id] ?? (control.sided?[0,0]:0);
    const value = control.sided ? stored[side==='right'?1:0] : stored;
    const min = Object.keys(control.targets).some(key=>key.startsWith('negative')) ? -1 : 0;
    const max = Object.keys(control.targets).some(key=>key.startsWith('positive')) ? 1 : 0;
    return field(controlLabel(control),value,min,max,.01,`data-control="${esc(control.id)}"`);
  }).join('');
  document.querySelectorAll('[data-control]').forEach(input=>{
    input.addEventListener('input',()=>{
      const control=manifest.controls.find(c=>c.id===input.dataset.control),value=Number(input.value);
      if(control.sided){ const values=[...(character.shapes[control.id]||[0,0])]; if(side!=='right')values[0]=value;if(side!=='left')values[1]=value;character.shapes[control.id]=values; }
      else character.shapes[control.id]=value;
      input.parentElement.querySelector('.value').textContent=Math.round(value*100);changed();
    });
    input.addEventListener('change',()=>changed(true));
  });
}

function bindPanel() {
  if(tab==='wardrobe')bindWardrobe();
  document.querySelectorAll('[data-property]').forEach(input=>{
    input.addEventListener('input',()=>{
      character[input.dataset.property]=input.type==='range'?Number(input.value):input.value;
      if(input.dataset.property==='outfit')character.wardrobe.enabled=false;
      const label=input.parentElement.querySelector('.value');if(label)label.textContent=Math.round(Number(input.value)*100);
      changed();
    });
    input.addEventListener('change',()=>changed(true));
  });
  document.querySelectorAll('[data-origin]').forEach(button=>button.onclick=async()=>{await replaceCharacter(makeCharacter(manifest,button.dataset.origin));frameCamera();});
  document.querySelectorAll('[data-side]').forEach(button=>button.onclick=()=>{side=button.dataset.side;renderPanel();});
  if($('#shape-group'))$('#shape-group').onchange=event=>{activeGroup[tab]=event.target.value;renderShapeControls();};
  if($('#shape-search'))$('#shape-search').oninput=renderShapeControls;
  if($('#reset-region'))$('#reset-region').onclick=()=>{for(const control of manifest.controls.filter(c=>c.group===activeGroup[tab]))delete character.shapes[control.id];changed(true);renderShapeControls();};
  document.querySelectorAll('[data-tint]').forEach(button=>button.onclick=()=>{character.skinTint=button.dataset.tint;changed(true);renderPanel();});
  document.querySelectorAll('[data-hair-color]').forEach(button=>button.onclick=()=>{character.hairColor=button.dataset.hairColor;changed(true);renderPanel();});
  document.querySelectorAll('[data-hair]').forEach(button=>button.onclick=()=>{character.hair=button.dataset.hair;changed(true);renderPanel();});
  if($('#variation'))$('#variation').onclick=()=>{
    for(const control of manifest.controls.filter(c=>['nose','chin','cheek','mouth','head'].includes(c.group))){if(Math.random()>.3)continue;const negative=Object.keys(control.targets).some(key=>key.startsWith('negative')),positive=Object.keys(control.targets).some(key=>key.startsWith('positive'));const value=(negative&&positive?Math.random()-.5:negative?-Math.random():Math.random())*.35;character.shapes[control.id]=control.sided?[value,value]:value;}
    changed(true);toast('A subtle variation. Undo to return to the previous character.');
  };
  if($('#add-tattoo'))$('#add-tattoo').onclick=()=>{
    if(character.tattoos.length>=12){toast('The maximum is 12 tattoo layers.');return;}
    const anchor=tattooAnchor(); character.tattoos.push({design:'sun',u:anchor.x,v:anchor.y,scale:.045,angle:0,opacity:.8,color:'#263135'});activeTattoo=character.tattoos.length-1;changed(true);renderPanel();
  };
  document.querySelectorAll('[data-layer]').forEach(button=>button.onclick=()=>{activeTattoo=Number(button.dataset.layer);renderPanel();});
  document.querySelectorAll('[data-delete-layer]').forEach(button=>button.onclick=()=>{character.tattoos.splice(Number(button.dataset.deleteLayer),1);activeTattoo=Math.max(0,Math.min(activeTattoo,character.tattoos.length-1));changed(true);renderPanel();});
  if($('#tattoo-design'))$('#tattoo-design').onchange=event=>{character.tattoos[activeTattoo].design=event.target.value;changed(true);renderPanel();};
  document.querySelectorAll('[data-tattoo]').forEach(input=>{
    input.oninput=()=>{character.tattoos[activeTattoo][input.dataset.tattoo]=input.type==='color'?input.value:Number(input.value);const label=input.parentElement.querySelector('.value');if(label)label.textContent=input.dataset.tattoo==='angle'?input.value+'°':Math.round(Number(input.value)*100);changed();};
    input.onchange=()=>changed(true);
  });
  if($('#place-tattoo'))$('#place-tattoo').onclick=()=>{placing=true;$('#viewport').classList.add('placing');toast('Click the skin to place the active tattoo. Escape cancels.');};
  if($('#import-tattoo'))$('#import-tattoo').onclick=async()=>{try{const image=await window.desktop.importTattoo();if(image){Object.assign(character.tattoos[activeTattoo],{design:'image',image});changed(true);renderPanel();}}catch(error){handleError(error);}};
  if($('#export-template'))$('#export-template').onclick=save;
  if($('#export-image'))$('#export-image').onclick=()=>runExport('image');
  if($('#export-model'))$('#export-model').onclick=()=>runExport('model');
  if($('#export-video'))$('#export-video').onclick=()=>runExport('video');
}

function tattooAnchor() {
  model.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(.1, model.restHeight * .57, 2), new THREE.Vector3(0,0,-1));
  const hit = ray.intersectObject(model.body)[0];
  if (hit?.uv) return hit.uv;
  const position=model.body.geometry.attributes.position,uv=model.body.geometry.attributes.uv;
  const target=new THREE.Vector3(.38,model.restHeight*.48,.1);let best=0,distance=Infinity;
  for(let i=0;i<position.count;i++){const d=(position.getX(i)-target.x)**2+(position.getY(i)-target.y)**2+(position.getZ(i)-target.z)**2;if(d<distance){distance=d;best=i;}}
  return new THREE.Vector2(uv.getX(best),uv.getY(best));
}
const pointerStart=new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown',event=>pointerStart.set(event.clientX,event.clientY));
renderer.domElement.addEventListener('pointerup',event=>{
  if(!placing||pointerStart.distanceTo(new THREE.Vector2(event.clientX,event.clientY))>5)return;
  const rect=renderer.domElement.getBoundingClientRect();const pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
  const ray=new THREE.Raycaster();ray.setFromCamera(pointer,camera);const hit=ray.intersectObject(model.body)[0];
  if(hit?.uv&&character.tattoos[activeTattoo]){character.tattoos[activeTattoo].u=hit.uv.x;character.tattoos[activeTattoo].v=hit.uv.y;placing=false;$('#viewport').classList.remove('placing');changed(true);toast('Tattoo placed. Adjust its size and rotation in the panel.');}
});

async function save(){if(!character||exporting)return;try{validateCharacter(character,manifest);const filename=await window.desktop.saveCharacter(character);if(filename){dirty=false;updateHeader();toast('Character saved: '+filename);}}catch(error){handleError(error);}}
async function runExport(kind){
  if(exporting)return;await waitForUpdate();exporting=true;cancelExport=false;spinning=false;$('#turntable').classList.remove('active');
  $('#busy').hidden=false;$('#busy-text').textContent=kind==='model'?'Preparing the 3D model…':kind==='image'?'Rendering your image…':'Rendering video…';$('#cancel-render').hidden=kind!=='video';$('#progress-fill').style.width='0';
  $('#inspector-content').style.pointerEvents='none';
  orbit.enabled=false;
  try{let filename;
    if(kind==='image'){const [width,height]=$('#image-size').value.split(',').map(Number);filename=await exportImage(context,character,{width,height,transparent:$('#transparent').checked});}
    else if(kind==='model')filename=await exportModel(model,character);
    else filename=await exportVideo(context,character,{height:Number($('#video-height').value),duration:Number($('#video-duration').value),motion:$('#video-motion').value},value=>{$('#progress-fill').style.width=value*100+'%';$('#busy-text').textContent=`Rendering video · ${Math.round(value*100)}%`;},()=>cancelExport);
    if(filename)toast('Saved: '+filename);
  }catch(error){handleError(error);}finally{exporting=false;orbit.enabled=true;$('#busy').hidden=true;$('#inspector-content').style.pointerEvents='';resize();void flushUpdate();}
}

document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{if(!manifest||exporting)return;tab=button.dataset.tab;renderPanel();});
document.querySelectorAll('[data-camera]').forEach(button=>button.onclick=()=>frameCamera(button.dataset.camera));
document.querySelectorAll('[data-angle]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-angle]').forEach(b=>b.classList.toggle('active',b===button));frameCamera(currentFrame,{front:0,side:Math.PI/2,back:Math.PI}[button.dataset.angle]);});
$('#reset-camera').onclick=()=>frameCamera('full',0);
$('#turntable').onclick=()=>{if(exporting)return;spinning=!spinning;$('#turntable').classList.toggle('active',spinning);};
$('#show-export').onclick=()=>{if(manifest&&!exporting){tab='export';renderPanel();}};
$('#save').onclick=save;
$('#open').onclick=async()=>{if(exporting)return;try{const data=await window.desktop.openCharacter();if(data){await replaceCharacter(data);dirty=false;updateHeader();frameCamera();toast('Character opened.');}}catch(error){handleError(error);}};
$('#undo').onclick=()=>{if(character&&!exporting)void replaceCharacter(history.undo(),false);};
$('#redo').onclick=()=>{if(character&&!exporting)void replaceCharacter(history.redo(),false);};
$('#character-name').onchange=event=>{if(!character||exporting)return;character.name=event.target.value.trim()||'Untitled character';changed(true);};
$('#cancel-render').onclick=()=>{cancelExport=true;};
window.addEventListener('keydown',event=>{
  if(event.key==='Escape'){placing=false;$('#viewport').classList.remove('placing');if(exporting)cancelExport=true;}
  if(!character||exporting||event.target.matches('input,textarea,select'))return;
  if(event.ctrlKey&&event.key.toLowerCase()==='s'){event.preventDefault();void save();}
  if(event.ctrlKey&&event.key.toLowerCase()==='z'){event.preventDefault();void replaceCharacter(event.shiftKey?history.redo():history.undo(),false);}
  if(event.ctrlKey&&event.key.toLowerCase()==='y'){event.preventDefault();void replaceCharacter(history.redo(),false);}
});

let previous=performance.now(),lastFPS=previous;
function animate(now){
  requestAnimationFrame(animate);const elapsed=now-previous,delta=Math.min(.1,elapsed/1000);previous=now;
  if(exporting)return;
  if(spinning){orbit.autoRotate=true;orbit.autoRotateSpeed=1.1;}else orbit.autoRotate=false;
  orbit.update(delta);renderer.render(scene,camera);
  if(model){frameTimes.push(elapsed);if(frameTimes.length>180)frameTimes.shift();}
  if(now-lastFPS>1000){$('#fps').textContent=`${Math.round(1000/(frameTimes.reduce((a,b)=>a+b,0)/frameTimes.length||1000))} FPS`;lastFPS=now;}
}
requestAnimationFrame(animate);

async function verify(smoke=false){
  const report={ok:true,counts:manifest.counts,checks:[],outputs:{},limitations:['Current shape is baked in GLB; editing sliders remain in .atelier files.','Visual game-reference quality requires human review.']};
  const check=(name,value)=>{report.checks.push({name,passed:Boolean(value)});if(!value)report.ok=false;};
  const position=model.body.geometry.attributes.position.array;
  check('finite body vertices',[...position].every(Number.isFinite));
  check('real body topology',model.bodyRenderData.index.length>20000);
  check('all required attachments loaded',['high-poly','eyebrow001','eyelashes01','teeth_base',character.hair].every(id=>id==='none'||model.attachments.has(id)));
  check('character validates',Boolean(validateCharacter(character,manifest)));
  check('53-bone skeleton',model.skeleton.bones.length===53);
  check('smooth mesh is available',Boolean(model.detailData&&model.detailData.index.length>model.bodyData.index.length*3));
  check('brows and lashes use smooth alpha blending',['eyebrow001','eyelashes01'].every(id=>{const m=model.attachments.get(id).mesh.material;return m.transparent&&!m.alphaToCoverage&&m.alphaTest<=.01;}));
  if(character.wardrobe?.enabled){
    check('fitted wardrobe meshes are finite and rigged',model.wardrobe.group.children.length>8&&model.wardrobe.group.children.every(mesh=>mesh.isSkinnedMesh&&mesh.geometry.attributes.position.array.every(Number.isFinite)));
    report.wardrobe={label:wardrobeLabel(character.wardrobe),presetCount:WARDROBE_PRESET_COUNT,meshes:model.wardrobe.group.children.map(m=>m.name)};
  }
  report.graphics={meshQuality:character.meshQuality,renderQuality:character.renderQuality,fullBodyTriangles:model.bodyRenderData.index.length/3,bodyVertices:model.body.geometry.attributes.position.count,hairTriangles:model.attachments.get(character.hair)?.mesh.geometry.index.count/3||0,renderBuffer:{width:renderer.domElement.width,height:renderer.domElement.height},sourceSkinPixels:2048};
  report.character=structuredClone(character);
  report.geometrySHA256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',position))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
  if(smoke){renderer.render(scene,camera);return report;}
  const original=structuredClone(character),before=new Float32Array(position);
  const control=manifest.controls.find(c=>c.id==='nose/nose-scale-horiz-decr-incr');
  character.shapes[control.id]=.6;await model.update(character);
  check('nose control deforms actual mesh',model.body.geometry.attributes.position.array.some((value,i)=>Math.abs(value-before[i])>1e-5));
  const controlFailures=[];
  for(const detail of manifest.controls){
    const trial=structuredClone(original);
    const value=Object.keys(detail.targets).some(key=>key.startsWith('positive'))?1:-1;
    trial.shapes[detail.id]=detail.sided?[value,value]:value;
    model.deform(trial);
    const vertices=model.body.geometry.attributes.position.array;
    if(!vertices.every(Number.isFinite)||!vertices.some((v,i)=>Math.abs(v-before[i])>1e-5))controlFailures.push(detail.id);
  }
  report.controlFailures=controlFailures;
  check('all 223 controls deform the live mesh at an admitted endpoint',controlFailures.length===0);
  character=structuredClone(original);character.name='Atelier verification';
  const anchor=tattooAnchor();character.tattoos=[{design:'constellation',u:anchor.x,v:anchor.y,scale:.045,angle:12,opacity:.85,color:'#263135'}];
  await model.update(character);updateHeader();frameCamera('full',0);
  check('template round-trip',JSON.stringify(validateCharacter(JSON.parse(JSON.stringify(character)),manifest))===JSON.stringify(character));
  report.outputs.template=await window.desktop.saveCharacter(character);
  report.savedGeometrySHA256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',model.body.geometry.attributes.position.array))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
  exporting=true;
  try{
    report.outputs.image=await exportImage(context,character,{width:1920,height:1080});
    report.outputs.model=await exportModel(model,character);
    character.pose='wave';model.pose(character.pose);
    report.outputs.video=await exportVideo(context,character,{height:720,duration:3,motion:'animated'},()=>{},()=>false);
    let cancelled=false,frames=0;
    try{await exportVideo(context,{...character,name:'Cancelled verification'},{height:720,duration:3,motion:'turntable'},()=>frames++,()=>frames>=2);}
    catch(error){cancelled=error.message==='Video cancelled.';}
    check('video cancellation returns without publishing a partial clip',cancelled);
  }finally{exporting=false;character.pose=original.pose;await model.update(character);resize();}
  report.reviewSet=[];
  const saved=structuredClone(character);
  for(const presetId of ['human','elf','orc','darkelf']){
    character=makeCharacter(manifest,presetId);character.name='Review '+presetId;
    if(presetId!=='human'&&presetId!=='orc')character.hair='ponytail01';
    await model.update(character);applyStudio();
    if(presetId==='human'){const uv=tattooAnchor();character.tattoos=[{design:'sun',u:uv.x,v:uv.y,scale:.045,angle:0,opacity:.9,color:'#263135'}];await model.update(character);}
    check(presetId+' geometry is finite',model.body.geometry.attributes.position.array.every(Number.isFinite));
    const template=await window.desktop.saveCharacter(character);
    frameCamera('full',.12);
    const full=await exportImage(context,{...character,name:character.name+' full'},{width:1080,height:1920});
    frameCamera('face',.12);
    const face=await exportImage(context,{...character,name:character.name+' face'},{width:1920,height:1080});
    report.reviewSet.push({preset:presetId,template,full,face});
  }
  character=saved;applyStudio();
  await model.update(character);frameCamera('full',0);renderPanel();renderer.render(scene,camera);
  frameTimes.length=0;await new Promise(resolve=>setTimeout(resolve,1500));
  report.frameTimeMs=frameTimes.length?frameTimes.reduce((a,b)=>a+b,0)/frameTimes.length:null;
  report.performanceWindow={mode:'idle full-body viewport after warmup',frames:frameTimes.length,p95Ms:[...frameTimes].sort((a,b)=>a-b)[Math.floor(frameTimes.length*.95)],pixelRatio:renderer.getPixelRatio()};
  const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  report.renderer=gl.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:gl.RENDERER);
  return report;
}

async function start(){
  environment=await window.desktop.environment();
  const response=await fetch('/assets/manifest.json');if(!response.ok)throw new Error('The character asset bundle is missing.');manifest=await response.json();
  $('#loading-text').textContent='Loading the character and its details…';
  model=await CharacterModel.load(manifest);context.model=model;scene.add(model.group);
  character=environment.initialCharacter?validateCharacter(environment.initialCharacter,manifest):makeCharacter(manifest);history=new History(character);
  await model.update(character);applyStudio();updateHeader();renderPanel();frameCamera('full',0);resize();
  $('#loading').remove();$('#status-text').textContent='Studio ready';$('#model-stats').textContent=`${manifest.counts.controls} shape controls · ${(model.bodyRenderData.index.length/3).toLocaleString('en')} body triangles`;
  window.atelier={ready:true,verify,getCharacter:()=>structuredClone(character),getModel:()=>model,setCharacter:replaceCharacter,frameCamera};
}
start().catch(error=>{$('#loading-text').textContent=error.message;$('.spinner')?.remove();handleError(error);});
