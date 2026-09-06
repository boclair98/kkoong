(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const els = {
    lobby: $('#lobbyScreen'), game: $('#gameScreen'), dialog: $('#setupDialog'), setupForm: $('#setupForm'),
    nickname: $('#nicknameInput'), modePicker: $('#modePicker'), roomCodeInput: $('#roomCodeInput'), roomList: $('#roomList'),
    dictionaryForm: $('#dictionaryForm'), dictionaryInput: $('#dictionaryInput'), dictionaryResult: $('#dictionaryResult'),
    onlineCount: $('#onlineCount'), connection: $('#connectionStatus'), playerList: $('#playerList'), playerCount: $('#playerCount'),
    gameMode: $('#gameMode'), gameRule: $('#gameRule'), round: $('#roundCount'), timerRing: $('#timerRing'), timerText: $('#timerText'),
    required: $('#requiredSyllable'), turnLabel: $('#turnLabel'), lastWord: $('#lastWord'), combo: $('#comboCount'),
    eventText: $('#eventText'), wordForm: $('#wordForm'), wordInput: $('#wordInput'), inputHint: $('#inputHint'),
    roomCode: $('#roomCode'), roomCodeButton: $('#roomCodeButton'), start: $('#startButton'), rematch: $('#rematchButton'),
    addBot: $('#addBotButton'), waitingCopy: $('#waitingCopy'), controls: $('#gameControls'), lengthRule: $('#lengthRule'),
    history: $('#wordHistory'), historyCount: $('#historyCount'), feverBanner: $('#feverBanner'), arena: $('.arena'), mobileRoomCode: $('#mobileRoomCode'),
    reactionLayer: $('#reactionLayer'), impactLayer: $('#impactLayer'), combatantStage: $('#combatantStage'), activeMascot: $('#activeMascot'),
    activePilot: $('#activePilot'), mascotMood: $('#mascotMood'), feverGaugeFill: $('#feverGaugeFill'), feverGaugeLabel: $('#feverGaugeLabel'),
    result: $('#resultOverlay'), resultKicker: $('#resultKicker'), resultMascot: $('#resultMascot'), resultWinner: $('#resultWinner'), resultSummary: $('#resultSummary'),
    toast: $('#toast'), sound: $('#soundButton'), soundLabel: $('#soundLabel'), hint: $('#hintButton'), hintCount: $('#hintCount')
  };
  const modeLabels = {classic: '클래식 쿵', speed: '번개 쿵', relay: '릴레이 쿵'};
  const crewNames = ['루미', '노바', '볼트', '네오'];
  const savedMascot = Number(localStorage.getItem('segulja-mascot'));

  const app = {
    socket: null, connecting: null, room: null, playerId: localStorage.getItem('segulja-player') || `guest-${crypto.randomUUID()}`,
    nickname: localStorage.getItem('segulja-nickname') || '', desiredRoom: null, setupIntent: null, pendingCode: '',
    pendingMode: 'classic', reconnectAttempt: 0, serverOffset: 0, sound: localStorage.getItem('segulja-sound') === 'on',
    mascot: Number.isInteger(savedMascot) && savedMascot >= 0 && savedMascot < 4 ? savedMascot : 0,
    lastPhase: null, lastPlayAt: 0, previousLives: new Map(), impactQueue: [], impactBusy: false,
    feedbackTimers: new Set(), lastFever: false, lastTurn: null
  };
  const wordEntry = new KungInput.WordInput(els.wordInput, {now: () => Date.now() + app.serverOffset});
  const audioEngine = {
    ctx: null, master: null, music: null, sfx: null, compressor: null, noise: null, scheduler: null,
    nextStepAt: 0, step: 0, scene: 'lobby', mode: 'classic', urgency: 0, fever: false
  };
  localStorage.setItem('segulja-player', app.playerId);

  function socketUrl() {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/game`;
  }

  function connect() {
    if (app.socket?.readyState === WebSocket.OPEN) return Promise.resolve(app.socket);
    if (app.connecting) return app.connecting;
    setConnection(false, '연결 중');
    app.connecting = new Promise((resolve, reject) => {
      const socket = new WebSocket(socketUrl());
      app.socket = socket;
      const timeout = setTimeout(() => reject(new Error('connection timeout')), 9000);
      socket.onopen = () => {
        clearTimeout(timeout); app.connecting = null; app.reconnectAttempt = 0; setConnection(true, '연결됨');
        // Rejoin synchronously before releasing queued actions. Otherwise a word
        // submitted during a reconnect can reach the server before room recovery.
        if (app.desiredRoom) socket.send(JSON.stringify({
          type: 'join', code: app.desiredRoom, nickname: app.nickname, playerId: app.playerId, mascot: app.mascot
        }));
        resolve(socket);
      };
      socket.onmessage = event => handleMessage(JSON.parse(event.data));
      socket.onerror = () => { clearTimeout(timeout); app.connecting = null; reject(new Error('socket error')); };
      socket.onclose = () => {
        clearTimeout(timeout); app.connecting = null; setConnection(false, '재연결 중');
        wordEntry.reset(); syncInputControls();
        if (app.desiredRoom) {
          const delay = Math.min(7000, 700 * 2 ** app.reconnectAttempt++);
          setTimeout(() => connect().catch(() => {}), delay);
        }
      };
    });
    return app.connecting;
  }

  async function send(message) {
    try {
      const socket = await connect();
      socket.send(JSON.stringify(message));
    } catch {
      toast('서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요');
    }
  }

  function handleMessage(message) {
    if (message.type === 'joined') {
      app.desiredRoom = message.roomCode;
      app.playerId = message.playerId;
      localStorage.setItem('segulja-player', app.playerId);
      wordEntry.reset();
      els.wordForm.classList.remove('invalid');
      els.inputHint.classList.remove('invalid');
      history.replaceState({}, '', `${location.pathname}?room=${message.roomCode}`);
      showGame();
      return;
    }
    if (message.type === 'state') {
      clearTimeout(toast.timer);
      els.toast.classList.remove('show');
      app.serverOffset = message.serverTime - Date.now();
      app.room = message;
      renderGame(message);
      return;
    }
    if (message.type === 'reaction') {
      flyReaction(message.emoji, message.nickname);
      tone('reaction');
      return;
    }
    if (message.type === 'hint') {
      if (!wordEntry.receiveHint(message.word)) return;
      syncInputControls();
      els.inputHint.classList.remove('invalid');
      els.inputHint.textContent = `힌트가 입력됐어요 · ${message.remaining}개 남음 · ${message.cost}점 차감`;
      toast(`힌트: ${message.word} · ${message.cost}점`);
      tone('hint');
      return;
    }
    if (message.type === 'error') {
      wordEntry.reject(); syncInputControls();
      toast(message.message);
      tone('error');
      if (['HANGUL_ONLY', 'WRONG_LENGTH', 'WRONG_START', 'DUPLICATE', 'NOT_IN_DICTIONARY'].includes(message.code)) {
        const labels = {HANGUL_ONLY: '한글만!', WRONG_LENGTH: '글자 수!', WRONG_START: '첫 글자!', DUPLICATE: '중복 단어!', NOT_IN_DICTIONARY: '사전 미등록!'};
        showImpact('reject', labels[message.code] || '인정 불가!', message.message, '다시 도전', app.playerId);
        pulseArena('damage-flash');
        vibrate([45, 35, 65]);
        els.wordForm.classList.add('invalid');
        els.inputHint.classList.add('invalid');
        els.inputHint.textContent = message.message;
      }
      if (['ROOM_NOT_FOUND', 'GAME_STARTED', 'GAME_FINISHED', 'ROOM_FULL'].includes(message.code) && !app.room) goHome();
    }
  }

  function showGame() {
    if (els.game.hidden) window.scrollTo({top: 0, behavior: 'instant'});
    els.lobby.hidden = true; els.game.hidden = false;
  }

  function goHome() {
    if (app.room) send({type: 'leave'});
    app.desiredRoom = null; app.room = null; app.lastPhase = null; app.lastPlayAt = 0; app.lastTurn = null; app.lastFever = false;
    app.previousLives.clear(); resetFeedback(); els.result.hidden = true;
    wordEntry.update(null, app.playerId); els.wordForm.classList.remove('invalid'); updateInputViewport();
    app.socket?.close(); app.socket = null;
    history.replaceState({}, '', location.pathname);
    els.game.hidden = true; els.lobby.hidden = false; setMusicState(null); loadLobby();
  }

  function renderGame(room) {
    showGame();
    wordEntry.update(room, app.playerId);
    els.roomCode.textContent = room.roomCode;
    els.mobileRoomCode.textContent = room.roomCode;
    els.gameMode.textContent = modeLabels[room.mode.id] || room.mode.label;
    els.gameRule.textContent = `${room.mode.length} · ${room.mode.turnSeconds}초`;
    els.round.textContent = String(room.round || 1).padStart(2, '0');
    els.lengthRule.textContent = room.mode.length === '3글자' ? '반드시 세 글자' : `${room.mode.length} 단어`;
    els.playerCount.textContent = `${room.players.length} / 8`;
    els.required.textContent = room.requiredSyllable || '쿵';
    els.combo.textContent = room.combo;
    const feverTarget = room.feverTarget || 7;
    const feverProgress = Math.min(100, Math.max(0, room.combo) / feverTarget * 100);
    els.feverGaugeFill.style.width = `${room.fever ? 100 : feverProgress}%`;
    els.feverGaugeLabel.textContent = room.fever ? 'FEVER ×2' : `${Math.min(room.combo, feverTarget)} / ${feverTarget}`;
    els.eventText.textContent = room.eventText || '';
    els.lastWord.textContent = room.lastWord ? `방금 단어 · ${room.lastWord} → 다음 ‘${room.requiredSyllable}’` : '게임이 시작되면 첫 글자가 공개돼요';
    els.arena.classList.toggle('fever', room.fever);
    setMusicState(room);
    renderPlayers(room);
    renderHistory(room.history || []);

    const me = room.players.find(player => player.id === app.playerId);
    const current = room.players.find(player => player.id === room.turnPlayerId);
    const isHost = room.hostId === app.playerId;
    const myTurn = room.phase === 'playing' && room.turnPlayerId === app.playerId && !me?.eliminated;
    renderCombatant(room, current, me);
    renderResult(room, me);
    els.turnLabel.textContent = room.phase === 'waiting' ? '모두 준비되면 출발!' : room.phase === 'finished'
      ? `🏆 ${room.players.find(player => player.id === room.winnerId)?.nickname || '누군가'} 승리!` : myTurn ? '내 차례! 빠르게 이어주세요' : `${current?.nickname || '다음 플레이어'}님 차례`;
    const hints = me?.hints ?? 0;
    els.hintCount.textContent = hints;
    syncInputControls();
    els.wordInput.maxLength = room.mode.id === 'relay' ? 4 : 3;
    els.wordInput.placeholder = myTurn ? `‘${room.requiredSyllable}’로 시작하는 사전 명사` : '상대 차례 · 다음 글자를 기다려요';
    els.wordForm.classList.remove('invalid');
    els.inputHint.classList.remove('invalid');
    els.inputHint.textContent = myTurn ? `${room.mode.length} · 사전에 등록된 명사만 성공` : room.phase === 'playing' ? '상대 차례 · 키보드는 유지되고 다음 차례에 입력이 초기화돼요' : '시작 후 입력창을 눌러 단어를 입력하세요';
    els.start.hidden = room.phase !== 'waiting' || !isHost;
    els.rematch.hidden = room.phase !== 'finished' || !isHost;
    els.addBot.hidden = room.phase !== 'waiting' || !isHost || room.players.length >= 8;
    els.waitingCopy.hidden = room.phase === 'playing';
    els.controls.hidden = room.phase === 'playing' || (!isHost && room.phase !== 'waiting');
    processMatchFeedback(room);
    // No asynchronous autofocus: a dismissed mobile keyboard must stay dismissed.
    updateInputViewport();

    app.lastPhase = room.phase;
    app.lastPlayAt = room.history?.at(-1)?.at || 0;
    app.lastFever = Boolean(room.fever); app.lastTurn = room.turnPlayerId;
    app.previousLives = new Map(room.players.map(player => [player.id, player.lives]));
  }

  function renderPlayers(room) {
    els.playerList.replaceChildren(...room.players.map((player, index) => {
      const card = document.createElement('div');
      card.className = `player-card${player.id === room.turnPlayerId ? ' active' : ''}${player.eliminated ? ' eliminated' : ''}${!player.connected ? ' disconnected' : ''}`;
      card.dataset.playerId = player.id;
      const avatar = document.createElement('span'); avatar.className = 'avatar mascot-sprite';
      setMascotSprite(avatar, player.id); avatar.role = 'img'; avatar.ariaLabel = `${player.nickname}의 우주 캐릭터`;
      const info = document.createElement('span'); info.className = 'player-name';
      const name = document.createElement('b'); name.textContent = player.nickname;
      if (player.host) { const crown = document.createElement('i'); crown.className = 'host-crown'; crown.textContent = '★ 방장'; name.append(crown); }
      const state = document.createElement('small'); state.textContent = player.eliminated ? '관전 중' : !player.connected ? '재접속 중' : player.bot ? '쿵봇' : player.streak ? `${player.streak}연속 성공` : '준비 완료';
      info.append(name, state);
      const score = document.createElement('span'); score.className = 'player-score';
      const points = document.createElement('strong'); points.textContent = player.score.toLocaleString();
      const hearts = document.createElement('span'); hearts.className = 'hearts'; hearts.textContent = '♥'.repeat(Math.max(0, player.lives)) + '♡'.repeat(Math.max(0, 2 - player.lives));
      const lifeBar = document.createElement('span'); lifeBar.className = 'life-bar';
      const lifeFill = document.createElement('i'); lifeFill.style.width = `${Math.min(100, Math.max(0, player.lives) / 2 * 100)}%`;
      lifeBar.append(lifeFill); score.append(points, hearts, lifeBar); card.append(avatar, info, score); return card;
    }));
  }

  function renderHistory(history) {
    els.historyCount.textContent = history.length;
    if (!history.length) {
      els.history.innerHTML = '<li class="history-empty">첫 신호를 기다립니다</li>'; return;
    }
    els.history.replaceChildren(...[...history].reverse().map((play, index) => {
      const li = document.createElement('li'); const left = document.createElement('span');
      if (index === 0) li.classList.add('latest');
      const word = document.createElement('b'); word.textContent = play.word;
      const name = document.createElement('small'); name.textContent = play.nickname;
      left.append(word, document.createTextNode(' · '), name);
      const points = document.createElement('small'); points.textContent = `+${play.points}`;
      li.append(left, points); return li;
    }));
  }

  function mascotIndex(playerId = '') {
    let hash = 0;
    for (const character of playerId) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
    return Math.abs(hash) % 4;
  }

  function setMascotSprite(element, playerId) {
    const player = app.room?.players.find(item => item.id === playerId);
    const index = player?.mascot ?? mascotIndex(playerId);
    applyMascot(element, index);
  }

  function applyMascot(element, index) {
    element.style.setProperty('--sprite-x', index % 2);
    element.style.setProperty('--sprite-y', Math.floor(index / 2));
    element.dataset.mascot = String(index);
  }

  function renderCrewSelection() {
    $$('.crew-card').forEach(button => {
      const selected = Number(button.dataset.mascot) === app.mascot;
      button.setAttribute('aria-pressed', String(selected));
      button.querySelector('b').textContent = selected ? '선택됨' : '선택';
    });
    applyMascot($('#heroMascot'), app.mascot);
    applyMascot($('#setupMascot'), app.mascot);
    $('#crewSelection').textContent = `${crewNames[app.mascot]}와 함께 출격해요 · 모든 캐릭터는 외형만 달라요`;
    $('#setupCrewName').textContent = `${crewNames[app.mascot]}와 함께 출격!`;
  }

  function renderCombatant(room, current, me) {
    const featured = room.phase === 'finished'
      ? room.players.find(player => player.id === room.winnerId) || me || room.players[0]
      : current || me || room.players[0];
    if (!featured) return;
    setMascotSprite(els.activeMascot, featured.id);
    els.activePilot.textContent = featured.nickname;
    els.combatantStage.classList.toggle('mine', featured.id === app.playerId);
    els.combatantStage.dataset.state = room.phase;
    els.mascotMood.textContent = room.phase === 'finished' ? 'ORBIT KING' : room.phase === 'waiting' ? 'READY'
      : featured.id === app.playerId ? 'YOUR TURN' : featured.bot ? 'BOT THINKING' : 'NOW PLAYING';
  }

  function renderResult(room, me) {
    if (room.phase !== 'finished') {
      els.result.hidden = true;
      return;
    }
    const winner = room.players.find(player => player.id === room.winnerId);
    if (!winner) return;
    setMascotSprite(els.resultMascot, winner.id);
    els.resultKicker.textContent = winner.id === app.playerId ? 'YOU RULE THE ORBIT' : 'MISSION COMPLETE';
    els.resultWinner.textContent = winner.nickname;
    els.resultSummary.textContent = `${winner.score.toLocaleString()}점 · ${winner.wins}승 달성`;
    els.result.hidden = false;
    els.result.classList.toggle('mine', winner.id === app.playerId && Boolean(me));
  }

  function processMatchFeedback(room) {
    if (app.lastPhase === null) return;
    if ((app.lastPhase === 'waiting' || app.lastPhase === 'finished') && room.phase === 'playing') {
      resetFeedback();
      showImpact('start', '출격!', `첫 글자 ‘${room.requiredSyllable}’ · 박자에 올라타세요`, `ROUND ${room.round}`);
      pulseArena('start-flash');
    }

    const latest = room.history?.at(-1);
    if (latest && latest.at > app.lastPlayAt) {
      const mine = latest.playerId === app.playerId;
      showImpact('success', latest.word, `${latest.nickname} · ${room.combo} COMBO${room.fever ? ' · 피버 ×2' : ''}`, `+${latest.points}`, latest.playerId, mine);
      pulseArena('success-flash');
      animatePlayer(latest.playerId, 'scored');
      burstParticles(room.fever ? 'fever' : 'success');
      if (mine) vibrate([22, 28, 38]);
      tone(room.fever ? 'fever' : 'word');
    }

    room.players.forEach(player => {
      const previousLives = app.previousLives.get(player.id);
      if (previousLives === undefined || player.lives >= previousLives) return;
      const mine = player.id === app.playerId;
      showImpact('miss', player.eliminated ? '이번 판 탈락' : '시간 초과!', `${player.nickname} · ${player.eliminated ? '관전하며 응원해요' : `생명 ${player.lives}개 남음`}`, `♥ −${previousLives - player.lives}`, player.id, mine);
      pulseArena('damage-flash');
      animatePlayer(player.id, 'hit');
      if (mine) vibrate([90, 45, 110]);
      tone('error');
    });

    if (app.lastPhase === 'playing' && room.phase === 'finished') {
      celebrate(); tone('win');
    }
  }

  function feedbackLater(callback, delay) {
    const timer = setTimeout(() => { app.feedbackTimers.delete(timer); callback(); }, delay);
    app.feedbackTimers.add(timer);
    return timer;
  }

  function resetFeedback() {
    app.feedbackTimers.forEach(clearTimeout); app.feedbackTimers.clear();
    app.impactQueue.length = 0; app.impactBusy = false;
    els.impactLayer.replaceChildren(); els.reactionLayer.replaceChildren();
    els.arena.classList.remove('success-flash', 'damage-flash', 'start-flash');
  }

  function showImpact(kind, title, detail, badge = '', playerId = '', mine = false) {
    // Repeated submissions must not build a backlog that outlives the turn.
    if (kind === 'reject') app.impactQueue = app.impactQueue.filter(item => item.kind !== 'reject');
    if (app.impactQueue.length >= 2) app.impactQueue.shift();
    app.impactQueue.push({kind, title, detail, badge, playerId, mine});
    pumpImpact();
  }

  function pumpImpact() {
    if (app.impactBusy || !app.impactQueue.length) return;
    app.impactBusy = true;
    const notice = app.impactQueue.shift();
    const card = document.createElement('div');
    card.className = `impact-card ${notice.kind}${notice.mine ? ' mine' : ''}`;
    if (notice.playerId) {
      const portrait = document.createElement('span'); portrait.className = 'impact-mascot mascot-sprite';
      setMascotSprite(portrait, notice.playerId); card.append(portrait);
    }
    const copy = document.createElement('span'); copy.className = 'impact-copy';
    const kicker = document.createElement('small');
    kicker.textContent = ({success: 'NICE KUNG!', miss: 'MISS', reject: 'NOT ACCEPTED', start: 'GET READY'}[notice.kind] || 'KUNG!');
    const heading = document.createElement('strong'); heading.textContent = notice.title;
    const description = document.createElement('span'); description.textContent = notice.detail;
    copy.append(kicker, heading, description); card.append(copy);
    if (notice.badge) { const badge = document.createElement('b'); badge.textContent = notice.badge; card.append(badge); }
    els.impactLayer.replaceChildren(card);
    requestAnimationFrame(() => { if (card.isConnected) card.classList.add('show'); });
    const duration = notice.kind === 'miss' || notice.kind === 'reject' ? 1450 : 1150;
    feedbackLater(() => {
      card.classList.add('exit');
      feedbackLater(() => {
        card.remove(); app.impactBusy = false; pumpImpact();
      }, 260);
    }, duration);
  }

  function pulseArena(className) {
    els.arena.classList.remove(className);
    void els.arena.offsetWidth;
    els.arena.classList.add(className);
    feedbackLater(() => els.arena.classList.remove(className), 700);
  }

  function animatePlayer(playerId, className) {
    const card = [...els.playerList.children].find(item => item.dataset.playerId === playerId);
    if (!card) return;
    card.classList.add(className);
    feedbackLater(() => card.classList.remove(className), 760);
  }

  function burstParticles(kind) {
    for (let index = 0; index < 18; index++) {
      const particle = document.createElement('i'); particle.className = `impact-particle ${kind}`;
      particle.style.setProperty('--angle', `${index * 20 + Math.random() * 12}deg`);
      particle.style.setProperty('--distance', `${90 + Math.random() * 150}px`);
      particle.style.setProperty('--delay', `${Math.random() * 90}ms`);
      els.reactionLayer.append(particle); feedbackLater(() => particle.remove(), 1000);
    }
  }

  function vibrate(pattern) {
    try { navigator.vibrate?.(pattern); } catch { /* haptics are optional */ }
  }

  function updateTimer() {
    const room = app.room;
    if (!room || room.phase !== 'playing') {
      els.timerText.textContent = room?.mode?.turnSeconds?.toFixed?.(1) || '—';
      els.timerRing.style.setProperty('--progress', 1);
      els.combatantStage.classList.remove('urgent');
    } else {
      const total = Math.max(5, room.mode.turnSeconds - (room.fever ? 2 : 0)) * 1000;
      const remaining = Math.max(0, room.deadline - (Date.now() + app.serverOffset));
      els.timerText.textContent = (remaining / 1000).toFixed(1);
      const progress = Math.min(1, remaining / total);
      els.timerRing.style.setProperty('--progress', progress);
      els.combatantStage.classList.toggle('urgent', progress <= .28);
      setMusicUrgency(progress <= .13 ? 3 : progress <= .28 ? 2 : progress <= .5 ? 1 : 0);
    }
    requestAnimationFrame(updateTimer);
  }

  async function loadLobby() {
    try {
      const response = await fetch('/api/lobby', {cache: 'no-store'});
      if (!response.ok) return;
      const data = await response.json();
      els.onlineCount.textContent = data.stats.connectedPlayers || 0;
      if (!data.rooms.length) {
        els.roomList.innerHTML = '<div class="empty-room"><span>◌</span><p>열린 게임이 없어요. 첫 번째 방을 만들어 보세요!</p></div>';
        return;
      }
      els.roomList.replaceChildren(...data.rooms.map(room => {
        const button = document.createElement('button'); button.className = 'room-card'; button.type = 'button'; button.dataset.room = room.code;
        const top = document.createElement('div'); const code = document.createElement('strong'); code.textContent = room.code;
        const mode = document.createElement('b'); mode.textContent = room.modeLabel; top.append(code, mode);
        const people = document.createElement('p'); people.textContent = `${room.players}명 플레이 중${room.bots ? ` · 쿵봇 ${room.bots}` : ''} · 입장 가능`;
        button.append(top, people); return button;
      }));
    } catch { /* cold start while polling is harmless */ }
  }

  function openSetup(intent, {mode = 'classic', code = ''} = {}) {
    app.setupIntent = intent; app.pendingMode = mode; app.pendingCode = code;
    els.nickname.value = app.nickname;
    els.modePicker.hidden = intent === 'join';
    const radio = $(`input[name="mode"][value="${mode}"]`, els.modePicker); if (radio) radio.checked = true;
    els.dialog.showModal(); setTimeout(() => els.nickname.focus(), 50);
  }

  function useIdentityThen(intent, options = {}) {
    if (!app.nickname) openSetup(intent, options);
    else launch(intent, options);
  }

  function launch(intent, options = {}) {
    const mode = options.mode || app.pendingMode || 'classic';
    const identity = {nickname: app.nickname, playerId: app.playerId, mascot: app.mascot};
    if (intent === 'create') send({type: 'create', mode, ...identity});
    else if (intent === 'quick') send({type: 'quickJoin', mode, ...identity});
    else if (intent === 'join') send({type: 'join', code: options.code || app.pendingCode, ...identity});
  }

  function setConnection(ok, label) {
    els.connection?.classList.toggle('connected', ok);
    if (els.connection) els.connection.lastChild.textContent = ` ${label}`;
  }

  function toast(message) {
    els.toast.textContent = message; els.toast.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => els.toast.classList.remove('show'), 2800);
  }

  function flyReaction(emoji, nickname) {
    const item = document.createElement('div'); item.className = 'flying-reaction'; item.textContent = emoji;
    item.title = `${nickname}님의 반응`; item.style.left = `${12 + Math.random() * 76}%`;
    els.reactionLayer.append(item); feedbackLater(() => item.remove(), 2400);
  }

  function celebrate() {
    for (let i = 0; i < 24; i++) feedbackLater(() => flyReaction(['🎉','⭐','💥','👏'][i % 4], '승리'), i * 35);
  }

  function ensureAudio() {
    try {
      if (!audioEngine.ctx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        const ctx = new AudioContextClass();
        const master = ctx.createGain(), music = ctx.createGain(), sfx = ctx.createGain(), compressor = ctx.createDynamicsCompressor();
        master.gain.value = app.sound ? .82 : .0001; music.gain.value = .0001; sfx.gain.value = .72;
        compressor.threshold.value = -18; compressor.knee.value = 18; compressor.ratio.value = 4; compressor.attack.value = .006; compressor.release.value = .22;
        music.connect(master); sfx.connect(master); master.connect(compressor).connect(ctx.destination);
        const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * .15), ctx.sampleRate), data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        Object.assign(audioEngine, {ctx, master, music, sfx, compressor, noise, nextStepAt: ctx.currentTime + .05});
        audioEngine.scheduler = setInterval(scheduleMusic, 70);
      }
      audioEngine.master.gain.setTargetAtTime(app.sound ? .82 : .0001, audioEngine.ctx.currentTime, .025);
      if (app.sound && audioEngine.ctx.state === 'suspended') audioEngine.ctx.resume().catch(() => {});
      return audioEngine.ctx;
    } catch { return null; }
  }

  const midiHz = note => 440 * 2 ** ((note - 69) / 12);

  function synthNote(time, note, duration, level, type = 'triangle', cutoff = 1800, destination = audioEngine.music) {
    const ctx = audioEngine.ctx;
    if (!ctx || !destination) return;
    const oscillator = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(midiHz(note), time);
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(cutoff, time); filter.Q.value = .8;
    gain.gain.setValueAtTime(.0001, time); gain.gain.exponentialRampToValueAtTime(Math.max(.001, level), time + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    oscillator.connect(filter).connect(gain).connect(destination); oscillator.start(time); oscillator.stop(time + duration + .03);
  }

  function kick(time, level = .3) {
    const ctx = audioEngine.ctx, oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(130, time); oscillator.frequency.exponentialRampToValueAtTime(43, time + .15);
    gain.gain.setValueAtTime(level, time); gain.gain.exponentialRampToValueAtTime(.0001, time + .18);
    oscillator.connect(gain).connect(audioEngine.music); oscillator.start(time); oscillator.stop(time + .2);
  }

  function hat(time, level = .06) {
    const ctx = audioEngine.ctx, source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = audioEngine.noise; filter.type = 'highpass'; filter.frequency.value = 6500;
    gain.gain.setValueAtTime(level, time); gain.gain.exponentialRampToValueAtTime(.0001, time + .045);
    source.connect(filter).connect(gain).connect(audioEngine.music); source.start(time); source.stop(time + .05);
  }

  function scheduleMusicStep(time, step) {
    const roots = [45, 41, 48, 43], root = roots[Math.floor(step / 16) % roots.length], beat = step % 16;
    if (audioEngine.scene === 'lobby') {
      if (beat === 0 || beat === 8) {
        synthNote(time, root, 1.8, .055, 'sine', 950);
        synthNote(time, root + 7, 1.55, .035, 'triangle', 1300);
      }
      if (beat % 4 === 2) synthNote(time, root + 19, .28, .035, 'sine', 2800);
      return;
    }
    if (audioEngine.scene === 'finished') {
      if (beat % 4 === 0) synthNote(time, root + 12 + [0, 4, 7, 11][beat / 4], .65, .08, 'sine', 2200);
      return;
    }
    if (beat % 8 === 0) kick(time, audioEngine.scene === 'playing' ? .34 : .2);
    if (audioEngine.scene === 'waiting') {
      if (beat % 4 === 0) synthNote(time, root, .42, .1, 'triangle', 780);
      if (beat % 4 === 2) synthNote(time, root + 12 + [0, 7, 3, 10][Math.floor(beat / 4)], .25, .07, 'sine', 2200);
      return;
    }
    const arp = [0, 7, 12, 15, 7, 12, 19, 15];
    if (beat % 2 === 0 || audioEngine.urgency >= 2) synthNote(time, root + 12 + arp[beat % 8], .14, .12 + audioEngine.urgency * .015, audioEngine.fever ? 'sawtooth' : 'triangle', 1700 + audioEngine.urgency * 700);
    if (beat % 4 === 0) synthNote(time, root, .34, .17, 'sawtooth', 520 + audioEngine.urgency * 90);
    if (audioEngine.urgency >= 1 && beat % 2 === 1) hat(time, .035 + audioEngine.urgency * .016);
    if (audioEngine.urgency >= 3 && beat % 4 === 2) kick(time, .22);
  }

  function musicBpm() {
    if (audioEngine.scene === 'lobby') return 76;
    if (audioEngine.scene === 'waiting') return 92;
    if (audioEngine.scene === 'finished') return 72;
    return ({classic: 112, speed: 132, relay: 106}[audioEngine.mode] || 112) + audioEngine.urgency * 7 + (audioEngine.fever ? 12 : 0);
  }

  function scheduleMusic() {
    const ctx = audioEngine.ctx;
    if (!app.sound || !ctx || ctx.state !== 'running') return;
    if (audioEngine.nextStepAt < ctx.currentTime - .2 || audioEngine.nextStepAt > ctx.currentTime + 1) audioEngine.nextStepAt = ctx.currentTime + .04;
    while (audioEngine.nextStepAt < ctx.currentTime + .2) {
      scheduleMusicStep(audioEngine.nextStepAt, audioEngine.step);
      audioEngine.nextStepAt += 60 / musicBpm() / 4;
      audioEngine.step = (audioEngine.step + 1) % 64;
    }
  }

  function setMusicState(room) {
    audioEngine.scene = !room ? 'lobby' : room.phase === 'playing' ? 'playing' : room.phase === 'finished' ? 'finished' : 'waiting';
    audioEngine.mode = room?.mode?.id || 'classic'; audioEngine.fever = Boolean(room?.fever);
    document.body.dataset.audioScene = audioEngine.scene;
    if (audioEngine.scene !== 'playing') setMusicUrgency(0);
    if (!audioEngine.ctx) return;
    const target = !app.sound ? .0001 : ({lobby: .14, waiting: .22, playing: .34, finished: .18}[audioEngine.scene] || .18);
    audioEngine.music.gain.setTargetAtTime(target, audioEngine.ctx.currentTime, .18);
  }

  function setMusicUrgency(level) {
    audioEngine.urgency = level;
    document.body.dataset.audioUrgency = String(level);
    document.body.classList.toggle('music-urgent', level >= 1);
    document.body.classList.toggle('music-critical', level >= 2);
  }

  function updateSoundButton() {
    els.sound.setAttribute('aria-pressed', String(app.sound));
    els.sound.setAttribute('aria-label', app.sound ? '배경음악 끄기' : '배경음악 켜기');
    els.soundLabel.textContent = app.sound ? 'BGM ON' : 'BGM OFF';
    document.body.classList.toggle('music-on', app.sound);
  }

  function tone(kind) {
    if (!app.sound) return;
    const ctx = ensureAudio(); if (!ctx) return;
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    const notes = {word: 420, fever: 620, reaction: 520, error: 150, hint: 300, win: 760};
    oscillator.type = kind === 'error' ? 'square' : 'sine'; oscillator.frequency.setValueAtTime(notes[kind] || 400, ctx.currentTime);
    if (kind === 'word' || kind === 'win') oscillator.frequency.exponentialRampToValueAtTime((notes[kind] || 400) * 1.45, ctx.currentTime + .11);
    gain.gain.setValueAtTime(.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .18);
    oscillator.connect(gain).connect(audioEngine.sfx); oscillator.start(); oscillator.stop(ctx.currentTime + .2);
  }

  $('#quickButton').addEventListener('click', () => useIdentityThen('quick', {mode: 'classic'}));
  $('#createButton').addEventListener('click', () => openSetup('create'));
  $$('[data-quick-mode]').forEach(button => button.addEventListener('click', () => useIdentityThen('quick', {mode: button.dataset.quickMode})));
  $('#joinForm').addEventListener('submit', event => {
    event.preventDefault(); const code = els.roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) return toast('방 코드는 영문·숫자 5자리예요');
    useIdentityThen('join', {code});
  });
  els.roomCodeInput.addEventListener('input', () => els.roomCodeInput.value = els.roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  els.roomList.addEventListener('click', event => { const card = event.target.closest('[data-room]'); if (card) useIdentityThen('join', {code: card.dataset.room}); });
  $('#refreshRooms').addEventListener('click', loadLobby);
  els.dictionaryForm.addEventListener('submit', async event => {
    event.preventDefault();
    const word = els.dictionaryInput.value.trim();
    if (!word) {
      els.dictionaryResult.className = 'dictionary-result invalid';
      els.dictionaryResult.textContent = '단어를 입력해 주세요';
      return;
    }
    els.dictionaryResult.className = 'dictionary-result';
    els.dictionaryResult.textContent = '서버 사전을 조회하는 중…';
    try {
      const response = await fetch(`/api/word/check?word=${encodeURIComponent(word)}`, {cache: 'no-store'});
      if (!response.ok) throw new Error('lookup failed');
      const result = await response.json();
      if (result.known) {
        els.dictionaryResult.className = 'dictionary-result valid';
        els.dictionaryResult.textContent = `✓ ‘${result.word}’은 사용할 수 있는 ${result.length}글자 명사예요`;
      } else {
        els.dictionaryResult.className = 'dictionary-result invalid';
        els.dictionaryResult.textContent = `× ${result.word || word} · 등록된 명사가 아닙니다`;
      }
    } catch {
      els.dictionaryResult.className = 'dictionary-result invalid';
      els.dictionaryResult.textContent = '사전 서버에 연결하지 못했어요';
    }
  });
  els.dictionaryInput.addEventListener('input', () => {
    els.dictionaryResult.className = 'dictionary-result';
    els.dictionaryResult.textContent = '검증할 단어를 입력하세요';
  });
  els.setupForm.addEventListener('submit', event => {
    event.preventDefault();
    app.nickname = els.nickname.value.trim().replace(/[^가-힣A-Za-z0-9 ]/g, '').slice(0, 10) || `익명쿵${100 + Math.floor(Math.random() * 900)}`;
    localStorage.setItem('segulja-nickname', app.nickname);
    app.pendingMode = $('input[name="mode"]:checked', els.modePicker)?.value || app.pendingMode;
    els.dialog.close(); launch(app.setupIntent, {mode: app.pendingMode, code: app.pendingCode});
  });
  function syncInputControls() {
    const connected = app.socket?.readyState === WebSocket.OPEN;
    els.wordForm.querySelector('button').disabled = !connected || !wordEntry.canSubmit;
    els.wordForm.setAttribute('aria-busy', String(wordEntry.pending));
    const hints = app.room?.players.find(player => player.id === app.playerId)?.hints ?? 0;
    els.hint.disabled = !connected || !wordEntry.canSubmit || Boolean(wordEntry.hintKey) || hints <= 0;
  }

  function submitWord(explicitPointer = false) {
    // Never queue a turn-sensitive word to be replayed after a reconnect.
    if (app.socket?.readyState !== WebSocket.OPEN) {
      wordEntry.reset(); syncInputControls(); toast('재연결 중이에요. 연결되면 새 단어를 입력해 주세요'); return;
    }
    const word = wordEntry.takeWord(explicitPointer);
    if (!word) return;
    try { app.socket.send(JSON.stringify({type: 'word', word})); }
    catch { wordEntry.reject(); toast('전송하지 못했어요. 새 단어로 다시 시도해 주세요'); }
    syncInputControls();
  }
  els.wordForm.addEventListener('submit', event => { event.preventDefault(); submitWord(); });
  els.wordForm.querySelector('button').addEventListener('click', event => {
    event.preventDefault(); submitWord(event.detail > 0);
  });
  // Pointer taps must not move focus to a button and collapse the soft keyboard.
  [els.wordForm.querySelector('button'), els.hint, ...$$('.reactions button')].forEach(button => {
    button.addEventListener('pointerdown', event => {
      if (event.button === 0 && document.activeElement === els.wordInput) event.preventDefault();
    });
  });
  els.wordInput.addEventListener('input', () => {
    els.wordForm.classList.remove('invalid');
    els.inputHint.classList.remove('invalid');
  });
  els.hint.addEventListener('click', () => {
    if (app.socket?.readyState !== WebSocket.OPEN || !wordEntry.requestHint()) return;
    els.wordInput.focus({preventScroll: true});
    try { app.socket.send(JSON.stringify({type: 'hint'})); }
    catch { wordEntry.reject(); toast('힌트를 요청하지 못했어요. 다시 시도해 주세요'); }
    syncInputControls();
  });
  els.start.addEventListener('click', () => send({type: 'start'}));
  els.rematch.addEventListener('click', () => send({type: 'rematch'}));
  els.addBot.addEventListener('click', () => send({type: 'addBot'}));
  $('#leaveButton').addEventListener('click', goHome);
  $$('[data-go-home]').forEach(button => button.addEventListener('click', goHome));
  $$('.reactions button').forEach(button => button.addEventListener('click', () => send({type: 'react', emoji: button.dataset.reaction})));

  async function shareRoom() {
    const url = `${location.origin}${location.pathname}?room=${app.room?.roomCode || ''}`;
    try {
      if (navigator.share) await navigator.share({title: '세글자쿵! 같이 하자', text: `방 코드 ${app.room.roomCode} · 지금 바로 쿵!`, url});
      else { await navigator.clipboard.writeText(url); toast('초대 링크를 복사했어요!'); }
    } catch (error) { if (error?.name !== 'AbortError') toast('주소창의 링크를 복사해 친구에게 보내 주세요'); }
  }
  $('#shareButton').addEventListener('click', shareRoom); $('#mobileShareButton').addEventListener('click', shareRoom); els.roomCodeButton.addEventListener('click', shareRoom);
  setMusicState(null); updateSoundButton();
  els.sound.addEventListener('click', async () => {
    app.sound = !app.sound; localStorage.setItem('segulja-sound', app.sound ? 'on' : 'off');
    updateSoundButton();
    if (app.sound) {
      const ctx = ensureAudio(); if (ctx) await ctx.resume().catch(() => {});
      setMusicState(app.room); tone('word'); toast('BGM ON · 시간이 줄수록 박자가 빨라져요');
    } else if (audioEngine.ctx) {
      audioEngine.master.gain.setTargetAtTime(.0001, audioEngine.ctx.currentTime, .04);
      setTimeout(() => { if (!app.sound) audioEngine.ctx?.suspend().catch(() => {}); }, 260);
    }
  });
  window.addEventListener('keydown', event => {
    const editing = event.target instanceof Element && event.target.closest('input,textarea,[contenteditable="true"]');
    if (event.key === '/' && !editing && !event.isComposing && wordEntry.active) {
      event.preventDefault(); els.wordInput.focus({preventScroll: true});
    }
  });

  let viewportFrameId = 0;
  function updateInputViewport() {
    if (viewportFrameId) return;
    viewportFrameId = requestAnimationFrame(() => {
      viewportFrameId = 0;
      const viewport = window.visualViewport;
      const frame = KungInput.viewportFrame({
        width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight,
        offsetTop: viewport?.offsetTop, offsetLeft: viewport?.offsetLeft, scale: viewport?.scale,
        focused: document.activeElement === els.wordInput, playing: wordEntry.active
      });
      const root = document.documentElement;
      root.style.setProperty('--game-viewport-height', `${frame.height}px`);
      root.style.setProperty('--game-viewport-top', `${frame.top}px`);
      root.style.setProperty('--game-viewport-left', `${frame.left}px`);
      root.style.setProperty('--game-viewport-width', `${frame.width}px`);
      root.classList.toggle('game-input-active', frame.compact);
      root.classList.toggle('game-input-short', frame.compact && frame.short);
    });
  }
  els.wordInput.addEventListener('focus', updateInputViewport);
  els.wordInput.addEventListener('blur', updateInputViewport);
  window.addEventListener('resize', updateInputViewport, {passive: true});
  window.visualViewport?.addEventListener('resize', updateInputViewport, {passive: true});
  window.visualViewport?.addEventListener('scroll', updateInputViewport, {passive: true});
  window.addEventListener('pageshow', () => { wordEntry.reset(); updateInputViewport(); });
  const unlockAudio = () => { if (app.sound) { ensureAudio(); setMusicState(app.room); } };
  window.addEventListener('pointerdown', unlockAudio, {once: true, capture: true});
  window.addEventListener('keydown', unlockAudio, {once: true, capture: true});
  document.addEventListener('visibilitychange', () => {
    if (!audioEngine.ctx) return;
    if (document.hidden) audioEngine.ctx.suspend().catch(() => {});
    else if (app.sound) audioEngine.ctx.resume().then(() => { audioEngine.nextStepAt = audioEngine.ctx.currentTime + .05; }).catch(() => {});
  });

  $$('.crew-card').forEach(button => button.addEventListener('click', () => {
    app.mascot = Number(button.dataset.mascot);
    localStorage.setItem('segulja-mascot', String(app.mascot)); renderCrewSelection(); tone('reaction');
  }));
  renderCrewSelection();
  loadLobby(); setInterval(() => { if (!app.room) loadLobby(); }, 5000); requestAnimationFrame(updateTimer);
  const initialRoom = new URLSearchParams(location.search).get('room')?.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (initialRoom?.length === 5) useIdentityThen('join', {code: initialRoom});
})();
