// The Input page reads, opens and filters without this file.
// It does what the page cannot do alone: it keeps what is picked in the address (the level
// shown, and the sheet, line or question last opened), so a view can be sent as a link; it
// opens whatever the address names, in every browser; and when a sheet is hidden it goes back
// to the sheet's row in the chart and gives that row the focus, instead of leaving the reader,
// and the keyboard, further down the page.
(() => {
  // With no script a closed sheet that the address names keeps its name on the page, to be
  // opened by hand where a browser does not open it. Here this file opens it, so the name can
  // go: input.css takes it away while the page wears this word.
  document.documentElement.classList.add('scripted');

  const levels = [...document.querySelectorAll('input[name="show"]')];
  const put = (address) => { try { history.replaceState(null, '', address); } catch (error) { /* the page stands without it */ } };
  // what the address names, if it names anything on the page
  const named = () => {
    if (location.hash.length < 2) return null;
    try { return document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (error) { return null; }
  };
  // a sheet wears no name of its own: the address names what it holds
  const nameOf = (box) => box.id || (box.classList.contains('area') && box.querySelector(':scope > .sheet-in')?.id) || '';
  const inSight = (thing) => { const at = thing.getBoundingClientRect(); return at.top >= 0 && at.bottom <= innerHeight; };

  // the level shown: ?show=shaky
  const asked = new URLSearchParams(location.search).get('show');
  const level = levels.find((input) => input.id === `f-${asked}`);
  if (level) level.checked = true;
  for (const input of levels) {
    input.addEventListener('change', () => {
      const address = new URL(location.href);
      if (input.id === 'f-all') address.searchParams.delete('show');
      else address.searchParams.set('show', input.id.slice(2));
      put(address);
    });
  }

  // what the address names is opened, with everything it sits in
  let arriving = false;
  const reveal = () => {
    const target = named();
    if (!target) return;
    arriving = true;
    for (let box = target; box; box = box.parentElement) if (box.tagName === 'DETAILS') box.open = true;
    target.scrollIntoView({ block: 'start' });
    setTimeout(() => { arriving = false; }, 300);
  };
  reveal();
  addEventListener('hashchange', reveal);

  // opened by hand: the address names it. Closed again: it names nothing.
  document.addEventListener('toggle', (event) => {
    const box = event.target;
    const name = nameOf(box);
    if (arriving || !name) return;
    if (box.open) {
      // a browser that opens a box for what the address names says so here before it says the
      // address changed: the address is already right, and is left alone
      if (!box.contains(named())) put(`#${name}`);
      return;
    }
    const sheet = box.classList.contains('area');
    if (sheet && document.querySelector('.area[open]')) return;      // another sheet took its place
    if (box.contains(named())) put(location.pathname + location.search);
    if (!sheet) return;
    // A sheet hidden: what follows it has slid up in its place, and the name that had the focus
    // is gone. Back to the row it was opened from: the chart, or on a small screen the row
    // itself, comes back into sight, and the row takes the focus, so the next Tab goes on from there.
    const row = document.querySelector(`.chart .row[href="#${name}"]`);
    if (!row) return;
    if (!inSight(row)) document.getElementById('picture')?.scrollIntoView({ block: 'start' });
    if (!inSight(row)) row.scrollIntoView({ block: 'center' });
    const active = document.activeElement;
    if (!active || active === document.body || box.contains(active)) row.focus({ preventScroll: true });
  }, true);
})();
