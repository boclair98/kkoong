(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KungQuality = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function volume(value, fallback = 70) {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : fallback;
  }
  function audioMix({musicEnabled, effectsEnabled, musicVolume, effectsVolume, scene = 'lobby'}) {
    const music = musicEnabled ? volume(musicVolume) / 100 * ({lobby: .14, waiting: .22, playing: .34, finished: .18}[scene] || .14) : 0;
    const effects = effectsEnabled ? volume(effectsVolume) / 100 * .72 : 0;
    return {music, effects, audible: music > 0 || effects > 0};
  }
  // This is an input guide only. Dictionary, repetition and turn validation remain on the server.
  function draftGuide(raw, mode, composing = false) {
    const word = String(raw || '').trim().normalize('NFC');
    const count = [...word].length;
    const min = mode === 'relay' ? 2 : 3, max = mode === 'relay' ? 4 : 3;
    const label = `${count} / ${min === max ? max : '2–4'}글자`;
    if (composing) return {label, state: 'composing', message: '한글 조합 중'};
    if (!count) return {label, state: 'empty', message: '입력 후 쿵!'};
    if (!/^[가-힣]+$/.test(word)) return {label, state: 'incomplete', message: '한글 음절을 완성해요'};
    if (count < min) return {label, state: 'short', message: `${min - count}글자 더 입력해요`};
    if (count > max) return {label, state: 'long', message: `${max}글자까지 입력해요`};
    return {label, state: 'ready', message: '쿵!을 누르면 사전 판정'};
  }
  function roundReport(player) {
    if (!player || !Number.isFinite(player.bestStreak)) return null;
    const fastest = Number(player.fastestWordMillis);
    const hasWord = player.wordsPlayed > 0 && fastest > 0;
    const speed = !hasWord ? '—' : fastest < 100 ? '0.1초 미만' : `${(fastest / 1000).toFixed(1)}초`;
    const coaching = !hasWord ? '첫 성공부터 시작해요. 초급 쿵봇과 힌트로 다음 한 단어에 도전하세요.'
      : player.bestStreak >= 3 ? `${player.bestStreak}번 연속으로 내 차례를 성공했어요. 다음 판에도 이 리듬을 이어가요!`
      : player.hintsUsed > 0 ? '힌트로 이어 간 단어를 기억해 두세요. 다음 판에는 혼자서도 연결할 수 있어요.'
      : '힌트 없이 단어를 연결했어요. 다음 목표는 내 차례 3회 연속 성공!';
    return {speed, streak: `${player.bestStreak}회`, hints: `${player.hintsUsed || 0}회`, coaching};
  }
  return {volume, audioMix, draftGuide, roundReport};
});
