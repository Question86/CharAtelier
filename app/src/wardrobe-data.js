// Original modular costume recipes. Shared pieces remain individually editable.
export const PROFESSIONS = [
  {id:'warrior',name:'Warrior',ranks:['Squire','Veteran','Champion'],colors:['#743a37','#272f39','#c49c57'],emblem:'swords'},
  {id:'mage',name:'Mage',ranks:['Apprentice','Adept','Archmage'],colors:['#334c79','#222b44','#d1b875'],emblem:'star'},
  {id:'civilian',name:'Civilian',ranks:['Apprentice','Journeyman','Guildmaster'],colors:['#827051','#3f514b','#b99561'],emblem:'tower'},
  {id:'bard',name:'Bard',ranks:['Minstrel','Troubadour','Master bard'],colors:['#704568','#33565c','#d6ad65'],emblem:'lyre'},
  {id:'warlock',name:'Warlock',ranks:['Initiate','Invoker','Coven master'],colors:['#402b50','#202b31','#a985c4'],emblem:'eye'},
  {id:'priest',name:'Priest',ranks:['Acolyte','Priest','High priest'],colors:['#d6ccb3','#79504a','#c9a653'],emblem:'sun'},
  {id:'soldier',name:'Soldier',ranks:['Recruit','Regular','Veteran'],colors:['#52604e','#353c43','#b6a685'],emblem:'swords'},
  {id:'officer',name:'Officer',ranks:['Lieutenant','Captain','Colonel'],colors:['#2c435f','#752f39','#c4a167'],emblem:'tower'},
  {id:'commander',name:'Commander',ranks:['Castellan','General','High marshal'],colors:['#6a2735','#243747','#d5b269'],emblem:'lion'},
  {id:'ranger',name:'Ranger',ranks:['Scout','Pathfinder','Warden'],colors:['#415442','#4a3730','#a99c69'],emblem:'leaf'},
  {id:'rogue',name:'Rogue',ranks:['Cutpurse','Infiltrator','Shadow master'],colors:['#303843','#473842','#9b8c7c'],emblem:'raven'}
];
export const OCCASIONS = [['civil','Civilian'],['field','In the field'],['formal','Ceremonial']];
export const FABRICS = [['linen','Linen'],['wool','Wool'],['leather','Leather'],['velvet','Velvet'],['silk','Silk'],['brocade','Brocade'],['mail','Chainmail']];
export const EMBLEMS = [['none','No emblem'],['sun','Sun'],['moon','Moon'],['star','Arcane star'],['eye','Watchful eye'],['swords','Crossed swords'],['tower','Tower'],['lion','Lion'],['leaf','Leaf'],['raven','Raven'],['lyre','Lyre'],['image','Imported emblem']];
export const WARDROBE_ENUMS = {
  silhouette:['tunic','robe','coat','doublet'],cloak:['none','short','long'],armor:['none','leather','plate'],
  shoulders:['none','left','both'],sleeves:['short','long'],necklace:['none','pendant','chain'],
  earrings:['none','studs','rings'],headpiece:['none','circlet','crown'],emblemPlacement:['chest','cape','both']
};

export function wardrobePreset(profession='warrior',rank=0,occasion='civil') {
  const p=PROFESSIONS.find(p=>p.id===profession);
  if(!p||!Number.isInteger(rank)||rank<0||rank>2||!OCCASIONS.some(o=>o[0]===occasion))throw new Error('Unknown wardrobe setup.');
  const caster=['mage','warlock','priest'].includes(profession),military=['soldier','officer','commander'].includes(profession);
  const field=occasion==='field',formal=occasion==='formal',noble=rank===2;
  const w={enabled:true,profession,rank,occasion,
    primary:p.colors[0],secondary:p.colors[1],trim:p.colors[2],metal:field?'#a2adb5':'#c6b18a',gem:'#72b8c5',
    fabric:formal?(caster||profession==='bard'?'brocade':'velvet'):caster?'wool':field&&['ranger','rogue'].includes(profession)?'leather':'linen',
    secondaryFabric:formal?'silk':'leather',
    silhouette:caster?'robe':military&&(!field||profession==='officer')?'coat':profession==='bard'||profession==='rogue'?'doublet':'tunic',
    cloak:formal&&rank>0||field&&(['mage','warlock','priest','commander'].includes(profession))?'long':field&&profession!=='civilian'||rank>0&&['ranger','warlock'].includes(profession)?'short':'none',
    armor:field&&(['warrior','soldier','officer','commander'].includes(profession))?(rank>0||profession==='commander'?'plate':'leather'):field&&['ranger','rogue'].includes(profession)?'leather':'none',
    shoulders:field&&['warrior','soldier','officer','commander'].includes(profession)?(rank===0?'left':'both'):'none',
    sleeves:profession==='civilian'&&!formal||profession==='rogue'&&field?'short':'long',
    necklace:caster||formal?(noble?'chain':'pendant'):'none',
    earrings:formal&&['bard','rogue','mage'].includes(profession)?'rings':noble&&caster?'studs':'none',
    headpiece:formal&&noble&&['commander','warlock','priest'].includes(profession)?'crown':noble&&(caster||formal)?'circlet':'none',
    emblem:p.emblem,emblemColor:p.colors[2],emblemPlacement:formal&&rank>0?'both':'chest',emblemScale:1,emblemImage:null
  };
  if(profession==='bard'&&formal)w.secondary='#b37153';
  if(profession==='priest'&&formal){w.primary='#e5ddca';w.secondary='#9b6246';}
  if(profession==='rogue'&&field)w.emblem='none';
  return w;
}

export function validateWardrobe(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid wardrobe.');
  const w=structuredClone(value);
  if(typeof w.enabled!=='boolean')throw new Error('Invalid wardrobe visibility.');
  if(!PROFESSIONS.some(p=>p.id===w.profession)||!Number.isInteger(w.rank)||w.rank<0||w.rank>2||!OCCASIONS.some(o=>o[0]===w.occasion))throw new Error('Unknown wardrobe setup.');
  for(const key of ['primary','secondary','trim','metal','gem','emblemColor'])if(typeof w[key]!=='string'||!/^#[0-9a-f]{6}$/i.test(w[key]))throw new Error(`Invalid wardrobe ${key} color.`);
  for(const [key,values] of Object.entries(WARDROBE_ENUMS))if(!values.includes(w[key]))throw new Error(`Unsupported wardrobe ${key}.`);
  for(const key of ['fabric','secondaryFabric'])if(!FABRICS.some(f=>f[0]===w[key]))throw new Error('Unsupported fabric.');
  if(!EMBLEMS.some(e=>e[0]===w.emblem)||!Number.isFinite(w.emblemScale)||w.emblemScale<.5||w.emblemScale>1.5)throw new Error('Invalid emblem.');
  if(w.emblemImage!==null&&(typeof w.emblemImage!=='string'||!/^data:image\/(png|jpeg);base64,/.test(w.emblemImage)||w.emblemImage.length>9_000_000))throw new Error('Invalid imported emblem.');
  if(w.emblem==='image'&&!w.emblemImage)throw new Error('Import an emblem image first.');
  return w;
}

export function wardrobeLabel(w) {
  const p=PROFESSIONS.find(p=>p.id===w.profession);
  return `${p.name} · ${p.ranks[w.rank]} · ${OCCASIONS.find(o=>o[0]===w.occasion)[1]}`;
}

export const WARDROBE_PRESET_COUNT=PROFESSIONS.length*3*OCCASIONS.length;
