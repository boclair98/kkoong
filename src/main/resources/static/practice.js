(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KungPractice = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  class Lesson {
    constructor() { this.index = 0; }
    get words() { return ['자전거', '거미줄', '줄넘기']; }
    get done() { return this.index >= this.words.length; }
    get word() { return this.words[this.index] || ''; }
    get syllable() { return this.word[0] || '쿵'; }
    submit(value) {
      if (this.done) return {ok: false, message: '연습을 마쳤어요. 다시 연습하거나 대전을 시작해요.'};
      const word = String(value).trim().normalize('NFC');
      if (!/^[가-힣]{3}$/.test(word)) return {ok: false, message: '한글 세 글자를 입력해 주세요.'};
      if (word[0] !== this.syllable) return {ok: false, message: `첫 글자는 ‘${this.syllable}’예요.`};
      if (word !== this.word) return {ok: false, message: `이번 예시 연습은 ‘${this.word}’를 입력해요. 실제 대전에서는 다른 사전 명사도 가능해요.`};
      this.index++;
      return {ok: true, message: this.done ? '세 단어 완성! 이제 실제 대전에 도전해 보세요.' : `성공! 마지막 글자 ‘${word.at(-1)}’로 이어가요.`};
    }
  }
  return {Lesson};
});
