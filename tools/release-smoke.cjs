// Real HTTP/WebSocket smoke test. Creates only its own room and explicitly leaves it.
// Node 22+. Usage: node tools/release-smoke.cjs http://127.0.0.1:8182
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const base = new URL(process.argv[2] || 'http://127.0.0.1:8182');
const sockets = [];
async function peer() {
  const endpoint = new URL('/ws/game', base); endpoint.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(endpoint);
  const messages = []; let waiting = null;
  socket.addEventListener('message', event => {
    const value = JSON.parse(event.data); messages.push(value); waiting?.();
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.close(); reject(new Error('connection timeout')); }, 10000);
    socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, {once: true});
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('connection error')); }, {once: true});
  });
  const p = {socket, send: body => socket.send(JSON.stringify(body)),
    wait: predicate => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiting = null; reject(new Error('message timeout')); }, 8000);
      const check = () => {
        const index = messages.findIndex(predicate);
        if (index < 0) return;
        clearTimeout(timer); waiting = null; resolve(messages.splice(index, 1)[0]);
      };
      waiting = check; check();
    })};
  sockets.push(p); return p;
}
async function get(path) {
  const response = await fetch(new URL(path, base), {signal: AbortSignal.timeout(10000), headers: {'Cache-Control': 'no-cache', 'User-Agent': 'Kung-Release-Smoke/1.0'}});
  assert.equal(response.status, 200); return response.json();
}
(async () => {
  let code;
  try {
    assert.equal((await get('/actuator/health')).status, 'UP');
    const host = await peer(); const guest = await peer();
    const hostId = `guest-smoke-${randomUUID()}`;
    host.send({type: 'create', protocolVersion: 2, playerId: hostId, nickname: '별빛탐험가', mascot: 23});
    const joined = await host.wait(m => m.type === 'joined'); code = joined.roomCode;
    assert.ok(joined.resumeToken && joined.resumeToken.length >= 32);
    const state = await host.wait(m => m.type === 'state');
    assert.ok(!JSON.stringify(state).includes(joined.resumeToken), 'resume credentials must be private');
    host.send({type: 'create', nickname: '별빛탐험가'});
    assert.equal((await host.wait(m => m.type === 'error')).code, 'ALREADY_IN_ROOM');
    guest.send({type: 'join', code, protocolVersion: 2, playerId: hostId, nickname: '은하항해사', resumeToken: 'invalid'});
    assert.equal((await guest.wait(m => m.type === 'error')).code, 'RESUME_DENIED');
    guest.send({type: 'join', code, protocolVersion: 2, playerId: `guest-smoke-${randomUUID()}`, nickname: '은하항해사', mascot: 23});
    await guest.wait(m => m.type === 'joined');
    const shared = await guest.wait(m => m.type === 'state' && m.players.length === 2);
    assert.notEqual(shared.players[0].mascot, shared.players[1].mascot);
    host.socket.close();
    const returning = await peer();
    returning.send({type: 'join', code, protocolVersion: 2, playerId: hostId, nickname: '별빛탐험가', resumeToken: joined.resumeToken});
    const resumed = await returning.wait(m => m.type === 'joined');
    assert.equal(resumed.mascot, 23);
    const restored = await returning.wait(m => m.type === 'state');
    assert.equal(restored.hostId, hostId); assert.equal(restored.players.length, 2);
    returning.send({type: 'start'});
    const playing = await returning.wait(m => m.type === 'state' && m.phase === 'playing');
    assert.equal(playing.turnPlayerId, hostId);
    returning.send({type: 'hint', round: playing.round, turnCount: playing.turnCount});
    const hint = await returning.wait(m => m.type === 'hint');
    returning.send({type: 'word', word: hint.word, round: playing.round, turnCount: playing.turnCount});
    const accepted = await returning.wait(m => m.type === 'state' && m.history.some(p => p.playerId === hostId));
    assert.equal(accepted.players.find(p => p.id === hostId).wordsPlayed, 1);
    assert.equal((await get('/api/word/check?word=' + encodeURIComponent(hint.word))).known, true);
    for (const p of sockets) if (p.socket.readyState === 1) p.send({type: 'leave'});
    let listed = true;
    for (let attempt = 0; attempt < 6 && listed; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      listed = (await get('/api/lobby')).rooms.some(room => room.code === code);
    }
    assert.equal(listed, false, 'test room must leave the lobby after explicit exit');
    console.log('PASS: health, one-room membership, private resume, takeover rejection, unique crew, host/character recovery, valid word, whole-round count, cleanup');
  } finally {
    for (const p of sockets) if (p.socket.readyState === 1) { p.send({type: 'leave'}); p.socket.close(); }
  }
})().catch(error => { console.error('FAIL:', error.message); process.exitCode = 1; });
