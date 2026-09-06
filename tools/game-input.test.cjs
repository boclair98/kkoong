const {test} = require('node:test');
const assert = require('node:assert/strict');
const {WordInput, viewportFrame} = require('../src/main/resources/static/game-input.js');

class Input {
  value = '';
  focused = true;
  handlers = new Map();
  set disabled(value) { this.isDisabled = value; if (value) this.focused = false; }
  get disabled() { return this.isDisabled; }
  addEventListener(type, handler) { this.handlers.set(type, handler); }
  emit(type, data = {}) {
    const event = {...data, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }};
    this.handlers.get(type)?.(event);
    return event;
  }
}
const room = (changes = {}) => ({
  roomCode: 'KUNG5', phase: 'playing', round: 1, deadline: 13000, turnPlayerId: 'me',
  players: [{id: 'me', eliminated: false}, {id: 'bot', eliminated: false}], ...changes
});
function setup() {
  const input = new Input();
  let time = 1000;
  const controller = new WordInput(input, {now: () => time});
  controller.update(room(), 'me');
  return {input, controller, time: value => { time = value; }};
}

test('opponent and next turn keep the same focused input enabled and clear old text', () => {
  const {input, controller} = setup();
  input.value = '자전거';
  controller.update(room({turnPlayerId: 'bot', deadline: 15000}), 'me');
  assert.equal(input.disabled, false);
  assert.equal(input.focused, true);
  assert.equal(input.value, '');
  input.value = '거미줄';
  controller.update(room({round: 2, deadline: 17000}), 'me');
  assert.equal(input.focused, true);
  assert.equal(input.value, '');
});
test('state broadcasts in the same turn preserve the current draft', () => {
  const {input, controller} = setup();
  input.value = '자전';
  controller.update(room({eventText: '다른 참가자 연결'}), 'me');
  assert.equal(input.value, '자전');
});
test('submit clears text immediately and cannot submit twice before a response', () => {
  const {input, controller} = setup();
  input.value = '자전거';
  assert.equal(controller.takeWord(), '자전거');
  assert.equal(input.value, '');
  assert.equal(input.focused, true);
  controller.update(room(), 'me');
  input.value = '자전거';
  assert.equal(controller.takeWord(), null);
  assert.equal(controller.pending, true);
});
test('rejection never restores the previous word', () => {
  const {input, controller} = setup();
  input.value = '자뷁쀍'; controller.takeWord(); controller.reject();
  assert.equal(input.value, '');
  assert.equal(controller.canSubmit, true);
  input.value = '자전거';
  assert.equal(controller.takeWord(), '자전거');
});
test('late rejection does not erase a freshly typed retry', () => {
  const {input, controller} = setup();
  input.value = '자뷁쀍'; controller.takeWord(); input.value = '자전'; controller.reject();
  assert.equal(input.value, '자전');
});
test('opponent turn and expired deadline never send a word', () => {
  const {input, controller, time} = setup();
  controller.update(room({turnPlayerId: 'bot'}), 'me'); input.value = '자전거';
  assert.equal(controller.takeWord(), null);
  controller.update(room(), 'me'); time(13000); input.value = '자전거';
  assert.equal(controller.takeWord(), null);
});
test('timeout clears a draft even if the same player receives the next turn', () => {
  const {input, controller} = setup(); input.value = '자전';
  controller.update(room({deadline: 26000}), 'me');
  assert.equal(input.value, '');
});
test('finish, rematch, reconnect reset and leaving clear drafts', () => {
  const {input, controller} = setup(); input.value = '자전거';
  controller.update(room({phase: 'finished'}), 'me');
  assert.equal(input.value, ''); assert.equal(input.disabled, true);
  input.value = 'old'; controller.update(room({deadline: 20000}), 'me');
  assert.equal(input.value, ''); assert.equal(input.disabled, false);
  input.value = 'old'; controller.reset(); assert.equal(input.value, '');
  input.value = 'old'; controller.update(null, 'me'); assert.equal(input.value, '');
});
test('Korean composition Enter and Safari 229 do not submit', () => {
  const {input, controller, time} = setup();
  input.emit('compositionstart'); input.value = '자전거';
  assert.equal(input.emit('keydown', {key: 'Enter', isComposing: true}).defaultPrevented, true);
  assert.equal(controller.takeWord(), null);
  input.emit('compositionend');
  assert.equal(input.emit('keydown', {key: 'Enter', keyCode: 229}).defaultPrevented, true);
  assert.equal(controller.takeWord(), null);
  time(1100);
  assert.equal(input.emit('keydown', {key: 'Enter'}).defaultPrevented, false);
  assert.equal(controller.takeWord(), '자전거');
});
test('pointer submit during composition sends once; the final IME commit cannot restore it', () => {
  const {input, controller} = setup();
  input.emit('compositionstart'); input.value = '자전거';
  assert.equal(controller.takeWord(true), '자전거');
  input.value = '자전거'; input.emit('compositionend');
  assert.equal(input.value, '');
  input.value = '자전거'; input.emit('input', {inputType: 'insertFromComposition'});
  assert.equal(input.value, '');
});
test('timeout during composition rejects late commits but permits new typing', () => {
  const {input, controller} = setup(); input.emit('compositionstart'); input.value = '자전';
  controller.update(room({deadline: 26000}), 'me');
  input.value = '자전'; input.emit('compositionend'); assert.equal(input.value, '');
  input.emit('compositionstart'); input.value = '나무꾼';
  input.emit('input', {inputType: 'insertCompositionText'}); assert.equal(input.value, '나무꾼');
});
test('one hint per request, same-turn broadcasts keep it, stale hints are ignored', () => {
  const {input, controller} = setup();
  assert.equal(controller.requestHint(), true); assert.equal(controller.requestHint(), false);
  controller.update(room(), 'me'); assert.equal(controller.receiveHint('자전거'), true);
  assert.equal(input.value, '자전거');
  controller.requestHint(); controller.update(room({deadline: 26000}), 'me');
  assert.equal(controller.receiveHint('자전거'), false); assert.equal(input.value, '');
});
test('a hint replacing a composing draft survives the old IME commit', () => {
  const {input, controller} = setup(); input.emit('compositionstart'); input.value = '자';
  controller.requestHint(); controller.receiveHint('자전거');
  input.value = '자'; input.emit('compositionend'); assert.equal(input.value, '자전거');
});
test('lost focus is not reclaimed by subsequent state updates', () => {
  const {input, controller} = setup(); input.focused = false;
  controller.update(room({deadline: 26000}), 'me');
  assert.equal(input.focused, false);
});
test('mobile visual viewport follows keyboard size and panning without changing focus', () => {
  assert.deepEqual(viewportFrame({width: 390, height: 402.4, offsetTop: 41.7, focused: true, playing: true}),
    {compact: true, short: false, height: 402, top: 42, left: 0, width: 390});
  assert.equal(viewportFrame({width: 390, height: 280, focused: true, playing: true}).short, true);
});
test('desktop, blurred input, finished game and pinch zoom keep the standard layout', () => {
  const options = {width: 390, height: 700, focused: true, playing: true};
  for (const changed of [{width: 1440}, {focused: false}, {playing: false}, {scale: 2}]) {
    assert.equal(viewportFrame({...options, ...changed}).compact, false);
  }
});
