import { wardrobePreset, validateWardrobe } from './wardrobe-data.js';
export const SCHEMA = 'character-atelier/v1';
export const GROUPS = {
  head: 'Head shape', forehead: 'Forehead', eyebrows: 'Brow ridge', eyes: 'Eyes & lids',
  nose: 'Nose', cheek: 'Cheeks', mouth: 'Mouth & lips', chin: 'Jaw & chin', ears: 'Ears',
  neck: 'Neck', torso: 'Torso & shoulders', breast: 'Chest', stomach: 'Abdomen',
  hip: 'Hips', pelvis: 'Pelvis', buttocks: 'Glutes', arms: 'Arms', hands: 'Hands',
  legs: 'Legs', feet: 'Feet', asym: 'Facial asymmetry'
};
export const FACE_GROUPS = new Set(['head', 'forehead', 'eyebrows', 'eyes', 'nose', 'cheek', 'mouth', 'chin', 'ears', 'asym']);
export const PRESETS = [
  { id: 'human', name: 'Human', subtitle: 'A familiar beginning', initial: { sex: 0, muscle: .45, weight: .45 } },
  { id: 'elf', name: 'High elf', subtitle: 'Slender. Otherworldly.', initial: { sex: 0, muscle: .25, weight: .32, height: 1.06 },
    shapes: { 'ears/ear-shape-pointed-triangle': -.75, 'ears/ear-scale-vert-decr-incr': .35, 'head/head-scale-horiz-decr-incr': -.2, 'chin/chin-width-decr-incr': -.25 } },
  { id: 'orc', name: 'Orc', subtitle: 'A powerful silhouette', initial: { sex: 1, muscle: .86, weight: .65, height: 1.08 },
    shapes: { 'head/head-scale-horiz-decr-incr': .45, 'chin/chin-width-decr-incr': .55, 'nose/nose-scale-horiz-decr-incr': .4, 'ears/ear-shape-pointed-triangle': -.5 }, skinTint: '#93a779' },
  { id: 'darkelf', name: 'Dusk elf', subtitle: 'Moonlight and shadow', initial: { sex: .15, muscle: .45, weight: .32, height: 1.03 },
    shapes: { 'ears/ear-shape-pointed-triangle': -.9, 'ears/ear-scale-vert-decr-incr': .3, 'head/head-scale-horiz-decr-incr': -.15 }, skinTint: '#a49ac2', hairColor: '#d6d0c5' }
];

export function makeCharacter(manifest, presetId = 'human') {
  const preset = PRESETS.find(p => p.id === presetId) || PRESETS[0];
  const character = {
    schema: SCHEMA, name: 'Untitled character', origin: preset.id,
    sex: 0, age: 0, muscle: .45, weight: .45, height: 1,
    skin: 'young_caucasian_female', skinTint: '#ffffff', roughness: .6, outfit: 'female_sportsuit01',
    hair: 'long01', hairColor: '#766052', eye: 'green', shapes: {}, tattoos: [],
    pose: 'relaxed', lighting: 'studio', background: '#191e24', exposure: 1,
    meshQuality:'high',renderQuality:'high',wardrobe:wardrobePreset(),
    ...preset.initial
  };
  if (character.sex > .5) { character.skin = 'young_caucasian_male'; character.hair = 'short02'; character.outfit = 'male_casualsuit04'; }
  if (preset.skinTint) character.skinTint = preset.skinTint;
  if (preset.hairColor) character.hairColor = preset.hairColor;
  for (const [id, value] of Object.entries(preset.shapes || {})) {
    const control = manifest.controls.find(c => c.id === id);
    if (control) character.shapes[id] = control.sided ? [value, value] : value;
  }
  return character;
}

export function controlLabel(control) {
  return control.name
    .replace(/^(head|nose|mouth|chin|cheek|ear|forehead|neck|hip|pelvis|stomach|torso|breast|buttocks)-/, '')
    .replace('scale-horiz', 'width').replace('scale-vert', 'height').replace('scale-depth', 'depth')
    .replace('trans-backward-forward', 'forward position').replace('trans-down-up', 'vertical position')
    .replace('trans-in-out', 'spacing').replace('rot-backward-forward', 'rotation')
    .replace(/-(decr-incr|decrease-increase)$/, '').replace(/^measure-/, '')
    .replaceAll('-', ' ').replace(/\b\w/g, x => x.toUpperCase());
}

