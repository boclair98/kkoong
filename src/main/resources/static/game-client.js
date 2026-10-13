(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KungClient = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  class SocketConnection {
    constructor({createSocket, onSocket = () => {}, onOpen = () => {}, onMessage = () => {}, onClose = () => {}, timeoutMs = 9000, heartbeatMs = 10000, livenessMs = 25000, now = Date.now, setTimer = (callback, delay) => setTimeout(callback, delay), clearTimer = timer => clearTimeout(timer)}) {
      Object.assign(this, {createSocket, onSocket, onOpen, onMessage, onClose, timeoutMs, heartbeatMs, livenessMs, now, setTimer, clearTimer});
      this.socket = null;
      this.pending = null;
      this.heartbeatTimer = null;
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
        this.clearTimer(this.heartbeatTimer);
        this.heartbeatTimer = null;
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
        this.lastReceivedAt = this.now();
        const heartbeat = () => {
          if (this.socket !== socket) return;
          if (this.now() - this.lastReceivedAt >= this.livenessMs) { fail(new Error('connection unresponsive')); return; }
          try { socket.send(JSON.stringify({type: 'ping'})); } catch (error) { fail(error); return; }
          this.heartbeatTimer = this.setTimer(heartbeat, this.heartbeatMs);
        };
        if (this.heartbeatMs > 0) this.heartbeatTimer = this.setTimer(heartbeat, this.heartbeatMs);
      };
      socket.onmessage = event => {
        if (this.socket !== socket) return;
        this.lastReceivedAt = this.now();
        try { this.onMessage(event.data); } catch { fail(new Error('invalid server response')); }
      };
      socket.onerror = () => fail(new Error('socket error'));
      socket.onclose = () => fail(new Error('connection closed'));
      return pending.promise;
    }

    close() {
      const socket = this.socket, pending = this.pending;
      this.socket = null;
      this.pending = null;
      this.clearTimer(this.heartbeatTimer);
      this.heartbeatTimer = null;
      if (pending) {
        this.clearTimer(pending.timer);
        pending.reject(new Error('connection cancelled'));
      }
      this.onSocket(null);
      try { socket?.close(); } catch { /* already closed */ }
    }

    check() {
      if (this.socket?.readyState === 1 && this.now() - this.lastReceivedAt >= this.livenessMs) {
        this.socket.onclose();
      }
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
      myWords: ranking.find(player => player.id === playerId)?.wordsPlayed ?? (room.history || []).filter(word => word.playerId === playerId).length
    };
  }

  // Storage can be blocked or full in a private WebView. Keep the current game usable.
  function safeStorage(getStorage) {
    const memory = new Map();
    return {
      getItem(key) { if (memory.has(key)) return memory.get(key); try { return getStorage().getItem(key); } catch { return null; } },
      setItem(key, value) { memory.set(key, String(value)); try { getStorage().setItem(key, String(value)); } catch { /* session-only fallback */ } },
      removeItem(key) { memory.set(key, null); try { getStorage().removeItem(key); } catch { /* unavailable storage */ } }
    };
  }

  return {SocketConnection, summarizeResult, safeStorage};
});
