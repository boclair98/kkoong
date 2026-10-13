(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KungClient = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  class SocketConnection {
    constructor({createSocket, onSocket = () => {}, onOpen = () => {}, onMessage = () => {}, onClose = () => {}, timeoutMs = 9000, setTimer = (callback, delay) => setTimeout(callback, delay), clearTimer = timer => clearTimeout(timer)}) {
      Object.assign(this, {createSocket, onSocket, onOpen, onMessage, onClose, timeoutMs, setTimer, clearTimer});
      this.socket = null;
      this.pending = null;
    }

    connect() {
      if (this.pending) return this.pending.promise;
      if (this.socket?.readyState === 1) return Promise.resolve(this.socket);
      let socket;
      try { socket = this.createSocket(); } catch (error) { return Promise.reject(error); }
      const pending = {};
      pending.promise = new Promise((resolve, reject) => Object.assign(pending, {resolve, reject}));
      this.socket = socket;
      this.pending = pending;
      this.onSocket(socket);
      const fail = error => {
        if (this.socket !== socket) return;
        this.clearTimer(pending.timer);
        this.socket = null;
        this.pending = null;
        this.onSocket(null);
        pending.reject(error);
        try { socket.close(); } catch { /* already closed */ }
        this.onClose(error);
      };
      pending.timer = this.setTimer(() => fail(new Error('connection timeout')), this.timeoutMs);
      socket.onopen = () => {
        if (this.socket !== socket) return;
        this.clearTimer(pending.timer);
        try { this.onOpen(socket); } catch (error) { fail(error); return; }
        this.pending = null;
        pending.resolve(socket);
      };
      socket.onmessage = event => { if (this.socket === socket) this.onMessage(event.data); };
      socket.onerror = () => fail(new Error('socket error'));
      socket.onclose = () => fail(new Error('connection closed'));
      return pending.promise;
    }

    close() {
      const socket = this.socket, pending = this.pending;
      this.socket = null;
      this.pending = null;
      if (pending) {
        this.clearTimer(pending.timer);
        pending.reject(new Error('connection cancelled'));
      }
      this.onSocket(null);
      try { socket?.close(); } catch { /* already closed */ }
    }
  }

  function summarizeResult(room, playerId) {
    const ranking = [...(room.players || [])].sort((left, right) =>
      Number(right.id === room.winnerId) - Number(left.id === room.winnerId)
      || right.score - left.score || right.lives - left.lives);
    const rank = ranking.findIndex(player => player.id === playerId);
    return {
      winner: ranking.find(player => player.id === room.winnerId) || null,
      ranking,
      myRank: rank < 0 ? null : rank + 1,
      myWords: (room.history || []).filter(word => word.playerId === playerId).length
    };
  }

  return {SocketConnection, summarizeResult};
});
