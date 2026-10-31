import * as THREE from 'three';

const TAU=Math.PI*2;
const clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp;
const clothSettings={
  linen:{roughness:.91,sheen:.18,normal:.32},wool:{roughness:.96,sheen:.6,normal:.45},
  leather:{roughness:.57,sheen:.06,normal:.3},velvet:{roughness:.85,sheen:1,normal:.14},
  silk:{roughness:.33,sheen:.8,normal:.12},brocade:{roughness:.55,sheen:.7,normal:.4},
  mail:{roughness:.38,sheen:0,normal:.7,metalness:.72}
};

function fabricTextures(type) {
  const n=256,canvas=document.createElement('canvas');canvas.width=canvas.height=n;
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(n,n),height=new Float32Array(n*n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const weave=Math.sin(x*TAU/8)*Math.cos(y*TAU/8),grain=Math.sin(x*127.1+y*311.7)*43758.5453%1;
    let h=.5+.16*weave;
    if(type==='wool')h=.5+.15*weave+.12*grain;
    if(type==='leather')h=.52+.07*grain+.11*Math.sin(x*.39+Math.sin(y*.41))*Math.sin(y*.37);
    if(type==='velvet'||type==='silk')h=.5+.05*weave;
    if(type==='brocade'){const a=x*TAU/64,b=y*TAU/64;h=.48+.22*Math.cos(a+Math.sin(b))*Math.cos(b)+.05*weave;}
    if(type==='mail'){const row=Math.floor(y/16),xx=(x+(row%2)*8)%16-8,yy=y%16-8;const d=Math.hypot(xx*.8,yy);h=.2+.65*Math.exp(-((d-5.3)**2)/1.4);}
    height[y*n+x]=h;const v=type==='mail'?120+h*125:225+h*30;
    const i=(y*n+x)*4;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  const normal=document.createElement('canvas');normal.width=normal.height=n;const nc=normal.getContext('2d'),np=nc.createImageData(n,n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const dx=(height[y*n+(x+1)%n]-height[y*n+(x+n-1)%n])*1.6,dy=(height[((y+1)%n)*n+x]-height[((y+n-1)%n)*n+x])*1.6;
    const l=Math.hypot(dx,dy,1),i=(y*n+x)*4;np.data[i]=128-dx/l*127;np.data[i+1]=128+dy/l*127;np.data[i+2]=128+127/l;np.data[i+3]=255;
  }
  nc.putImageData(np,0,0);
  const map=new THREE.CanvasTexture(canvas),normalMap=new THREE.CanvasTexture(normal);map.colorSpace=THREE.SRGBColorSpace;
  for(const t of [map,normalMap]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(5,6);t.anisotropy=8;}
  return {map,normalMap};
}

function emblemCanvas(design,image) {
  const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');
  if(design==='image'&&image){const s=460/Math.max(image.width,image.height);x.drawImage(image,(512-image.width*s)/2,(512-image.height*s)/2,image.width*s,image.height*s);return c;}
  x.translate(256,256);x.scale(195,195);x.strokeStyle=x.fillStyle='#ffffff';x.lineWidth=.065;x.lineCap='round';x.lineJoin='round';
  const line=points=>{x.beginPath();points.forEach(([a,b],i)=>i?x.lineTo(a,b):x.moveTo(a,b));x.stroke();};
  if(design==='sun'||design==='star'){
    if(design==='sun'){x.beginPath();x.arc(0,0,.35,0,TAU);x.stroke();for(let i=0;i<12;i++){const a=i*TAU/12;line([[Math.cos(a)*.5,Math.sin(a)*.5],[Math.cos(a)*.9,Math.sin(a)*.9]]);}}
    else{line(Array.from({length:11},(_,i)=>{const a=i*Math.PI/5-Math.PI/2,r=i%2?.36:.9;return [Math.cos(a)*r,Math.sin(a)*r];}));x.beginPath();x.arc(0,0,.98,0,TAU);x.stroke();}
  }else if(design==='moon'){
    x.beginPath();x.arc(0,0,.85,0,TAU);x.fill();x.globalCompositeOperation='destination-out';x.beginPath();x.arc(.38,-.22,.74,0,TAU);x.fill();
  }else if(design==='eye'){
    x.beginPath();x.moveTo(-.95,0);x.quadraticCurveTo(0,-.95,.95,0);x.quadraticCurveTo(0,.95,-.95,0);x.stroke();x.beginPath();x.arc(0,0,.29,0,TAU);x.stroke();line([[0,-.82],[0,-1]]);
  }else if(design==='swords'){
    for(const sign of [-1,1]){x.save();x.rotate(sign*.65);line([[0,.95],[0,-.9],[-.12,-.66],[0,-.9],[.12,-.66]]);line([[-.32,.48],[.32,.48]]);x.restore();}
  }else if(design==='tower'){
    line([[-.65,.85],[-.5,-.55],[-.66,-.55],[-.66,-.9],[-.32,-.9],[-.32,-.6],[.32,-.6],[.32,-.9],[.66,-.9],[.66,-.55],[.5,-.55],[.65,.85],[-.65,.85]]);line([[-.14,.85],[-.14,.27],[.14,.27],[.14,.85]]);
  }else if(design==='leaf'){
    x.beginPath();x.moveTo(0,.9);x.bezierCurveTo(-1,.5,-.85,-.5,.3,-.95);x.bezierCurveTo(.9,-.2,.85,.6,0,.9);x.stroke();line([[-.15,1],[.3,-.85]]);for(let i=0;i<4;i++){const y=-.45+i*.3;line([[-.03,y+.18],[-.5,y-.12]]);line([[.08,y+.08],[.55,y-.2]]);}
  }else if(design==='raven'){
    line([[0,.9],[-.2,.3],[-.9,-.25],[-.35,-.13],[-.85,-.7],[-.17,-.28],[0,-.75],[.23,-.9],[.5,-.62],[.2,-.6],[.17,-.28],[.85,-.7],[.35,-.13],[.9,-.25],[.2,.3],[0,.9]]);
  }else if(design==='lyre'){
    x.beginPath();x.moveTo(-.65,-.85);x.bezierCurveTo(-.15,-.55,-.9,.8,0,.8);x.bezierCurveTo(.9,.8,.15,-.55,.65,-.85);x.stroke();line([[-.65,-.7],[.65,-.7]]);for(let i=-2;i<=2;i++)line([[i*.13,-.66],[i*.13,.6]]);line([[-.3,.95],[.3,.95]]);
  }else if(design==='lion'){
    line([[0,-.95],[-.23,-.65],[-.6,-.8],[-.8,-.3],[-.68,.38],[0,.95],[.68,.38],[.8,-.3],[.6,-.8],[.23,-.65],[0,-.95]]);
    line([[-.43,-.23],[-.2,-.15]]);line([[.43,-.23],[.2,-.15]]);line([[-.16,.15],[0,.32],[.16,.15],[-.16,.15]]);line([[0,.32],[0,.56],[-.25,.62]]);line([[0,.56],[.25,.62]]);
  }
  return c;
}

export class Wardrobe {
  constructor(model){
    this.model=model;this.group=new THREE.Group();this.group.name='Wardrobe';model.group.add(this.group);
    this.coveredVertices=new Set();this.materials={};this.fabricCache=new Map();this.geometryKey='';this.emblemKey='';
  }
  material(slot,type,color){
    if(!this.materials[slot])this.materials[slot]=new THREE.MeshPhysicalMaterial({side:THREE.DoubleSide});
    const m=this.materials[slot];m.name=`Wardrobe ${slot} - ${type}`;m.color.set(color);
    const spec=clothSettings[type];
    if(spec){
      if(!this.fabricCache.has(type))this.fabricCache.set(type,fabricTextures(type));
      const maps=this.fabricCache.get(type);m.map=maps.map;m.normalMap=maps.normalMap;m.normalScale.setScalar(spec.normal);
      m.roughness=spec.roughness;m.metalness=spec.metalness||0;m.sheen=spec.sheen;m.sheenColor.set(color).lerp(new THREE.Color('#ffffff'),.25);m.sheenRoughness=.65;
    }else{m.map=null;m.normalMap=null;m.sheen=0;m.metalness=type==='gem'?.15:.88;m.roughness=type==='gem'?.16:.42;m.clearcoat=type==='gem'?.7:.05;}
    m.needsUpdate=true;return m;
  }
  async update(character){
    const w=character.wardrobe;this.group.visible=Boolean(w?.enabled);
    if(!w?.enabled){this.coveredVertices.clear();this.geometryKey='';return;}
    this.w=w;
    this.material('primary',w.fabric,w.primary);this.material('secondary',w.secondaryFabric,w.secondary);
    this.material('trim',w.occasion==='formal'?'brocade':'silk',w.trim);this.material('metal','metal',w.metal);
    this.material('leather','leather',w.secondary);this.material('gem','gem',w.gem);
    const imageKey=JSON.stringify([w.emblem,w.emblemImage]);
    if(imageKey!==this.emblemKey){
      let image=null;
      if(w.emblem==='image'){image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Could not decode the emblem.'));i.src=w.emblemImage;});}
      const texture=new THREE.CanvasTexture(emblemCanvas(w.emblem,image));texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
      if(!this.materials.emblem)this.materials.emblem=new THREE.MeshStandardMaterial({transparent:true,alphaTest:.01,depthWrite:false,roughness:.7,side:THREE.DoubleSide});
      this.materials.emblem.map?.dispose();this.materials.emblem.map=texture;this.materials.emblem.needsUpdate=true;this.materials.emblem.name='Wardrobe emblem';this.emblemKey=imageKey;
    }
    this.materials.emblem.color.set(w.emblemColor);
    const key=JSON.stringify([character.sex,character.age,character.weight,character.muscle,character.height,character.shapes,w.profession,w.rank,w.occasion,w.silhouette,w.cloak,w.armor,w.shoulders,w.sleeves,w.necklace,w.earrings,w.headpiece,w.emblem,w.emblemPlacement,w.emblemScale]);
    if(key!==this.geometryKey){this.rebuild();this.geometryKey=key;}
    // The body skeleton was rebound after shape editing. Garments share that bind space.
    for(const mesh of this.group.children)mesh.bind(this.model.skeleton);
  }
  bone(name){return this.model.bodyData.boneNames.indexOf(name);}
  joint(name){return this.model.boneMap[name].getWorldPosition(new THREE.Vector3());}
  torsoWeights(y){
    const points=['pelvis','spine_01','spine_02','spine_03','neck_01'].map(name=>[this.joint(name).y,this.bone(name)]).sort((a,b)=>a[0]-b[0]);
    if(y<=points[0][0])return [[points[0][1],1]];
    for(let i=1;i<points.length;i++)if(y<=points[i][0]){const t=clamp((y-points[i-1][0])/(points[i][0]-points[i-1][0]),0,1);return [[points[i-1][1],1-t],[points[i][1],t]];}
    return [[points.at(-1)[1],1]];
  }
  skin(geometry,weights){
    const ids=[],values=[],pos=geometry.attributes.position;
    for(let i=0;i<pos.count;i++){
      const row=typeof weights==='function'?weights(i,pos.getX(i),pos.getY(i),pos.getZ(i)):weights;
      for(let j=0;j<4;j++){ids.push(row[j]?.[0]||0);values.push(row[j]?.[1]||0);}
    }
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(ids,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(values,4));
  }
  mesh(name,geometry,material,weights){
    if(weights)this.skin(geometry,weights);
    geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const mesh=new THREE.SkinnedMesh(geometry,material);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
    this.group.add(mesh);mesh.bind(this.model.skeleton);return mesh;
  }
  grid(name,nx,ny,point,material,weight=(i,x,y)=>this.torsoWeights(y)){
    const positions=[],uv=[],index=[];
    for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){positions.push(...point(i/nx,j/ny));uv.push(i/nx,1-j/ny);}
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;index.push(a,c,b,b,c,d);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);
    return this.mesh(name,g,material,weight);
  }
  solid(name,geometry,center,scale,material,bone='spine_03',rotation=null){
    if(rotation)geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation));
    geometry.scale(...scale);geometry.translate(...center);return this.mesh(name,geometry,material,[[this.bone(bone),1]]);
  }
  rawProfile(y,triangles=this.torsoTriangles){
    // Intersect actual body triangles with a horizontal plane. A bounding ellipse
    // expands both axes at once and erases the waist and chest silhouette.
    const pos=this.shellGeometry.attributes.position,segments=[];
    for(const t of triangles){
      const points=t.map(i=>new THREE.Vector3().fromBufferAttribute(pos,i));
      if(y<Math.min(...points.map(p=>p.y))||y>Math.max(...points.map(p=>p.y)))continue;
      const cuts=[];
      for(let k=0;k<3;k++){
        const a=points[k],b=points[(k+1)%3];
        if((a.y<=y&&b.y>y)||(b.y<=y&&a.y>y)){
          const t=(y-a.y)/(b.y-a.y);cuts.push([lerp(a.x,b.x,t),lerp(a.z,b.z,t)]);
        }
      }
      if(cuts.length===2)segments.push(cuts);
    }
    const zs=segments.flat().map(p=>p[1]),cz=zs.length?(Math.min(...zs)+Math.max(...zs))/2:0;
    const radii=Array.from({length:96},(_,i)=>{
      const a=i*TAU/96,dx=Math.sin(a),dz=Math.cos(a);let radius=0;
      for(const [[ax,az0],[bx,bz0]] of segments){
        const az=az0-cz,bz=bz0-cz,ex=bx-ax,ez=bz-az,det=dx*ez-dz*ex;
        if(Math.abs(det)<1e-10)continue;
        const r=(ax*ez-az*ex)/det,t=(ax*dz-az*dx)/det;
        if(t>=0&&t<=1&&r>radius)radius=r;
      }
      return radius||this.h*.035;
    });
    const smooth=radii.map((r,i)=>(radii[(i+95)%96]+r*6+radii[(i+1)%96])/8);
    return {cz,radii:smooth,rx:Math.max(...smooth.map((r,i)=>Math.abs(Math.sin(i*TAU/96)*r))),rz:Math.max(...smooth.map((r,i)=>Math.abs(Math.cos(i*TAU/96)*r)))};
  }
  profile(y){
    const t=clamp((y-this.profileMin)/(this.neckY-this.profileMin),0,1)*(this.profiles.length-1),i=Math.floor(t),a=this.profiles[i],b=this.profiles[Math.min(i+1,this.profiles.length-1)];
    return {rx:lerp(a.rx,b.rx,t-i),rz:lerp(a.rz,b.rz,t-i),cz:lerp(a.cz,b.cz,t-i),radii:a.radii.map((r,k)=>lerp(r,b.radii[k],t-i))};
  }
  garmentProfile(y){
    const p=this.profile(Math.max(y,this.skirtJoin));
    if(y<this.skirtJoin){
      const t=clamp((this.skirtJoin-y)/(this.skirtJoin-this.hemY),0,1);
      const flare=this.w.silhouette==='robe'?.019:this.w.silhouette==='coat'?.014:.014;
      p.radii=p.radii.map((r,i)=>r+this.h*t*(flare*Math.abs(Math.sin(i*TAU/96))+.008*Math.abs(Math.cos(i*TAU/96))));
      p.rx+=this.h*flare*t;p.rz+=this.h*.008*t;
    }
    return p;
  }
  garmentPoint(y,a,extra=0){
    const p=this.garmentProfile(y),t=((a/TAU%1)+1)%1*96,i=Math.floor(t),r=lerp(p.radii[i],p.radii[(i+1)%96],t-i)+this.ease+extra;
    const skirt=clamp((this.skirtJoin-y)/(this.skirtJoin-this.hemY||1),0,1);
    const fold=Math.cos(a*(this.w.silhouette==='robe'?18:14))*this.h*.0015*skirt;
    return [Math.sin(a)*(r+fold),y,p.cz+Math.cos(a)*(r+fold)];
  }
  front(y,x,extra=0){
    let z=-Infinity;
    for(let i=0;i<48;i++){
      const a=this.garmentPoint(y,-Math.PI/2+i*Math.PI/48),b=this.garmentPoint(y,-Math.PI/2+(i+1)*Math.PI/48);
      if(x>=Math.min(a[0],b[0])&&x<=Math.max(a[0],b[0])&&Math.abs(b[0]-a[0])>1e-9)z=Math.max(z,lerp(a[2],b[2],(x-a[0])/(b[0]-a[0])));
    }
    return (Number.isFinite(z)?z:this.garmentPoint(y,0)[2])+extra;
  }
  band(name,y,width,mat,extra=0){
    return this.grid(name,96,2,(u,v)=>this.garmentPoint(y+(v-.5)*width,this.w.silhouette==='coat'&&y<this.waistY-this.h*.04?lerp(.22,TAU-.22,u):u*TAU,extra),mat);
  }
  shell(name,predicate,material,padding,clip=null){
    const data=this.model.bodyData,source=this.shellGeometry,positions=source.attributes.position,normals=source.attributes.normal;
    const vertices=[],p=[],uv=[],si=[],sw=[],normal=[],indices=[],mapping=new Map();
    for(let i=0;i<positions.count;i++){
      const original=data.vertexMap[i],point=new THREE.Vector3().fromBufferAttribute(positions,i),b=this.dominant[i];
      const selected=predicate(i,point.x,point.y,point.z,b),d=selected?(clip?clip(point,b):1):-1;
      if(d>=0)this.coveredVertices.add(original);
      vertices.push({point,normal:new THREE.Vector3().fromBufferAttribute(normals,i),uv:new THREE.Vector2().fromBufferAttribute(source.attributes.uv,i),weights:new Map(Array.from({length:4},(_,k)=>[data.skinIndices[original*4+k],data.skinWeights[original*4+k]]).filter(([,w])=>w>0)),d});
    }
    const mix=(a,b,t)=>{
      const weights=new Map();for(const [id,w] of a.weights)weights.set(id,(weights.get(id)||0)+w*(1-t));
      for(const [id,w] of b.weights)weights.set(id,(weights.get(id)||0)+w*t);
      return {point:a.point.clone().lerp(b.point,t),normal:a.normal.clone().lerp(b.normal,t).normalize(),uv:a.uv.clone().lerp(b.uv,t),weights,d:0};
    };
    const add=v=>{
      const point=v.point.clone().addScaledVector(v.normal,padding),key=[...point.toArray(),...v.uv.toArray()].map(x=>x.toFixed(7)).join(',');
      if(mapping.has(key))return mapping.get(key);
      const id=mapping.size;mapping.set(key,id);p.push(...point.toArray());normal.push(...v.normal.toArray());uv.push(v.uv.x*2,v.uv.y*2);
      const weights=[...v.weights].filter(([,w])=>w>0).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=weights.reduce((n,[,w])=>n+w,0);
      for(let k=0;k<4;k++){si.push(weights[k]?.[0]||0);sw.push((weights[k]?.[1]||0)/sum);}
      return id;
    };
    for(let i=0;i<data.index.length;i+=3){
      const face=data.index.slice(i,i+3).map(v=>vertices[v]),polygon=[];
      for(let k=0;k<3;k++){
        const a=face[k],b=face[(k+1)%3];
        if(a.d>=0)polygon.push(a);
        if((a.d>=0)!==(b.d>=0))polygon.push(mix(a,b,a.d/(a.d-b.d)));
      }
      for(let k=1;k<polygon.length-1;k++)indices.push(add(polygon[0]),add(polygon[k]),add(polygon[k+1]));
    }
    if(!indices.length)return;
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));g.setIndex(indices);
    const mesh=this.mesh(name,g,material);
    // Preserve the body's welded smooth normals, including on newly clipped edges.
    g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));return mesh;
  }
  rebuild(){
    for(const mesh of [...this.group.children]){mesh.geometry.dispose();this.group.remove(mesh);}this.coveredVertices.clear();
    const m=this.model,w=this.w,h=this.h=m.restHeight,mat=this.materials;
    const data=m.bodyData;
    this.shellGeometry=m.geometry(data);m.updateGeometry({geometry:this.shellGeometry},data,m.full);
    const positions=this.shellGeometry.attributes.position;
    this.dominant=data.vertexMap.map(v=>{let k=0;for(let i=1;i<4;i++)if(data.skinWeights[v*4+i]>data.skinWeights[v*4+k])k=i;return data.boneNames[data.skinIndices[v*4+k]];});
    this.ease=h*.0022;
    this.hipY=this.joint('pelvis').y;
    this.shoulderY=(this.joint('upperarm_l').y+this.joint('upperarm_r').y)/2;
    this.neckY=this.joint('neck_01').y;this.profileMin=this.hipY-h*.04;
    this.torsoTriangles=[];
    for(let i=0;i<data.index.length;i+=3){
      const t=data.index.slice(i,i+3);
      if(t.every(v=>/^(pelvis|spine_|clavicle_|neck_|thigh_)/.test(this.dominant[v])))this.torsoTriangles.push(t);
    }
    const slices=Array.from({length:97},()=>[]);
    for(const t of this.torsoTriangles){
      const ys=t.map(i=>positions.getY(i)),a=Math.max(0,Math.ceil((Math.min(...ys)-this.profileMin)/(this.neckY-this.profileMin)*96)),b=Math.min(96,Math.floor((Math.max(...ys)-this.profileMin)/(this.neckY-this.profileMin)*96));
      for(let i=a;i<=b;i++)slices[i].push(t);
    }
    this.profiles=Array.from({length:97},(_,i)=>this.rawProfile(lerp(this.profileMin,this.neckY,i/96),slices[i]));
    // Find the anatomical waist above the pelvis; spine_01 is a low abdomen joint.
    const waistCandidates=Array.from({length:31},(_,i)=>lerp(this.hipY+h*.055,this.shoulderY-h*.105,i/30));
    this.waistY=waistCandidates.reduce((best,y)=>this.profile(y).rx<this.profile(best).rx?y:best,waistCandidates[0]);
    this.skirtJoin=this.hipY+h*.025;
    const ankle=this.joint('foot_l').y;
    this.hemY=w.silhouette==='robe'?ankle+h*.025:w.silhouette==='coat'?this.hipY-h*.19:w.silhouette==='doublet'?this.hipY-h*.035:this.hipY-h*.115;
    const torso=(i,x,y,z,b)=>/^(pelvis|spine_|clavicle_|neck_|thigh_)/.test(b)&&y<this.neckY+h*.01&&y>this.skirtJoin-h*.025;
    const arms=(i,x,y,z,b)=>b.startsWith('upperarm')||w.sleeves==='long'&&b.startsWith('lowerarm');
    this.shell('Fitted shirt and sleeves',(i,x,y,z,b)=>torso(i,x,y,z,b)||arms(i,x,y,z,b),w.silhouette==='coat'?mat.secondary:mat.primary,this.ease,(p,b)=>/arm/.test(b)?1:Math.min(this.neckY-h*.006-p.y,p.y-this.skirtJoin-h*.006));
    if(w.silhouette==='coat')this.shell('Tailored coat bodice',(i,x,y,z,b)=>(torso(i,x,y,z,b)&&(Math.abs(x)>h*.024||z<this.profile(y).cz))||arms(i,x,y,z,b),mat.primary,this.ease+h*.0018);
    // Shell clipping alone owns upper-body coverage; keep the exposed neck visible.
    this.shell('Trousers',(i,x,y,z,b)=>/^(pelvis|thigh_|calf_)/.test(b)&&y<this.waistY,mat.secondary,h*.0018,(p)=>w.silhouette==='coat'?1:this.hemY+h*.003-p.y);
    if(w.silhouette!=='coat')for(let i=0;i<positions.count;i++)if(/^(pelvis|thigh_|calf_)/.test(this.dominant[i])&&positions.getY(i)>this.hemY&&positions.getY(i)<this.waistY)this.coveredVertices.add(data.vertexMap[i]);
    if(w.silhouette==='robe'){
      // A closed robe conceals these layers; suppress their intersections at wide hips.
      if(this.group.getObjectByName('Trousers'))this.group.getObjectByName('Trousers').visible=false;
      for(let i=0;i<positions.count;i++)if(/^(pelvis|thigh_|calf_)/.test(this.dominant[i])&&positions.getY(i)<this.waistY)this.coveredVertices.add(data.vertexMap[i]);
    }
    this.shell('Leather boot shafts',(i,x,y,z,b)=>/^(calf_|foot_)/.test(b)&&y<ankle+h*.14&&y>h*.032&&(w.silhouette!=='robe'||y<this.hemY-h*.012),mat.leather,h*.0035);
    for(let i=0;i<positions.count;i++)if(/^(foot_|ball_)/.test(this.dominant[i]))this.coveredVertices.add(data.vertexMap[i]);
    for(const side of ['l','r']){
      const foot=[];
      for(let i=0;i<positions.count;i++)if(this.dominant[i]==='foot_'+side||this.dominant[i]==='ball_'+side)foot.push(new THREE.Vector3().fromBufferAttribute(positions,i));
      const box=new THREE.Box3().setFromPoints(foot),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
      const soleY=box.min.y-h*.002;
      this.solid('Boot sole '+side,new THREE.CylinderGeometry(1,1,1,40),[center.x,soleY,center.z],[size.x*.53,h*.006,size.z*.52],mat.leather,'foot_'+side);
      this.solid('Closed leather toe '+side,new THREE.SphereGeometry(1,40,24),[center.x,soleY+h*.022,center.z+size.z*.09],[size.x*.53,h*.027,size.z*.51],mat.leather,'foot_'+side);
      this.solid('Boot strap buckle '+side,new THREE.BoxGeometry(1,1,1),[center.x,ankle+h*.05,box.max.z*.45],[h*.022,h*.012,h*.007],mat.metal,'foot_'+side);
    }
    const top=this.skirtJoin+h*.012,coat=w.silhouette==='coat';
    this.grid(w.silhouette==='robe'?'Pleated robe':coat?'Open long coat':w.silhouette==='doublet'?'Tailored doublet':'Layered tunic',96,32,(u,v)=>{
      const y=lerp(top,this.hemY,v),a=coat?lerp(.22,TAU-.22,u):u*TAU;
      return this.garmentPoint(y,a);
    },mat.primary);
    this.band('Waist belt',this.waistY,h*.021,mat.leather,h*.0018);
    this.band('Hem binding',this.hemY+h*.004,h*.008,mat.trim,h*.0012);
    if(w.rank>0)this.band('Embroidered hem border',this.hemY+h*.016,h*.004,mat.trim,h*.0013);
    if(w.rank===2)this.band('Masterwork hem border',this.hemY+h*.025,h*.003,mat.trim,h*.0013);
    const beltZ=this.front(this.waistY,0,h*.004);
    this.solid('Belt buckle',new THREE.BoxGeometry(1,1,1),[0,this.waistY,beltZ],[h*.026,h*.024,h*.005],mat.metal,'spine_02');
    this.solid('Buckle inset',new THREE.BoxGeometry(1,1,1),[0,this.waistY,beltZ+h*.003],[h*.016,h*.013,h*.002],mat.gem,'spine_02');
    if(coat)for(const sign of [-1,1])this.grid('Coat edge piping',2,32,(u,v)=>{
      const y=lerp(this.shoulderY,this.hemY,v);
      if(y>top){const x=sign*h*.025;return [x+(u-.5)*h*.004,y,this.front(y,x,h*.004)];}
      return this.garmentPoint(y,sign*(.22+(u-.5)*.025),h*.0015);
    },mat.trim);
    this.addDetails();
    if(w.cloak!=='none')this.addCloak();
    if(w.armor!=='none')this.addArmor();
    if(w.shoulders!=='none')this.addShoulders();
    this.addJewelry();
    if(w.emblem!=='none'){
      if(w.emblemPlacement!=='cape')this.addEmblem(false);
      if(w.emblemPlacement!=='chest'&&w.cloak!=='none')this.addEmblem(true);
    }
    this.shellGeometry.dispose();
  }
  addDetails(){
    const w=this.w,h=this.h,mat=this.materials;
    // Rank decoration and closures are separate meshes, carried by the upper torso.
    const centerY=this.shoulderY-h*.065;
    for(let i=0;i<=w.rank;i++){
      const y=centerY-i*h*.016,p=this.garmentProfile(y),x=h*.078,z=this.front(y,x,h*.003);
      this.solid('Rank bar '+(i+1),new THREE.BoxGeometry(1,1,1),[x,y,z],[h*.025,h*.004,h*.002],mat.metal);
    }
    if(['officer','commander','bard'].includes(w.profession)||w.occasion==='formal'){
      for(let i=0;i<5;i++){const y=lerp(this.shoulderY-h*.045,this.waistY+h*.035,i/4),p=this.garmentProfile(y);this.solid('Metal garment clasp '+i,new THREE.SphereGeometry(1,12,8),[0,y,this.front(y,0,h*.003)],[h*.003,h*.004,h*.003],mat.metal,y>this.joint('spine_02').y?'spine_03':'spine_02');}
    }
    if(['ranger','rogue','civilian'].includes(w.profession)&&w.occasion!=='formal'){
      const p=this.garmentProfile(this.waistY),x=p.rx*.85,z=p.cz+p.rz*.7;
      this.solid('Leather belt pouch',new THREE.SphereGeometry(1,24,16),[x,this.waistY-h*.055,z],[h*.045,h*.065,h*.025],mat.leather,'pelvis');
      this.solid('Pouch clasp',new THREE.SphereGeometry(1,12,8),[x,this.waistY-h*.045,z+h*.025],[h*.005,h*.005,h*.003],mat.metal,'pelvis');
    }
    if(['priest','mage','warlock'].includes(w.profession)){
      for(const sign of [-1,1])this.grid('Embroidered stole',5,34,(u,v)=>{const y=lerp(this.shoulderY-h*.018,this.hemY+h*.03,v),p=this.garmentProfile(y),x=sign*(h*.045+u*h*.028);return [x,y,this.front(y,x,h*.008)];},mat.trim);
    }
  }
  cloakPoint(u,v){
    const h=this.h,top=this.shoulderY+h*.012+Math.sin(u*Math.PI)*h*.035,bottom=this.w.cloak==='long'?this.joint('foot_l').y+h*.09:this.hipY-h*.055;
    const y=lerp(top,bottom,v),a=lerp(Math.PI-1.15,Math.PI+1.15,u);
    const p=this.garmentPoint(Math.max(y,this.skirtJoin),a,h*.005);
    const flare=clamp((this.waistY-y)/(this.waistY-bottom),0,1);
    p[0]*=1+flare*.16;p[1]=y;p[2]-=h*.018*flare+Math.cos(u*TAU*7)*h*.0025*flare;
    return p;
  }
  addCloak(){
    const h=this.h,mat=this.materials;
    this.grid('Draped '+this.w.cloak+' cloak',48,30,(u,v)=>this.cloakPoint(u,v),mat.secondary);
    this.grid('Cloak hem embroidery',48,2,(u,v)=>{const p=this.cloakPoint(u,.98+v*.015);p[2]-=h*.004;return p;},mat.trim);
    for(const u of [0,1])this.grid('Cloak edge binding',2,30,(x,v)=>{const p=this.cloakPoint(clamp(u+(u===0?1:-1)*x*.012,0,1),v);p[2]-=h*.003;return p;},mat.trim);
    for(const sign of [-1,1]){const y=this.shoulderY-h*.005,p=this.profile(y);this.solid('Cloak brooch',new THREE.SphereGeometry(1,20,12),[sign*h*.078,y,this.front(y,sign*h*.078,h*.004)],[h*.009,h*.009,h*.004],mat.metal);}
    for(const sign of [-1,1]){
      const y=this.shoulderY-h*.005,p=this.profile(y),end=this.cloakPoint(sign>0?.12:.88,0);
      const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(sign*h*.078,y,this.front(y,sign*h*.078,h*.005)),new THREE.Vector3(sign*h*.065,this.neckY-h*.006,p.cz),new THREE.Vector3(...end)]);
      this.grid('Cloak shoulder fastening',4,16,(u,v)=>{const q=curve.getPoint(v);q.x+=(u-.5)*h*.014;return q.toArray();},mat.secondary);
    }
  }
  addArmor(){
    const h=this.h,mat=this.materials,material=this.w.armor==='plate'?mat.metal:mat.leather;
    const top=this.shoulderY-h*.035,bottom=this.waistY+h*.016;
    this.grid(this.w.armor==='plate'?'Forged cuirass':'Leather cuirass',64,24,(u,v)=>{
      const a=lerp(-1.52,1.52,u),y=lerp(top,bottom,v),p=this.garmentPoint(y,a,h*.004);
      p[2]+=h*.0025*Math.exp(-Math.abs(a)*7);return p;
    },material);
    this.band('Cuirass waist edging',bottom,h*.006,mat.trim,h*.005);
    for(const side of ['l','r']){
      this.limbGuard('Armored greave '+side,'calf_'+side,'foot_'+side,.25,.9,material);
      this.limbGuard('Bracer '+side,'lowerarm_'+side,'hand_'+side,.25,.9,material);
    }
  }
  limbGuard(name,startName,endName,startT,endT,material){
    const a=this.joint(startName),axis=this.joint(endName).sub(a),length=axis.length();axis.normalize();
    this.shell(name,(i,x,y,z,b)=>{
      const t=new THREE.Vector3(x,y,z).sub(a).dot(axis)/length;
      return b===startName;
    },material,this.ease+this.h*.004,(p)=>{const t=p.clone().sub(a).dot(axis)/length;return Math.min(t-startT,endT-t)*length;});
  }
  addShoulders(){
    const h=this.h,mat=this.materials;
    for(const sign of this.w.shoulders==='left'?[1]:[1,-1]){
      const side=sign===1?'l':'r',j=this.joint('upperarm_'+side),material=this.w.armor==='leather'?mat.leather:mat.metal;
      this.shell('Layered pauldron '+side,(i,x,y,z,b)=>
        (b==='upperarm_'+side||b==='clavicle_'+side)&&x*sign>Math.abs(j.x)-h*.025&&
        y>j.y-h*.06&&new THREE.Vector3(x,y,z).distanceTo(j)<h*.095,
        material,this.ease+h*.006,p=>p.y-(j.y-h*.04));
    }
  }
  addJewelry(){
    const w=this.w,h=this.h,mat=this.materials,neck=this.joint('neck_01');
    if(w.necklace!=='none'){
      const points=[];
      for(let i=0;i<=60;i++){const a=i*TAU/60,x=Math.sin(a)*h*.064,y=neck.y-h*.016-Math.max(0,Math.cos(a))*h*.085,p=this.profile(y);points.push(new THREE.Vector3(x,y,this.garmentPoint(y,a,h*.003)[2]));}
      const tube=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),96,h*(w.necklace==='chain'?.0032:.0018),6,false);this.mesh('Necklace chain',tube,mat.metal,(i,x,y)=>this.torsoWeights(y));
      const y=neck.y-h*.102,p=this.profile(y);
      this.solid('Pendant setting',new THREE.OctahedronGeometry(1,1),[0,y,this.front(y,0,h*.006)],[h*.018,h*.025,h*.009],mat.metal);
      this.solid('Pendant gemstone',new THREE.OctahedronGeometry(1,1),[0,y,this.front(y,0,h*.011)],[h*.011,h*.017,h*.006],mat.gem);
    }
    if(w.headpiece!=='none'){
      const y=h*.961,headPoints=[];
      const pos=this.model.body.geometry.attributes.position;
      for(let i=0;i<pos.count;i++)if(Math.abs(pos.getY(i)-y)<h*.015)headPoints.push(new THREE.Vector3().fromBufferAttribute(pos,i));
      const rx=Math.max(h*.046,...headPoints.map(p=>Math.abs(p.x)))+h*.004,front=Math.max(...headPoints.map(p=>p.z)),back=Math.min(...headPoints.map(p=>p.z)),rz=(front-back)/2+h*.006,cz=(front+back)/2;
      this.grid('Jewelled '+w.headpiece,64,4,(u,v)=>{const a=u*TAU,peaks=w.headpiece==='crown'?Math.max(0,Math.cos(a*7))*h*.025:0;return [Math.sin(a)*rx,y+v*(h*.012+peaks),cz+Math.cos(a)*rz];},mat.metal,[[this.bone('head'),1]]);
      for(let k=0;k<5;k++){const a=lerp(-1.1,1.1,k/4);this.solid('Headpiece jewel '+k,new THREE.OctahedronGeometry(1,1),[Math.sin(a)*(rx+h*.002),y+h*.009,cz+Math.cos(a)*(rz+h*.003)],[h*.005,h*.007,h*.004],mat.gem,'head');}
    }
    if(w.earrings!=='none'){
      const pos=this.model.body.geometry.attributes.position;
      for(const sign of [-1,1]){
        let best=null,score=-Infinity;
        for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i);if(y<h*.87||y>h*.94||x*sign<0)continue;const s=x*sign-Math.abs(y-h*.9)*.9;if(s>score){score=s;best=new THREE.Vector3(x,y,pos.getZ(i));}}
        if(best){best.y-=h*.008;best.z+=h*.004;
          this.solid('Earring '+sign,w.earrings==='rings'?new THREE.TorusGeometry(1,.17,8,28):new THREE.OctahedronGeometry(1,1),best.toArray(),[h*.009,h*.013,h*.009],mat.metal,'head');
        }
      }
    }
  }
  addEmblem(back){
    const h=this.h,w=this.w,size=h*.085*w.emblemScale,center=this.shoulderY-h*.12;
    this.grid(back?'Cloak emblem':'Chest emblem',12,12,(u,v)=>{
      const x=(u-.5)*size,y=center+(.5-v)*size,p=this.garmentProfile(y);
      if(back){const top=this.shoulderY+h*.07,bottom=w.cloak==='long'?this.joint('foot_l').y+h*.09:this.hipY-h*.055,t=clamp((top-y)/(top-bottom),0,1),q=this.cloakPoint(.5,t);return [x,y,q[2]-h*.006+Math.abs(x)*.08];}
      const armor=w.armor==='none'?0:h*.007;
      return [x,y,this.front(y,x,h*.003+armor)];
    },this.materials.emblem);
  }
  dispose(){
    for(const mesh of this.group.children)mesh.geometry.dispose();
    for(const material of Object.values(this.materials))material.dispose();
    for(const maps of this.fabricCache.values()){maps.map.dispose();maps.normalMap.dispose();}
    this.materials.emblem?.map?.dispose();this.model.group.remove(this.group);
  }
}
