const test = require('node:test');
const assert = require('node:assert/strict');
const progression = require('../src/main/resources/static/progression.js');

const date = new Date(2026, 8, 14, 12, 0, 0);

test('profile starts with a fresh daily mission board', () => {
  const profile = progression.emptyProfile(date);
  assert.equal(profile.date, '2026-09-14');
  assert.equal(profile.level, 1);
  assert.deepEqual(Object.keys(profile.missions), ['launch', 'wordsmith', 'signal']);
});

test('round reward IDs remain idempotent after reload and rematch can earn again', () => {
  let stored = '';
  const options = {read: () => stored, write: value => { stored = value; }, now: () => date};
  let store = progression.createStore(options);
  store.record({type: 'match', id: 'match:round-a'});
  store.record({type: 'word', id: 'word:round-a:1'});
  store.record({type: 'win', id: 'win:round-a'});
  store = progression.createStore(options);
  for (const [type, id] of [['match', 'match:round-a'], ['word', 'word:round-a:1'], ['win', 'win:round-a']]) {
    assert.equal(store.record({type, id}).duplicate, true);
  }
  assert.equal(store.get().matches, 1); assert.equal(store.get().wins, 1); assert.equal(store.get().words, 1); assert.equal(store.get().xp, 40);
  store.record({type: 'match', id: 'match:round-b'}); assert.equal(store.get().matches, 2);
});
test('event memory is bounded and malformed stored IDs are ignored', () => {
  let profile = progression.parse(JSON.stringify({recentEvents: [null, 42, 'a'.repeat(161), 'valid', 'valid']}), date);
  assert.deepEqual(profile.recentEvents, ['valid']);
  for (let i = 0; i < 300; i++) profile = progression.apply(profile, {type: 'word', id: `word:${i}`}, date).profile;
  assert.equal(profile.recentEvents.length, 256); assert.equal(profile.words, 300);
});

test('match and word events update stats, streak, xp and missions', () => {
  let profile = progression.emptyProfile(date);
  profile = progression.apply(profile, 'match', date).profile;
  profile = progression.apply(profile, 'word', date).profile;
  assert.equal(profile.matches, 1);
  assert.equal(profile.words, 1);
  assert.equal(profile.streak, 1);
  assert.equal(profile.xp, 15);
  assert.equal(profile.missions.launch.progress, 1);
  assert.equal(profile.missions.wordsmith.progress, 1);
});

test('streak increments only when a new calendar day follows yesterday', () => {
  const firstDay = progression.apply(progression.emptyProfile(date), 'match', date).profile;
  const nextDay = new Date(2026, 8, 15, 12, 0, 0);
  const continued = progression.apply(firstDay, 'match', nextDay).profile;
  assert.equal(continued.streak, 2);
  const afterBreak = progression.apply(continued, 'match', new Date(2026, 8, 17, 12, 0, 0)).profile;
  assert.equal(afterBreak.streak, 1);
});

test('badges unlock from honest milestones', () => {
  let profile = progression.emptyProfile(date);
  for (let i = 0; i < 3; i++) profile = progression.apply(profile, 'word', date).profile;
  profile = progression.apply(profile, {type: 'combo', value: 3}, date).profile;
  assert.ok(profile.badges.includes('combo-3'));
  assert.ok(!profile.badges.includes('first-flight'));
});

test('completed mission can be claimed only once', () => {
  let profile = progression.emptyProfile(date);
  profile = progression.apply(profile, 'match', date).profile;
  const first = progression.claim(profile, 'launch', date);
  assert.equal(first.claimed, true);
  assert.equal(first.reward, 12);
  assert.equal(first.profile.fragments, 12);
  const second = progression.claim(first.profile, 'launch', date);
  assert.equal(second.claimed, false);
  assert.equal(second.profile.fragments, 12);
});

test('malformed storage is safely normalized and a new day resets daily missions', () => {
  const malformed = progression.parse('{"xp":"oops","missions":{"launch":{"progress":99}}}', date);
  assert.equal(malformed.xp, 0);
  assert.equal(malformed.missions.launch.progress, 1);
  const tomorrow = progression.normalize({...malformed, date: '2026-09-13'}, date);
  assert.equal(tomorrow.missions.launch.progress, 0);
  assert.equal(tomorrow.date, '2026-09-14');
});

test('level thresholds grow without losing current-level progress', () => {
  const levelOne = progression.levelInfo(99);
  assert.equal(levelOne.level, 1);
  const levelTwo = progression.levelInfo(100);
  assert.equal(levelTwo.level, 2);
  assert.equal(levelTwo.current, 0);
  const levelThree = progression.levelInfo(250);
  assert.equal(levelThree.level, 3);
  assert.equal(levelThree.current, 0);
});
