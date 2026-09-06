const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../src/main/resources/static/crew-catalog.js');
const root = path.resolve(__dirname, '..');

test('24 stable cosmetic IDs match the server roster size', () => {
  const server = fs.readFileSync(path.join(root, 'src/main/java/kr/coders/threeletterboom/game/MascotRoster.java'), 'utf8');
  const size = Number(server.match(/SIZE = (\d+)/)[1]);
  assert.equal(catalog.length, 24);
  assert.equal(catalog.length, size);
  assert.deepEqual(catalog.map(crew => crew.id), Array.from({length: size}, (_, id) => id));
  assert.equal(new Set(catalog.map(crew => crew.key)).size, size);
  assert.equal(new Set(catalog.map(crew => crew.name)).size, size);
});

test('all 24 appearances differ and the four existing identities stay intact', () => {
  assert.deepEqual(catalog.slice(0, 4).map(crew => crew.name), ['루미', '노바', '볼트', '네오']);
  const signatures = catalog.map(crew => `${crew.image}:${crew.atlas ? crew.id : 'single'}`);
  assert.equal(new Set(signatures).size, 24);
  assert.equal(catalog.filter(crew => crew.group === 'explorers').length, 12);
  assert.equal(catalog.filter(crew => crew.group === 'aliens').length, 6);
  assert.equal(catalog.filter(crew => crew.group === 'robots').length, 6);
});

test('every generated portrait exists, has its own original, and is lightweight WebP', () => {
  let total = 0;
  for (const crew of catalog.filter(item => !item.atlas)) {
    assert.match(crew.image, /^\/assets\/crew-v2\/[a-z0-9]+\.webp$/);
    const image = fs.readFileSync(path.join(root, 'src/main/resources/static', crew.image));
    assert.equal(image.toString('ascii', 0, 4), 'RIFF');
    assert.equal(image.toString('ascii', 8, 12), 'WEBP');
    assert.ok(image.length < 350000, `${crew.key} exceeds mobile image budget`);
    assert.ok(fs.existsSync(path.join(root, 'art-source/crew-v2', crew.key + '.png')));
    total += image.length;
  }
  assert.ok(total < 4000000, 'New portrait payload must stay under 4 MB');
});
