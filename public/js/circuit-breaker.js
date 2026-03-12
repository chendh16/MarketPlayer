// CircuitBreaker — prevents cascading failures from repeated API errors.
// States: closed (normal) → open (cooldown, returns stale data) → half-open (probe)
// Usage: var cb = new CircuitBreaker('name', { failureThreshold: 3, cooldownMs: 300000 });
//        cb.execute(function() { return fetch(...).then(r => r.json()); });
(function () {
  'use strict';

  function CircuitBreaker(name, options) {
    var opts = options || {};
    this.name = name;
    this.failureThreshold = opts.failureThreshold || 3;
    this.cooldownMs       = opts.cooldownMs || 5 * 60 * 1000;
    this._failures   = 0;
    this._state      = 'closed'; // closed | open | half-open
    this._openAt     = null;
    this._staleData  = undefined;
  }

  CircuitBreaker.prototype.execute = function (fn) {
    var self = this;

    if (this._state === 'open') {
      if (Date.now() - this._openAt < this.cooldownMs) {
        // Still in cooldown — return stale data silently, or reject if none
        if (self._staleData !== undefined) {
          return Promise.resolve(self._staleData);
        }
        return Promise.reject(new Error('[CircuitBreaker] ' + this.name + ' is open'));
      }
      // Cooldown elapsed — try half-open probe
      this._state = 'half-open';
    }

    return Promise.resolve(fn()).then(function (result) {
      self._failures = 0;
      self._state = 'closed';
      self._staleData = result;
      return result;
    }).catch(function (err) {
      self._failures++;
      if (self._failures >= self.failureThreshold) {
        self._state = 'open';
        self._openAt = Date.now();
        console.warn('[CircuitBreaker] ' + self.name + ' opened after ' + self._failures + ' failures');
      }
      // Return stale data on error if available
      if (self._staleData !== undefined) {
        return self._staleData;
      }
      throw err;
    });
  };

  window.CircuitBreaker = CircuitBreaker;
})();
