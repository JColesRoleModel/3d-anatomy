import fs from 'fs';
// Which filters each structure belongs to. A structure can be in more than one.
const SYSTEMS = [
  { id: 'skeletal', name: 'Skeletal', color: '#e9e2cf' },
  { id: 'muscular', name: 'Muscular', color: '#b5473f' },
  { id: 'circulatory', name: 'Circulatory', color: '#c0303a' },
  { id: 'lymphatic', name: 'Lymphatic', color: '#5fae6a' },
  { id: 'nervous', name: 'Nervous', color: '#e8c547' },
  { id: 'endocrine', name: 'Endocrine', color: '#9a6fd0' },
  { id: 'sinuses', name: 'Sinuses', color: '#5fb8d6' },
  { id: 'organs', name: 'Organs', color: '#d98a8a' },
  { id: 'joints', name: 'Joints & ligaments', color: '#c9c3a8' },
  { id: 'skin', name: 'Skin & regions', color: '#d9b59a' },
];
const files = ['skeletal','muscular','cardiovascular','lymphoid','nervous','visceral','joints','regions'];
const sinus = /^(Sinus of (frontal|sphenoid) bone|(Anterior|Middle|Posterior) cells of ethmoid bone|Mucosa of nasal cavity|Maxillary sinus)/;
const extraEndocrine = /^(Pancreas|Testis|Ovary|Left lobe of thymus|Right lobe of thymus|Hypothalamus)/;
const structures = [];
for (const file of files) {
  for (const s of JSON.parse(fs.readFileSync(`out/${file}.json`))) {
    const g = s.groups.join(' > ');
    const tags = [];
    let color;
    switch (file) {
      case 'skeletal': tags.push('skeletal'); break;
      case 'muscular': tags.push('muscular'); if (/^Fasciae/.test(g)) color = '#d8cfc4'; break;
      case 'cardiovascular': tags.push('circulatory'); color = /Venous/.test(g) ? '#3f62b5' : '#c0303a'; break;
      case 'lymphoid': tags.push('lymphatic'); break;
      case 'nervous': tags.push('nervous'); if (/^Central/.test(g)) color = '#e6c9b8'; if (/^Sense organs/.test(g)) color = '#d9d0c0'; break;
      case 'visceral': if (/Endocrine glands/.test(g)) tags.push('endocrine'); else tags.push('organs'); break;
      case 'joints': tags.push('joints'); break;
      case 'regions': tags.push('skin'); if (/^Hairs/.test(g)) color = '#3a2a20'; break;
    }
    if (sinus.test(s.name)) { tags.push('sinuses'); color = '#5fb8d6'; }
    if (extraEndocrine.test(s.name) && !tags.includes('endocrine')) tags.push('endocrine');
    if (/Heart|heart/.test(s.name) && file === 'cardiovascular') color = '#a8323a';
    structures.push({ name: s.name, file, groups: s.groups, tags, ...(color ? { color } : {}) });
  }
}
fs.writeFileSync(process.argv[2], JSON.stringify({ systems: SYSTEMS, files, structures }));
const c = {}; structures.forEach(s => s.tags.forEach(t => c[t] = (c[t]||0)+1)); console.log(c, structures.length);
