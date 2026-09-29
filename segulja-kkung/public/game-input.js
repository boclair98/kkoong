/* Kept independent of rendering so server updates never replace or blur the input. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KungInput = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  class WordInput {
    constructor(input, {now = Date.now} = {}) {
      this.input = input;
      this.now = now;
      this.key = '';
      this.active = false;
      this.myTurn = false;
      this.pending = false;
      this.hintKey = null;
      this.composing = false;
      this.discardComposition = false;
      this.committedReplacement = '';
      this.imeEnterUntil = 0;
      input.addEventListener('compositionstart', () => {
        this.composing = true;
        this.discardComposition = false;
      });
      input.addEventListener('compositionend', () => {
        this.composing = false;
        // Safari can dispatch compositionend before the confirming Enter.
        this.imeEnterUntil = this.now() + 80;
        if (this.discardComposition) input.value = this.committedReplacement;
      });
      input.addEventListener('beforeinput', event => {
        if (!event.isComposing && !/Composition/.test(event.inputType || '')) this.discardComposition = false;
      });
      input.addEventListener('input', event => {
        // An IME may commit after a timeout or a pointer submission cleared it.
        if (this.discardComposition && (this.composing || /Composition/.test(event.inputType || ''))) input.value = this.committedReplacement;
      });
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229 || this.composing || this.now() < this.imeEnterUntil)) {
          event.preventDefault();
        }
      });
    }

    clear() {
      if (this.composing) this.discardComposition = true;
      this.committedReplacement = '';
      this.input.value = '';
    }

    reset() {
      this.clear();
      this.pending = false;
      this.hintKey = null;
    }

    update(room, playerId) {
      const me = room?.players.find(player => player.id === playerId);
      const key = room ? [room.roomCode, room.phase, room.round, room.deadline, room.turnPlayerId].join(':') : '';
      this.active = room?.phase === 'playing' && Boolean(me) && !me.eliminated;
      this.myTurn = this.active && room.turnPlayerId === playerId;
      this.deadline = room?.deadline || 0;
      if (key !== this.key || !this.active) this.reset();
      this.key = key;
      // Never disable/readOnly a focused field just because the opponent is up.
      this.input.disabled = !this.active;
    }

    get canSubmit() {
      return this.myTurn && !this.pending && this.now() < this.deadline;
    }

    takeWord(explicitPointer = false) {
      if (!this.canSubmit || (!explicitPointer && (this.composing || this.now() < this.imeEnterUntil))) return null;
      const word = this.input.value.trim().normalize('NFC');
      if (!word) return null;
      this.pending = true;
      this.hintKey = null;
      this.clear();
      return word;
    }

    reject() {
      // Do not restore the submitted word or overwrite a newly typed retry.
      this.pending = false;
      this.hintKey = null;
    }

    requestHint() {
      if (!this.canSubmit || this.hintKey) return false;
      this.hintKey = this.key;
      return true;
    }

    receiveHint(word) {
      const current = this.hintKey === this.key && this.canSubmit;
      this.hintKey = null;
      if (!current) return false;
      this.clear();
      this.input.value = word;
      this.committedReplacement = word;
      return true;
    }
  }

  function viewportFrame({width, height, offsetTop = 0, offsetLeft = 0, scale = 1, focused, playing}) {
    return {
      compact: Boolean(focused && playing && width <= 760 && Math.abs(scale - 1) < 0.05),
      short: height < 360,
      height: Math.max(0, Math.round(height)),
      top: Math.max(0, Math.round(offsetTop)),
      left: Math.max(0, Math.round(offsetLeft)),
      width: Math.max(0, Math.round(width))
    };
  }

  return {WordInput, viewportFrame};
});
