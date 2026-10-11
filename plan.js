/* Plan works with no script: picks, roads and views are radio inputs read by :has().
   This makes it quicker and kinder, and changes nothing a reader sees at rest.
   - What is picked and tried is copied onto .app as classes, and the :has() rules for them are
     switched off. build-plan.py writes both sets from one template (the sheets plan-lights and
     plan-quick), so they say the same. A pick then costs one small pass, where :has() has the
     browser search the page once for every different thing the rules ask.
   - The keyboard's ring on the map, and round a Show label, is drawn by a class, and the rules
     that read the focus through :has() are taken out of this page's copy of its sheets. One such
     rule anywhere has the browser weigh every :has() rule again at each move of the focus.
     A road reached by the arrow keys gets its ring the same way, in the browser that draws none.
   - An address that names a stage picks it, and a picked stage is kept in the address.
   - Esc closes the pick and takes the keyboard back to the map.
   - A fork's heading under the map can be reached and pressed by the keyboard: it picks the fork
     and goes to its roads in the rail, and Esc comes back to the heading.
   - Where the map is wider than its box, it opens at Now and slides to whatever is picked.
   - The window goes to a picked mark that is out of sight, up or down, at any width: under the
     sheet that covers the foot of a narrow screen, or past either edge when the arrow keys walk
     the picks. A pick made in the lists under the map leaves the page where it is. With no
     script the reader scrolls to the mark: the picks are radios in the rail, and a browser brings
     a radio into view, not the mark that stands for it. */
