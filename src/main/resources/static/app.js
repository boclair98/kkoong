(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const els = {
    lobby: $('#lobbyScreen'), game: $('#gameScreen'), dialog: $('#setupDialog'), setupForm: $('#setupForm'),
    nickname: $('#nicknameInput'), modePicker: $('#modePicker'), roomCodeInput: $('#roomCodeInput'), roomList: $('#roomList'),
    onlineCount: $('#onlineCount'), connection: $('#connectionStatus'), playerList: $('#playerList'), playerCount: $('#playerCount'),
    gameMode: $('#gameMode'), gameRule: $('#gameRule'), timerRing: $('#timerRing'), timerText: $('#timerText'),
    required: $('#requiredSyllable'), turnLabel: $('#turnLabel'), lastWord: $('#lastWord'), combo: $('#comboCount'),
    eventText: $('#eventText'), wordForm: $('#wordForm'), wordInput: $('#wordInput'), inputHint: $('#inputHint'),
    roomCode: $('#roomCode'), roomCodeButton: $('#roomCodeButton'), start: $('#startButton'), rematch: $('#rematchButton'),
    addBot: $('#addBotButton'), waitingCopy: $('#waitingCopy'), controls: $('#gameControls'), lengthRule: $('#lengthRule'),
    history: $('#wordHistory'), historyCount: $('#historyCount'), feverBanner: $('#feverBanner'), arena: $('.arena'), mobileRoomCode: $('#mobileRoomCode'),
    reactionLayer: $('#reactionLayer'), toast: $('#toast'), sound: $('#soundButton')
  };

  const app = {
    socket: null, connecting: null, room: null, playerId: localStorage.getItem('segulja-player') || `guest-${crypto.randomUUID()}`,
    nickname: localStorage.getItem('segulja-nickname') || '', desiredRoom: null, setupIntent: null, pendingCode: '',
    pendingMode: 'classic', reconnectAttempt: 0, serverOffset: 0, sound: localStorage.getItem('segulja-sound') === 'on',
    audio: null, lastPhase: null, lastHistorySize: 0, pendingWord: ''
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
          type: 'join', code: app.desiredRoom, nickname: app.nickname, playerId: app.playerId
        }));
        resolve(socket);
      };
      socket.onmessage = event => handleMessage(JSON.parse(event.data));
      socket.onerror = () => { clearTimeout(timeout); app.connecting = null; reject(new Error('socket error')); };
      socket.onclose = () => {
        clearTimeout(timeout); app.connecting = null; setConnection(false, '재연결 중');
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
      history.replaceState({}, '', `${location.pathname}?room=${message.roomCode}`);
      showGame();
      return;
    }
    if (message.type === 'state') {
      app.pendingWord = '';
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
    if (message.type === 'error') {
      toast(message.message);
      tone('error');
      if (['HANGUL_ONLY', 'WRONG_LENGTH', 'WRONG_START', 'DUPLICATE', 'NOT_IN_DICTIONARY'].includes(message.code)) {
        if (app.pendingWord) els.wordInput.value = app.pendingWord;
        els.wordForm.classList.add('invalid');
        els.inputHint.classList.add('invalid');
        els.inputHint.textContent = message.message;
        els.wordInput.focus({preventScroll: true});
      }
      if (['ROOM_NOT_FOUND', 'GAME_STARTED', 'GAME_FINISHED', 'ROOM_FULL'].includes(message.code) && !app.room) goHome();
    }
  }

  function showGame() {
    els.lobby.hidden = true; els.game.hidden = false; window.scrollTo({top: 0, behavior: 'smooth'});
  }

  function goHome() {
    if (app.room) send({type: 'leave'});
    app.desiredRoom = null; app.room = null; app.lastPhase = null; app.lastHistorySize = 0;
    app.socket?.close(); app.socket = null;
    history.replaceState({}, '', location.pathname);
    els.game.hidden = true; els.lobby.hidden = false; loadLobby();
  }

  function renderGame(room) {
    showGame();
    els.roomCode.textContent = room.roomCode;
    els.mobileRoomCode.textContent = room.roomCode;
    els.gameMode.textContent = room.mode.label;
    els.gameRule.textContent = `${room.mode.length} · ${room.mode.turnSeconds}초`;
    els.lengthRule.textContent = room.mode.length === '3글자' ? '반드시 세 글자' : `${room.mode.length} 단어`;
    els.playerCount.textContent = `${room.players.length} / 8`;
    els.required.textContent = room.requiredSyllable || '쿵';
    els.combo.textContent = room.combo;
    els.eventText.textContent = room.eventText || '';
    els.lastWord.textContent = room.lastWord ? `LAST SIGNAL / ${room.lastWord} → ${room.requiredSyllable}` : '출발과 함께 첫 음절이 공개됩니다';
    els.arena.classList.toggle('fever', room.fever);
    renderPlayers(room);
    renderHistory(room.history || []);

    const me = room.players.find(player => player.id === app.playerId);
    const current = room.players.find(player => player.id === room.turnPlayerId);
    const isHost = room.hostId === app.playerId;
    const myTurn = room.phase === 'playing' && room.turnPlayerId === app.playerId && !me?.eliminated;
    els.turnLabel.textContent = room.phase === 'waiting' ? 'LAUNCH SEQUENCE READY' : room.phase === 'finished'
      ? `${room.players.find(player => player.id === room.winnerId)?.nickname || '누군가'} 승리` : myTurn ? 'YOUR TRANSMISSION' : `${current?.nickname || '다음 승무원'} 전송 중`;
    els.wordInput.disabled = !myTurn;
    els.wordForm.querySelector('button').disabled = !myTurn;
    els.wordInput.maxLength = room.mode.id === 'relay' ? 4 : 3;
    els.wordInput.placeholder = myTurn ? `‘${room.requiredSyllable}’로 시작하는 사전 명사` : '다음 전송을 기다립니다';
    els.wordForm.classList.remove('invalid');
    els.inputHint.classList.remove('invalid');
    els.inputHint.textContent = myTurn ? `${room.mode.length} · 사전에 등록된 명사만 승인` : current?.bot ? '쿵봇이 사전 신호를 탐색 중…' : '내 차례에 입력 장치가 활성화됩니다';
    els.start.hidden = room.phase !== 'waiting' || !isHost;
    els.rematch.hidden = room.phase !== 'finished' || !isHost;
    els.addBot.hidden = room.phase !== 'waiting' || !isHost || room.players.length >= 8;
    els.waitingCopy.hidden = room.phase === 'playing';
    els.controls.hidden = room.phase === 'playing' || (!isHost && room.phase !== 'waiting');
    if (myTurn) setTimeout(() => els.wordInput.focus({preventScroll: true}), 80);

    if (app.lastPhase === 'playing' && room.phase === 'finished') {
      celebrate(); tone('win');
    } else if ((room.history?.length || 0) > app.lastHistorySize) {
      tone(room.fever ? 'fever' : 'word');
    }
    app.lastPhase = room.phase;
    app.lastHistorySize = room.history?.length || 0;
  }

  function renderPlayers(room) {
    els.playerList.replaceChildren(...room.players.map((player, index) => {
      const card = document.createElement('div');
      card.className = `player-card${player.id === room.turnPlayerId ? ' active' : ''}${player.eliminated ? ' eliminated' : ''}${!player.connected ? ' disconnected' : ''}`;
      const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = player.bot ? '봇' : [...player.nickname][0] || index + 1;
      const info = document.createElement('span'); info.className = 'player-name';
      const name = document.createElement('b'); name.textContent = player.nickname;
      if (player.host) { const crown = document.createElement('i'); crown.className = 'host-crown'; crown.textContent = 'CAPTAIN'; name.append(crown); }
      const state = document.createElement('small'); state.textContent = player.eliminated ? 'OBSERVER' : !player.connected ? 'RELINKING' : player.bot ? 'NAVIGATION BOT' : player.streak ? `${player.streak} SIGNAL STREAK` : 'SYSTEM READY';
      info.append(name, state);
      const score = document.createElement('span'); score.className = 'player-score';
      const points = document.createElement('strong'); points.textContent = player.score.toLocaleString();
      const hearts = document.createElement('span'); hearts.className = 'hearts'; hearts.textContent = '♥'.repeat(Math.max(0, player.lives)) + '♡'.repeat(Math.max(0, 2 - player.lives));
      score.append(points, hearts); card.append(avatar, info, score); return card;
    }));
  }

  function renderHistory(history) {
    els.historyCount.textContent = history.length;
    if (!history.length) {
      els.history.innerHTML = '<li class="history-empty">첫 신호를 기다립니다</li>'; return;
    }
    els.history.replaceChildren(...[...history].reverse().map(play => {
      const li = document.createElement('li'); const left = document.createElement('span');
      const word = document.createElement('b'); word.textContent = play.word;
      const name = document.createElement('small'); name.textContent = play.nickname;
      left.append(word, document.createTextNode(' · '), name);
      const points = document.createElement('small'); points.textContent = `+${play.points}`;
      li.append(left, points); return li;
    }));
  }

  function updateTimer() {
    const room = app.room;
    if (!room || room.phase !== 'playing') {
      els.timerText.textContent = room?.mode?.turnSeconds?.toFixed?.(1) || '—';
      els.timerRing.style.setProperty('--progress', 1);
    } else {
      const total = Math.max(5, room.mode.turnSeconds - (room.fever ? 2 : 0)) * 1000;
      const remaining = Math.max(0, room.deadline - (Date.now() + app.serverOffset));
      els.timerText.textContent = (remaining / 1000).toFixed(1);
      els.timerRing.style.setProperty('--progress', Math.min(1, remaining / total));
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
        els.roomList.innerHTML = '<div class="empty-room"><span>◌</span><p>공개 신호가 없습니다. 첫 미션을 생성해 보세요.</p></div>';
        return;
      }
      els.roomList.replaceChildren(...data.rooms.map(room => {
        const button = document.createElement('button'); button.className = 'room-card'; button.type = 'button'; button.dataset.room = room.code;
        const top = document.createElement('div'); const code = document.createElement('strong'); code.textContent = room.code;
        const mode = document.createElement('b'); mode.textContent = room.modeLabel; top.append(code, mode);
        const people = document.createElement('p'); people.textContent = `CREW ${room.players}${room.bots ? ` · BOT ${room.bots}` : ''} · OPEN CHANNEL`;
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
    if (intent === 'create') send({type: 'create', mode, nickname: app.nickname, playerId: app.playerId});
    else if (intent === 'quick') send({type: 'quickJoin', mode, nickname: app.nickname, playerId: app.playerId});
    else if (intent === 'join') send({type: 'join', code: options.code || app.pendingCode, nickname: app.nickname, playerId: app.playerId});
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
    els.reactionLayer.append(item); setTimeout(() => item.remove(), 2400);
  }

  function celebrate() {
    for (let i = 0; i < 24; i++) setTimeout(() => flyReaction(['🎉','⭐','💥','👏'][i % 4], '승리'), i * 35);
  }

  function tone(kind) {
    if (!app.sound) return;
    try {
      app.audio ||= new AudioContext();
      const ctx = app.audio, oscillator = ctx.createOscillator(), gain = ctx.createGain();
      const notes = {word: 420, fever: 620, reaction: 520, error: 150, win: 760};
      oscillator.frequency.setValueAtTime(notes[kind] || 400, ctx.currentTime);
      if (kind === 'word' || kind === 'win') oscillator.frequency.exponentialRampToValueAtTime((notes[kind] || 400) * 1.45, ctx.currentTime + .11);
      gain.gain.setValueAtTime(.05, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .18);
      oscillator.connect(gain).connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + .2);
    } catch { /* sound remains an optional enhancement */ }
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
  els.setupForm.addEventListener('submit', event => {
    event.preventDefault();
    app.nickname = els.nickname.value.trim().replace(/[^가-힣A-Za-z0-9 ]/g, '').slice(0, 10) || `익명쿵${100 + Math.floor(Math.random() * 900)}`;
    localStorage.setItem('segulja-nickname', app.nickname);
    app.pendingMode = $('input[name="mode"]:checked', els.modePicker)?.value || app.pendingMode;
    els.dialog.close(); launch(app.setupIntent, {mode: app.pendingMode, code: app.pendingCode});
  });
  els.wordForm.addEventListener('submit', event => {
    event.preventDefault(); const word = els.wordInput.value.trim(); if (!word) return;
    app.pendingWord = word; send({type: 'word', word}); els.wordInput.value = '';
  });
  els.wordInput.addEventListener('input', () => {
    els.wordForm.classList.remove('invalid');
    els.inputHint.classList.remove('invalid');
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
  els.sound.setAttribute('aria-pressed', String(app.sound)); els.sound.setAttribute('aria-label', app.sound ? '소리 끄기' : '소리 켜기');
  els.sound.addEventListener('click', () => {
    app.sound = !app.sound; localStorage.setItem('segulja-sound', app.sound ? 'on' : 'off');
    els.sound.setAttribute('aria-pressed', String(app.sound)); els.sound.setAttribute('aria-label', app.sound ? '소리 끄기' : '소리 켜기'); tone('word');
  });
  window.addEventListener('keydown', event => { if (event.key === '/' && app.room?.phase === 'playing') { event.preventDefault(); els.wordInput.focus(); } });

  loadLobby(); setInterval(() => { if (!app.room) loadLobby(); }, 5000); requestAnimationFrame(updateTimer);
  const initialRoom = new URLSearchParams(location.search).get('room')?.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (initialRoom?.length === 5) useIdentityThen('join', {code: initialRoom});
})();
