// Real HTTP/WebSocket smoke test. Creates only its own rooms and explicitly leaves them.
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
async function lobby(mode = 'all') {
  return get(`/api/lobby?mode=${encodeURIComponent(mode)}&smoke=${randomUUID()}`);
}
async function leaveOwnRooms() {
  for (const p of sockets) if (p.socket.readyState === 1) {
    p.send({type: 'leave'});
    // Ordered messages confirm the server handled our exit before checking discovery.
    p.send({type: 'ping'});
    await p.wait(m => m.type === 'pong');
  }
}
(async () => {
  let code, publicCode;
  try {
    assert.equal((await get('/actuator/health')).status, 'UP');
    const host = await peer(); const guest = await peer();
    const hostId = `guest-smoke-${randomUUID()}`;
    host.send({type: 'create', protocolVersion: 2, playerId: hostId, nickname: '별빛탐험가', mascot: 23,
      mode: 'classic', inviteOnly: true});
    const joined = await host.wait(m => m.type === 'joined'); code = joined.roomCode;
    assert.ok(joined.resumeToken && joined.resumeToken.length >= 32);
    const state = await host.wait(m => m.type === 'state');
    assert.equal(state.inviteOnly, true);
    assert.ok(!JSON.stringify(state).includes(joined.resumeToken), 'resume credentials must be private');
    for (const mode of ['all', 'classic']) {
      assert.equal((await lobby(mode)).rooms.some(room => room.code === code), false, 'invite-only rooms must stay out of discovery');
    }

    // Create an independent public room; never quick-match into another user's room.
    const publicHost = await peer();
    publicHost.send({type: 'create', protocolVersion: 2, playerId: `guest-smoke-${randomUUID()}`,
      nickname: '별빛탐험가', mode: 'relay', difficulty: 'beginner', inviteOnly: false});
    publicCode = (await publicHost.wait(m => m.type === 'joined')).roomCode;
    assert.equal((await publicHost.wait(m => m.type === 'state')).inviteOnly, false);
    const publicRoom = (await lobby('relay')).rooms.find(room => room.code === publicCode);
    assert.ok(publicRoom, 'public room must appear in its matching mode filter');
    assert.equal(publicRoom.mode, 'relay');
    assert.equal(publicRoom.connectedPlayers, 1);
    assert.equal(publicRoom.occupiedSeats, 1);
    assert.equal(publicRoom.availableSeats, publicRoom.maxPlayers - 1);
    assert.equal(publicRoom.difficulty, 'beginner');
    assert.equal((await lobby('classic')).rooms.some(room => room.code === publicCode), false, 'public room must not appear in another mode filter');
    host.send({type: 'create', nickname: '별빛탐험가'});
    assert.equal((await host.wait(m => m.type === 'error')).code, 'ALREADY_IN_ROOM');
    guest.send({type: 'join', code, protocolVersion: 2, playerId: hostId, nickname: '은하항해사', resumeToken: 'invalid'});
    assert.equal((await guest.wait(m => m.type === 'error')).code, 'RESUME_DENIED');
    guest.send({type: 'join', code, protocolVersion: 2, playerId: `guest-smoke-${randomUUID()}`, nickname: '은하항해사', mascot: 23});
    await guest.wait(m => m.type === 'joined');
    const shared = await guest.wait(m => m.type === 'state' && m.players.length === 2);
    assert.equal(shared.inviteOnly, true, 'code joining must preserve invite-only visibility');
    assert.notEqual(shared.players[0].mascot, shared.players[1].mascot);
    host.socket.close();
    const returning = await peer();
    returning.send({type: 'join', code, protocolVersion: 2, playerId: hostId, nickname: '별빛탐험가', resumeToken: joined.resumeToken});
    const resumed = await returning.wait(m => m.type === 'joined');
    assert.equal(resumed.mascot, 23);
    const restored = await returning.wait(m => m.type === 'state');
    assert.equal(restored.inviteOnly, true, 'protected resume must preserve invite-only visibility');
    assert.equal(restored.hostId, hostId); assert.equal(restored.players.length, 2);
    for (const mode of ['all', 'classic']) {
      assert.equal((await lobby(mode)).rooms.some(room => room.code === code), false);
    }
    returning.send({type: 'start'});
    const playing = await returning.wait(m => m.type === 'state' && m.phase === 'playing');
    assert.equal(playing.turnPlayerId, hostId);
    returning.send({type: 'hint', round: playing.round, turnCount: playing.turnCount});
    const hint = await returning.wait(m => m.type === 'hint');
    returning.send({type: 'word', word: hint.word, round: playing.round, turnCount: playing.turnCount});
    const accepted = await returning.wait(m => m.type === 'state' && m.history.some(p => p.playerId === hostId));
    assert.equal(accepted.players.find(p => p.id === hostId).wordsPlayed, 1);
    const metrics = accepted.players.find(p => p.id === hostId);
    assert.equal(metrics.bestStreak, 1);
    assert.equal(metrics.hintsUsed, 1);
    assert.ok(metrics.fastestWordMillis > 0 && metrics.fastestWordMillis <= playing.mode.turnSeconds * 1000);
    assert.equal((await get('/api/word/check?word=' + encodeURIComponent(hint.word))).known, true);
    await leaveOwnRooms();
    for (const mode of ['all', 'classic', 'relay']) {
      assert.equal((await lobby(mode)).rooms.some(room => room.code === code || room.code === publicCode), false,
        'test rooms must leave discovery after explicit exit');
    }
    // Hidden rooms were never listed, so also verify both owned codes are gone.
    const cleanupProbe = await peer();
    for (const ownCode of [code, publicCode]) {
      cleanupProbe.send({type: 'join', code: ownCode, playerId: `guest-smoke-${randomUUID()}`, nickname: '별빛탐험가'});
      assert.equal((await cleanupProbe.wait(m => m.type === 'error')).code, 'ROOM_NOT_FOUND');
    }
    console.log('PASS: health, invite-only discovery, public mode filters/seat counts, code join, protected resume, one-room membership, takeover rejection, unique crew, host/character recovery, valid word, round metrics, whole-round count, owned-room cleanup');
  } finally {
    for (const p of sockets) if (p.socket.readyState === 1) { p.send({type: 'leave'}); p.socket.close(); }
  }
})().catch(error => { console.error('FAIL:', error.message); process.exitCode = 1; });
