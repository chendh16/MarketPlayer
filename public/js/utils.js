// Shared dashboard utilities — imported by dashboard.html panels
// Provides: DashUtils.fmtTime, DashUtils.escHtml, DashUtils.marketBadge, DashUtils.directionBadge
(function () {
  'use strict';

  function fmtTime(iso) {
    if (!iso) return '--';
    var d = new Date(iso);
    return String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0') + ' '
      + String(d.getHours()).padStart(2, '0') + ':'
      + String(d.getMinutes()).padStart(2, '0');
  }

  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function marketBadge(market) {
    var map = {
      us:  'bg-blue-100 text-blue-700',
      hk:  'bg-red-100 text-red-700',
      a:   'bg-green-100 text-green-700',
      btc: 'bg-orange-100 text-orange-700',
    };
    var cls = map[market] || 'bg-gray-100 text-gray-600';
    return '<span class="inline-flex px-1.5 py-0.5 rounded text-xs font-semibold ' + cls + '">'
      + (market || '--').toUpperCase() + '</span>';
  }

  function directionBadge(direction) {
    var isLong = direction === 'long' || direction === 'buy';
    return '<span class="inline-flex px-2 py-0.5 rounded text-xs font-semibold '
      + (isLong ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')
      + '">' + (isLong ? 'LONG' : 'SHORT') + '</span>';
  }

  window.DashUtils = {
    fmtTime: fmtTime,
    escHtml: escHtml,
    marketBadge: marketBadge,
    directionBadge: directionBadge,
  };
})();