(function () {
  var app = document.querySelector('.app');
  var none = document.getElementById('p-none');
  var box = document.getElementById('map');
  var wrap = (box && box.closest('.mapwrap')) || box;    /* the map and the key under it */
  var tries = document.getElementById('tries');
  var slow = document.getElementById('plan-lights');
  if (!app || !none || !box) return;
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  var narrow = window.matchMedia('(max-width: 820px)');
  var STATE = /^(?:m[ij]\d+|q\d+)$/;    /* a pick's two digits, a tried road: the classes the rules read */

  function mirror() {
    var want = {}, have = [];
    var on = document.querySelectorAll('input.pick:checked, input.opt:checked');
    for (var i = 0; i < on.length; i++) {
      on[i].classList.forEach(function (name) { if (STATE.test(name)) want[name] = true; });
    }
    app.classList.forEach(function (name) { if (STATE.test(name)) have.push(name); });
    have.forEach(function (name) { if (!want[name]) app.classList.remove(name); });
    Object.keys(want).forEach(function (name) { app.classList.add(name); });
  }

  /* where the keyboard is: on "nothing picked" (keys-none on .app), on a pick (keys-pick), on a
     Show label or on a road (keys, on the label or on the road's radio) */
  var shown = null, keys = false;    /* keys: the last thing pressed was a key that moves the focus */
  function ring() {
    var at = document.activeElement;
    /* one browser does not count an arrow key inside a group of radios as the keyboard: this does */
    var group = !!at && at.type === 'radio' && (at.name === 'pick' || /^o-/.test(at.name));
    var seen = !!at && !!at.matches && (at.matches(':focus-visible') || (keys && group));
    app.classList.toggle('keys-none', seen && at === none);
    app.classList.toggle('keys-pick', seen && at.name === 'pick' && at !== none);
    var mark = !seen ? null : at.name === 'show' ? at.closest('label') : /^o-/.test(at.name || '') ? at : null;
    if (shown && shown !== mark) shown.classList.remove('keys');
    if (mark) mark.classList.add('keys');
    shown = mark;
  }

  /* take out every selector that reads the focus through :has(); what each drew, ring() draws */
  function unwatch() {
    function walk(owner) {
      var list = owner.cssRules;
      for (var i = list.length - 1; i >= 0; i--) {
        var rule = list[i];
        if (!rule.selectorText) { if (rule.cssRules) walk(rule); continue; }
        if (!/:has\([^)]*:focus/.test(rule.selectorText)) continue;
        var keep = rule.selectorText.split(/,(?![^()]*\))/).filter(function (one) { return !/:has\([^)]*:focus/.test(one); });
        if (keep.length) rule.selectorText = keep.join(','); else owner.deleteRule(i);
      }
    }
    for (var n = 0; n < document.styleSheets.length; n++) {
      try { walk(document.styleSheets[n]); } catch (error) { /* a sheet from elsewhere is not ours to read */ }
    }
  }

  /* where the window ends for the map: at its foot, or at the top of the sheet laid over its foot */
  function foot() {
    var sheet = document.querySelector('.side .sheet');
    var over = narrow.matches && sheet && sheet.getClientRects().length && getComputedStyle(sheet).position === 'fixed';
    return over ? sheet.getBoundingClientRect().top : window.innerHeight;
  }

  /* the map slides sideways to a mark. With follow the window goes up or down to it too, by no
     more than it takes: 'keys' keeps the mark a little clear of the window's edges, since the next
     press of an arrow goes to its neighbour; 'hand' moves only for a mark that is cut off or
     covered, since a mark just pressed is already under the finger */
  function slide(marks, start, follow, by) {
    var mark = marks && marks[0];
    if (!mark || !mark.getClientRects().length) return;
    var at = mark.getBoundingClientRect(), frame = box.getBoundingClientRect();
    var how = start || calm.matches ? 'auto' : 'smooth';
    /* a fork's roads run to its right: leave them room */
    var room = mark.classList.contains('fh') ? frame.width / 3 : 8;
    var seen = at.left >= frame.left + 8 && at.right <= frame.right - room;
    if (box.contains(mark) && box.scrollWidth > box.clientWidth + 1 && !seen) {
      /* a third of the box before the mark, less where its name needs the room */
      var before = start ? 12 : Math.max(12, Math.min(frame.width / 3, frame.width - at.width - room));
      box.scrollTo({ left: box.scrollLeft + at.left - frame.left - before, behavior: how });
    }
    if (!follow) return;
    var low = foot(), air = Math.min(64, low / 6), edge = follow === 'keys' ? air : -4;    /* a hair cut off still counts as seen */
    /* up and down it goes by the mark that was pressed, or the first. A fork stands once for each
       place its roads leave a line: where one window holds all its diamonds, it goes by them all */
    var one = by && marks.indexOf(by) >= 0 ? by.getBoundingClientRect() : at;
    var top = one.top, bottom = one.bottom, first = top, last = bottom;
    for (var i = 0; i < marks.length; i++) {
      var each = marks[i].getBoundingClientRect();
      first = Math.min(first, each.top);
      last = Math.max(last, each.bottom);
    }
    if (last - first <= low - 2 * air) { top = first; bottom = last; }
    var move = top < edge ? top - air : bottom > low - edge ? bottom - low + air : 0;
    if (move) window.scrollTo({ top: window.scrollY + move, behavior: how });
  }

  /* the marks of a pick that are shown: on the map, or in the key, where a fork that no stage waits
     on stands. Not the entry of the same name further down the page */
  function marksOf(radio) {
    var all = wrap.querySelectorAll('.nm[for="' + radio.id + '"], .fh[for="' + radio.id + '"], .lf[for="' + radio.id + '"]');
    var shown = [];
    for (var i = 0; i < all.length; i++) if (all[i].getClientRects().length) shown.push(all[i]);
    return shown;
  }

  /* whether the window goes to a picked mark, and how (see slide). Always when the keyboard walks
     the picks: the mark is the only place on the page where that focus shows. For a pick made on
     the map or in the rail, while some of the map is in the window. Never for one made in the
     lists under the map: the reader would lose the place they were reading */
  function follows(radio, by) {
    if (keys && document.activeElement === radio) return 'keys';
    if (by && !wrap.contains(by) && !by.closest('.side')) return '';
    var frame = box.getBoundingClientRect();
    return frame.bottom > 48 && frame.top < foot() - 48 ? 'hand' : '';
  }

  function fromAddress() {
    var radio = /^#w-/.test(location.hash) && document.getElementById('p-' + location.hash.slice(1));
    if (radio && radio.name === 'pick') {
      radio.checked = true;
      mirror();
      slide(marksOf(radio));    /* up and down, the browser has gone to the stage the address names */
    }
  }

  /* the label a pick is made by, kept until its radio says it has changed */
  var via = null;
  document.addEventListener('click', function (event) {
    var label = event.target && event.target.closest ? event.target.closest('label[for]') : null;
    if (label) via = label;
  }, true);

  document.addEventListener('change', function (event) {
    var radio = event.target;
    if (!radio || radio.type !== 'radio') return;
    if (radio.name === 'pick' || /^o-/.test(radio.name)) mirror();
    if (radio.name !== 'pick') { ring(); return; }
    var by = via && via.htmlFor === radio.id ? via : null;
    via = null;
    var stage = /^p-w-/.test(radio.id) ? '#' + radio.id.slice(2) : '';
    history.replaceState(null, '', stage || location.pathname + location.search);
    ring();
    if (radio !== none) slide(marksOf(radio), false, follows(radio, by), by);
  });
  /* "Start over" puts every road back: the radios change after the event, and say nothing */
  if (tries) tries.addEventListener('reset', function () { setTimeout(mirror, 0); });

  document.addEventListener('keydown', function (event) { if (event.key === 'Tab' || /^Arrow/.test(event.key)) keys = true; }, true);
  document.addEventListener('pointerdown', function () { keys = false; }, true);
  document.addEventListener('focusin', ring);
  document.addEventListener('focusout', function () { setTimeout(ring, 0); });

  /* a fork's heading under the map is a label, which only a pointer can press: the keyboard gets it too */
  var came = null;
  Array.prototype.forEach.call(document.querySelectorAll('.fork h3 label[for]'), function (label) {
    label.tabIndex = 0;
    label.setAttribute('role', 'button');
  });
  document.addEventListener('keydown', function (event) {
    var label = event.target && event.target.closest ? event.target.closest('.fork h3 label[for]') : null;
    if (!label || (event.key !== 'Enter' && event.key !== ' ')) return;
    var radio = document.getElementById(label.htmlFor);
    var rest = document.getElementById('o-' + label.htmlFor.slice(2) + '-0');
    if (!radio) return;
    event.preventDefault();
    via = label;    /* picked from under the map: the page stays where it is */
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    came = label;
    if (rest) rest.focus();    /* its roads, in the rail: the arrow keys try them */
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || none.checked) return;
    var at = document.activeElement;
    var back = !!at && (at.name === 'pick' || !!(at.closest && at.closest('.sheet')));
    none.checked = true;
    none.dispatchEvent(new Event('change', { bubbles: true }));
    /* the pick it stood on, or the sheet it was in, is gone: back to where it came from, or to the map */
    if (back && came) came.focus(); else if (back) none.focus();
    came = null;
  });

  window.addEventListener('hashchange', fromAddress);
  /* a page brought back by the browser comes with its radios as they were left, and says nothing */
  window.addEventListener('pageshow', function () { mirror(); ring(); });
  slide([box.querySelector('.bh-now')], true);
  fromAddress();
  mirror();
  ring();
  if (slow && slow.sheet) slow.sheet.disabled = true;
  unwatch();
})();
