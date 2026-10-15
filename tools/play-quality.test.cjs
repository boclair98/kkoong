const {test} = require('node:test');
const assert = require('node:assert/strict');
const {volume, audioMix, draftGuide, roundReport} = require('../src/main/resources/static/play-quality.js');

test('audio channels mute independently and zero volume stays silent', () => {
  const prefs = {musicEnabled: true, effectsEnabled: true, musicVolume: 100, effectsVolume: 50, scene: 'playing'};
  assert.deepEqual(audioMix(prefs), {music: .34, effects: .36, audible: true});
  assert.deepEqual(audioMix({...prefs, musicEnabled: false}), {music: 0, effects: .36, audible: true});
  assert.deepEqual(audioMix({...prefs, effectsEnabled: false}), {music: .34, effects: 0, audible: true});
  assert.deepEqual(audioMix({...prefs, musicVolume: 0, effectsVolume: 0}), {music: 0, effects: 0, audible: false});
});
test('saved audio values are bounded with a fallback for invalid storage', () => {
  assert.equal(volume(null), 70); assert.equal(volume('broken'), 70);
  assert.equal(volume('0'), 0); assert.equal(volume(-4), 0); assert.equal(volume(300), 100);
});
test('guide distinguishes IME composition, incomplete syllables and mode lengths without claiming dictionary success', () => {
  assert.equal(draftGuide('자ㅈ', 'classic', true).state, 'composing');
  assert.equal(draftGuide('자ㅈ', 'classic').state, 'incomplete');
  assert.equal(draftGuide('자전', 'classic').message, '1글자 더 입력해요');
  assert.equal(draftGuide('가나다', 'classic').message, '쿵!을 누르면 사전 판정');
  assert.equal(draftGuide('우주', 'relay').state, 'ready');
  assert.equal(draftGuide('우주비행', 'relay').label, '4 / 2–4글자');
  assert.equal(draftGuide('우주비행사', 'relay').state, 'long');
});
test('round report shows no invented speed when there are no accepted words', () => {
  assert.equal(roundReport({wordsPlayed: 0, bestStreak: 0, fastestWordMillis: 0, hintsUsed: 0}).speed, '—');
  assert.equal(roundReport({wordsPlayed: 3}), null);
  const report = roundReport({wordsPlayed: 4, bestStreak: 3, fastestWordMillis: 1250, hintsUsed: 1});
  assert.equal(report.speed, '1.3초'); assert.equal(report.streak, '3회'); assert.equal(report.hints, '1회');
  assert.match(report.coaching, /3번 연속/);
  assert.equal(roundReport({wordsPlayed: 1, bestStreak: 1, fastestWordMillis: 12}).speed, '0.1초 미만');
});
