import * as THREE from 'three';
import { Wardrobe } from './wardrobe.js';

const assetURL = name => '/assets/' + name;
const fetchJSON = async name => { const response = await fetch(assetURL(name)); if (!response.ok) throw new Error(`Missing asset: ${name}`); return response.json(); };
const imageCache = new Map();
async function loadImage(url) {
  if (!imageCache.has(url)) imageCache.set(url, new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Could not load material image.')); image.src = url;
  }));
  return imageCache.get(url);
}
function textureFromImage(image) {
  const texture = new THREE.Texture(image); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; texture.needsUpdate = true; return texture;
}
function triangular(value) { return [Math.max(0, 1 - value * 2), 1 - Math.abs(value * 2 - 1), Math.max(0, value * 2 - 1)]; }

export class CharacterModel {
  static async load(manifest) {
    const [body, targets, detail] = await Promise.all([fetchJSON(manifest.body), fetchJSON(manifest.morphs), manifest.bodyDetail ? fetchJSON(manifest.bodyDetail) : null]);
    return new CharacterModel(manifest, body, targets, detail);
  }
  constructor(manifest, body, targets, detail = null) {
    this.manifest = manifest; this.bodyData = body; this.targets = targets;
    this.detailData=detail;this.bodyRenderData=body;this.detailPositions=detail?new Float32Array(detail.stencils.length*3):null;
    this.group = new THREE.Group(); this.group.name = 'Character';
    this.full = new Float32Array(body.positions); this.attachments = new Map(); this.meshCache = new Map();
    this.bones = body.boneNames.map(name => { const bone = new THREE.Bone(); bone.name = name; return bone; });
    this.boneMap = Object.fromEntries(this.bones.map(bone => [bone.name, bone]));
    for (const bone of this.bones) {
      const parent = body.rig[bone.name].parent;
      if (parent && this.boneMap[parent]) this.boneMap[parent].add(bone); else this.group.add(bone);
    }
    this.skeleton = new THREE.Skeleton(this.bones);
    this.skinMaterial = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: .6, metalness: 0, clearcoat: .06, clearcoatRoughness: .75, sheen: .16, sheenColor: new THREE.Color('#cfa590') });
    this.body = new THREE.SkinnedMesh(this.geometry(body), this.skinMaterial);
    this.body.name = 'Body'; this.body.castShadow = true; this.body.receiveShadow = true; this.body.frustumCulled = false;
    this.group.add(this.body); this.wardrobe=new Wardrobe(this); this.revision = 0;
  }
  geometry(data, attachment = false) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(data.vertexMap.length * 3), 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
    geometry.setIndex(data.index);
    const indices = [], weights = [];
    for (const vertex of data.vertexMap) {
      if (!attachment || data.skinIndices) {
        indices.push(...data.skinIndices.slice(vertex * 4, vertex * 4 + 4));
        weights.push(...data.skinWeights.slice(vertex * 4, vertex * 4 + 4));
      } else {
        const binding = data.bindings[vertex], influences = new Map();
        for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) {
          const bone = this.bodyData.skinIndices[binding[k] * 4 + j];
          const weight = this.bodyData.skinWeights[binding[k] * 4 + j] * Math.max(0, binding[k + 3]);
          influences.set(bone, (influences.get(bone) || 0) + weight);
        }
        const best = [...influences].sort((a, b) => b[1] - a[1]).slice(0, 4);
        const total = best.reduce((sum, [, weight]) => sum + weight, 0) || 1;
        while (best.length < 4) best.push([0, 0]);
        indices.push(...best.map(([bone]) => bone)); weights.push(...best.map(([, weight]) => weight / total));
      }
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    return geometry;
  }
  applyTarget(name, amount) {
    if (Math.abs(amount) < .000001) return;
    const target = this.targets[name];
    if (!target) throw new Error(`Required morph is unavailable: ${name}`);
    for (let n = 0; n < target.i.length; n++) {
      const index = target.i[n] * 3, offset = n * 3;
      this.full[index] += target.d[offset] * amount;
      this.full[index + 1] += target.d[offset + 1] * amount;
      this.full[index + 2] += target.d[offset + 2] * amount;
    }
  }
  deform(character) {
    const renderData=character.meshQuality==='standard'||!this.detailData?this.bodyData:this.detailData;
    if(this.bodyRenderData!==renderData){this.body.geometry.dispose();this.bodyRenderData=renderData;this.body.geometry=this.geometry(renderData);}
    this.full.set(this.bodyData.positions);
    const sex = [1 - character.sex, character.sex], age = [1 - character.age, character.age];
    const muscle = triangular(character.muscle), weight = triangular(character.weight);
    for (let s = 0; s < 2; s++) for (let a = 0; a < 2; a++) {
      const prefix = ['female', 'male'][s] + '-' + ['young', 'old'][a];
      this.applyTarget('macrodetails/caucasian-' + prefix, sex[s] * age[a]);
      for (let m = 0; m < 3; m++) for (let w = 0; w < 3; w++) {
        this.applyTarget('macrodetails/universal-' + prefix + '-' + ['minmuscle', 'averagemuscle', 'maxmuscle'][m] + '-' + ['minweight', 'averageweight', 'maxweight'][w], sex[s] * age[a] * muscle[m] * weight[w]);
      }
    }
    for (const control of this.manifest.controls) {
      const value = character.shapes[control.id]; if (value === undefined) continue;
      const sides = control.sided ? [['left', value[0]], ['right', value[1]]] : [['unsided', value]];
      for (const [side, amount] of sides) {
        const target = control.targets[(amount < 0 ? 'negative-' : 'positive-') + side];
        if (target) this.applyTarget(target, Math.abs(amount));
      }
    }
    this.unit = .1 * character.height;
    let lowest = Infinity;
    for (const index of this.bodyData.vertexMap) lowest = Math.min(lowest, this.full[index * 3 + 1]);
    this.floor = -lowest * this.unit + .035;
    let positions=this.full;
    if(renderData===this.detailData){
      positions=this.detailPositions;
      for(let vertex=0;vertex<renderData.stencils.length;vertex++){
        const row=renderData.stencils[vertex];let x=0,y=0,z=0;
        for(let k=0;k<row.length;k+=2){const i=row[k]*3,w=row[k+1];x+=this.full[i]*w;y+=this.full[i+1]*w;z+=this.full[i+2]*w;}
        positions[vertex*3]=x;positions[vertex*3+1]=y;positions[vertex*3+2]=z;
      }
    }
    this.body.geometry.setIndex(renderData.index);
    this.updateGeometry(this.body, renderData, positions);
    const absolute = {};
    for (const name of this.bodyData.boneNames) {
      const spec = this.bodyData.rig[name].head;
      const ids = spec.strategy === 'CUBE' ? this.bodyData.groups[spec.cube_name] : spec.vertex_indices;
      if (!ids?.length) throw new Error(`Missing rig landmark: ${name}`);
      const position = new THREE.Vector3();
      for (const index of ids) position.add(new THREE.Vector3(this.full[index * 3], this.full[index * 3 + 1], this.full[index * 3 + 2]));
      position.multiplyScalar(this.unit / ids.length); position.y += this.floor; absolute[name] = position;
    }
    for (const bone of this.bones) {
      const parent = this.bodyData.rig[bone.name].parent;
      bone.quaternion.identity(); bone.scale.setScalar(1);
      bone.position.copy(absolute[bone.name]);
      if (parent && absolute[parent]) bone.position.sub(absolute[parent]);
    }
    this.group.updateMatrixWorld(true); this.skeleton.calculateInverses();
    this.body.bind(this.skeleton);
    for (const { mesh, data } of this.attachments.values()) { this.fitAttachment(mesh, data); mesh.bind(this.skeleton); }
    this.restHeight = this.body.geometry.boundingBox.max.y;
    this.pose(character.pose, 0);
  }
  updateGeometry(mesh, data, positions) {
    const attribute = mesh.geometry.attributes.position;
    for (let n = 0; n < data.vertexMap.length; n++) {
      const index = data.vertexMap[n] * 3;
      attribute.setXYZ(n, positions[index] * this.unit, positions[index + 1] * this.unit + this.floor, positions[index + 2] * this.unit);
    }
    attribute.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    // Weld normal contributions across UV splits without changing UV identities.
    const normals = mesh.geometry.attributes.normal, sums = new Float32Array(positions.length);
    for (let n = 0; n < data.vertexMap.length; n++) {
      const k = data.vertexMap[n] * 3; sums[k] += normals.getX(n); sums[k + 1] += normals.getY(n); sums[k + 2] += normals.getZ(n);
    }
    for (let n = 0; n < data.vertexMap.length; n++) {
      const k = data.vertexMap[n] * 3, length = Math.hypot(sums[k], sums[k + 1], sums[k + 2]) || 1;
      normals.setXYZ(n, sums[k] / length, sums[k + 1] / length, sums[k + 2] / length);
    }
    normals.needsUpdate = true; mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
  }
  fitAttachment(mesh, data) {
    const scales = ['x', 'y', 'z'].map((axis, n) => {
      const reference = data.scales[axis];
      return reference ? Math.abs(this.full[reference[0] * 3 + n] - this.full[reference[1] * 3 + n]) / reference[2] : 1;
    });
    const positions = new Float32Array(data.bindings.length * 3);
    for (let n = 0; n < data.bindings.length; n++) {
      const binding = data.bindings[n];
      for (let axis = 0; axis < 3; axis++) positions[n * 3 + axis] =
        this.full[binding[0] * 3 + axis] * binding[3] + this.full[binding[1] * 3 + axis] * binding[4] + this.full[binding[2] * 3 + axis] * binding[5] + binding[6 + axis] * scales[axis];
    }
    if(mesh.userData.smoothGeometry&&data.detail){
      const detail=data.detail,fine=new Float32Array(detail.stencils.length*3);
      for(let vertex=0;vertex<detail.stencils.length;vertex++){
        const row=detail.stencils[vertex];
        for(let k=0;k<row.length;k+=2){const i=row[k]*3,w=row[k+1];fine[vertex*3]+=positions[i]*w;fine[vertex*3+1]+=positions[i+1]*w;fine[vertex*3+2]+=positions[i+2]*w;}
      }
      this.updateGeometry(mesh,detail,fine);
    }else this.updateGeometry(mesh, data, positions);
  }
  async syncAttachments(character) {
    const selected = this.manifest.attachments.filter(item => item.kind === 'hair' ? item.id === character.hair : item.kind === 'outfit' ? !character.wardrobe?.enabled && item.id === character.outfit : true);
    const active = new Set(selected.map(item => item.id));
    for (const [id, entry] of this.attachments) entry.mesh.visible = active.has(id);
    for (const item of selected) {
      if (!this.attachments.has(item.id)) {
        const data = await fetchJSON(item.file);
        const map = item.texture ? textureFromImage(await loadImage(assetURL(item.texture))) : null;
        const material = new THREE.MeshPhysicalMaterial({ map, roughness: item.kind === 'eyes' ? .16 : .7,
          metalness: 0, side: item.kind === 'hair' || item.transparent ? THREE.DoubleSide : THREE.FrontSide,
          alphaTest: ['brows','lashes'].includes(item.kind) ? .01 : item.kind === 'hair' || item.transparent ? .2 : 0,
          alphaToCoverage: item.kind === 'hair',
          transparent: item.kind === 'brows' || item.kind === 'lashes',
          depthWrite: item.kind !== 'brows' && item.kind !== 'lashes',
          clearcoat: item.kind === 'eyes' ? .75 : 0, clearcoatRoughness: .08 });
        if(item.normalMap){material.normalMap=textureFromImage(await loadImage(assetURL(item.normalMap)));material.normalMap.colorSpace=THREE.NoColorSpace;material.normalScale.set(.6,.6);}
        const mesh = new THREE.SkinnedMesh(this.geometry(data, true), material);
        mesh.name = item.kind + '_' + item.id; mesh.castShadow = item.kind === 'hair'; mesh.receiveShadow = !['eyes','brows','lashes'].includes(item.kind); mesh.frustumCulled = false;
        this.group.add(mesh); this.attachments.set(item.id, { mesh, data, item });
        this.fitAttachment(mesh, data); mesh.bind(this.skeleton);
      }
      this.attachments.get(item.id).mesh.visible = true;
      const entry=this.attachments.get(item.id),smooth=Boolean(entry.data.detail&&character.meshQuality!=='standard');
      if(Boolean(entry.mesh.userData.smoothGeometry)!==smooth){
        entry.mesh.geometry.dispose();entry.mesh.userData.smoothGeometry=smooth;
        entry.mesh.geometry=this.geometry(smooth?entry.data.detail:entry.data,true);
        this.fitAttachment(entry.mesh,entry.data);entry.mesh.bind(this.skeleton);
      }
    }
    const outfit=this.attachments.get(character.outfit);
    const deleted=character.wardrobe?.enabled?this.wardrobe.coveredVertices:new Set(outfit?.data.deleteVertices||[]);
    const visibleIndices=[];
    const data=this.bodyRenderData;
    for(let index=0;index<data.index.length;index+=3){
      const triangle=data.index.slice(index,index+3);
      const source=data.parentFaces?data.sourceFaces[data.parentFaces[index/3]]:triangle.map(vertex=>data.vertexMap[vertex]);
      if(!source.every(vertex=>deleted.has(vertex)))visibleIndices.push(...triangle);
    }
    this.body.geometry.setIndex(visibleIndices);
    const eyes = this.attachments.get('high-poly');
    if (eyes && this.lastEye !== character.eye) {
      const selectedEye = this.manifest.eyes.find(item => item.id === character.eye);
      const map = textureFromImage(await loadImage(assetURL(selectedEye.texture)));
      eyes.mesh.material.map?.dispose(); eyes.mesh.material.map = map; eyes.mesh.material.needsUpdate = true; this.lastEye = character.eye;
    }
    const hair = this.attachments.get(character.hair);
    if (hair && (this.lastHair !== character.hair || this.lastHairColor !== character.hairColor)) {
      const original = await loadImage(assetURL(hair.item.texture));
      const canvas = document.createElement('canvas'); canvas.width = original.width; canvas.height = original.height;
      const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(original, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const color = character.hairColor.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16));
      for (let i = 0; i < pixels.data.length; i += 4) {
        const light = Math.min(1.3, (.21 * pixels.data[i] + .72 * pixels.data[i + 1] + .07 * pixels.data[i + 2]) / 105);
        for (let channel = 0; channel < 3; channel++) pixels.data[i + channel] = Math.min(255, color[channel] * light);
      }
      context.putImageData(pixels, 0, 0);
      hair.mesh.material.map?.dispose(); hair.mesh.material.map = textureFromImage(canvas); hair.mesh.material.needsUpdate = true;
      this.lastHair = character.hair; this.lastHairColor = character.hairColor;
    }
  }
  async skin(character) {
    const key = JSON.stringify([character.skin, character.tattoos]);
    this.skinMaterial.color.set(character.skinTint); this.skinMaterial.roughness = character.roughness;
    if (key === this.lastSkinKey) return;
    const entry = this.manifest.skins.find(skin => skin.id === character.skin);
    const image = await loadImage(assetURL(entry.texture));
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    for (const tattoo of character.tattoos) {
      context.save(); context.translate(tattoo.u * canvas.width, (1 - tattoo.v) * canvas.height);
      context.rotate(-tattoo.angle * Math.PI / 180); context.scale(tattoo.scale * canvas.width, tattoo.scale * canvas.width);
      context.globalAlpha = tattoo.opacity; context.strokeStyle = tattoo.color; context.fillStyle = tattoo.color;
      context.lineWidth = .025; context.lineCap = 'round'; context.lineJoin = 'round';
      if (tattoo.design === 'image') { const imported = await loadImage(tattoo.image); context.drawImage(imported, -.5, -.5 * imported.height / imported.width, 1, imported.height / imported.width); }
      else drawTattoo(context, tattoo.design);
      context.restore();
    }
    this.skinMaterial.map?.dispose(); this.skinMaterial.map = textureFromImage(canvas); this.skinMaterial.needsUpdate = true; this.lastSkinKey = key;
  }
  async update(character) {
    this.character = structuredClone(character); this.deform(character);
    this.pose('neutral');await this.wardrobe.update(character);
    await this.syncAttachments(character); await this.skin(character);
    this.pose(character.pose, 0); this.revision++;
  }
  pose(name, time = 0, animated = false) {
    for (const bone of this.bones) bone.rotation.set(0, 0, 0);
    const rotate = (id, x = 0, y = 0, z = 0) => this.boneMap[id]?.rotation.set(x, y, z);
    if (name !== 'neutral') { rotate('upperarm_l', 0, 0, -.16); rotate('upperarm_r', 0, 0, .16); rotate('lowerarm_l', -.05); rotate('lowerarm_r', -.05); }
    if (name === 'portrait') { rotate('head', .02, .16, -.04); rotate('neck_01', 0, -.05, 0); }
    if (name === 'hero') { rotate('upperarm_l', -.15, 0, -.06); rotate('lowerarm_l', -.5, .15); rotate('head', 0, -.13); }
    if (name === 'wave') { rotate('upperarm_l', -.2, 0, 1.3); rotate('lowerarm_l', 0, 0, .8 + (animated ? Math.sin(time * 4) * .24 : 0)); }
    if (animated) { this.boneMap.head.rotation.y += Math.sin(time * .8) * .045; this.boneMap.spine_02.rotation.x = Math.sin(time * 1.7) * .009; }
    this.group.updateMatrixWorld(true); this.skeleton.update();
  }
  dispose() {
    this.wardrobe.dispose();
    this.group.traverse(item => { item.geometry?.dispose(); if (item.material) { item.material.map?.dispose(); item.material.dispose(); } });
    this.skeleton.dispose();
  }
}

