/* What every page needs from a script, and nothing else: a link that lands on a fold opens
   it, and a fold that is opened can be linked to. Every page reads and works without this. */
(function () {
  'use strict';

  /* open what the address points at: the fold itself, and any fold it sits inside */
  function land() {
    var at = document.getElementById(location.hash.slice(1));
    if (!at) return;
    var opened = false;
    for (var el = at; el; el = el.parentElement) {
      if (el.tagName === 'DETAILS' && !el.open) { el.open = true; opened = true; }
    }
    if (opened) at.scrollIntoView();
  }

  /* a fold with an id puts it in the address when it opens, and takes it out when it closes */
  document.addEventListener('toggle', function (e) {
    var el = e.target;
    if (!el.matches || !el.matches('details.fold[id]')) return;
    if (el.open) history.replaceState(null, '', '#' + el.id);
    else if (location.hash === '#' + el.id) history.replaceState(null, '', location.pathname + location.search);
  }, true);

  addEventListener('hashchange', land);
  land();
})();
