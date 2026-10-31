import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

export async function canvasPNG(canvas, width = canvas.width, height = canvas.height) {
  let output=canvas;
  if(canvas.width!==width||canvas.height!==height){output=document.createElement('canvas');output.width=width;output.height=height;const context=output.getContext('2d');context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(canvas,0,0,width,height);}
  const blob = await new Promise((resolve, reject) => output.toBlob(value => value ? resolve(value) : reject(new Error('Image encoding failed.')), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

export async function exportModel(model, character) {
  const copy = clone(model.group);
  const body = copy.getObjectByName('Body');
  // Retain covered skin without letting it intersect fitted clothing.
  const visible = new Set();
  for(let i=0;i<body.geometry.index.count;i+=3)visible.add(Array.from(body.geometry.index.array.slice(i,i+3)).join(','));
  const coveredIndices = [];
  for (let i=0;i<model.bodyRenderData.index.length;i+=3) {
    const triangle=model.bodyRenderData.index.slice(i,i+3);
    if (!visible.has(triangle.join(','))) coveredIndices.push(...triangle);
  }
  let covered;
  if (coveredIndices.length) {
    covered=body.clone();covered.name='Covered skin - restore Body material after removing outfit';
    covered.geometry=body.geometry.clone();covered.geometry.setIndex(coveredIndices);
    covered.material=body.material.clone();covered.material.transparent=true;covered.material.opacity=0;covered.material.depthWrite=false;
    covered.material.name='Covered skin - set opacity to 1 after removing outfit';
    copy.add(covered);covered.bind(body.skeleton,body.bindMatrix);
  }
  copy.rotation.set(0, 0, 0);
  copy.userData = {
    application: 'Character Atelier', characterName: character.name,
    templateSchema: character.schema,
    exportNotes: 'Current face/body geometry is baked. The 53-bone skeleton and current pose are retained. Hair, tattoos, wardrobe geometry, fabric normal maps, jewelry and emblems are embedded. Original editing parameters remain in the separate .atelier template.',
    assetOrigin: 'Body and original appearance: MakeHuman / MPFB CC0 data. Fantasy wardrobe: original project-authored procedural geometry and materials.',
    wardrobe: character.wardrobe?.enabled ? {...character.wardrobe,emblemImage:character.wardrobe.emblemImage?'Embedded in emblem material':null} : null
  };
  copy.updateMatrixWorld(true);
  const exporter = new GLTFExporter();
  let buffer;
  try { buffer = await exporter.parseAsync(copy, { binary: true, onlyVisible: true, maxTextureSize: 4096 }); }
  finally { covered?.geometry.dispose();covered?.material.dispose(); }
  if (!(buffer instanceof ArrayBuffer)) throw new Error('Expected a binary glTF file.');
  return window.desktop.saveOutput('model', new Uint8Array(buffer), character.name);
}

function renderScope(context, width, height, transparent) {
  const { renderer, camera, scene, stage } = context;
  const size = renderer.getSize(new THREE.Vector2()), ratio = renderer.getPixelRatio();
  const aspect = camera.aspect, background = scene.background, stageVisible = stage.visible;
  renderer.setPixelRatio(context.qualityScale?.()||1); renderer.setSize(width, height, false);
  camera.aspect = width / height; camera.updateProjectionMatrix();
  if (transparent) { scene.background = null; stage.visible = false; }
  return () => {
    scene.background = background; stage.visible = stageVisible;
    renderer.setPixelRatio(ratio); renderer.setSize(size.x, size.y, false);
    camera.aspect = aspect; camera.updateProjectionMatrix();
  };
}

export async function exportImage(context, character, options = {}) {
  const width = options.width || 1920, height = options.height || 1080;
  if (![1080, 1920, 2160, 3840].includes(width) || ![1080, 1920, 2160, 3840].includes(height)) throw new Error('Unsupported image resolution.');
  const restore = renderScope(context, width, height, Boolean(options.transparent));
  try {
    context.renderer.render(context.scene, context.camera);
    const bytes = await canvasPNG(context.renderer.domElement,width,height);
    return await window.desktop.saveOutput('image', bytes, character.name);
  } finally { restore(); }
}

export async function exportVideo(context, character, options, progress, cancelled) {
  const height = options.height || 1080, fps = 30, duration = options.duration || 6;
  if (![720, 1080].includes(height) || !Number.isFinite(duration) || duration < 2 || duration > 15) throw new Error('Unsupported video settings.');
  if (!await window.desktop.startVideo({ height, fps, name: character.name })) return null;
  const width = Math.round(height * 16 / 9), restore = renderScope(context, width, height, false);
  const rotation = context.model.group.rotation.y;
  let completed = false;
  try {
    const frames = Math.round(duration * fps);
    for (let frame = 0; frame < frames; frame++) {
      if (cancelled()) throw new Error('Video cancelled.');
      const time = frame / fps;
      context.model.group.rotation.y = options.motion === 'turntable' ? rotation + time / duration * Math.PI * 2 : rotation;
      context.model.pose(character.pose, time, options.motion !== 'turntable');
      context.renderer.render(context.scene, context.camera);
      await window.desktop.videoFrame(await canvasPNG(context.renderer.domElement,width,height));
      progress((frame + 1) / frames);
      if (frame % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    const filename = await window.desktop.finishVideo(); completed = true; return filename;
  } finally {
    if (!completed) await window.desktop.cancelVideo();
    context.model.group.rotation.y = rotation; context.model.pose(character.pose, 0); restore();
  }
}
