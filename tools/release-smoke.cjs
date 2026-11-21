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
    wait: (predicate, timeoutMs = 8000) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiting = null; reject(new Error('message timeout')); }, timeoutMs);
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
function turnContext(state) {
  return {round: state.round, turnCount: state.turnCount};
}
async function checkedHint(p, state, duplicate = false) {
  p.send({type: 'hint', ...turnContext(state)});
  const hint = await p.wait(m => m.type === 'hint');
  assert.equal(hint.roundId, state.roundId);
  assert.equal(hint.round, state.round);
  assert.equal(hint.turnCount, state.turnCount);
  assert.equal(hint.charged, true);
  assert.ok(hint.word && Number.isInteger(hint.remaining) && hint.cost >= 0);
  const score = state.players.find(player => player.id === state.turnPlayerId).score;
  assert.equal(hint.deductedPoints, Math.min(score, hint.cost));
  if (duplicate) {
    p.send({type: 'hint', ...turnContext(state)});
    const retry = await p.wait(m => m.type === 'hint');
    assert.equal(retry.charged, false, 'retrying one turn must not charge another hint');
    assert.equal(retry.deductedPoints, 0);
    for (const key of ['word', 'remaining', 'cost', 'roundId', 'round', 'turnCount']) {
      assert.equal(retry[key], hint[key], `hint retry must preserve ${key}`);
    }
  }
  return hint;
}
function untilTurnDeadline(state) {
  return Math.max(8000, state.deadline - state.serverTime + 5000);
}
(async () => {
  let code, publicCode;
  try {
    assert.equal((await get('/actuator/health')).status, 'UP');
    assert.equal((await get('/actuator/health/liveness')).status, 'UP');
    assert.equal((await get('/actuator/health/readiness')).status, 'UP');
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
    returning.send({type: 'returnToLobby'});
    assert.equal((await returning.wait(m => m.type === 'error')).code, 'NOT_FINISHED');
    guest.send({type: 'returnToLobby'});
    assert.equal((await guest.wait(m => m.type === 'error')).code, 'HOST_ONLY');
    const hint = await checkedHint(returning, playing, true);
    returning.send({type: 'word', word: hint.word, ...turnContext(playing)});
    const accepted = await returning.wait(m => m.type === 'state' && m.history.some(p => p.playerId === hostId));
    assert.equal(accepted.players.find(p => p.id === hostId).wordsPlayed, 1);
    const metrics = accepted.players.find(p => p.id === hostId);
    assert.equal(metrics.bestStreak, 1);
    assert.equal(metrics.hintsUsed, 1);
    assert.equal(metrics.hints, hint.remaining, 'the repeated hint must leave its balance unchanged');
    assert.ok(metrics.fastestWordMillis > 0 && metrics.fastestWordMillis <= playing.mode.turnSeconds * 1000);

    // Let only our guest time out twice, retaining both players for the existing rematch path.
    // No wall-clock mutation or test endpoint is used: this exercises the actual server timer.
    const secondTurn = await returning.wait(m => m.type === 'state' && m.phase === 'playing'
      && m.roundId === playing.roundId && m.turnCount > accepted.turnCount && m.turnPlayerId === hostId,
    untilTurnDeadline(accepted));
    const secondHint = await checkedHint(returning, secondTurn, true);
    returning.send({type: 'word', word: secondHint.word, ...turnContext(secondTurn)});
    const secondAccepted = await returning.wait(m => m.type === 'state' && m.phase === 'playing'
      && m.roundId === playing.roundId && m.turnCount > secondTurn.turnCount);
    const secondMetrics = secondAccepted.players.find(p => p.id === hostId);
    assert.equal(secondMetrics.hintsUsed, 2, 'a new turn charges once; its retry does not');
    assert.equal(secondMetrics.hints, secondHint.remaining);
    const finished = await returning.wait(m => m.type === 'state' && m.phase === 'finished'
      && m.roundId === playing.roundId, untilTurnDeadline(secondAccepted));
    assert.equal(finished.winnerId, hostId);
    assert.equal(finished.players.length, 2);
    const winningHost = finished.players.find(p => p.id === hostId);
    assert.equal(winningHost.wins, 1);
    guest.send({type: 'returnToLobby'});
    assert.equal((await guest.wait(m => m.type === 'error')).code, 'HOST_ONLY');
    returning.send({type: 'rematch'});
    const rematch = await returning.wait(m => m.type === 'state' && m.phase === 'playing'
      && m.round === finished.round + 1);
    assert.notEqual(rematch.roundId, finished.roundId);
    assert.equal(rematch.players.length, 2, 'legacy rematch keeps the existing crew');
    for (const player of rematch.players) {
      const previous = finished.players.find(p => p.id === player.id);
      assert.equal(player.mascot, previous.mascot);
      assert.equal(player.wins, previous.wins);
      assert.equal(player.score, 0);
      assert.equal(player.hintsUsed, 0);
      assert.equal(player.hints, 3);
    }

    // A player leaving creates a finished room that cannot admit replacements until its host reopens it.
    guest.send({type: 'leave'});
    const abandoned = await returning.wait(m => m.type === 'state' && m.phase === 'finished'
      && m.roundId === rematch.roundId && m.players.length === 1);
    assert.equal(abandoned.winnerId, hostId);
    const newcomer = await peer();
    const newcomerIdentity = {code, protocolVersion: 2, playerId: `guest-smoke-${randomUUID()}`,
      nickname: '달빛파일럿', mascot: 1};
    newcomer.send({type: 'join', ...newcomerIdentity});
    assert.equal((await newcomer.wait(m => m.type === 'error')).code, 'GAME_FINISHED');
    returning.send({type: 'returnToLobby'});
    const reopened = await returning.wait(m => m.type === 'state' && m.phase === 'waiting'
      && m.round === abandoned.round);
    assert.equal(reopened.roomCode, code);
    assert.equal(reopened.inviteOnly, true);
    assert.equal(reopened.hostId, hostId);
    assert.equal(reopened.players.length, 1);
    assert.equal(reopened.players[0].mascot, winningHost.mascot);
    assert.equal(reopened.players[0].wins, abandoned.players[0].wins);
    assert.equal(reopened.players[0].score, 0);
    assert.equal(reopened.players[0].hintsUsed, 0);
    assert.equal(reopened.players[0].hints, 3);
    assert.equal(reopened.players[0].eliminated, false);
    assert.equal(reopened.players[0].lives, playing.players[0].lives);
    assert.equal(reopened.history.length, 0);
    assert.equal(reopened.deadline, 0);
    assert.equal((await lobby('all')).rooms.some(room => room.code === code), false);
    newcomer.send({type: 'join', ...newcomerIdentity});
    await newcomer.wait(m => m.type === 'joined');
    const newCrew = await newcomer.wait(m => m.type === 'state' && m.phase === 'waiting' && m.players.length === 2);
    assert.equal(newCrew.inviteOnly, true);
    returning.send({type: 'start'});
    const nextRound = await returning.wait(m => m.type === 'state' && m.phase === 'playing'
      && m.round === abandoned.round + 1);
    assert.notEqual(nextRound.roundId, abandoned.roundId);
    assert.equal(nextRound.players.find(p => p.id === hostId).wins, abandoned.players[0].wins);
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
    console.log('PASS: health, invite-only discovery, public mode filters/seat counts, code join, protected resume, one-room membership, takeover rejection, unique crew, host/character recovery, hint metadata/idempotency, valid word, round metrics, real timeout finish, legacy rematch, host-only lobby return, replacement crew entry, next round, owned-room cleanup');
  } finally {
    for (const p of sockets) if (p.socket.readyState === 1) { p.send({type: 'leave'}); p.socket.close(); }
  }
})().catch(error => { console.error('FAIL:', error.message); process.exitCode = 1; });