export function validateCharacter(input, manifest) {
  if (!input || typeof input !== 'object' || input.schema !== SCHEMA) throw new Error('This is not a supported Character Atelier file.');
  const result = structuredClone(input);
  result.meshQuality??='high';result.renderQuality??='high';
  if(result.wardrobe===undefined)result.wardrobe={...wardrobePreset(),enabled:false};
  result.wardrobe=validateWardrobe(result.wardrobe);
  if(!['standard','high'].includes(result.meshQuality)||!['balanced','high','ultra'].includes(result.renderQuality))throw new Error('Unsupported quality setting.');
  if (typeof result.name !== 'string' || result.name.length > 120) throw new Error('Invalid character name.');
  const bounds = { sex: [0, 1], age: [0, 1], muscle: [0, 1], weight: [0, 1], height: [.7, 1.35], roughness: [.1, 1], exposure: [.3, 2.5] };
  for (const [name, [min, max]] of Object.entries(bounds)) {
    if (!Number.isFinite(result[name]) || result[name] < min || result[name] > max) throw new Error(`Invalid ${name} value.`);
  }
  for (const key of ['skinTint', 'hairColor', 'background']) if (!/^#[\da-f]{6}$/i.test(result[key])) throw new Error(`Invalid ${key}.`);
  if (!manifest.skins.some(s => s.id === result.skin)) throw new Error('The required skin is not installed.');
  if (!manifest.eyes.some(e => e.id === result.eye)) throw new Error('The required eye material is not installed.');
  if (result.hair !== 'none' && !manifest.attachments.some(a => a.kind === 'hair' && a.id === result.hair)) throw new Error('The required hairstyle is not installed.');
  if (result.outfit !== 'none' && !manifest.attachments.some(a => a.kind === 'outfit' && a.id === result.outfit)) throw new Error('The required outfit is not installed.');
  if (!['relaxed', 'neutral', 'portrait', 'hero', 'wave'].includes(result.pose)) throw new Error('Unsupported pose.');
  if (!['studio', 'warm', 'moonlight'].includes(result.lighting)) throw new Error('Unsupported lighting.');
  if (!result.shapes || Array.isArray(result.shapes) || typeof result.shapes !== 'object') throw new Error('Invalid shape parameters.');
  for (const [id, value] of Object.entries(result.shapes)) {
    const control = manifest.controls.find(c => c.id === id);
    if (!control) throw new Error(`Unknown shape: ${id}`);
    const values = control.sided ? value : [value];
    if (!Array.isArray(values) || values.length !== (control.sided ? 2 : 1) || values.some(v => !Number.isFinite(v) || v < -1 || v > 1)) throw new Error(`Invalid shape value: ${id}`);
  }
  if (!Array.isArray(result.tattoos) || result.tattoos.length > 12) throw new Error('At most 12 tattoo layers are supported.');
  for (const tattoo of result.tattoos) {
    if (!['sun', 'constellation', 'vine', 'sigil', 'bands', 'diamond', 'image'].includes(tattoo.design)) throw new Error('Unsupported tattoo design.');
    for (const [key, min, max] of [['u', 0, 1], ['v', 0, 1], ['scale', .005, .25], ['angle', -180, 180], ['opacity', 0, 1]]) {
      if (!Number.isFinite(tattoo[key]) || tattoo[key] < min || tattoo[key] > max) throw new Error(`Invalid tattoo ${key}.`);
    }
    if (!/^#[\da-f]{6}$/i.test(tattoo.color)) throw new Error('Invalid tattoo color.');
    if (tattoo.design === 'image' && (typeof tattoo.image !== 'string' || !/^data:image\/(png|jpeg);base64,/.test(tattoo.image) || tattoo.image.length > 9_000_000)) throw new Error('Invalid tattoo image.');
  }
  return result;
}

export class History {
  constructor(initial, limit = 80) { this.items = [structuredClone(initial)]; this.index = 0; this.limit = limit; }
  push(state) {
    if (JSON.stringify(this.items[this.index]) === JSON.stringify(state)) return;
    this.items = this.items.slice(0, this.index + 1);
    this.items.push(structuredClone(state));
    if (this.items.length > this.limit) this.items.shift();
    this.index = this.items.length - 1;
  }
  undo() { if (this.index > 0) this.index--; return structuredClone(this.items[this.index]); }
  redo() { if (this.index < this.items.length - 1) this.index++; return structuredClone(this.items[this.index]); }
}
