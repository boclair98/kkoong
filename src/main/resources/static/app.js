(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const localStorage = KungClient.safeStorage(() => window.localStorage);
  const sessionStore = KungClient.safeStorage(() => window.sessionStorage);
  let restoredSession;
  try { restoredSession = JSON.parse(sessionStore.getItem('segulja-room-session')); } catch { /* old or invalid record */ }
  const lobby = $('#lobbyScreen');
  ['.lobby-hero', '.join-strip', '.mode-section', '.crew-section', '.dictionary-strip', '.passport-section', '.rooms-section', '.promise-strip']
    .map(selector => $(selector, lobby)).filter(Boolean).forEach(section => lobby.append(section));
  const els = {
    lobby: $('#lobbyScreen'), game: $('#gameScreen'), dialog: $('#setupDialog'), setupForm: $('#setupForm'),
    nickname: $('#nicknameInput'), modePicker: $('#modePicker'), roomCodeInput: $('#roomCodeInput'), roomList: $('#roomList'),
    dictionaryForm: $('#dictionaryForm'), dictionaryInput: $('#dictionaryInput'), dictionaryResult: $('#dictionaryResult'),
    onlineCount: $('#onlineCount'), connection: $('#connectionStatus'), playerList: $('#playerList'), playerCount: $('#playerCount'),
    gameMode: $('#gameMode'), gameRule: $('#gameRule'), round: $('#roundCount'), timerRing: $('#timerRing'), timerText: $('#timerText'),
    required: $('#requiredSyllable'), turnInstruction: $('#turnInstruction'), entryPrompt: $('#entryPrompt'), submitLabel: $('#submitLabel'),
    arenaTitle: $('#arenaTitle'), turnLabel: $('#turnLabel'), lastWord: $('#lastWord'), combo: $('#comboCount'),
    eventText: $('#eventText'), wordForm: $('#wordForm'), wordInput: $('#wordInput'), inputHint: $('#inputHint'),
    waitingStage: $('#waitingStage'), waitingMascot: $('#waitingMascot'), waitingSeatCount: $('#waitingSeatCount'), waitingCopyText: $('#waitingCopyText'),
    resultRank: $('#resultRank'), resultWords: $('#resultWords'), resultPlayers: $('#resultPlayers'), resultRanking: $('#resultRanking'),
    roomCode: $('#roomCode'), roomCodeButton: $('#roomCodeButton'), start: $('#startButton'), rematch: $('#rematchButton'),
    addBot: $('#addBotButton'), waitingCopy: $('#waitingCopy'), controls: $('#gameControls'), lengthRule: $('#lengthRule'),
    history: $('#wordHistory'), historyCount: $('#historyCount'), feverBanner: $('#feverBanner'), arena: $('.arena'), mobileRoomCode: $('#mobileRoomCode'),
    reactionLayer: $('#reactionLayer'), impactLayer: $('#impactLayer'), combatantStage: $('#combatantStage'), activeMascot: $('#activeMascot'),
    activePilot: $('#activePilot'), mascotMood: $('#mascotMood'), feverGaugeFill: $('#feverGaugeFill'), feverGaugeLabel: $('#feverGaugeLabel'),
    result: $('#resultOverlay'), resultKicker: $('#resultKicker'), resultMascot: $('#resultMascot'), resultWinner: $('#resultWinner'), resultSummary: $('#resultSummary'),
    toast: $('#toast'), sound: $('#soundButton'), soundLabel: $('#soundLabel'), hint: $('#hintButton'), hintCount: $('#hintCount'),
    difficultyPicker: $('#difficultyPicker'), setupDifficultyPicker: $('#setupDifficultyPicker'),
    passportLevel: $('#passportLevel'), passportFragments: $('#passportFragments'), passportXp: $('#passportXp'), passportXpLabel: $('#passportXpLabel'),
    passportXpFill: $('#passportXpFill'), passportMatches: $('#passportMatches'), passportWins: $('#passportWins'), passportWinRate: $('#passportWinRate'),
    passportStreak: $('#passportStreak'), passportMissionMeta: $('#passportMissionMeta'), missionList: $('#missionList'), passportBadgeMeta: $('#passportBadgeMeta'), badgeList: $('#badgeList')
  };
  const modeLabels = {classic: '클래식 쿵', speed: '번개 쿵', relay: '릴레이 쿵'};
  function particleForStart(syllable) {
    const code = syllable?.codePointAt(0) || 0;
    if (code < 0xAC00 || code > 0xD7A3) return '으로';
    const jongseong = (code - 0xAC00) % 28;
    return jongseong === 0 || jongseong === 8 ? '로' : '으로';
  }
  const approvedNames = ['별빛', '은하', '달빛', '혜성', '우주', '반짝']
    .flatMap(prefix => ['탐험가', '항해사', '파일럿', '연구원'].map(role => prefix + role));
  els.nickname.replaceChildren(...approvedNames.map(name => new Option(name, name)));
  const crewCatalog = KungCrew;
  const mobileQuery = window.matchMedia('(max-width: 760px)');
  const crewPageSize = () => mobileQuery.matches ? 4 : 8;
  const crewNames = crewCatalog.map(crew => crew.name);
  const savedMascot = Number(localStorage.getItem('segulja-mascot'));

  const app = {
    socket: null, reconnectTimer: null, awaitingState: true, loadingLobby: false, entryPending: false, room: null,
    playerId: sessionStore.getItem('segulja-tab-player') || `guest-${crypto.randomUUID()}`, resumeToken: '',
    nickname: approvedNames.includes(localStorage.getItem('segulja-nickname')) ? localStorage.getItem('segulja-nickname') : '', desiredRoom: null, setupIntent: null, pendingCode: '',
    pendingMode: 'classic', pendingDifficulty: localStorage.getItem('segulja-difficulty') || 'beginner', reconnectAttempt: 0, serverOffset: 0, sound: localStorage.getItem('segulja-sound') !== 'off',
    haptics: localStorage.getItem('segulja-haptics') !== 'off',
    effectsSound: (localStorage.getItem('segulja-sfx') || localStorage.getItem('segulja-sound')) !== 'off',
    musicVolume: KungQuality.volume(localStorage.getItem('segulja-music-volume')),
    effectsVolume: KungQuality.volume(localStorage.getItem('segulja-effects-volume')),
    reducedEffects: localStorage.getItem('segulja-effects') === 'calm' || (!localStorage.getItem('segulja-effects') && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    mascot: Number.isInteger(savedMascot) && savedMascot >= 0 && savedMascot < crewCatalog.length ? savedMascot : 0,
    crewFilter: 'all', crewPage: 0, crewNotice: '',
    lastPhase: null, lastPlayAt: 0, previousLives: new Map(), impactQueue: [], impactBusy: false, impactSerial: 0,
    feedbackTimers: new Set(), lastFever: false, lastTurn: null
  };
  const wordEntry = new KungInput.WordInput(els.wordInput, {now: () => Date.now() + app.serverOffset});
  const audioEngine = {
    ctx: null, master: null, music: null, sfx: null, compressor: null, noise: null, scheduler: null,
    nextStepAt: 0, step: 0, scene: 'lobby', mode: 'classic', urgency: 0, fever: false
  };
  const progression = KungProgression.createStore({
    key: 'segulja-passport-v1',
    read: () => localStorage.getItem('segulja-passport-v1'),
    write: value => localStorage.setItem('segulja-passport-v1', value)
  });
  sessionStore.setItem('segulja-tab-player', app.playerId);
  // Migrate the former combined mute preference once, before BGM is changed independently.
  if (localStorage.getItem('segulja-sfx') === null) localStorage.setItem('segulja-sfx', app.effectsSound ? 'on' : 'off');

  function socketUrl() {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/game`;
  }

  function connect() {
    clearTimeout(app.reconnectTimer); app.reconnectTimer = null;
    if (app.socket?.readyState !== WebSocket.OPEN) setConnection(false, '연결 중');
    return transport.connect();
  }

  const transport = new KungClient.SocketConnection({
    createSocket: () => new WebSocket(socketUrl()),
    onSocket: socket => { app.socket = socket; },
    onOpen: socket => {
      app.reconnectAttempt = 0; app.awaitingState = true; setConnection(!app.desiredRoom, app.desiredRoom ? '복귀 중' : '연결됨');
      if (app.desiredRoom) socket.send(JSON.stringify({
        type: 'join', code: app.desiredRoom, nickname: app.nickname, playerId: app.playerId, mascot: app.mascot,
        protocolVersion: 2, resumeToken: app.resumeToken
      }));
    },
    onMessage: payload => handleMessage(JSON.parse(payload)),
    onClose: () => {
      app.awaitingState = true; setConnection(false, '재연결 중');
      wordEntry.reset(); syncInputControls();
      if (app.desiredRoom && navigator.onLine) {
        const delay = Math.min(7000, 700 * 2 ** app.reconnectAttempt++);
        app.reconnectTimer = setTimeout(() => { if (app.desiredRoom) connect().catch(() => {}); }, delay);
      }
    }
  });

  async function send(message) {
    try {
      const socket = await connect();
      socket.send(JSON.stringify(message));
    } catch (error) {
      if (error?.message !== 'connection cancelled') {
        console.warn('Game connection failed:', error?.message);
        toast('서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요');
      }
      setEntryPending(false);
    }
  }

  function handleMessage(message) {
    if (message.type === 'joined') {
      app.desiredRoom = message.roomCode;
      app.playerId = message.playerId;
      app.resumeToken = message.resumeToken || '';
      sessionStore.setItem('segulja-tab-player', app.playerId);
      sessionStore.setItem('segulja-room-session', JSON.stringify({roomCode: message.roomCode, playerId: app.playerId, resumeToken: app.resumeToken}));
      setEntryPending(false);
      if (message.mascotAdjusted && crewCatalog[message.mascot]) {
        app.crewNotice = `같은 크루가 이미 있어 이번 방에서는 ${crewNames[message.mascot]}와 함께해요`;
      }
      wordEntry.reset();
      els.wordForm.classList.remove('invalid');
      els.inputHint.classList.remove('invalid');
      history.replaceState({}, '', `${location.pathname}?room=${message.roomCode}`);
      showGame();
      return;
    }
    if (message.type === 'state') {
      app.awaitingState = false;
      setConnection(true, '연결됨');
      clearTimeout(toast.timer);
      els.toast.classList.remove('show');
      app.serverOffset = message.serverTime - Date.now();
      app.room = message;
      renderGame(message);
      if (app.crewNotice) { toast(app.crewNotice); app.crewNotice = ''; }
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
      setEntryPending(false);
      wordEntry.reject(); syncInputControls();
      toast(message.message);
      tone('error');
      if (message.code === 'INVALID_NICKNAME') {
        app.nickname = '';
        localStorage.removeItem('segulja-nickname');
        openSetup(app.setupIntent || 'quick', {mode: app.pendingMode, code: app.pendingCode});
        return;
      }
      if (['HANGUL_ONLY', 'WRONG_LENGTH', 'WRONG_START', 'DUPLICATE', 'NOT_IN_DICTIONARY'].includes(message.code)) {
        const labels = {HANGUL_ONLY: '한글만!', WRONG_LENGTH: '글자 수!', WRONG_START: '첫 글자!', DUPLICATE: '중복 단어!', NOT_IN_DICTIONARY: '사전 미등록!'};
        showImpact('reject', labels[message.code] || '인정 불가!', message.message, '다시 도전', app.playerId);
        pulseArena('damage-flash');
        vibrate([45, 35, 65]);
        els.wordForm.classList.add('invalid');
        els.inputHint.classList.add('invalid');
        els.inputHint.textContent = message.message;
      }
      if (['RESUME_DENIED', 'SESSION_REPLACED', 'JOIN_FIRST', 'ROOM_CLOSED', 'PLAYER_GONE'].includes(message.code)
          || (['ROOM_NOT_FOUND', 'GAME_STARTED', 'GAME_FINISHED', 'ROOM_FULL'].includes(message.code) && (app.awaitingState || !app.room))) goHome();
    }
  }

  function showGame() {
    if (els.game.hidden) window.scrollTo({top: 0, behavior: 'instant'});
    els.lobby.hidden = true; els.game.hidden = false;
  }

  function goHome() {
    if ($('#playMenu').open) $('#playMenu').close();
    if ($('#shareDialog').open) $('#shareDialog').close();
    if (app.room && app.socket?.readyState === WebSocket.OPEN) {
      try { app.socket.send(JSON.stringify({type: 'leave'})); } catch { /* close also leaves the room */ }
    }
    app.desiredRoom = null; app.room = null; app.lastPhase = null; app.lastPlayAt = 0; app.lastTurn = null; app.lastFever = false; app.crewNotice = '';
    app.resumeToken = ''; sessionStore.removeItem('segulja-room-session'); setEntryPending(false);
    app.previousLives.clear(); resetFeedback(); els.result.hidden = true;
    wordEntry.update(null, app.playerId); els.wordForm.classList.remove('invalid'); updateInputViewport();
    clearTimeout(app.reconnectTimer); app.reconnectTimer = null; app.awaitingState = true; transport.close();
    history.replaceState({}, '', location.pathname);
    els.game.hidden = true; els.lobby.hidden = false; setMusicState(null); loadLobby();
    setConnection(false, '대기 중');
    window.scrollTo({top: 0, behavior: 'instant'});
  }

  function renderGame(room) {
    showGame();
    els.game.dataset.phase = room.phase;
    els.game.dataset.mode = room.mode.id;
    els.waitingStage.hidden = room.phase !== 'waiting';
    els.waitingSeatCount.textContent = `${room.players.length} / 8`;
    els.waitingCopyText.textContent = room.players.length > 1
      ? `${room.players.length}명의 크루가 탑승했어요. 모두 준비되면 방장이 출발 버튼을 눌러요.`
      : '친구에게 방 코드를 보내거나 쿵봇을 불러 바로 출발할 수 있어요.';
    wordEntry.update(room, app.playerId);
    els.roomCode.textContent = room.roomCode;
    els.mobileRoomCode.textContent = room.roomCode;
    $('#waitingRoomCode').textContent = room.roomCode;
    els.gameMode.textContent = modeLabels[room.mode.id] || room.mode.label;
    const currentSeconds = room.mode.currentTurnSeconds || room.mode.turnSeconds;
    els.gameRule.textContent = `${room.mode.length} · ${currentSeconds}초${room.mode.tempoStage ? ` · 속도 ${room.mode.tempoStage + 1}` : ''}`;
    els.round.textContent = String(room.round || 1).padStart(2, '0');
    els.lengthRule.textContent = room.mode.length === '3글자' ? '반드시 세 글자' : `${room.mode.length} 단어`;
    els.playerCount.textContent = `${room.players.length} / 8`;
    const requiredSyllable = room.requiredSyllable || '쿵';
    const particle = particleForStart(requiredSyllable);
    els.required.textContent = requiredSyllable;
    els.turnInstruction.textContent = `${particle} 시작!`;
    els.arenaTitle.setAttribute('aria-label', `${requiredSyllable}${particle} 시작하는 단어를 입력하세요`);
    els.combo.textContent = room.combo;
    const feverTarget = room.feverTarget || 7;
    const feverProgress = Math.min(100, Math.max(0, room.combo) / feverTarget * 100);
    els.feverGaugeFill.style.width = `${room.fever ? 100 : feverProgress}%`;
    els.feverGaugeLabel.textContent = room.fever ? 'FEVER ×2' : `${Math.min(room.combo, feverTarget)} / ${feverTarget}`;
    els.eventText.textContent = room.eventText || '';
    els.lastWord.textContent = room.lastWord ? `방금 단어 · ${room.lastWord} → 다음 ‘${room.requiredSyllable}’` : room.phase === 'playing' ? `첫 단어를 기다려요 · 시작 글자 ‘${requiredSyllable}’` : '게임이 시작되면 첫 글자가 공개돼요';
    els.arena.classList.toggle('fever', room.fever);
    setMusicState(room);
    renderPlayers(room);
    renderHistory(room.history || []);

    const me = room.players.find(player => player.id === app.playerId);
    const current = room.players.find(player => player.id === room.turnPlayerId);
    const isHost = room.hostId === app.playerId;
    setMascotSprite(els.waitingMascot, app.playerId);
    const myTurn = room.phase === 'playing' && room.turnPlayerId === app.playerId && !me?.eliminated;
    renderCombatant(room, current, me);
    renderResult(room, me);
    els.turnLabel.textContent = room.phase === 'waiting' ? '모두 준비되면 출발!' : room.phase === 'finished'
      ? `🏆 ${room.players.find(player => player.id === room.winnerId)?.nickname || '누군가'} 승리!` : myTurn ? '내 차례! 빠르게 이어주세요' : `${current?.nickname || '다음 플레이어'}님 차례`;
    const hints = me?.hints ?? 0;
    els.hintCount.textContent = hints;
    syncInputControls();
    els.wordInput.maxLength = room.mode.id === 'relay' ? 4 : 3;
    els.wordInput.placeholder = mobileQuery.matches ? (myTurn ? '단어 입력' : '상대 차례') : myTurn ? `‘${requiredSyllable}’${particle} 시작하는 사전 명사` : '상대 차례 · 다음 글자를 기다려요';
    els.entryPrompt.textContent = myTurn ? `${requiredSyllable}${particle} 시작하는 ${room.mode.length} 명사` : room.phase === 'playing' ? `${current?.nickname || '상대'} 차례 · 다음 글자를 준비하세요` : `${room.mode.length} 단어로 출격 준비`;
    els.submitLabel.textContent = room.mode.id === 'relay' ? '단어 쿵!' : '세글자 쿵!';
    els.wordForm.querySelector('button').setAttribute('aria-label', `${room.mode.id === 'relay' ? '단어' : '세 글자'} 쿵, Enter 키로 제출`);
    els.wordForm.classList.remove('invalid');
    els.inputHint.classList.remove('invalid');
    const hintReady = myTurn && wordEntry.committedReplacement && els.wordInput.value === wordEntry.committedReplacement;
    els.inputHint.textContent = hintReady ? '힌트 단어가 입력됐어요 · 쿵!을 눌러 제출하세요' : myTurn ? `${room.mode.length} · 사전에 등록된 명사만 성공` : room.phase === 'playing' ? (mobileQuery.matches ? '상대 차례 · 다음 차례에 입력이 비워져요' : '상대 차례 · 키보드는 유지되고 다음 차례에 입력이 초기화돼요') : '시작 후 입력창을 눌러 단어를 입력하세요';
    els.start.hidden = room.phase !== 'waiting' || !isHost;
    els.rematch.hidden = room.phase !== 'finished' || !isHost;
    els.addBot.hidden = room.phase !== 'waiting' || !isHost || room.players.length >= 8;
    if (els.difficultyPicker) {
      els.difficultyPicker.hidden = room.phase !== 'waiting' || !isHost;
      $$('[data-difficulty]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.difficulty === room.difficulty?.id)));
    }
    els.waitingCopy.hidden = room.phase === 'playing';
    els.waitingCopy.textContent = room.phase === 'finished'
      ? (isHost ? '같은 크루와 새 판을 시작해요. 이번 판 기록은 초기화돼요.' : '방장이 재경기를 시작하면 함께 출격해요.')
      : (isHost ? '친구를 기다리거나 쿵봇을 불러 바로 시작하세요' : '방장이 시작하면 함께 출격해요.');
    els.controls.hidden = room.phase === 'playing';
    recordProgression(room);
    processMatchFeedback(room);
    if ($('#playMenu').open) renderPlayMenu();
    // No asynchronous autofocus: a dismissed mobile keyboard must stay dismissed.
    updateInputViewport();

    app.lastPhase = room.phase;
    app.lastPlayAt = room.history?.at(-1)?.at || 0;
    app.lastFever = Boolean(room.fever); app.lastTurn = room.turnPlayerId;
    app.previousLives = new Map(room.players.map(player => [player.id, player.lives]));
  }

  function renderPassport(profile = progression.get()) {
    if (!els.passportLevel || !profile) return;
    const level = KungProgression.levelInfo(profile.xp);
    const missions = progression.missions();
    const badges = progression.badges();
    const completedMissions = missions.filter(mission => mission.progress >= mission.goal).length;
    const unlockedBadges = badges.filter(badge => badge.unlocked).length;
    const winRate = profile.matches ? Math.round(profile.wins / profile.matches * 100) : 0;
    els.passportLevel.textContent = `LV ${level.level}`;
    els.passportFragments.textContent = profile.fragments.toLocaleString('ko-KR');
    els.passportXp.textContent = `${level.current} / ${level.needed} XP`;
    els.passportXpLabel.textContent = level.level >= 99 ? '최고 레벨에 도달했어요' : `다음 레벨까지 ${Math.max(0, level.needed - level.current)} XP`;
    els.passportXpFill.style.width = `${level.percent}%`;
    els.passportMatches.textContent = profile.matches.toLocaleString('ko-KR');
    els.passportWins.textContent = profile.wins.toLocaleString('ko-KR');
    els.passportWinRate.textContent = `${winRate}%`;
    els.passportStreak.textContent = `${profile.streak}일`;
    els.passportMissionMeta.textContent = `${completedMissions} / ${missions.length} 완료`;
    els.passportBadgeMeta.textContent = `${unlockedBadges} / ${badges.length}`;
    els.missionList.replaceChildren(...missions.map(mission => {
      const complete = mission.progress >= mission.goal;
      const item = document.createElement('div');
      item.className = `mission-item${complete ? ' done' : ''}`;
      const icon = document.createElement('span'); icon.className = 'mission-icon'; icon.textContent = mission.icon; icon.ariaHidden = 'true';
      const copy = document.createElement('span'); copy.className = 'mission-copy';
      const title = document.createElement('strong'); title.textContent = mission.title;
      const description = document.createElement('small'); description.textContent = `${mission.description} · ${Math.min(mission.progress, mission.goal)} / ${mission.goal}`;
      const meter = document.createElement('span'); meter.className = 'mission-meter';
      const meterFill = document.createElement('i'); meterFill.style.width = `${Math.min(100, mission.progress / mission.goal * 100)}%`; meter.append(meterFill);
      copy.append(title, description, meter);
      const reward = document.createElement('span'); reward.className = 'mission-reward';
      const rewardLabel = document.createElement('small'); rewardLabel.textContent = `+${mission.reward} ✦`;
      const claimButton = document.createElement('button'); claimButton.type = 'button'; claimButton.dataset.mission = mission.id;
      claimButton.className = mission.claimed ? 'claimed' : '';
      claimButton.disabled = mission.claimed || !complete;
      claimButton.textContent = mission.claimed ? '받음' : complete ? '받기' : '진행 중';
      claimButton.setAttribute('aria-label', `${mission.title} ${mission.claimed ? '보상 받음' : '보상 받기'}`);
      reward.append(rewardLabel, claimButton); item.append(icon, copy, reward);
      return item;
    }));
    els.badgeList.replaceChildren(...badges.map((badge, index) => {
      const item = document.createElement('div'); item.className = `badge-item${badge.unlocked ? ' unlocked' : ''}`;
      const icon = document.createElement('i'); icon.textContent = ['✦', '🔥', '◈', '★'][index] || '✦'; icon.ariaHidden = 'true';
      const copy = document.createElement('span'); const label = document.createElement('strong'); label.textContent = badge.label;
      const description = document.createElement('small'); description.textContent = badge.unlocked ? '획득 완료' : badge.description;
      copy.append(label, description); item.append(icon, copy); item.title = `${badge.label} · ${badge.description}`; return item;
    }));
  }

  function recordProgression(room) {
    const previousPhase = app.lastPhase;
    const latest = room.history?.at(-1);
    const roundKey = room.roundId || `${room.roomCode}:${room.round}`;
    let changed = false;
    const record = event => { const result = progression.record(event); changed ||= !result.duplicate; };
    if (room.phase === 'playing' && previousPhase !== 'playing') record({type: 'match', id: `match:${roundKey}`});
    // Ignore history already present when joining an active room; only count new local plays.
    if (previousPhase !== null && latest && latest.at > app.lastPlayAt && latest.playerId === app.playerId) record({type: 'word', id: `word:${roundKey}:${latest.at}:${latest.word}`});
    const currentBest = progression.get().bestCombo;
    if (Number.isFinite(Number(room.combo)) && room.combo > currentBest) record({type: 'combo', value: room.combo});
    if (room.phase === 'finished' && room.winnerId === app.playerId
        && (previousPhase === 'playing' || progression.get().recentEvents.includes(`match:${roundKey}`))) record({type: 'win', id: `win:${roundKey}`});
    if (changed) renderPassport();
  }

  function renderPlayers(room) {
    const isHostWaiting = room.phase === 'waiting' && room.hostId === app.playerId;
    const occupiedSeats = room.players.map(player => {
      const card = document.createElement('div');
      card.className = `player-card${player.id === room.turnPlayerId ? ' active' : ''}${player.eliminated ? ' eliminated' : ''}${!player.connected ? ' disconnected' : ''}`;
      card.dataset.playerId = player.id;
      const avatar = document.createElement('span'); avatar.className = 'avatar mascot-sprite';
      setMascotSprite(avatar, player.id); avatar.role = 'img';
      const crewName = crewNames[player.mascot] || '우주 크루';
      avatar.ariaLabel = `${player.nickname}의 캐릭터 ${crewName}`; avatar.title = crewName;
      const info = document.createElement('span'); info.className = 'player-name';
      const name = document.createElement('b'); name.textContent = player.nickname;
      if (player.host) { const crown = document.createElement('i'); crown.className = 'host-crown'; crown.textContent = '★ 방장'; name.append(crown); }
      const state = document.createElement('small'); state.textContent = player.eliminated ? '관전 중' : !player.connected ? '재접속 중' : player.bot ? `쿵봇 · ${crewName}` : player.streak ? `${player.streak}연속 · ${crewName}` : `${crewName} · 준비 완료`;
      info.append(name, state);
      const score = document.createElement('span'); score.className = 'player-score';
      const points = document.createElement('strong'); points.textContent = player.score.toLocaleString();
      const hearts = document.createElement('span'); hearts.className = 'hearts'; hearts.textContent = '♥'.repeat(Math.max(0, player.lives)) + '♡'.repeat(Math.max(0, 2 - player.lives));
      const lifeBar = document.createElement('span'); lifeBar.className = 'life-bar';
      const lifeFill = document.createElement('i'); lifeFill.style.width = `${Math.min(100, Math.max(0, player.lives) / 2 * 100)}%`;
      lifeBar.append(lifeFill); score.append(points, hearts, lifeBar); card.append(avatar, info, score);
      if (isHostWaiting && player.bot) {
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-bot';
        remove.dataset.removeBot = player.id; remove.setAttribute('aria-label', `${player.nickname} 삭제`); remove.textContent = '×'; card.append(remove);
      }
      return card;
    });
    const emptySeats = Array.from({length: room.phase === 'waiting' ? Math.max(0, 8 - room.players.length) : 0}, (_, index) => {
      const seat = document.createElement('div');
      seat.className = 'player-card player-slot empty-slot';
      seat.setAttribute('aria-label', `빈 좌석 ${room.players.length + index + 1}`);
      const plus = document.createElement('span'); plus.className = 'empty-seat-mark'; plus.textContent = '+'; plus.setAttribute('aria-hidden', 'true');
      const info = document.createElement('span'); info.className = 'player-name';
      const title = document.createElement('b'); title.textContent = '탑승 대기';
      const note = document.createElement('small'); note.textContent = '초대 링크로 참가';
      info.append(title, note);
      const seatLabel = document.createElement('span'); seatLabel.className = 'seat-number'; seatLabel.textContent = `${String(room.players.length + index + 1).padStart(2, '0')} / 08`;
      seat.append(plus, info, seatLabel); return seat;
    });
    els.playerList.replaceChildren(...occupiedSeats, ...emptySeats);
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
    return Math.abs(hash) % crewCatalog.length;
  }

  function setMascotSprite(element, playerId) {
    const player = app.room?.players.find(item => item.id === playerId);
    const index = player?.mascot ?? mascotIndex(playerId);
    applyMascot(element, index);
  }

  function applyMascot(element, index) {
    const crew = crewCatalog[index] || crewCatalog[0];
    element.style.backgroundImage = `url("${crew.image}")`;
    element.style.backgroundSize = crew.atlas ? '200% 200%' : 'contain';
    element.style.backgroundPosition = crew.atlas ? `${crew.id % 2 * 100}% ${Math.floor(crew.id / 2) * 100}%` : 'center';
    element.style.backgroundRepeat = 'no-repeat';
    element.dataset.mascot = String(crew.id);
  }

  function filteredCrew() {
    return crewCatalog.filter(crew => app.crewFilter === 'all' || crew.group === app.crewFilter);
  }

  function renderCrewGrid() {
    const choices = filteredCrew();
    const pageSize = crewPageSize();
    const pageCount = Math.max(1, Math.ceil(choices.length / pageSize));
    app.crewPage = Math.max(0, Math.min(app.crewPage, pageCount - 1));
    const cards = choices.slice(app.crewPage * pageSize, app.crewPage * pageSize + pageSize).map(crew => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'crew-card'; button.dataset.mascot = String(crew.id);
      const portrait = document.createElement('span'); portrait.className = 'mascot-sprite'; portrait.ariaHidden = 'true';
      applyMascot(portrait, crew.id);
      const copy = document.createElement('span');
      const role = document.createElement('small'); role.textContent = crew.role;
      const name = document.createElement('strong'); name.textContent = crew.name;
      const line = document.createElement('em'); line.textContent = crew.line;
      copy.append(role, name, line);
      const badge = document.createElement('b'); badge.textContent = '선택';
      button.append(portrait, copy, badge);
      return button;
    });
    $('#crewGrid').replaceChildren(...cards);
    $$('[data-crew-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.crewFilter === app.crewFilter)));
    $('#crewPageLabel').textContent = `${app.crewPage + 1} / ${pageCount} · ${choices.length}종`;
    $('#crewPrev').disabled = app.crewPage === 0;
    $('#crewNext').disabled = app.crewPage === pageCount - 1;
    renderCrewSelection();
  }

  function renderCrewSelection() {
    $$('.crew-card').forEach(button => {
      const selected = Number(button.dataset.mascot) === app.mascot;
      button.setAttribute('aria-pressed', String(selected));
      button.querySelector('b').textContent = selected ? '선택됨' : '선택';
    });
    applyMascot($('#heroMascot'), app.mascot);
    applyMascot($('#setupMascot'), app.mascot);
    applyMascot($('#mobileCrewPortrait'), app.mascot);
    $('#mobileCrewName').textContent = crewNames[app.mascot];
    $('#mobileDifficulty').textContent = {beginner: '초급', intermediate: '중급', advanced: '고급'}[app.pendingDifficulty] || '초급';
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
    const {winner, ranking, myRank, myWords} = KungClient.summarizeResult(room, app.playerId);
    setMascotSprite(els.resultMascot, winner?.id || app.playerId);
    els.resultKicker.textContent = winner?.id === app.playerId ? 'YOU RULE THE ORBIT' : 'MISSION COMPLETE';
    $('#resultTitle').textContent = winner ? '궤도의 주인공!' : '이번 판은 무승부';
    els.resultWinner.textContent = winner?.nickname || '다음 항로에서 만나요';
    els.resultSummary.textContent = winner ? `${winner.score.toLocaleString()}점 · ${winner.wins}승 달성` : '새 게임에서 다시 도전할 수 있어요';
    els.resultRank.textContent = myRank === null ? '관전' : `${myRank}위`;
    els.resultWords.textContent = String(myWords);
    els.resultPlayers.textContent = `${room.players.length}명`;
    const report = KungQuality.roundReport(me);
    $('#roundReport').hidden = !report;
    if (report) {
      $('#roundFastest').textContent = report.speed;
      $('#roundStreak').textContent = report.streak;
      $('#roundHints').textContent = report.hints;
      $('#roundCoaching').textContent = report.coaching;
    }
    els.resultRanking.replaceChildren(...ranking.map((player, index) => {
      const item = document.createElement('li');
      item.className = player.id === app.playerId ? 'result-player mine' : 'result-player';
      const position = document.createElement('span'); position.className = 'result-position'; position.textContent = String(index + 1).padStart(2, '0');
      const avatar = document.createElement('span'); avatar.className = 'result-avatar mascot-sprite'; avatar.setAttribute('aria-hidden', 'true'); setMascotSprite(avatar, player.id);
      const name = document.createElement('span'); name.className = 'result-player-name'; name.textContent = `${player.nickname}${player.id === app.playerId ? ' · 나' : ''}`;
      const score = document.createElement('b'); score.textContent = `${player.score.toLocaleString()}점`;
      item.append(position, avatar, name, score); return item;
    }));
    els.result.hidden = false;
    els.result.classList.toggle('mine', winner?.id === app.playerId && Boolean(me));
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
    app.impactQueue.length = 0; app.impactBusy = false; app.impactSerial++;
    els.impactLayer.replaceChildren(); els.reactionLayer.replaceChildren();
    els.arena.classList.remove('success-flash', 'damage-flash', 'start-flash');
  }

  function showImpact(kind, title, detail, badge = '', playerId = '', mine = false) {
    if (kind === 'success' && els.impactLayer.firstElementChild?.classList.contains('reject')) {
      app.impactSerial++; app.impactBusy = false; app.impactQueue.length = 0;
      els.impactLayer.replaceChildren();
    }
    // Repeated submissions must not build a backlog that outlives the turn.
    if (kind === 'reject') app.impactQueue = app.impactQueue.filter(item => item.kind !== 'reject');
    if (app.impactQueue.length >= 2) app.impactQueue.shift();
    app.impactQueue.push({kind, title, detail, badge, playerId, mine});
    pumpImpact();
  }

  function pumpImpact() {
    if (app.impactBusy || !app.impactQueue.length) return;
    app.impactBusy = true;
    const serial = ++app.impactSerial;
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
      if (serial !== app.impactSerial) return;
      card.classList.add('exit');
      feedbackLater(() => {
        if (serial !== app.impactSerial) return;
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
    if (app.reducedEffects) return;
    for (let index = 0; index < 18; index++) {
      const particle = document.createElement('i'); particle.className = `impact-particle ${kind}`;
      particle.style.setProperty('--angle', `${index * 20 + Math.random() * 12}deg`);
      particle.style.setProperty('--distance', `${90 + Math.random() * 150}px`);
      particle.style.setProperty('--delay', `${Math.random() * 90}ms`);
      els.reactionLayer.append(particle); feedbackLater(() => particle.remove(), 1000);
    }
  }

  function vibrate(pattern) {
    if (app.haptics) try { navigator.vibrate?.(pattern); } catch { /* haptics are optional */ }
  }

  function updateTimer() {
    const room = app.room;
    if (!room || room.phase !== 'playing') {
      els.timerText.textContent = room?.mode?.turnSeconds?.toFixed?.(1) || '—';
      els.timerRing.style.setProperty('--progress', 1);
      els.combatantStage.classList.remove('urgent');
    } else {
      const total = Math.max(5, room.mode.currentTurnSeconds || room.mode.turnSeconds) * 1000;
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
    if (app.loadingLobby) return;
    app.loadingLobby = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/lobby', {cache: 'no-store', signal: controller.signal});
      if (!response.ok) throw new Error('lobby unavailable');
      const data = await response.json();
      $('#lobbyStatus').hidden = true;
      els.onlineCount.textContent = data.stats.connectedPlayers || 0;
      if (!data.rooms.length) {
        els.roomList.innerHTML = '<div class="empty-room"><span>◌</span><p>열린 게임이 없어요. 첫 번째 방을 만들어 보세요!</p></div>';
        return;
      }
      els.roomList.replaceChildren(...data.rooms.map(room => {
        const button = document.createElement('button'); button.className = 'room-card'; button.type = 'button'; button.dataset.room = room.code;
        const top = document.createElement('div'); const code = document.createElement('strong'); code.textContent = room.code;
        const mode = document.createElement('b'); mode.textContent = room.modeLabel; top.append(code, mode);
        const people = document.createElement('p'); people.textContent = `${room.players}명 대기 중${room.bots ? ` · 쿵봇 ${room.bots}` : ''} · 입장 가능`;
        button.append(top, people); return button;
      }));
    } catch {
      $('#lobbyStatus').hidden = false;
      $('#lobbyStatus').textContent = '방 목록을 불러오지 못했어요. 새로고침하면 다시 확인할 수 있어요.';
    } finally { clearTimeout(timeout); app.loadingLobby = false; }
  }

  function openSetup(intent, {mode = 'classic', code = ''} = {}) {
    if (els.dialog.open || app.entryPending) return;
    app.setupIntent = intent; app.pendingMode = mode; app.pendingCode = code;
    els.nickname.value = app.nickname || approvedNames[0];
    els.modePicker.hidden = intent === 'join';
    const radio = $(`input[name="mode"][value="${mode}"]`, els.modePicker); if (radio) radio.checked = true;
    if (els.setupDifficultyPicker) {
      els.setupDifficultyPicker.hidden = intent === 'join';
      const difficulty = $(`input[name="difficulty"][value="${app.pendingDifficulty}"]`, els.setupDifficultyPicker);
      if (difficulty) difficulty.checked = true;
    }
    els.dialog.showModal(); setTimeout(() => els.nickname.focus(), 50);
  }

  function useIdentityThen(intent, options = {}) {
    if (app.entryPending) return;
    if (!app.nickname) openSetup(intent, options);
    else launch(intent, options);
  }

  function launch(intent, options = {}) {
    if (app.entryPending) return;
    setEntryPending(true);
    const mode = options.mode || app.pendingMode || 'classic';
    const identity = {nickname: app.nickname, playerId: app.playerId, mascot: app.mascot, difficulty: app.pendingDifficulty, protocolVersion: 2, resumeToken: app.resumeToken};
    if (intent === 'create') send({type: 'create', mode, ...identity});
    else if (intent === 'quick') send({type: 'quickJoin', mode, ...identity});
    else if (intent === 'join') send({type: 'join', code: options.code || app.pendingCode, ...identity});
  }

  function setEntryPending(pending) {
    app.entryPending = pending;
    ['#quickButton', '#createButton', '#setupSubmit', '#joinForm button', '#practiceButton'].forEach(selector => { const button = $(selector); if (button) button.disabled = pending; });
    els.lobby.setAttribute('aria-busy', String(pending));
  }

  function setConnection(ok, label) {
    els.connection?.classList.toggle('connected', ok);
    if (els.connection) els.connection.lastChild.textContent = ` ${label}`;
    $('#recoveryBanner').hidden = !app.desiredRoom || !app.awaitingState;
    $('#recoveryMessage').textContent = navigator.onLine ? '연결을 복구하고 있어요. 복귀할 때까지 입력을 잠시 막아요.' : '인터넷 연결이 끊겼어요. 연결되면 자동으로 돌아가요.';
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
    if (app.reducedEffects) return;
    for (let i = 0; i < 24; i++) feedbackLater(() => flyReaction(['🎉','⭐','💥','👏'][i % 4], '승리'), i * 35);
  }

  function ensureAudio() {
    try {
      if (!audioEngine.ctx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        const ctx = new AudioContextClass();
        const master = ctx.createGain(), music = ctx.createGain(), sfx = ctx.createGain(), compressor = ctx.createDynamicsCompressor();
        master.gain.value = .82; music.gain.value = 0; sfx.gain.value = 0;
        compressor.threshold.value = -18; compressor.knee.value = 18; compressor.ratio.value = 4; compressor.attack.value = .006; compressor.release.value = .22;
        music.connect(master); sfx.connect(master); master.connect(compressor).connect(ctx.destination);
        const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * .15), ctx.sampleRate), data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        Object.assign(audioEngine, {ctx, master, music, sfx, compressor, noise, nextStepAt: ctx.currentTime + .05});
        audioEngine.scheduler = setInterval(scheduleMusic, 70);
        ctx.addEventListener('statechange', updateAudioStatus);
      }
      applyAudioMix();
      if (audioMix().audible && audioEngine.ctx.state === 'suspended' && !document.hidden) audioEngine.ctx.resume().catch(updateAudioStatus);
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
    if (!app.sound || app.musicVolume === 0 || !ctx || ctx.state !== 'running') return;
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
    applyAudioMix();
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
    els.sound.title = app.sound ? 'BGM 기본 켜짐 · 화면을 한 번 누르면 재생돼요' : 'BGM 꺼짐 · 눌러서 다시 켤 수 있어요';
    els.soundLabel.textContent = app.sound ? 'BGM ON' : 'BGM OFF';
    document.body.classList.toggle('music-on', app.sound);
    $('#menuSound').setAttribute('aria-checked', String(app.sound));
    $('#menuSfx').setAttribute('aria-checked', String(app.effectsSound));
    for (const key of ['musicVolume', 'effectsVolume']) {
      $(`#${key}`).value = app[key];
      $(`#${key}Value`).textContent = `${app[key]}%`;
    }
    updateAudioStatus();
  }

  function audioMix() {
    return KungQuality.audioMix({musicEnabled: app.sound, effectsEnabled: app.effectsSound,
      musicVolume: app.musicVolume, effectsVolume: app.effectsVolume, scene: audioEngine.scene});
  }
  function applyAudioMix() {
    if (!audioEngine.ctx) return;
    const mix = audioMix(), now = audioEngine.ctx.currentTime;
    audioEngine.music.gain.setTargetAtTime(mix.music, now, .06);
    audioEngine.sfx.gain.setTargetAtTime(mix.effects, now, .025);
    updateAudioStatus();
  }
  function updateAudioStatus() {
    const mix = audioMix();
    $('#audioStatus').textContent = !mix.audible ? '모든 소리가 꺼져 있어요.'
      : audioEngine.ctx?.state === 'running' ? '소리 준비 완료 · 기기 음량과 무음 모드도 확인해 주세요.'
      : '화면을 한 번 누르면 소리가 시작돼요. 기기 음량도 확인해 주세요.';
  }

  function tone(kind) {
    if (!app.effectsSound || app.effectsVolume === 0) return;
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
  els.missionList?.addEventListener('click', event => {
    const button = event.target.closest('[data-mission]');
    if (!button || button.disabled) return;
    const result = progression.claim(button.dataset.mission);
    if (!result.claimed) return;
    renderPassport(result.profile);
    tone('win');
    toast(`오늘의 임무 완료 · +${result.reward} 조각`);
  });
  els.setupForm.addEventListener('submit', event => {
    event.preventDefault();
    if (event.submitter?.value === 'cancel') { els.dialog.close(); return; }
    if (!approvedNames.includes(els.nickname.value)) { toast('준비된 별명 중에서 골라 주세요'); return; }
    app.nickname = els.nickname.value;
    localStorage.setItem('segulja-nickname', app.nickname);
    app.pendingMode = $('input[name="mode"]:checked', els.modePicker)?.value || app.pendingMode;
    app.pendingDifficulty = $('input[name="difficulty"]:checked', els.setupDifficultyPicker)?.value || app.pendingDifficulty;
    localStorage.setItem('segulja-difficulty', app.pendingDifficulty);
    renderCrewSelection();
    els.dialog.close(); launch(app.setupIntent, {mode: app.pendingMode, code: app.pendingCode});
  });
  function syncInputControls() {
    const connected = app.socket?.readyState === WebSocket.OPEN && !app.awaitingState;
    els.wordForm.querySelector('button').disabled = !connected || !wordEntry.canSubmit;
    els.wordForm.setAttribute('aria-busy', String(wordEntry.pending));
    const hints = app.room?.players.find(player => player.id === app.playerId)?.hints ?? 0;
    els.hint.disabled = !connected || !wordEntry.canSubmit || Boolean(wordEntry.hintKey) || hints <= 0;
    renderDraftGuide();
  }

  function renderDraftGuide() {
    const guide = $('#draftGuide');
    guide.hidden = !wordEntry.active;
    if (!wordEntry.active) return;
    const draft = KungQuality.draftGuide(els.wordInput.value, app.room?.mode.id, wordEntry.composing);
    guide.dataset.state = draft.state;
    $('#draftCount').textContent = draft.label;
    $('#draftMessage').textContent = wordEntry.pending ? '서버에서 판정 중…'
      : !wordEntry.myTurn ? '상대 차례 · 다음 차례에 초기화' : draft.message;
  }

  function submitWord(explicitPointer = false) {
    // Never queue a turn-sensitive word to be replayed after a reconnect.
    if (app.socket?.readyState !== WebSocket.OPEN || app.awaitingState) {
      wordEntry.reset(); syncInputControls(); toast('재연결 중이에요. 연결되면 새 단어를 입력해 주세요'); return;
    }
    const word = wordEntry.takeWord(explicitPointer);
    if (!word) return;
    try { app.socket.send(JSON.stringify({type: 'word', word, round: app.room.round, turnCount: app.room.turnCount})); }
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
    renderDraftGuide();
  });
  els.wordInput.addEventListener('compositionend', renderDraftGuide);
  els.hint.addEventListener('click', () => {
    if (app.socket?.readyState !== WebSocket.OPEN || app.awaitingState || !wordEntry.requestHint()) return;
    els.wordInput.focus({preventScroll: true});
    try { app.socket.send(JSON.stringify({type: 'hint', round: app.room.round, turnCount: app.room.turnCount})); }
    catch { wordEntry.reject(); toast('힌트를 요청하지 못했어요. 다시 시도해 주세요'); }
    syncInputControls();
  });
  els.start.addEventListener('click', () => send({type: 'start'}));
  els.rematch.addEventListener('click', () => send({type: 'rematch'}));
  els.addBot.addEventListener('click', () => send({type: 'addBot'}));
  els.playerList.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-bot]');
    if (remove) send({type: 'removeBot', botId: remove.dataset.removeBot});
  });
  $$('[data-difficulty]').forEach(button => button.addEventListener('click', () => {
    app.pendingDifficulty = button.dataset.difficulty;
    localStorage.setItem('segulja-difficulty', app.pendingDifficulty);
    renderCrewSelection();
    send({type: 'setDifficulty', difficulty: app.pendingDifficulty});
  }));
  $('#leaveButton').addEventListener('click', requestGoHome);
  $$('[data-go-home]').forEach(button => button.addEventListener('click', requestGoHome));
  $$('.reactions button').forEach(button => button.addEventListener('click', () => {
    if (!app.room || app.socket?.readyState !== WebSocket.OPEN) return;
    progression.record('react');
    renderPassport();
    send({type: 'react', emoji: button.dataset.reaction});
  }));

  async function shareRoom() {
    if (!app.room) return;
    const url = `${location.origin}${location.pathname}?room=${app.room?.roomCode || ''}`;
    try {
      if (navigator.share) await navigator.share({title: '세글자쿵! 같이 하자', text: `방 코드 ${app.room.roomCode} · 지금 바로 쿵!`, url});
      else { await navigator.clipboard.writeText(url); toast('초대 링크를 복사했어요!'); }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      const link = $('#shareLink'); link.value = url;
      $('#shareDialog').showModal(); link.focus({preventScroll: true}); link.select();
    }
  }
  $('#shareButton').addEventListener('click', shareRoom); $('#waitingShareButton').addEventListener('click', shareRoom); $('#mobileShareButton').addEventListener('click', shareRoom); els.roomCodeButton.addEventListener('click', shareRoom);
  setMusicState(null); updateSoundButton();
  async function toggleSound() {
    app.sound = !app.sound; localStorage.setItem('segulja-sound', app.sound ? 'on' : 'off');
    updateSoundButton();
    ensureAudio(); setMusicState(app.room);
    toast(app.sound ? 'BGM ON · 시간이 줄수록 박자가 빨라져요' : 'BGM OFF · 효과음은 설정에서 따로 조절해요');
  }
  els.sound.addEventListener('click', toggleSound);
  $('#menuSound').addEventListener('click', toggleSound);
  $('#menuSfx').addEventListener('click', () => {
    app.effectsSound = !app.effectsSound;
    localStorage.setItem('segulja-sfx', app.effectsSound ? 'on' : 'off');
    ensureAudio(); updateSoundButton(); if (app.effectsSound) tone('word');
  });
  for (const [key, storageKey] of [['musicVolume', 'segulja-music-volume'], ['effectsVolume', 'segulja-effects-volume']]) {
    $(`#${key}`).addEventListener('input', event => {
      app[key] = KungQuality.volume(event.target.value);
      localStorage.setItem(storageKey, String(app[key]));
      ensureAudio(); updateSoundButton();
    });
  }

  function updatePlayPreferences() {
    $('#menuHaptics').setAttribute('aria-checked', String(app.haptics));
    $('#menuEffects').setAttribute('aria-checked', String(app.reducedEffects));
    document.body.classList.toggle('calm-effects', app.reducedEffects);
  }

  function renderPlayMenu() {
    const room = app.room;
    $('#playMenuTitle').textContent = room ? '게임 메뉴' : '플레이 설정';
    $('#menuGameNotice').hidden = room?.phase !== 'playing';
    $('#menuRoom').hidden = !room; $('#menuLeaveButton').hidden = !room;
    $('#menuRoomCode').textContent = room?.roomCode || '-----';
    $('#menuHistorySection').hidden = !room;
    const words = [...(room?.history || [])].slice(-12).reverse();
    $('#menuHistoryCount').textContent = `${room?.history?.length || 0}개 · 최근 12개`;
    $('#menuHistory').replaceChildren(...words.map(play => {
      const item = document.createElement('li');
      const copy = document.createElement('span'), word = document.createElement('strong'), name = document.createElement('small'), points = document.createElement('b');
      word.textContent = play.word; name.textContent = play.nickname; points.textContent = `+${play.points}`;
      copy.append(word, name); item.append(copy, points); return item;
    }));
    if (!words.length) {
      const empty = document.createElement('li'); empty.className = 'menu-history-empty'; empty.textContent = '첫 단어가 성공하면 기록이 쌓여요.'; $('#menuHistory').append(empty);
    }
    updateSoundButton(); updatePlayPreferences();
  }

  function openPlayMenu() {
    $('#menuExitConfirm').hidden = true;
    renderPlayMenu(); if (!$('#playMenu').open) $('#playMenu').showModal();
  }

  function requestGoHome() {
    if (app.room?.phase !== 'playing') { goHome(); return; }
    openPlayMenu(); $('#menuExitConfirm').hidden = false;
  }

  ['#mobileSettingsButton', '#mobileGameMenuButton', '#resultHistoryButton'].forEach(selector => $(selector).addEventListener('click', openPlayMenu));
  $('#closePlayMenu').addEventListener('click', () => $('#playMenu').close());
  $('#playMenu').addEventListener('close', () => { $('#menuExitConfirm').hidden = true; });
  $('#menuLeaveButton').addEventListener('click', requestGoHome);
  $('#confirmMenuExit').addEventListener('click', goHome);
  $('#cancelMenuExit').addEventListener('click', () => $('#playMenu').close());
  $('#menuShareButton').addEventListener('click', () => { $('#playMenu').close(); shareRoom(); });
  $('#menuHaptics').addEventListener('click', () => { app.haptics = !app.haptics; localStorage.setItem('segulja-haptics', app.haptics ? 'on' : 'off'); updatePlayPreferences(); });
  $('#menuEffects').addEventListener('click', () => { app.reducedEffects = !app.reducedEffects; localStorage.setItem('segulja-effects', app.reducedEffects ? 'calm' : 'full'); updatePlayPreferences(); });
  $('#mobileCrewChange').addEventListener('click', () => $('#crewTitle').scrollIntoView({block: 'start', behavior: app.reducedEffects ? 'instant' : 'smooth'}));
  updatePlayPreferences();
  let practiceLesson = new KungPractice.Lesson();
  const practiceInput = $('#practiceInput');
  const practiceEntry = new KungInput.WordInput(practiceInput);
  function renderPractice(message = '첫 글자에 맞춰 예시 단어를 입력하고 쿵! 또는 Enter를 눌러요.', result = '') {
    $('#practiceStep').textContent = practiceLesson.done ? '연습 완료' : `${practiceLesson.index + 1} / 3 단계 · 제한 시간 없음`;
    $('#practiceSyllable').textContent = practiceLesson.syllable;
    $('#practiceExample').textContent = practiceLesson.done ? '자전거 → 거미줄 → 줄넘기' : practiceLesson.word;
    $('#practiceForm').hidden = practiceLesson.done;
    $('#practiceComplete').hidden = !practiceLesson.done;
    $('#practiceFeedback').textContent = message;
    $('#practiceFeedback').className = result;
    $$('#practiceProgress i').forEach((element, index) => element.classList.toggle('done', index < practiceLesson.index));
    $('#practiceProgress').setAttribute('aria-label', `${practiceLesson.index} / 3 단어 완료`);
    practiceEntry.update(practiceLesson.done ? null : {roomCode: 'practice', phase: 'playing', round: practiceLesson.index, deadline: Number.MAX_SAFE_INTEGER, turnPlayerId: 'me', players: [{id: 'me', eliminated: false}]}, 'me');
  }
  $('#practiceButton').addEventListener('click', () => {
    practiceLesson = new KungPractice.Lesson(); practiceEntry.reset(); renderPractice(); $('#practiceDialog').showModal();
  });
  $('#closePractice').addEventListener('click', () => $('#practiceDialog').close());
  $('#restartPractice').addEventListener('click', () => { practiceLesson = new KungPractice.Lesson(); renderPractice(); });
  $('#practicePlay').addEventListener('click', () => { $('#practiceDialog').close(); useIdentityThen('quick', {mode: 'classic'}); });
  $('#practiceForm').addEventListener('submit', event => {
    event.preventDefault();
    const value = practiceEntry.takeWord();
    if (value === null) return;
    const result = practiceLesson.submit(value);
    practiceEntry.reject(); renderPractice(result.message, result.ok ? 'success' : 'error');
    tone(result.ok ? 'word' : 'error');
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
  window.addEventListener('pageshow', () => { wordEntry.reset(); transport.check(); updateInputViewport(); });
  $('#retryConnection').addEventListener('click', () => {
    if (!app.desiredRoom || !navigator.onLine) return;
    app.awaitingState = true; wordEntry.reset(); transport.close(); syncInputControls(); connect().catch(() => {});
  });
  $('#recoveryHome').addEventListener('click', requestGoHome);
  window.addEventListener('online', () => { if (app.desiredRoom) connect().catch(() => {}); else loadLobby(); });
  window.addEventListener('offline', () => {
    if (app.desiredRoom) { app.awaitingState = true; wordEntry.reset(); syncInputControls(); setConnection(false, '오프라인'); transport.close(); }
  });
  const unlockAudio = event => {
    const togglingSound = event.target instanceof Element && event.target.closest('#soundButton');
    if (audioMix().audible && !togglingSound) { ensureAudio(); setMusicState(app.room); }
  };
  window.addEventListener('pointerdown', unlockAudio, {once: true, capture: true});
  window.addEventListener('keydown', unlockAudio, {once: true, capture: true});
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { transport.check(); if (!app.room) loadLobby(); }
    if (!audioEngine.ctx) return;
    if (document.hidden) audioEngine.ctx.suspend().catch(() => {});
    else if (audioMix().audible) audioEngine.ctx.resume().then(() => { audioEngine.nextStepAt = audioEngine.ctx.currentTime + .05; }).catch(updateAudioStatus);
  });

  $('#crewGrid').addEventListener('click', event => {
    const button = event.target.closest('button[data-mascot]');
    if (!button || !$('#crewGrid').contains(button)) return;
    app.mascot = Number(button.dataset.mascot);
    localStorage.setItem('segulja-mascot', String(app.mascot)); renderCrewSelection(); tone('reaction');
  });
  $$('[data-crew-filter]').forEach(button => button.addEventListener('click', () => {
    app.crewFilter = button.dataset.crewFilter; app.crewPage = 0; renderCrewGrid();
  }));
  $('#crewPrev').addEventListener('click', () => { app.crewPage--; renderCrewGrid(); });
  $('#crewNext').addEventListener('click', () => { app.crewPage++; renderCrewGrid(); });
  $('#crewRandom').addEventListener('click', () => {
    const choices = filteredCrew().filter(crew => crew.id !== app.mascot);
    app.mascot = choices[Math.floor(Math.random() * choices.length)].id;
    app.crewPage = Math.floor(filteredCrew().findIndex(crew => crew.id === app.mascot) / crewPageSize());
    localStorage.setItem('segulja-mascot', String(app.mascot)); renderCrewGrid(); tone('reaction');
  });
  mobileQuery.addEventListener('change', () => {
    app.crewPage = Math.max(0, Math.floor(filteredCrew().findIndex(crew => crew.id === app.mascot) / crewPageSize())); renderCrewGrid();
  });
  app.crewPage = Math.floor(app.mascot / crewPageSize());
  renderCrewGrid(); renderPassport();
  loadLobby(); setInterval(() => { if (!app.room && !document.hidden && navigator.onLine) loadLobby(); }, 5000); requestAnimationFrame(updateTimer);
  const initialRoom = new URLSearchParams(location.search).get('room')?.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (initialRoom?.length === 5) {
    if (restoredSession?.roomCode === initialRoom && restoredSession.playerId === app.playerId && typeof restoredSession.resumeToken === 'string') app.resumeToken = restoredSession.resumeToken;
    useIdentityThen('join', {code: initialRoom});
  }
})();
