const {test} = require('node:test');
const assert = require('node:assert/strict');
const {SocketConnection, summarizeResult, safeStorage} = require('../src/main/resources/static/game-client.js');

function harness(overrides = {}) {
  const sockets = [], timers = new Map(), received = [], closed = [];
  let timerId = 0;
  const connection = new SocketConnection({
    heartbeatMs: 0,
    createSocket: () => {
      const socket = {readyState: 0, sent: [], send(value) { this.sent.push(value); }, close() { this.readyState = 3; this.onclose?.(); }};
      sockets.push(socket); return socket;
    },
    onMessage: message => received.push(message),
    onClose: error => closed.push(error),
    setTimer: fn => { const id = ++timerId; timers.set(id, () => { timers.delete(id); fn(); }); return id; },
    clearTimer: id => timers.delete(id),
    ...overrides
  });
  return {connection, sockets, timers, received, closed};
}

test('a timed-out connection rejects, closes, and permits a fresh retry', async () => {
  const h = harness();
  const first = h.connection.connect();
  const rejected = assert.rejects(first, /timeout/);
  [...h.timers.values()][0]();
  await rejected;
  assert.equal(h.sockets[0].readyState, 3);
  assert.equal(h.connection.pending, null);
  const retry = h.connection.connect();
  assert.equal(h.sockets.length, 2);
  h.sockets[1].readyState = 1; h.sockets[1].onopen();
  assert.equal(await retry, h.sockets[1]);
  assert.equal(h.closed.length, 1);
});

test('closing before open settles the waiting action instead of leaving it pending', async () => {
  const h = harness();
  const result = h.connection.connect();
  const rejected = assert.rejects(result, /closed/);
  h.sockets[0].onclose();
  await rejected;
  assert.equal(h.timers.size, 0);
  assert.equal(h.connection.socket, null);
});

test('events from an abandoned socket cannot overwrite the new connection', async () => {
  const h = harness();
  const first = h.connection.connect();
  const rejected = assert.rejects(first);
  h.sockets[0].onerror(); await rejected;
  const next = h.connection.connect();
  h.sockets[0].onopen(); h.sockets[0].onmessage({data: 'old room'}); h.sockets[0].onclose();
  assert.equal(h.connection.socket, h.sockets[1]);
  assert.deepEqual(h.received, []);
  h.sockets[1].readyState = 1; h.sockets[1].onopen(); await next;
  h.sockets[1].onmessage({data: 'current room'});
  assert.deepEqual(h.received, ['current room']);
});

test('intentional exit cancels a handshake without requesting a reconnect', async () => {
  const h = harness();
  const pending = h.connection.connect();
  const rejected = assert.rejects(pending, /cancelled/);
  h.connection.close(); await rejected;
  assert.equal(h.closed.length, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.connection.socket, null);
});

test('concurrent actions share one connection and recovery runs before release', async () => {
  const events = [];
  const h = harness({onOpen: () => events.push('rejoin')});
  const first = h.connection.connect(), second = h.connection.connect();
  assert.equal(first, second);
  assert.equal(h.sockets.length, 1);
  h.sockets[0].readyState = 1; h.sockets[0].onopen();
  await first; events.push('action');
  assert.deepEqual(events, ['rejoin', 'action']);
});

test('a failed recovery callback releases the connection for another attempt', async () => {
  const h = harness({onOpen: () => { throw new Error('rejoin failed'); }});
  const pending = h.connection.connect();
  const rejected = assert.rejects(pending, /rejoin failed/);
  h.sockets[0].readyState = 1; h.sockets[0].onopen(); await rejected;
  assert.equal(h.connection.pending, null);
  assert.equal(h.connection.socket, null);
});

test('the server winner ranks first even when a eliminated player scored higher', () => {
  const room = {winnerId: 'bot', players: [
    {id: 'me', score: 300, lives: 0}, {id: 'bot', score: 0, lives: 1}
  ], history: [{playerId: 'me'}, {playerId: 'bot'}, {playerId: 'me'}]};
  const result = summarizeResult(room, 'me');
  assert.equal(result.winner.id, 'bot');
  assert.deepEqual(result.ranking.map(p => p.id), ['bot', 'me']);
  assert.equal(result.myRank, 2);
  assert.equal(result.myWords, 2);
  assert.equal(room.players[0].id, 'me');
});

test('tied scores and a draw have stable results without inventing a winner', () => {
  const players = [{id: 'me', score: 0, lives: 0}, {id: 'bot', score: 0, lives: 1}];
  assert.equal(summarizeResult({players, winnerId: 'bot'}, 'me').myRank, 2);
  const draw = summarizeResult({players: [], history: []}, 'observer');
  assert.equal(draw.winner, null);
  assert.equal(draw.myRank, null);
  assert.equal(draw.myWords, 0);
});

test('heartbeat detects a silent network failure and permits recovery', async () => {
  let now = 0;
  const h = harness({heartbeatMs: 10000, now: () => now});
  const open = h.connection.connect(); h.sockets[0].readyState = 1; h.sockets[0].onopen(); await open;
  now = 10000; [...h.timers.values()][0]();
  assert.equal(JSON.parse(h.sockets[0].sent[0]).type, 'ping');
  h.sockets[0].onmessage({data: 'pong'});
  now = 40000; h.connection.check();
  assert.equal(h.connection.socket, null); assert.equal(h.closed.length, 1); assert.equal(h.timers.size, 0);
});
test('intentional close clears the heartbeat and malformed responses fail safely', async () => {
  const h = harness({heartbeatMs: 10000, onMessage: () => { throw new Error('bad JSON'); }});
  const open = h.connection.connect(); h.sockets[0].readyState = 1; h.sockets[0].onopen(); await open;
  h.sockets[0].onmessage({data: 'invalid'});
  assert.equal(h.closed[0].message, 'invalid server response'); assert.equal(h.connection.socket, null);
  const retry = h.connection.connect(); h.sockets[1].readyState = 1; h.sockets[1].onopen(); await retry;
  h.connection.close(); assert.equal(h.timers.size, 0); assert.equal(h.closed.length, 1);
});
test('result counts server totals rather than only the last twelve words', () => {
  const result = summarizeResult({players: [{id: 'me', wordsPlayed: 31, score: 0, lives: 1}], history: [{playerId: 'me'}]}, 'me');
  assert.equal(result.myWords, 31);
});
test('blocked storage cannot prevent play, preferences or current-session deletion', () => {
  const store = safeStorage(() => { throw new Error('blocked'); });
  assert.equal(store.getItem('sound'), null); store.setItem('sound', 'off');
  assert.equal(store.getItem('sound'), 'off'); store.removeItem('sound'); assert.equal(store.getItem('sound'), null);
  const full = safeStorage(() => ({getItem: () => 'old', setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('quota'); }}));
  full.setItem('key', 'new'); assert.equal(full.getItem('key'), 'new'); full.removeItem('key'); assert.equal(full.getItem('key'), null);
});
