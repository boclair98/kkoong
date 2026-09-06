// Mechanical web-asset encoding only. Artwork is generated with the built-in image tool.
// Originals (including their provenance metadata) are always preserved unchanged.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const catalog = require('../src/main/resources/static/crew-catalog.js');
const root = path.resolve(__dirname, '..');
const originals = path.join(root, 'art-source', 'crew-v2');
const output = path.join(root, 'src', 'main', 'resources', 'static', 'assets', 'crew-v2');
const entries = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  : catalog.filter(crew => !crew.atlas).map(crew => ({...crew, source: path.join(originals, crew.key + '.png')}));
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

(async () => {
  fs.mkdirSync(originals, {recursive: true});
  fs.mkdirSync(output, {recursive: true});
  for (const entry of entries) {
    const crew = catalog.find(item => item.id === entry.id && item.key === entry.key && !item.atlas);
    if (!crew) throw new Error('Unknown crew entry');
    const original = path.join(originals, crew.key + '.png');
    if (path.resolve(entry.source) !== original) {
      if (fs.existsSync(original)) {
        if (digest(original) !== digest(entry.source)) throw new Error('Refusing to overwrite original: ' + crew.key);
      } else fs.copyFileSync(entry.source, original, fs.constants.COPYFILE_EXCL);
    }
    const metadata = await sharp(original).metadata();
    const stats = await sharp(original).stats();
    if (!metadata.hasAlpha || stats.channels.at(-1).min !== 0) throw new Error('Missing transparent alpha: ' + crew.key);
    const destination = path.join(output, crew.key + '.webp');
    await sharp(original).resize(512, 512, {fit: 'inside', withoutEnlargement: true})
      .webp({quality: 88, alphaQuality: 100, effort: 5}).toFile(destination);
    const result = await sharp(destination).metadata();
    if (!result.hasAlpha) throw new Error('Alpha lost: ' + crew.key);
    console.log(JSON.stringify({id: crew.id, name: crew.name, source: path.relative(root, original),
      sourceBytes: fs.statSync(original).size, gameBytes: fs.statSync(destination).size,
      width: result.width, height: result.height, alpha: result.hasAlpha, sha256: digest(original)}));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
