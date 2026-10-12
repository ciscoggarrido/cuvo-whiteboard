/* The page's own glue. Without this file the page still reads and the queue still works:
   every place a link can name is in the plain list, and every fold and row opens by hand.

   For the rows that open beside the queue: one is open at a time, and the row just opened
   stays where it was pressed.

   For the queue, and only once it is running:
   - the fold that follows the queue joins the queue's own folds, under the list of everything;
   - a link to one item of that list goes to the card. The list is folded away by then, so the
     places it kept are kept here instead, and the address finds nothing to open by itself. */
(function () {
  'use strict';

  /* Rows that share a name: the browser closes the one that was open when another opens. The
     page above the new one then gets shorter, so the row is put back where it was pressed.
     The name is given here and not in the page, because with no script nothing could put the
     row back: there, rows open and close one by one. */
  function rows() {
    function keep(summary, top, more) {
      requestAnimationFrame(function () {
        var moved = summary.getBoundingClientRect().top - top;
        if (Math.abs(moved) > 1) scrollBy(0, moved);
        if (more) keep(summary, top, more - 1);       /* once more, in case the browser moved the page too */
      });
    }
    document.querySelectorAll('.chart details.area').forEach(function (row) {
      var summary = row.querySelector('summary');
      if (!summary) return;
      row.setAttribute('name', 'area');
      summary.addEventListener('click', function () {
        if (!row.open) keep(summary, summary.getBoundingClientRect().top, 1);
      });
    });
  }

  function queue() {
    var root = document.querySelector('[data-queue][data-live]');
    if (!root) return;                            // the queue did not start: the list has every place
    var all = root.querySelector('.q-all');
    var held = document.querySelector('.q-held');
    if (all && held && !root.contains(held)) all.after(held);

    var places = {};
    root.querySelectorAll('.q-plain .q-item[id]').forEach(function (item) {
      places[item.id] = item;
      item.removeAttribute('id');
    });
    function named(hash) {
      try { return places[decodeURIComponent(String(hash).slice(1))] || null; } catch (error) { return null; }
    }

    /* The list offers a way to an item for whoever may act on it: that way is taken. Where it
       offers none, the list opens at the item, whose own line says why. The item no longer has
       the id the address names, so it is picked out by a class, until another place is named. */
    var lit = null;
    function go() {
      if (lit) { lit.classList.remove('landed'); lit = null; }
      var item = named(location.hash);
      if (!item) return;
      var way = item.querySelector('.q-item-go button');
      if (way) { way.click(); return; }
      if (!all) return;
      all.open = true;
      item.classList.add('landed');
      lit = item;
      item.scrollIntoView({ block: 'start' });
    }

    addEventListener('hashchange', go);
    /* the same link pressed again changes nothing in the address: it still goes there */
    document.addEventListener('click', function (event) {
      var link = event.target && event.target.closest ? event.target.closest('a[href^="#"]') : null;
      if (link && link.hash === location.hash && named(link.hash)) go();
    });
    go();
  }

  function start() {
    rows();
    queue();
  }

  /* the queue's script is listed before this one, so it has started by the time this runs */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
