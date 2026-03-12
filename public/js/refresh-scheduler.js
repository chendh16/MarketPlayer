// RefreshScheduler — smart polling that pauses when the browser tab is hidden
// and resumes with flush+stagger when the tab becomes visible again.
// Usage: refreshScheduler.schedule('name', fn, intervalMs, options?)
// Options: { pauseWhenHidden: true, maxBackoffMultiplier: 4, staggerOnResume: true }
(function () {
  'use strict';

  function RefreshScheduler() {
    this._schedules = {};
    var self = this;
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        self._flushStale();
      }
    });
  }

  RefreshScheduler.prototype.schedule = function (name, fn, intervalMs, options) {
    var opts = options || {};
    var pauseWhenHidden     = opts.pauseWhenHidden !== false;
    var maxBackoffMultiplier = opts.maxBackoffMultiplier || 4;
    var staggerOnResume     = opts.staggerOnResume !== false;
    var self = this;

    if (this._schedules[name]) {
      clearInterval(this._schedules[name].timer);
    }

    var entry = {
      fn: fn,
      intervalMs: intervalMs,
      pauseWhenHidden: pauseWhenHidden,
      maxBackoffMultiplier: maxBackoffMultiplier,
      staggerOnResume: staggerOnResume,
      currentMultiplier: 1,
      lastRunAt: 0,
      timer: null,
    };

    function tick() {
      if (pauseWhenHidden && document.hidden) return;
      entry.lastRunAt = Date.now();
      Promise.resolve(fn()).then(function () {
        if (entry.currentMultiplier > 1) {
          entry.currentMultiplier = 1;
          reschedule();
        }
      }).catch(function () {
        if (entry.currentMultiplier < maxBackoffMultiplier) {
          entry.currentMultiplier = Math.min(entry.currentMultiplier * 2, maxBackoffMultiplier);
          reschedule();
        }
      });
    }

    function reschedule() {
      clearInterval(entry.timer);
      entry.timer = setInterval(tick, intervalMs * entry.currentMultiplier);
      self._schedules[name] = entry;
    }

    entry.timer = setInterval(tick, intervalMs);
    this._schedules[name] = entry;
  };

  // Call fn immediately for panels that are stale after the page was hidden
  RefreshScheduler.prototype._flushStale = function () {
    var self = this;
    var now = Date.now();
    var stagger = 0;
    Object.keys(this._schedules).forEach(function (name) {
      var entry = self._schedules[name];
      if (!entry.pauseWhenHidden) return;
      var age = now - entry.lastRunAt;
      if (age >= entry.intervalMs) {
        if (entry.staggerOnResume) {
          (function (e) {
            setTimeout(function () { e.lastRunAt = Date.now(); Promise.resolve(e.fn()).catch(function(){}); }, stagger);
          })(entry);
          stagger += 150;
        } else {
          entry.lastRunAt = now;
          Promise.resolve(entry.fn()).catch(function(){});
        }
      }
    });
  };

  RefreshScheduler.prototype.destroy = function (name) {
    if (this._schedules[name]) {
      clearInterval(this._schedules[name].timer);
      delete this._schedules[name];
    }
  };

  window.refreshScheduler = new RefreshScheduler();
})();
