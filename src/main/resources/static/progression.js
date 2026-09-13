(() => {
  'use strict';

  const VERSION = 1;
  const DEFAULT_KEY = 'segulja-passport-v1';
  const MISSION_TEMPLATES = Object.freeze([
    {id: 'launch', title: '첫 출격', description: '게임 1판 시작하기', goal: 1, reward: 12, icon: '🚀'},
    {id: 'wordsmith', title: '단어 항로', description: '단어 5개 성공하기', goal: 5, reward: 18, icon: '✦'},
    {id: 'signal', title: '신호 보내기', description: '빠른 반응 1회 보내기', goal: 1, reward: 8, icon: '⚡'}
  ]);
  const BADGE_DEFINITIONS = Object.freeze([
    {id: 'first-flight', label: '첫 비행', description: '첫 게임 시작', test: profile => profile.matches >= 1},
    {id: 'combo-3', label: '콤보 점화', description: '3연속 성공', test: profile => profile.bestCombo >= 3},
    {id: 'word-keeper', label: '단어 수집가', description: '단어 20개 성공', test: profile => profile.words >= 20},
    {id: 'orbit-veteran', label: '궤도 베테랑', description: '10판 플레이', test: profile => profile.matches >= 10}
  ]);

  const clone = value => JSON.parse(JSON.stringify(value));

  function dateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function yesterdayKey(date = new Date()) {
    const previous = new Date(date);
    previous.setDate(previous.getDate() - 1);
    return dateKey(previous);
  }

  function initialMissions() {
    return Object.fromEntries(MISSION_TEMPLATES.map(mission => [mission.id, {progress: 0, claimed: false}]));
  }

  function emptyProfile(date = new Date()) {
    return {
      version: VERSION,
      date: dateKey(date),
      xp: 0,
      level: 1,
      matches: 0,
      wins: 0,
      words: 0,
      bestCombo: 0,
      streak: 0,
      lastPlayedDate: null,
      fragments: 0,
      badges: [],
      missions: initialMissions()
    };
  }

  function numberOr(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  }

  function normalize(raw, date = new Date()) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const profile = {...emptyProfile(date), ...source};
    profile.version = VERSION;
    profile.xp = Math.floor(numberOr(source.xp));
    profile.matches = Math.floor(numberOr(source.matches));
    profile.wins = Math.floor(numberOr(source.wins));
    profile.words = Math.floor(numberOr(source.words));
    profile.bestCombo = Math.floor(numberOr(source.bestCombo));
    profile.streak = Math.floor(numberOr(source.streak));
    profile.fragments = Math.floor(numberOr(source.fragments));
    profile.badges = Array.isArray(source.badges) ? [...new Set(source.badges.filter(Boolean))] : [];
    profile.missions = {...initialMissions(), ...(source.missions || {})};
    for (const mission of MISSION_TEMPLATES) {
      const current = profile.missions[mission.id] || {};
      profile.missions[mission.id] = {
        progress: Math.min(mission.goal, Math.floor(numberOr(current.progress))),
        claimed: Boolean(current.claimed)
      };
    }
    const today = dateKey(date);
    if (profile.date !== today) {
      profile.date = today;
      profile.missions = initialMissions();
    }
    profile.level = levelInfo(profile.xp).level;
    return profile;
  }

  function parse(raw, date = new Date()) {
    if (raw && typeof raw === 'object') return normalize(raw, date);
    if (typeof raw !== 'string' || !raw.trim()) return emptyProfile(date);
    try { return normalize(JSON.parse(raw), date); } catch { return emptyProfile(date); }
  }

  function levelInfo(totalXp = 0) {
    let level = 1;
    let spent = 0;
    let needed = 100;
    const xp = Math.max(0, Math.floor(numberOr(totalXp)));
    while (level < 99 && xp - spent >= needed) {
      spent += needed;
      level += 1;
      needed = 100 + (level - 1) * 50;
    }
    return {level, current: xp - spent, needed, total: xp, percent: Math.min(100, (xp - spent) / needed * 100)};
  }

  function addMissionProgress(profile, id, amount = 1) {
    const mission = MISSION_TEMPLATES.find(item => item.id === id);
    if (!mission) return;
    const current = profile.missions[id] || {progress: 0, claimed: false};
    current.progress = Math.min(mission.goal, current.progress + Math.max(0, amount));
    profile.missions[id] = current;
  }

  function unlockBadges(profile) {
    for (const badge of BADGE_DEFINITIONS) {
      if (badge.test(profile) && !profile.badges.includes(badge.id)) profile.badges.push(badge.id);
    }
  }

  function apply(profile, event, date = new Date()) {
    const next = normalize(clone(profile), date);
    const type = typeof event === 'string' ? event : event?.type;
    let gainedXp = 0;
    if (type === 'match') {
      next.matches += 1;
      gainedXp = 5;
      addMissionProgress(next, 'launch');
      const today = dateKey(date);
      next.streak = next.lastPlayedDate === yesterdayKey(date) ? next.streak + 1 : next.lastPlayedDate === today ? next.streak : 1;
      next.lastPlayedDate = today;
    } else if (type === 'word') {
      next.words += 1;
      gainedXp = 10;
      addMissionProgress(next, 'wordsmith');
    } else if (type === 'win') {
      next.wins += 1;
      gainedXp = 25;
    } else if (type === 'react') {
      gainedXp = 1;
      addMissionProgress(next, 'signal');
    } else if (type === 'combo') {
      next.bestCombo = Math.max(next.bestCombo, Math.floor(numberOr(event?.value)));
    }
    next.xp += gainedXp;
    next.level = levelInfo(next.xp).level;
    unlockBadges(next);
    return {profile: next, gainedXp};
  }

  function claim(profile, missionId, date = new Date()) {
    const next = normalize(clone(profile), date);
    const mission = MISSION_TEMPLATES.find(item => item.id === missionId);
    const status = next.missions[missionId];
    if (!mission || !status || status.claimed || status.progress < mission.goal) return {profile: next, claimed: false, reward: 0};
    status.claimed = true;
    next.fragments += mission.reward;
    next.xp += mission.reward;
    next.level = levelInfo(next.xp).level;
    unlockBadges(next);
    return {profile: next, claimed: true, reward: mission.reward};
  }

  function missions(profile, date = new Date()) {
    const current = normalize(profile, date);
    return MISSION_TEMPLATES.map(template => ({...template, ...(current.missions[template.id] || {progress: 0, claimed: false})}));
  }

  function badges(profile, date = new Date()) {
    const current = normalize(profile, date);
    return BADGE_DEFINITIONS.map(badge => ({...badge, unlocked: current.badges.includes(badge.id)}));
  }

  function createStore({read = () => null, write = () => {}, now = () => new Date(), key = DEFAULT_KEY} = {}) {
    let profile = parse(read(), now());
    const persist = () => {
      try { write(JSON.stringify(profile)); } catch { /* local storage is optional */ }
    };
    const current = () => {
      const fresh = normalize(profile, now());
      if (JSON.stringify(fresh) !== JSON.stringify(profile)) { profile = fresh; persist(); }
      return clone(profile);
    };
    return {
      key,
      get: current,
      record(event) {
        const result = apply(profile, event, now());
        profile = result.profile;
        persist();
        return {...result, profile: clone(profile)};
      },
      claim(missionId) {
        const result = claim(profile, missionId, now());
        profile = result.profile;
        if (result.claimed) persist();
        return {...result, profile: clone(profile)};
      },
      missions: () => missions(current(), now()),
      badges: () => badges(current(), now())
    };
  }

  const api = {VERSION, DEFAULT_KEY, MISSION_TEMPLATES, BADGE_DEFINITIONS, dateKey, emptyProfile, parse, normalize, levelInfo, apply, claim, missions, badges, createStore};
  if (typeof window !== 'undefined') window.KungProgression = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
