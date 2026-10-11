// Counts and meters, worked out from the page itself so they can never drift from it.
// The page reads and filters without this file.
const order = ['built', 'first', 'named', 'ask', 'later', 'no', 'old'];
const names = {
  built: 'in the app today', first: 'built first', named: 'wanted, no order yet',
  ask: 'to decide', later: 'after launch', no: 'not in v1', old: 'from the old roadmap',
};

for (const group of document.querySelectorAll('.g')) {
  const items = [...group.querySelectorAll('li[data-s]')];
  const count = (s) => items.filter((item) => item.dataset.s === s).length;
  const share = (s) => `${(count(s) / items.length) * 100}%`;
  const meter = group.querySelector('.meter');
  // The line under the header: how much is in the app, then how much is built first.
  meter.style.setProperty('--b', share('built'));
  meter.style.setProperty('--f', share('first'));
  meter.setAttribute('role', 'img');
  meter.setAttribute('aria-label', order.filter(count).map((s) => `${count(s)} ${names[s]}`).join(', '));
  meter.title = meter.getAttribute('aria-label');
  group.querySelector('.tally').innerHTML = `${count('built')} of ${items.length}<i> in the app</i>`;
}

for (const out of document.querySelectorAll('[data-count]')) {
  const s = out.dataset.count;
  out.textContent = document.querySelectorAll(s === 'all' ? '.g li[data-s]' : `.g li[data-s="${s}"]`).length;
}

// Screens: the picked screen goes in the address, so a link can point at one. Esc closes it.
// Where the floor is wider than the window it scrolls sideways: it opens on the first path
// and follows the picked screen.
const picks = document.querySelectorAll('input.pick, input.pick-none');
if (picks.length) {
  const none = document.getElementById('sc-none');
  const floor = document.querySelector('.map-scroll');
  const sheet = document.querySelector('.side .sheet');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const bring = (pick, glide) => {
    const tag = floor.querySelector(`label.tag[for="${pick.id}"]`);
    if (!tag || floor.scrollWidth <= floor.clientWidth) return;
    floor.scrollTo({
      left: tag.offsetLeft - floor.clientWidth / 2,
      behavior: glide && !still.matches ? 'smooth' : 'auto',
    });
  };
  const fromAddress = () => {
    const pick = document.getElementById(`sc-${location.hash.slice(1)}`);
    if (pick) pick.checked = true;
    return pick;
  };
  const opened = fromAddress();
  bring(opened && opened !== none ? opened : document.getElementById('sc-files'));
  addEventListener('hashchange', () => {
    const pick = fromAddress();
    if (pick) bring(pick, true);
  });
  for (const pick of picks) {
    pick.addEventListener('change', () => {
      history.replaceState(null, '', pick === none ? location.pathname : `#${pick.id.slice(3)}`);
      sheet.scrollTop = 0;
      bring(pick, true);
    });
  }
  addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || none.checked) return;
    none.checked = true;
    none.dispatchEvent(new Event('change'));
  });
}
