// The map reads and picks without this file.
// With it: the picked thing goes in the address by its name, so a link can point at one
// (and #list opens the list); Esc, Close, or a second click on what is picked, closes it and
// hands the keyboard back to the map; and where one island is shown at a time, what was
// just opened is brought into view.
// The two widths are the ones in the page's stylesheet.
const compact = matchMedia('(max-width: 1279px)');   // one island at a time
const folded = matchMedia('(max-width: 820px)');     // no rail: the words stand under the island
const none = document.getElementById('sc-none');
const map = document.getElementById('v-map');
const list = document.getElementById('v-list');
const closeup = document.querySelector('.closeup');
const picks = [...document.querySelectorAll('input.sc')];

const check = (input) => {
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

// Closing leaves nothing picked. Where one island is shown at a time, its island stays
// open. The keyboard goes to what is now checked: the next arrow key moves on from there.
const close = (pick) => {
  const next = compact.matches ? document.getElementById(`zo-${pick.dataset.area}`) : none;
  check(next);
  next.focus({ preventScroll: true });
};

// A link names a pick as a reader would, by data-at. An older link named it by the end of
// its input's id: those still land.
const fromAddress = () => {
  const name = location.hash.slice(1);
  if (name === 'list') list.checked = true;
  const pick = picks.find((input) => input.dataset.at === name) || picks.find((input) => input.id === `sc-${name}`);
  if (!pick) return;
  map.checked = true;
  pick.checked = true;
  if (compact.matches) closeup.scrollIntoView({ block: 'start' });
};

const toAddress = () => {
  const picked = picks.find((input) => input.checked);
  const name = list.checked ? 'list' : picked ? picked.dataset.at : '';
  history.replaceState(null, '', name ? `#${name}` : location.pathname + location.search);
};

fromAddress();
addEventListener('hashchange', fromAddress);
map.addEventListener('change', toAddress);
list.addEventListener('change', toAddress);

for (const pick of document.querySelectorAll('input[name="pick"]')) {
  pick.addEventListener('change', () => {
    toAddress();
    if (!compact.matches) return;
    const picked = pick.classList.contains('sc') ? pick.id.slice(3) : '';
    const opened = picked && folded.matches ? document.getElementById(`r-${picked}`) : closeup;
    opened.scrollIntoView({ block: 'nearest' });
  });
}

// Close is a button that clears the picks, so it works with this file missing. With it,
// closing goes the one way: the island stays open, the address follows.
document.getElementById('picks').addEventListener('reset', (event) => {
  event.preventDefault();
  const picked = picks.find((input) => input.checked);
  if (picked) close(picked);
});

addEventListener('keydown', (event) => {
  const picked = picks.find((input) => input.checked);
  if (event.key === 'Escape' && picked && map.checked) close(picked);
});

// Esc closes only with this file, so it is here that Close says so, to whoever cannot see it.
for (const button of document.querySelectorAll('.close')) button.setAttribute('aria-keyshortcuts', 'Escape');

addEventListener('click', (event) => {
  const label = event.target.closest?.('label[for^="sc-"]');
  const picked = label && label.htmlFor !== 'sc-none' && document.getElementById(label.htmlFor);
  if (!picked || !picked.checked) return;
  event.preventDefault();
  close(picked);
});
