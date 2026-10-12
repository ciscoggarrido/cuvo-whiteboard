/* The question queue: one question at a time, a click answers it, the next one arrives.

   Everything this file shows comes from the page: the questions, the people and the names of the
   parts are JSON inside the queue's element, and the address answers are sent to is an attribute
   on it. Nothing about any product, and no address, is written here.

     <section class="queue" data-queue data-webhook="" data-mention="" data-store="">
       <script type="application/json">{ "parts": [], "people": [], "questions": [] }</script>
       <div class="q-plain"> every question as a plain list, for a reader with no script </div>
     </section>

   data-webhook   where an answer is posted, in Discord's webhook format. Empty: answers stay on the device.
   data-mention   a user id to mention in each post, and the only one a post may ping.
   data-store     the name answers are kept under on the device. Empty: the page's own path.

   With no script the plain list is what a reader gets. Once this file has built the queue it marks
   the element data-live, and the plain list moves into the fold named "All questions". */
(() => {
  'use strict';

  // Every word the queue says. A page can replace any of them: "words" in its JSON.
  const WORDS = {
    heading: 'The next question',
    leftOne: '1 question left.',
    leftMany: '{n} questions left.',
    leftYoursOne: '1 question left for you.',
    leftYoursMany: '{n} questions left for you.',
    whoAsk: 'Who is answering?',
    whoHint: 'Asked once and kept on this device.',
    whoWaits: 'Your answer:',
    whoOther: 'Someone else',
    whoName: 'Your name',
    whoUse: 'Use this name',
    back: 'Back to the question',
    as: 'Answering as',
    only: 'Only {name} can answer this one.',
    notYours: 'Not sent. Only {name} can answer that one.',
    cofounder: 'the co-founder',
    noOptions: 'No suggested answers for this one.',
    suggests: 'Claude suggests this.',
    said: 'It rests on what {name} said.',
    fact: 'It rests on a fact.',
    judgement: "It is Claude's own judgement.",
    plan: 'The answer changes the plan.',
    unknown: "We don't know",
    custom: 'Custom answer',
    customLabel: 'Your answer',
    roomOne: '1 character left.',
    roomMany: '{n} characters left.',
    customSend: 'Use this answer',
    cancel: 'Cancel',
    note: 'Add a note',
    noteOff: 'Remove the note',
    noteLabel: 'Note',
    noteHint: 'It goes with the answer you pick.',
    skip: 'Skip for now',
    undo: 'Undo',
    sending: 'Sending',
    sent: 'Sent',
    kept: 'Kept on this device',
    failed: 'Not sent',
    asWho: '{word} as {who}',
    takenBack: 'Taken back',
    wentOne: 'Sent: 1 answer.',
    wentMany: 'Sent: {n} answers.',
    skipped: 'Skipped.',
    skippedBefore: 'You skipped this one earlier.',
    changing: 'Changing your answer.',
    keep: 'Keep it as it is',
    yours: 'Your answer now.',
    unsentOne: '1 answer is not sent yet.',
    unsentMany: '{n} answers are not sent yet.',
    retry: 'Try again',
    refused: 'Discord did not accept it.',
    toDiscord: "Answers go to the team's Discord.",
    toDevice: 'Answers are kept on this device only. Each can be copied afterwards, to pass it on.',
    noStore: 'This browser keeps nothing, so a reload forgets them.',
    endTitle: 'That is every question for now.',
    endNew: 'New ones will show up here.',
    endSkippedOne: 'You skipped 1. It is still open.',
    endSkippedMany: 'You skipped {n}. They are still open.',
    endTheirsOne: '1 is left for {name}.',
    endTheirsMany: '{n} are left for {name}.',
    again: 'Go through the skipped ones',
    done: 'Answered on this device',
    change: 'Change',
    takeBack: 'Take back',
    copy: 'Copy',
    copyAll: 'Copy the unsent answers',
    copied: 'Copied',
    notCopied: 'Could not copy',
    allOne: 'The 1 question',
    allMany: 'All {n} questions',
    goto: 'Go to this question',
    answered: 'Answered',
    keysOff: 'Turn off shortcuts',
    keysOn: 'Turn on shortcuts',
    postAnswered: '{who} answered:',
    postWrote: '{who} wrote:',
    postNone: '{who} took this answer back.',
    postNote: 'Note:',
    postWas: 'Changed from:',
  };

  const UNDO_FOR = 8000;          // how long the undo stays
  const TELL_FOR = 5000;          // how long a line that only reports stays
  const ARM = 350;                // a second click this soon after a card arrives is a double click, not an answer
  const RETRY = [3000, 10000, 30000, 60000];
  const LIMIT = 2000;             // the most Discord takes in one post
  const MOST = 1000;              // the most a written answer holds
  const still = matchMedia('(prefers-reduced-motion: reduce)');

  let serial = 0;
  const el = (tag, props, ...kids) => {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(props || {})) {
      if (value == null || value === false) continue;
      if (name === 'class') node.className = value;
      else if (name === 'text') node.textContent = value;
      else if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
      else if (name === 'hidden' || name === 'disabled') node[name] = true;
      else node.setAttribute(name, value === true ? '' : value);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false && kid !== '') node.append(kid);
    return node;
  };
  const one = (text, max) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  // a name goes into the line a script reads: nothing in it may open a mention or close the line's code marks
  const name = (text) => one(text, 40).replace(/[`<>@*_~|]/g, '').trim();

  function mount(root) {
    let given;
    try { given = JSON.parse(root.querySelector('script[type="application/json"]').textContent); } catch (error) { return; }
    const cfg = Array.isArray(given) ? { questions: given } : (given || {});
    const T = { ...WORDS, ...(cfg.words || {}) };
    const say = (key, vars = {}) => String(T[key] ?? '').replace(/\{(\w+)\}/g, (all, word) => vars[word] ?? '');
    const many = (n, key, vars = {}) => say(`${key}${n === 1 ? 'One' : 'Many'}`, { n, ...vars });

    const questions = (cfg.questions || [])
      .filter((q) => q && q.id && q.ask)
      .map((q, i) => ({
        id: String(q.id), ask: String(q.ask), why: q.why ? String(q.why) : '',
        who: q.who === 'cofounder' ? 'cofounder' : 'founders',
        tier: Number(q.tier) || 99, rank: Number.isFinite(Number(q.rank)) ? Number(q.rank) : 1e9, plan: q.plan === true, i,
        options: (Array.isArray(q.options) ? q.options : []).filter((o) => o && o.key != null && o.text)
          .map((o) => ({ key: String(o.key), text: String(o.text), effect: o.effect ? String(o.effect) : '' })),
        pick: q.pick != null ? String(q.pick) : null, because: q.because ? String(q.because) : '',
        basis: q.basis ? String(q.basis) : '', by: q.by ? String(q.by) : '',
      }))
      .sort((a, b) => (a.tier - b.tier) || (a.rank - b.rank) || (a.i - b.i));
    if (!questions.length) return;
    for (const q of questions) if (!q.options.some((o) => o.key === q.pick)) q.pick = null;
    const byId = Object.fromEntries(questions.map((q) => [q.id, q]));
    const parts = Array.isArray(cfg.parts) ? cfg.parts.map(String) : [];
    const people = (Array.isArray(cfg.people) ? cfg.people : [])
      .map((p) => (typeof p === 'string' ? { name: p, role: 'team' } : { name: String(p.name ?? ''), role: String(p.role ?? 'team') }))
      .filter((p) => p.name);
    const cofounder = people.find((p) => p.role === 'cofounder');
    const theirs = cofounder ? cofounder.name : say('cofounder');

    let hook = (root.dataset.webhook || '').trim();
    try { if (!/^https?:$/.test(new URL(hook).protocol)) hook = ''; } catch (error) { hook = ''; }    // no address, or not one: answers stay here
    const mention = /^\d{5,25}$/.test((root.dataset.mention || '').trim()) ? root.dataset.mention.trim() : '';
    const storeName = `queue:${root.dataset.store || location.pathname}`;

    // ---------- what is kept on the device ----------
    // answers[id] = { key, text, label, note, who, at, was, msg, sent, state, tries, hard, gone, blind, open, stray }
    //   key    an option's key, "custom" or "unknown"
    //   msg    the post's id once the address has taken it; sent is the text it holds now
    //   state  sending | sent | failed | kept (no address: it stays here)
    //   gone   taken back; the record goes once the post is deleted
    //   blind  the address took the post and its reply named no post: it cannot be changed or deleted
    //   open   a post was started and never heard of again (the page was reloaded, or no reply came)
    //   stray  ... and it was posted once more since: the channel may hold a post this device cannot reach
    // drafts[id] = { text, note }: what was typed on a question and not sent yet
    // named: the name was picked or changed, and no answer has gone under it yet
    let storeWorks = true;
    const read = () => {
      try { const raw = localStorage.getItem(storeName); return raw ? JSON.parse(raw) : null; } catch (error) { storeWorks = false; return null; }
    };
    const blank = () => ({ v: 1, who: '', named: false, answers: {}, drafts: {}, skipped: [], keys: true });
    const sound = (kept) => {
      const all = { ...blank(), ...(kept && typeof kept === 'object' ? kept : {}) };
      if (!all.answers || typeof all.answers !== 'object') all.answers = {};
      if (!all.drafts || typeof all.drafts !== 'object') all.drafts = {};
      if (!Array.isArray(all.skipped)) all.skipped = [];
      all.who = name(all.who);
      for (const id of Object.keys(all.drafts)) if (!byId[id] || !all.drafts[id] || typeof all.drafts[id] !== 'object') delete all.drafts[id];
      return all;
    };
    let state = sound(read());
    // an answer the address holds, to a question the page no longer asks: nothing is left to do with it
    for (const [id, a] of Object.entries(state.answers)) if (!byId[id] && a && a.state === 'sent') delete state.answers[id];
    state.skipped = state.skipped.filter((id) => byId[id]);
    try { localStorage.setItem(`${storeName}:probe`, '1'); localStorage.removeItem(`${storeName}:probe`); } catch (error) { storeWorks = false; }
    const save = () => { try { localStorage.setItem(storeName, JSON.stringify(state)); } catch (error) { storeWorks = false; } };

    const roleOf = (who) => (people.find((p) => p.name.toLowerCase() === String(who).toLowerCase()) || { role: 'other' }).role;
    const isLive = (id) => !!state.answers[id] && !state.answers[id].gone;
    // the co-founder's question, and the person here is not him, or has not said who they are
    const isTheirs = (q) => q.who === 'cofounder' && roleOf(state.who) !== 'cofounder';
    const canAnswer = (q) => !isTheirs(q) || !state.who;
    const labelOf = (q, a) => (a.key === 'custom' ? a.text : a.key === 'unknown' ? say('unknown') : (q.options.find((o) => o.key === a.key) || { text: a.label }).text);
    // an answer as the lines above the question name it: an option's own words, or the start of what was written
    const labelFor = (q, given) => (given.key === 'custom' ? one(given.text, 200) : given.key === 'unknown' ? say('unknown') : q.options.find((o) => o.key === given.key).text);
    const openOnes = () => questions.filter((q) => !isLive(q.id));
    const left = () => openOnes().filter(canAnswer);            // what is open for the person here
    // how many are left, in words. Once the person here is named and some of what is open is not
    // theirs to answer, the count is theirs alone, and the words say so: it then drops by more than one.
    const leftSaid = (n) => many(n, state.who && openOnes().some((q) => !canAnswer(q)) ? 'leftYours' : 'left');
    const stateOf = (a) => (!hook && a.state !== 'sent' ? 'kept' : a.state);
    const unsent = () => Object.entries(state.answers).filter(([id, a]) => byId[id] && !a.gone && hook && (a.state === 'failed' || a.state === 'kept'));
    // the channel may hold a post for this answer that this device cannot change or delete
    const loose = (a) => !!(a.open || a.stray || a.blind);

    // what was typed on a question and not sent yet: kept as it is typed, so a stray tap or a reload loses nothing
    function draft(id, field, value) {
      const kept = state.drafts[id] || (state.drafts[id] = {});
      if (value && value.trim()) kept[field] = value; else delete kept[field];
      if (!kept.text && !kept.note) delete state.drafts[id];
      save();
    }

    // ---------- the post ----------
    // Lines a person reads, then one a script reads: answer <question id> <option key | custom | unknown | none> <who>
    // ("none": the person took the answer back, and a post may stand that could not be deleted.)
    // A post holds LIMIT characters at most. What is too long is cut and ends in "…": a very long
    // question or option, and a custom answer of many lines. The line a script reads is never cut.
    // Words are posted as words: a star, an underscore or a backtick in them is escaped, so Discord
    // sets nothing in bold and hides nothing. A cut never falls between a backslash and what it escapes.
    // (an address is left as it is: Discord sets nothing inside a link, and a backslash would break it)
    const md = (text) => String(text).split(/(https?:\/\/\S+)/).map((part, i) => (i % 2 ? part : part.replace(/[\\*_~|`]/g, '\\$&'))).join('');
    const whole = (text) => text.replace(/\\+$/, (run) => run.slice(run.length % 2));
    const cut = (text, max) => { const flat = md(one(text, max + 1)); return flat.length > max ? `${whole(flat.slice(0, max - 1))}…` : flat; };
    // plain: the words alone, for a reader to copy and pass on. The line a script reads, and the
    // mention, go only in a post.
    function post(q, a, plain) {
      const head = [`**${cut(q.ask, 300)}**`];
      const line = plain ? '' : `${mention ? `<@${mention}> ` : ''}\`answer ${q.id} ${a.key} ${a.who}\``;
      if (a.key === 'none') return [...head, say('postNone', { who: a.who }), line].filter(Boolean).join('\n');
      const tail = [];
      if (a.note) tail.push(`${say('postNote')} ${cut(a.note, 280)}`);
      if (a.was) tail.push(`${say('postWas')} ${cut(a.was, 260)}`);
      if (line) tail.push(line);
      if (a.key !== 'custom') return [...head, `${say('postAnswered', { who: a.who })} **${cut(a.label, 300)}**`, ...tail].join('\n');
      // a custom answer is quoted line by line; a line that would start a heading, a list or a quote of its own does not
      head.push(say('postWrote', { who: a.who }));
      let room = LIMIT - [...head, ...tail].join('\n').length;
      const lines = a.text.split(/\n+/).map((text) => text.trim()).filter(Boolean);
      const quoted = [];
      for (let i = 0; i < lines.length; i += 1) {
        const next = `> ${md(lines[i]).replace(/^[#>-]/, '\\$&')}`;
        // every line but the last leaves room for the mark that says the rest was cut
        if (next.length + 1 <= room - (i < lines.length - 1 ? 4 : 0)) { quoted.push(next); room -= next.length + 1; continue; }
        if (room >= 4) quoted.push(`${whole(next.slice(0, room - 2))}…`);
        break;
      }
      return [...head, ...quoted, ...tail].join('\n');
    }

    function trouble(kind, status) { const error = new Error(kind); error.kind = kind; error.status = status; return error; }
    async function send(method, message, text) {
      const url = new URL(hook);
      if (message) url.pathname = `${url.pathname.replace(/\/+$/, '')}/messages/${message}`;
      else url.searchParams.set('wait', 'true');              // so the reply carries the post's id
      // nothing of the person's goes along but the answer: no cookie, and not the page's address
      const init = { method, keepalive: true, credentials: 'omit', referrerPolicy: 'no-referrer' };
      if (text != null) {
        init.headers = { 'Content-Type': 'application/json' };
        // flags 4: a link in an answer is shown as a link, with no preview under the post
        init.body = JSON.stringify({ content: text, flags: 4, allowed_mentions: { parse: [], users: mention ? [mention] : [] } });
      }
      for (let attempt = 0; ; attempt += 1) {
        const stop = new AbortController();
        const timer = setTimeout(() => stop.abort(), 15000);
        let res;
        // no reply in time: the address may have taken it all the same. No way through at all: it did not.
        try { res = await fetch(url, { ...init, signal: stop.signal }); } catch (error) { throw trouble(stop.signal.aborted ? 'slow' : 'offline'); } finally { clearTimeout(timer); }
        if (res.status === 429 && attempt < 3) {
          let wait = 1;
          try { wait = Number((await res.json()).retry_after) || 1; } catch (error) { /* a second is a fair guess */ }
          await new Promise((go) => setTimeout(go, Math.min(wait, 10) * 1000 + 50));
          continue;
        }
        if (res.status === 404 && message) return { missing: true };
        if (!res.ok) throw trouble(res.status >= 500 || res.status === 429 ? 'busy' : 'refused', res.status);
        if (method === 'DELETE') return {};
        try { return await res.json(); } catch (error) { return {}; }
      }
    }

    // One answer is brought in line with what is wanted now, one call at a time. Whatever changed
    // while a call was in the air (an undo, a correction) is seen on the next turn of the loop.
    const busy = new Set();
    const timers = {};
    let went = 0;                 // answers the line above the question called "not sent yet" that have gone since
    // The page on its way out (a reload, a link) cuts short whatever call is in the air. That is not a
    // failure, and it says nothing about the post: it stays "on its way" for the page that opens next.
    let leaving = false;
    addEventListener('pagehide', () => { leaving = true; });
    addEventListener('pageshow', () => { leaving = false; });
    async function sync(id) {
      if (!hook || busy.has(id)) return;
      busy.add(id);
      clearTimeout(timers[id]);
      const first = state.answers[id];
      const waited = !!first && !first.gone && (first.state === 'failed' || first.state === 'kept');
      let posting = false;
      try {
        for (;;) {
          const a = state.answers[id];
          const q = byId[id];
          if (!a || !q) break;
          // Taken back: the post is deleted. When the channel may hold a post this device cannot reach,
          // deleting is not enough: the answer is taken back in words, and whoever reads the channel takes that as the last word.
          const inWords = a.gone && loose(a);
          const want = !a.gone ? post(q, a) : inWords ? post(q, { ...a, key: 'none' }) : null;
          if (a.gone && (want === null ? !a.msg : a.sent === want)) { delete state.answers[id]; break; }
          if (!a.gone && a.sent === want && (a.msg || a.blind)) { a.state = 'sent'; a.tries = 0; a.hard = false; break; }
          a.state = 'sending';
          if (want === null) {
            await send('DELETE', a.msg);
            a.msg = ''; a.sent = '';
            // an undo of this take back has no post to put the answer back into
            if (undo && undo.kind === 'back' && undo.id === id) { undo.before.msg = ''; undo.before.sent = ''; }
            continue;
          }
          if (a.msg) {
            const res = await send('PATCH', a.msg, want);
            if (res.missing) { a.msg = ''; a.sent = ''; continue; }       // the post is gone from the channel: say it again
            a.sent = want;
            if (inWords && a.gone) { delete state.answers[id]; break; }     // said: nothing is left to do (an undo in the meantime goes round again)
            continue;
          }
          if (a.open || a.blind) a.stray = true;                            // a post went before this one, and this device cannot reach it
          a.open = true;
          posting = true;
          save();                                                           // kept before the post leaves: a reload must know one was on its way
          const res = await send('POST', null, want);
          posting = false;
          a.open = false;
          a.msg = res.id ? String(res.id) : '';
          a.blind = !a.msg;                                                 // taken, but the reply named no post
          a.sent = want;
          if (inWords && a.gone) { delete state.answers[id]; break; }
          save();
        }
      } catch (error) {
        const a = state.answers[id];
        if (a && !leaving) {
          if (posting && error.kind !== 'slow') a.open = false;             // the address said no, or could not be reached: nothing was posted
          a.state = 'failed';
          a.tries = (a.tries || 0) + 1;
          a.hard = error.kind === 'refused';
          if (a.tries === 1 && !a.gone) announce(`${say('failed')}: ${a.label}`);      // said once, not at every try
          if (!a.hard) timers[id] = setTimeout(() => sync(id), RETRY[Math.min(a.tries - 1, RETRY.length - 1)]);
        }
      } finally {
        busy.delete(id);
        save();
        const now = state.answers[id];
        if (waited && now && !now.gone && now.state === 'sent') went += 1;
        if (went && !unsent().length) {
          // the line that said "not sent yet" does not just fall silent: it says they went (unless the undo beside this very answer says so already)
          const shown = undo && undo.kind === 'answer' && undo.id === id && went === 1;
          const n = went;
          went = 0;
          if (!shown) tell(many(n, 'went'));
        }
        paintSaid();
        paintWhere();
        paintDone();
        paintAll();
      }
    }
    // kept: said while there was no address. It is sent when the person asks, not behind their back.
    const syncAll = (also) => {
      for (const [id, a] of Object.entries(state.answers)) {
        if (!byId[id]) continue;
        if (a.gone || a.state === 'sending' || (a.state === 'failed' && (!a.hard || also)) || (a.state === 'kept' && also)) sync(id);
      }
    };

    // ---------- the frame the queue draws itself in ----------
    const said = el('div', { class: 'q-said' });            // what just happened, with its undo: a line of its own, always there
    const where = el('p', { class: 'q-where' });            // which part you are in, and how many are left
    const card = el('article', { class: 'q-card' });
    const doneList = el('ul');
    const doneCount = el('span', { class: 'q-n' });
    const doneFoot = el('p', { class: 'q-done-foot' });
    const done = el('details', { class: 'q-fold q-done', hidden: true }, el('summary', null, say('done'), doneCount), doneList, doneFoot);
    const plain = root.querySelector('.q-plain');
    const all = el('details', { class: 'q-fold q-all', hidden: !plain }, el('summary', null, many(questions.length, 'all')));
    const keysLine = el('p', { class: 'q-keys' });
    const voice = el('p', { class: 'q-vh', role: 'status', 'aria-live': 'polite' });
    const live = el('div', { class: 'q-live' }, el('h2', { class: 'q-vh', text: say('heading') }), said, where, card, done, all, keysLine, voice);

    let current = null;           // the question on the card
    let changing = false;         // the card shows a question already answered
    let again = false;            // the card shows a question skipped before
    let pending = null;           // an answer clicked before anyone said who is answering
    let undo = null;              // { kind: 'answer' | 'skip' | 'back', id, before, as, timer }
    let told = null;              // { text, timer }: a line that only reports, for a few seconds
    let armedAt = 0;
    let ui = {};                  // the card's own parts, rebuilt with each card
    const passed = new Set();     // skipped a second time since the page opened
    const announce = (text) => { voice.textContent = ''; setTimeout(() => { voice.textContent = text; }, 30); };
    const key = (letter) => el('kbd', { class: 'q-key', 'aria-hidden': 'true', text: letter });
    const link = (label, onclick, extra) => el('button', { type: 'button', class: 'q-link', onclick, ...extra }, label);

    // The queue's order, for the person here: a question that is someone else's to answer is passed over.
    function next() {
      const open = left();
      const fresh = open.find((q) => !state.skipped.includes(q.id));
      if (fresh) return [fresh.id, false];
      const back = state.skipped.map((id) => byId[id]).find((q) => q && !isLive(q.id) && canAnswer(q) && !passed.has(q.id));
      return back ? [back.id, true] : [null, false];
    }
    // the line that says what happened, and the question under it, are brought into sight and take the focus
    function attend() {
      armedAt = performance.now() + ARM;
      const top = said.getBoundingClientRect().top;
      if (top < 0 || top > innerHeight * 0.5) said.scrollIntoView({ block: 'start', behavior: still.matches ? 'auto' : 'smooth' });
      (ui.ask || card).focus({ preventScroll: true });
    }
    // from: 'next' when the queue moves on, 'back' when a question returns (an undo). The card arrives from that side.
    function show(id, { focus = false, change = false, skippedBefore = false, from = 'next' } = {}) {
      pending = null;               // an answer that waited for a name was to the question that leaves: it goes with it
      current = id;
      changing = change;
      again = skippedBefore;
      paintCard(from);
      paintWhere();
      paintSaid();
      if (focus) attend();
    }
    const advance = (focus = true, from = 'next') => { const [id, skippedBefore] = next(); show(id, { focus, skippedBefore, from }); };

    // ---------- what just happened: the answer that went, with its undo; or the answers still waiting to go ----------
    function setUndo(entry) {
      if (undo) clearTimeout(undo.timer);
      undo = entry;
      if (undo) undo.timer = setTimeout(() => setUndo(null), UNDO_FOR);
      paintSaid();
    }
    // a line that only reports: it stays a few seconds, under whatever has an undo or still waits
    function tell(text) {
      if (told) clearTimeout(told.timer);
      told = text ? { text, timer: setTimeout(() => tell(''), TELL_FOR) } : null;
      paintSaid();
      if (text) announce(text);
    }
    let saidWhat = '';            // what the line says now: it fades in when it says something new, not each time it is redrawn
    function paintSaid() {
      const waiting = unsent();
      const had = said.contains(document.activeElement);
      const what = undo ? `${undo.kind} ${undo.id}` : waiting.length ? 'waiting' : told ? `told ${told.text}` : '';
      said.classList.toggle('q-new', !!what && what !== saidWhat);
      saidWhat = what;
      if (undo) {
        const a = undo.kind === 'back' ? undo.before : state.answers[undo.id];
        // the first answer under a name says whose it is: a wrong name is seen while the undo is still there
        const how = a ? say({ sent: 'sent', failed: 'failed', kept: 'kept' }[stateOf(a)] || 'sending') : '';
        const word = undo.kind === 'skip' ? say('skipped') : undo.kind === 'back' ? `${say('takenBack')}:`
          : a ? `${undo.as ? say('asWho', { word: how, who: undo.as }) : how}:` : '';
        const button = el('button', { type: 'button', class: 'q-link q-undo', 'aria-keyshortcuts': 'Z', onclick: takeUndo }, say('undo'), key('Z'));
        // the undo does not run out under a pointer or a focus that is on it
        for (const on of ['mouseenter', 'focus']) button.addEventListener(on, () => clearTimeout(undo && undo.timer));
        for (const off of ['mouseleave', 'blur']) button.addEventListener(off, () => { if (undo) { clearTimeout(undo.timer); undo.timer = setTimeout(() => setUndo(null), UNDO_FOR / 2); } });
        said.replaceChildren(el('span', { class: 'q-said-t' }, el('b', { text: word }), undo.kind !== 'skip' && a ? ` ${a.label}` : ''), button);
        if (had) button.focus({ preventScroll: true });
      } else if (waiting.length) {
        const retry = link(say('retry'), () => syncAll(true));
        said.replaceChildren(el('span', { class: 'q-said-t' }, el('b', { text: many(waiting.length, 'unsent') }),
          waiting.some(([, a]) => a.hard) ? ` ${say('refused')}` : ''), retry);
        if (had) retry.focus({ preventScroll: true });
      } else {
        if (told) said.replaceChildren(el('span', { class: 'q-said-t' }, el('b', { text: told.text }))); else said.replaceChildren();
        if (had) (ui.ask || card).focus({ preventScroll: true });
      }
    }

    // ---------- where you are: the part, and how many are left ----------
    function paintWhere() {
      const q = byId[current];
      const open = left().length;
      const part = q ? (parts[q.tier - 1] || '') : '';
      where.replaceChildren(part ? el('b', { text: `${part}.` }) : '', part && open ? ' ' : '', open ? leftSaid(open) : '');
      where.hidden = !q || (!part && !open);          // at the end the card itself says what is left
    }

    // ---------- the card ----------
    function arrive(from) {
      card.classList.remove('q-in');
      card.dataset.from = from;
      if (!still.matches) { void card.offsetWidth; card.classList.add('q-in'); }
    }
    function whoBox() {
      const id = `q-name-${serial += 1}`;
      ui.name = el('input', { class: 'q-text', id, type: 'text', maxlength: '40', autocomplete: 'name' });
      const useName = el('button', { type: 'submit', class: 'q-go', disabled: true }, say('whoUse'));
      ui.name.addEventListener('input', () => { useName.disabled = !name(ui.name.value); });
      ui.other = el('form', { class: 'q-field', hidden: true, onsubmit: (event) => { event.preventDefault(); if (name(ui.name.value)) setWho(name(ui.name.value)); } },
        el('label', { for: id, text: say('whoName') }), ui.name, el('div', { class: 'q-row' }, useName));
      ui.waits = el('p', { class: 'q-waits', hidden: true });          // the answer that waits for a name: it stays in sight while one is picked
      return el('div', { class: 'q-whose', hidden: true },
        ui.waits,
        el('p', { class: 'q-whose-h', text: say('whoAsk') }),
        el('p', { class: 'q-hint', text: say('whoHint') }),
        el('div', { class: 'q-people' },
          people.map((p) => el('button', { type: 'button', class: 'q-fix', 'aria-pressed': String(state.who === p.name), onclick: () => setWho(p.name) }, p.name)),
          el('button', { type: 'button', class: 'q-fix', 'aria-expanded': 'false', onclick: (event) => { ui.other.hidden = false; event.currentTarget.setAttribute('aria-expanded', 'true'); ui.name.focus(); } }, say('whoOther'))),
        ui.other,
        el('div', { class: 'q-more' }, link(say('back'), () => closeWho())));
    }

    function paintCard(from) {
      const q = byId[current];
      ui = {};
      if (!q) { paintEnd(); arrive(from); return; }
      const mine = changing && isLive(q.id) ? state.answers[q.id] : null;
      const able = canAnswer(q);
      const ids = { ask: `q-ask-${serial += 1}`, only: `q-only-${serial}`, text: `q-text-${serial}`, note: `q-note-${serial}`, room: `q-room-${serial}` };

      const flag = mine ? el('p', { class: 'q-flag' }, say('changing'), ' ', link(say('keep'), () => advance()))
        : again ? el('p', { class: 'q-flag', text: say('skippedBefore') }) : null;
      ui.ask = el('h3', { class: 'q-ask', id: ids.ask, tabindex: '-1', text: q.ask });
      const why = (q.why || q.plan) && el('p', { class: 'q-why' }, q.why, q.why && q.plan ? ' ' : '', q.plan ? say('plan') : '');
      // whose it is, said to everyone but him: also before anyone has said who they are
      const only = isTheirs(q) && el('p', { class: 'q-only', id: ids.only, text: say('only', { name: theirs }) });
      const cannot = able ? {} : { 'aria-disabled': 'true', 'aria-describedby': ids.only };

      // what Claude's suggestion rests on: someone's words, a fact, or its own judgement. Said only when the page says which.
      const rests = q.basis === 'judgement' ? say('judgement') : q.basis === 'fact' ? say('fact') : q.basis === 'said' && q.by ? say('said', { name: q.by }) : '';
      const options = q.options.map((o, i) => {
        const picked = q.pick === o.key;
        const yours = !!mine && mine.key === o.key;
        return el('li', null, el('button', {
          type: 'button', class: `q-opt${picked ? ' q-picked' : ''}${yours ? ' q-yours' : ''}`, 'data-key': o.key,
          'aria-keyshortcuts': String(i + 1), ...cannot, onclick: () => choose({ key: o.key }),
        },
          el('span', { class: 'q-opt-t', text: o.text }), key(String(i + 1)),
          o.effect && el('span', { class: 'q-opt-e', text: o.effect }),
          yours && el('span', { class: 'q-opt-y', text: say('yours') }),
          picked && el('span', { class: 'q-sug' }, el('b', { text: say('suggests') }), q.because ? ` ${q.because}` : '',
            rests && el('span', { class: 'q-basis', text: rests }))));
      });
      // a card with no answers to press says so. One with answers and no suggestion says nothing: there is nothing to say
      const lead = able && !q.options.length ? el('p', { class: 'q-lead', text: say('noOptions') }) : null;

      const fixed = (word, was) => el('span', null, say(word), !!mine && mine.key === was && el('span', { class: 'q-opt-y', text: say('yours') }));
      ui.unknown = el('button', { type: 'button', class: `q-fix${mine && mine.key === 'unknown' ? ' q-yours' : ''}`, 'aria-keyshortcuts': 'U', ...cannot, onclick: () => choose({ key: 'unknown' }) }, fixed('unknown', 'unknown'), key('U'));
      ui.custom = el('button', { type: 'button', class: `q-fix${mine && mine.key === 'custom' ? ' q-yours' : ''}`, 'aria-keyshortcuts': 'C', 'aria-expanded': 'false', ...cannot, onclick: () => (ui.field.hidden ? openCustom() : closeCustom()) }, fixed('custom', 'custom'), key('C'));

      // a custom answer: its field, then the note if there is one, then the button that takes both
      ui.text = el('textarea', { class: 'q-text', id: ids.text, rows: '3', maxlength: String(MOST), 'aria-describedby': ids.room });
      ui.room = el('p', { class: 'q-hint', id: ids.room, hidden: true });           // how much more the field holds, said when it is nearly full
      ui.field = el('div', { class: 'q-field', hidden: true }, el('label', { for: ids.text, text: say('customLabel') }), ui.text, ui.room);
      ui.go = el('button', { type: 'submit', class: 'q-go', disabled: true }, say('customSend'));
      ui.acts = el('div', { class: 'q-row', hidden: true }, ui.go, link(say('cancel'), () => closeCustom()));
      const typed = () => {
        const room = MOST - ui.text.value.length;
        ui.go.disabled = !ui.text.value.trim();
        ui.room.hidden = room > 100;
        ui.room.textContent = many(Math.max(room, 0), 'room');
      };
      // what is typed is kept as it is typed: the question brings it back after a stray tap, an undo or a reload
      ui.text.addEventListener('input', () => { typed(); draft(q.id, 'text', ui.text.value); });
      ui.text.addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); ui.answers.requestSubmit(); } });

      ui.note = el('input', { class: 'q-text q-note', id: ids.note, type: 'text', maxlength: '280', autocomplete: 'off' });
      ui.note.addEventListener('input', () => draft(q.id, 'note', ui.note.value));
      ui.noteWrap = el('div', { class: 'q-field', hidden: true }, el('label', { for: ids.note, text: say('noteLabel') }), ui.note, el('p', { class: 'q-hint', text: say('noteHint') }));
      ui.noteBtn = link(say('note'), () => toggleNote(), { 'aria-expanded': 'false' });
      // (A guard. The queue passes over a question that is not this person's, and no link leads to one.
      // Should one reach the card all the same, its answers are off and skip stands where they would.)
      ui.skip = el('button', { type: 'button', class: able ? 'q-link' : 'q-fix', 'aria-keyshortcuts': 'S', onclick: () => skip() }, say('skip'), key('S'));
      // the fields open with what was typed here and not sent; failing that, with the answer being changed
      const kept = state.drafts[q.id] || {};
      const text = kept.text || (mine && mine.key === 'custom' ? mine.text : '');
      const note = kept.note || (mine && mine.note) || '';
      if (able && text) { ui.text.value = text.slice(0, MOST); typed(); ui.field.hidden = false; ui.acts.hidden = false; ui.custom.setAttribute('aria-expanded', 'true'); }
      if (able && note) { ui.note.value = note.slice(0, 280); ui.noteWrap.hidden = false; ui.noteBtn.setAttribute('aria-expanded', 'true'); ui.noteBtn.firstChild.textContent = say('noteOff'); }

      ui.whose = whoBox();          // who is answering: asked once, in the place of the answers
      ui.foot = el('p', { class: 'q-foot' });
      // one form, so the field, the note and their button are one thing; an option is a plain button and sends nothing by itself
      ui.answers = el('form', { class: 'q-answers', novalidate: true, onsubmit: (event) => { event.preventDefault(); const text = ui.text.value.trim(); if (!ui.field.hidden && text) choose({ key: 'custom', text }); } },
        lead, options.length ? el('ol', { class: 'q-opts' }, options) : null,
        able ? el('div', { class: 'q-pair' }, ui.unknown, ui.custom) : !mine && el('div', { class: 'q-pair' }, ui.skip),
        able && ui.field, able && ui.noteWrap, able && ui.acts,
        able && el('div', { class: 'q-more' }, ui.noteBtn, mine ? null : ui.skip));

      card.classList.remove('q-end');
      card.classList.toggle('q-lone', !able && !options.length);
      card.setAttribute('aria-labelledby', ids.ask);
      card.replaceChildren(
        el('div', { class: 'q-asking' }, flag, ui.ask, why, only),
        el('div', { class: 'q-side' }, ui.answers, ui.whose, ui.foot));
      paintFoot();
      arrive(from);
    }

    function paintFoot() {
      if (!ui.foot) return;
      const who = state.who
        ? [`${say('as')} `, link(state.who, () => openWho(), { class: 'q-link q-ref' }), '. ']
        : [link(say('whoAsk'), () => openWho(), { class: 'q-link q-ref' }), ' '];
      ui.foot.replaceChildren(...who, hook ? say('toDiscord') : say('toDevice'), !hook && !storeWorks ? ` ${say('noStore')}` : '');
    }

    // nothing left to show: what is still open, and whose it is
    function paintEnd() {
      const open = openOnes();
      const skippedOpen = open.filter((q) => state.skipped.includes(q.id) && canAnswer(q)).length;
      const notMine = open.filter((q) => !canAnswer(q)).length;
      const id = `q-ask-${serial += 1}`;
      ui.ask = el('h3', { class: 'q-ask', id, tabindex: '-1', text: say('endTitle') });
      ui.foot = el('p', { class: 'q-foot' });
      ui.whose = whoBox();
      ui.answers = el('div', { class: 'q-answers' },
        skippedOpen ? el('div', { class: 'q-pair' }, el('button', { type: 'button', class: 'q-fix', onclick: () => { passed.clear(); advance(); } }, say('again'))) : null);
      card.classList.add('q-end', 'q-lone');
      card.setAttribute('aria-labelledby', id);
      card.replaceChildren(
        el('div', { class: 'q-asking' }, ui.ask,
          el('p', { class: 'q-why' },
            !open.length ? say('endNew') : '',
            skippedOpen ? many(skippedOpen, 'endSkipped') : '',
            skippedOpen && notMine ? ' ' : '',
            notMine ? many(notMine, 'endTheirs', { name: theirs }) : '')),
        el('div', { class: 'q-side' }, ui.answers, ui.whose, ui.foot));
      paintFoot();
    }

    // ---------- what a person can do ----------
    function choose(given) {
      const q = byId[current];
      if (!q || performance.now() < armedAt) return;
      if (!state.who) { pending = given; openWho(); return; }
      if (!canAnswer(q)) { announce(say('only', { name: theirs })); return; }
      const before = isLive(q.id) ? { ...state.answers[q.id] } : null;
      if (before && before.who !== state.who) return;                  // an answer is its giver's: nobody else changes it
      const answer = {
        key: given.key, text: given.key === 'custom' ? String(given.text).slice(0, MOST) : '',
        note: one(ui.note ? ui.note.value : '', 280), who: state.who,
      };
      answer.label = labelFor(q, answer);
      if (before && before.key === answer.key && (before.text || '') === answer.text && (before.note || '') === answer.note) { advance(); return; }
      const record = state.answers[q.id] || (state.answers[q.id] = {});
      // A change says what it was before, once the first answer has reached the channel.
      // A change to the note alone keeps the line it had.
      const was = before && before.msg ? (before.label !== answer.label ? before.label : (before.was || '')) : '';
      Object.assign(record, answer, { at: Date.now(), was, gone: false, state: hook ? 'sending' : 'kept', tries: 0, hard: false });
      state.skipped = state.skipped.filter((id) => id !== q.id);
      // the note went with this answer. What was typed as a custom answer stays until it is the answer that goes.
      const kept = state.drafts[q.id];
      if (kept) { delete kept.note; if (given.key === 'custom') delete kept.text; if (!kept.text) delete state.drafts[q.id]; }
      const as = state.named ? state.who : '';                         // the first answer under a name says whose it is
      state.named = false;
      save();
      setUndo({ kind: 'answer', id: q.id, before, as });
      advance();
      announce(`${as ? say('asWho', { word: say('answered'), who: as }) : say('answered')}: ${answer.label}. ${left().length ? leftSaid(left().length) : ''}`);
      paintDone();
      paintAll();
      sync(q.id);
    }

    function skip() {
      const q = byId[current];
      if (!q || performance.now() < armedAt) return;
      if (changing) { advance(); return; }
      const before = { skipped: state.skipped.slice(), passed: passed.has(q.id) };
      if (state.skipped.includes(q.id)) passed.add(q.id);
      state.skipped = state.skipped.filter((id) => id !== q.id).concat(q.id);
      save();
      setUndo({ kind: 'skip', id: q.id, before });
      announce(say('skipped'));
      advance();
    }

    // what the post holds, and whether one was left on its way, is the record's own to say: an undo puts back the answer, not those
    const asItIs = (record) => ({ msg: record.msg, sent: record.sent, blind: record.blind, open: record.open, stray: record.stray });
    const afresh = () => ({ gone: false, state: hook ? 'sending' : 'kept', tries: 0, hard: false });
    function takeUndo() {
      if (!undo) return;
      const { kind, id, before } = undo;
      setUndo(null);
      if (kind === 'back') {
        // The answer stands again, and is said again: in its own post while that is still there, in a new one once it is deleted.
        const record = state.answers[id];
        if (record) Object.assign(record, before, asItIs(record), afresh());
        else state.answers[id] = { ...before, sent: '', blind: false, ...afresh() };
        save();
        if (current === id || !byId[current]) advance(); else { paintWhere(); attend(); }
        paintDone();
        paintAll();
        sync(id);
        return;
      }
      if (kind === 'skip') {
        state.skipped = before.skipped.filter((x) => byId[x]);          // as it was before the skip
        if (!before.passed) passed.delete(id);
      } else {
        const record = state.answers[id];
        if (record) {
          // what was typed comes back with the question: the answer if it was written, and the note
          if (record.key === 'custom' && record.text) (state.drafts[id] || (state.drafts[id] = {})).text = record.text;
          if (record.note && (!before || before.note !== record.note)) (state.drafts[id] || (state.drafts[id] = {})).note = record.note;
        }
        if (record && before) Object.assign(record, before, asItIs(record), afresh());
        else if (record) retract(id);
      }
      save();
      show(id, { focus: true, change: kind === 'answer' && !!before, skippedBefore: kind === 'skip' && state.skipped.includes(id), from: 'back' });
      paintDone();
      paintAll();
      if (kind === 'answer') sync(id);
    }

    // Taken back: the record goes at once when nothing was posted, and after the delete when something was.
    function retract(id) {
      const record = state.answers[id];
      if (!record) return;
      if (!hook || (!record.msg && !busy.has(id) && !loose(record))) delete state.answers[id];
      else record.gone = true;
    }
    // From the list of what was answered. It can be undone like an answer: the line above the question says so, and is brought into sight.
    function takeBack(id) {
      const record = state.answers[id];
      if (!record || record.gone || record.who !== state.who) return;   // an answer is its giver's
      const before = { ...record };
      const at = (which) => questions.findIndex((q) => q.id === which);
      retract(id);
      save();
      setUndo({ kind: 'back', id, before });
      // the question is open again, in its place: it comes back on the card when it stands before the one there
      if (current === id || !byId[current] || (!changing && at(id) < at(current))) advance(true, 'back');
      else { paintWhere(); attend(); }
      announce(`${say('takenBack')}: ${before.label}`);
      paintDone();
      paintAll();
      sync(id);
    }

    function openCustom() {
      if (!ui.field || (ui.custom && ui.custom.getAttribute('aria-disabled'))) return;
      if (ui.whose && !ui.whose.hidden) closeWho();
      ui.field.hidden = false;
      ui.acts.hidden = false;
      ui.custom.setAttribute('aria-expanded', 'true');
      ui.text.focus();
    }
    function closeCustom() {
      if (!ui.field || ui.field.hidden) return;
      ui.field.hidden = true;
      ui.acts.hidden = true;
      ui.custom.setAttribute('aria-expanded', 'false');
      ui.custom.focus();
    }
    function toggleNote() {
      const open = ui.noteWrap.hidden;
      ui.noteWrap.hidden = !open;
      ui.noteBtn.setAttribute('aria-expanded', String(open));
      ui.noteBtn.firstChild.textContent = say(open ? 'noteOff' : 'note');
      if (open) ui.note.focus(); else { ui.note.value = ''; draft(current, 'note', ''); }
    }
    // who is answering stands where the answers were, and the line that names who steps aside for it
    function whoShown(shown) {
      ui.whose.hidden = !shown;
      ui.answers.hidden = shown;
      ui.foot.hidden = shown;
    }
    function openWho() {
      if (!ui.whose) return;
      const q = byId[current];
      const waits = pending && q ? labelFor(q, pending) : '';
      ui.waits.replaceChildren(...(waits ? [`${say('whoWaits')} `, el('b', { text: waits })] : []));
      ui.waits.hidden = !waits;
      whoShown(true);
      const first = ui.whose.querySelector('[aria-pressed="true"]') || ui.whose.querySelector('button');
      first.focus({ preventScroll: true });
      ui.whose.scrollIntoView({ block: 'nearest', behavior: still.matches ? 'auto' : 'smooth' });
    }
    function closeWho() {
      if (!ui.whose || ui.whose.hidden) return;
      pending = null;
      whoShown(false);
      (ui.foot.querySelector('button') || ui.ask).focus({ preventScroll: true });
    }
    function setWho(who) {
      if (who !== state.who) state.named = true;          // the next answer says whose it is
      state.who = who;
      save();
      const waiting = pending;
      pending = null;
      const q = byId[current];
      if (waiting && q && canAnswer(q)) {
        whoShown(false);
        paintFoot();
        armedAt = 0;
        choose(waiting);
        paintDone();          // whose each answer in the list is may have changed with the name
        paintAll();
        return;
      }
      // Who can answer what, and whose the answers are, may have changed: the queue is read again from the top.
      // A question being changed, or one that is not this person's to answer, leaves the card.
      passed.clear();
      if (q && !changing && canAnswer(q)) show(current, { focus: true, skippedBefore: again }); else advance();
      if (waiting && q && !canAnswer(q)) tell(say('notYours', { name: theirs }));       // the answer that waited was to a question that is someone else's
      paintDone();
      paintAll();
    }

    async function copy(text, button) {
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch (error) {
        const box = el('textarea', { class: 'q-vh', readonly: true, 'aria-hidden': 'true' });
        box.value = text;
        root.append(box);
        box.select();
        try { ok = document.execCommand('copy'); } catch (failed) { ok = false; }
        box.remove();
        button.focus({ preventScroll: true });
      }
      const label = button.textContent;
      button.textContent = say(ok ? 'copied' : 'notCopied');
      announce(button.textContent);
      setTimeout(() => { button.textContent = label; }, 1800);
    }

    // ---------- answered on this device ----------
    function paintDone() {
      const rows = Object.entries(state.answers).filter(([id, a]) => byId[id] && !a.gone).sort((x, y) => (y[1].at || 0) - (x[1].at || 0));
      const open = done.open;
      const focused = done.contains(document.activeElement) ? document.activeElement.dataset.at : null;
      done.hidden = !rows.length;
      doneCount.textContent = rows.length ? ` ${rows.length}` : '';
      doneList.replaceChildren(...rows.map(([id, a]) => {
        const q = byId[id];
        const is = stateOf(a);
        const waits = is === 'failed' || is === 'kept';
        const status = is === 'failed' ? `${say('failed')}.${a.hard ? ` ${say('refused')}` : ''}` : is === 'kept' ? `${say('kept')}.` : is === 'sending' ? `${say('sending')}.` : '';
        return el('li', { class: 'q-d' },
          el('p', { class: 'q-d-ask', text: q.ask }),
          el('p', { class: 'q-d-ans' }, labelOf(q, a), a.note && el('span', { class: 'q-d-note', text: `${say('postNote')} ${a.note}` })),
          el('p', { class: 'q-d-acts' },
            (status || a.who !== state.who) && el('span', { class: `q-d-state${is === 'failed' ? ' q-d-bad' : ''}`, text: [a.who !== state.who ? `${a.who}.` : '', status].filter(Boolean).join(' ') }),
            waits && hook && link(say('retry'), () => sync(id), { 'data-at': `retry-${id}` }),
            waits && link(say('copy'), (event) => copy(post(q, a, true), event.currentTarget), { 'data-at': `copy-${id}` }),
            // An answer is its giver's: only the one who gave it changes it or takes it back. Anyone else sees whose it is.
            // Take back stands at the far end of the row, away from Change.
            a.who === state.who && link(say('change'), () => { done.open = false; show(id, { focus: true, change: true }); }, { 'data-at': `change-${id}` }),
            a.who === state.who && link(say('takeBack'), () => takeBack(id), { class: 'q-link q-d-back', 'data-at': `back-${id}` })));
      }));
      const waiting = rows.filter(([, a]) => stateOf(a) === 'failed' || stateOf(a) === 'kept');
      doneFoot.replaceChildren(waiting.length > 1 ? link(say('copyAll'), (event) => copy(waiting.map(([id, a]) => post(byId[id], a, true)).join('\n\n'), event.currentTarget), { 'data-at': 'copy-all' }) : '');
      doneFoot.hidden = waiting.length < 2;
      done.open = open && rows.length > 0;
      if (focused) { const back = done.querySelector(`[data-at="${focused}"]`) || done.querySelector('summary'); if (back) back.focus({ preventScroll: true }); }
    }

    // ---------- all questions: the page's own plain list, with a way to each ----------
    function paintAll() {
      if (!plain) return;
      for (const item of plain.querySelectorAll('[data-q]')) {
        const q = byId[item.dataset.q];
        if (!q) continue;
        let tail = item.querySelector(':scope > .q-item-go');
        if (!tail) { tail = el('p', { class: 'q-item-go' }); item.append(tail); }
        const a = isLive(q.id) ? state.answers[q.id] : null;
        const had = tail.contains(document.activeElement);
        // a way to the question for whoever can answer it; to an answer, for the one who gave it
        const can = a ? a.who === state.who : canAnswer(q);
        tail.replaceChildren(...[a && el('span', { text: `${say('answered')}: ${labelOf(q, a)}` }),
          can && link(a ? say('change') : say('goto'), () => { all.open = false; show(q.id, { focus: true, change: !!a }); })].filter(Boolean));
        tail.hidden = !tail.firstChild;
        const back = tail.querySelector('button');
        if (had && back) back.focus({ preventScroll: true });
      }
    }

    function paintKeys() {
      keysLine.replaceChildren(link(say(state.keys ? 'keysOff' : 'keysOn'), () => { state.keys = !state.keys; save(); paintKeys(); keysLine.querySelector('button').focus(); }));
      root.toggleAttribute('data-keys', !!state.keys);
    }

    // ---------- the keyboard: 1 to 4 an option, U we don't know, C custom, S skip, Z undo ----------
    // a key answers only the question a person can see: its own words, whole, not the tail of its card
    const inView = () => { const box = (ui.ask || card).getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight; };
    // Something else may stand beside the queue on its page. A click there says the person is with
    // that: the keys rest until the pointer or the focus is back in the queue.
    let away = false;
    document.addEventListener('pointerdown', (event) => { away = !root.contains(event.target); }, true);
    root.addEventListener('pointerenter', () => { away = false; });
    root.addEventListener('focusin', () => { away = false; });
    document.addEventListener('keydown', (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      const at = document.activeElement;
      if (event.key === 'Escape' && at && root.contains(at)) {
        if (ui.whose && !ui.whose.hidden) { closeWho(); event.preventDefault(); } else if (ui.field && !ui.field.hidden) { closeCustom(); event.preventDefault(); } else if (changing) { advance(); event.preventDefault(); }
        return;
      }
      if (!state.keys) return;
      if (at && (at.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName))) return;
      if (at && at !== document.body && !root.contains(at)) return;                 // the focus is somewhere else on the page
      if (away) return;                                                             // the last click was somewhere else on the page
      if (at && at.closest && at.closest('.q-fold[open]')) return;                  // reading a list: the keys rest
      if (ui.whose && !ui.whose.hidden) return;
      if (!inView()) return;                                                        // the question is out of sight: a key answers nothing
      const letter = event.key.toLowerCase();
      const q = byId[current];
      if (letter === 'z' && undo) { event.preventDefault(); takeUndo(); return; }
      if (!q) return;
      if (/^[1-9]$/.test(letter) && q.options[Number(letter) - 1]) { event.preventDefault(); choose({ key: q.options[Number(letter) - 1].key }); }
      else if (letter === 'u') { event.preventDefault(); choose({ key: 'unknown' }); }
      else if (letter === 'c') { event.preventDefault(); openCustom(); }
      else if (letter === 's') { event.preventDefault(); skip(); }
    });

    // ---------- start ----------
    try {
      if (plain) { all.append(plain); }
      root.append(live);
      root.setAttribute('data-live', '');
      advance(false);
      card.classList.remove('q-in');          // the first card is simply there
      paintDone();
      paintAll();
      paintKeys();
    } catch (error) {
      // the plain list is still on the page, back where it was
      if (plain) root.append(plain);
      live.remove();
      root.removeAttribute('data-live');
      throw error;
    }
    syncAll(false);
    addEventListener('online', () => syncAll(false));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) syncAll(false); });
    // the same page open twice on this device: the other one's answers are read when it writes
    addEventListener('storage', (event) => {
      if (event.key !== storeName || busy.size || (ui.field && !ui.field.hidden) || (ui.whose && !ui.whose.hidden)) return;
      const fresh = read();
      if (!fresh) return;
      state = sound(fresh);
      const q = byId[current];
      if (q && ((isLive(current) && !changing) || !canAnswer(q))) advance(false); else { paintWhere(); paintSaid(); }
      paintDone();
      paintAll();
      paintFoot();
    });
  }

  const start = () => document.querySelectorAll('[data-queue]').forEach((root) => { if (!root.hasAttribute('data-live')) mount(root); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