function drawTattoo(context, design) {
  if (design === 'sun') {
    context.beginPath(); context.arc(0, 0, .22, 0, Math.PI * 2); context.stroke();
    for (let i = 0; i < 12; i++) { const angle = i * Math.PI / 6; context.beginPath(); context.moveTo(Math.cos(angle) * .3, Math.sin(angle) * .3); context.lineTo(Math.cos(angle) * .48, Math.sin(angle) * .48); context.stroke(); }
  } else if (design === 'vine') {
    context.beginPath(); context.moveTo(-.15, .5); context.bezierCurveTo(.45, .1, -.45, -.1, .15, -.5); context.stroke();
    for (let i = 0; i < 5; i++) { const y = -.38 + i * .18, side = i % 2 ? 1 : -1; context.beginPath(); context.ellipse(side * .12, y, .15, .05, side * -.5, 0, Math.PI * 2); context.fill(); }
  } else if (design === 'bands') {
    for (let i = -1; i <= 1; i++) { context.lineWidth = i ? .04 : .09; context.beginPath(); context.moveTo(-.48, i * .17); context.lineTo(.48, i * .17); context.stroke(); }
  } else if (design === 'constellation') {
    const points = [[-.4,.25],[-.2,-.1],[.12,-.35],[.35,-.06],[.2,.35]];
    context.beginPath(); points.forEach(([x,y], i) => i ? context.lineTo(x,y) : context.moveTo(x,y)); context.stroke();
    points.forEach(([x,y]) => { context.beginPath(); context.arc(x,y,.035,0,Math.PI*2); context.fill(); });
  } else {
    for (let i = 0; i < (design === 'sigil' ? 3 : 2); i++) {
      const size = .46 - i * .12; context.beginPath(); context.moveTo(0,-size); context.lineTo(size*.65,0); context.lineTo(0,size); context.lineTo(-size*.65,0); context.closePath(); context.stroke();
    }
    if (design === 'sigil') { context.beginPath(); context.moveTo(-.42,-.22); context.lineTo(.42,.22); context.moveTo(-.42,.22); context.lineTo(.42,-.22); context.stroke(); }
  }
}
