// Unsends your own messages in the open chat, newest first, scrolling up until the start.
// Flow per message: hover it -> toolbar "More actions" -> "Unsend" -> "Unsend for everyone" -> "Remove".
// Works for text, photos, stickers, location cards etc.: every message is a [role=article]; own ones are laid out row-reverse.
// Taps are real Android touches (Android.tap). Texts are matched below; add your language there.
(function () {
  if (window.__mc) { return; }

  const L = {
    menu:     [/^unsend$/i, /^intrekken$/i],
    more:     [/^more actions$/i, /^more$/i, /^meer/i],
    everyone: [/unsend for everyone/i, /voor iedereen/i],
    forYou:   [/for you$/i, /voor jou$/i],
    confirm:  [/^remove$/i, /^verwijder(en)?$/i],
    ignore:   [/unsent a message/i, /removed a message/i, /message was removed/i, /deleted a message/i, /^message removed$/i],
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const state = { running: false, done: 0, skipped: 0, why: '', trace: [], fails: [] };
  const note = (m) => { state.trace.push(m); if (state.trace.length > 40) state.trace.shift(); };
  const say = (m) => { try { Android.report(m); } catch (e) { console.log(m); } };
  const progress = (extra) => say('Unsent ' + state.done + ', skipped ' + state.skipped +
    (state.why ? ' (last skip: ' + state.why + ')' : '') + (extra ? ' ' + extra : ''));

  const label = (el) => (el.getAttribute('aria-label') || '').trim();
  const ownText = (el) => (el.innerText || '').trim();   // innerText: visible text only (textContent includes hidden duplicates)
  // Visible text only: some Facebook buttons carry misleading aria-labels (e.g. Cancel labelled "Remove").
  const textIs = (el, res) => res.some((re) => re.test(ownText(el)));
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const find = (root, sel, res) => [...root.querySelectorAll(sel)]
    .find((e) => visible(e) && e.getAttribute('aria-disabled') !== 'true' && textIs(e, res)) || null;

  async function waitFor(fn, ms = 2000) {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(100); }
    return null;
  }

  // --- real taps --------------------------------------------------------------------------
  // CSS px (layout viewport) -> WebView px, accounting for page zoom via the visual viewport.
  function toView(cx, cy) {
    const [w, h] = Android.viewSize().split(',').map(Number);
    const vv = window.visualViewport;
    const ow = vv ? vv.offsetLeft : 0, oh = vv ? vv.offsetTop : 0;
    const vw = vv ? vv.width : window.innerWidth, vh = vv ? vv.height : window.innerHeight;
    return [(cx - ow) * (w / vw), (cy - oh) * (h / vh)];
  }
  // A point inside el that is really hit by el (not covered by the sticky header, composer, banners...).
  function hitPoint(el) {
    const r = el.getBoundingClientRect();
    const left = Math.max(r.left, 0), right = Math.min(r.right, innerWidth);
    const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight);
    if (right <= left || bottom <= top) return null;
    const cx = (left + right) / 2;
    for (let d = 0; d <= (bottom - top) / 2; d += 6) {
      for (const cy of [(top + bottom) / 2 + d, (top + bottom) / 2 - d]) {
        const hit = document.elementFromPoint(cx, cy);
        if (hit && el.contains(hit)) return [cx, cy];
      }
    }
    return null;
  }
  async function tap(el) {
    // Dialogs animate in: wait until the element can actually be hit.
    let p = hitPoint(el);
    for (let i = 0; !p && i < 15; i++) { await sleep(100); p = hitPoint(el); }
    if (!p) { const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      note('nohit rect=' + [r.left, r.top, r.width, r.height].map(Math.round) + ' vp=' + innerWidth + 'x' + innerHeight + ' hit=' + (h ? h.tagName + ':' + (h.getAttribute('aria-label') || ownText(h).slice(0, 10)) + ' in=' + el.contains(h) : 'null')); }
    note('tap ' + el.tagName + ' ' + (label(el) || ownText(el).slice(0, 12)) + ' @' + (p ? Math.round(p[0]) + ',' + Math.round(p[1]) : 'none'));
    if (!p) return false;
    if (typeof Android !== 'undefined' && Android.tap) {
      const [x, y] = toView(p[0], p[1]);
      Android.tap(x, y);
    } else {
      for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
        el.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t,
          { bubbles: true, cancelable: true, view: window, clientX: p[0], clientY: p[1] }));
    }
    await sleep(250);
    return true;
  }
  // Escape closes the whole conversation when nothing is open, so only press it to dismiss a menu/dialog.
  const overlayOpen = () => [...document.querySelectorAll('[role="menu"], [role="dialog"]')].some(visible);
  const escape = () => { if (!overlayOpen()) return; try { Android.escape(); } catch (e) {} };
  const dialog = () => [...document.querySelectorAll('[role="dialog"]')].filter(visible).pop();

  // --- finding messages -------------------------------------------------------------------
  function scrollers() {
    return [...document.querySelectorAll('*')].filter((e) => {
      const s = getComputedStyle(e);
      return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 50 && e.clientHeight > 150;
    });
  }
  function scroller() {
    const s = scrollers();
    return s.find((e) => e.querySelector('[role="article"]')) || s.find((e) => e.querySelector('[dir="auto"]')) ||
      s[0] || document.scrollingElement;
  }
  // Own messages are laid out right-to-left (row-reverse); received ones left-to-right.
  function isOwn(article) {
    let level = [article];
    for (let depth = 0; depth < 6 && level.length; depth++) {
      const next = [];
      for (const el of level) for (const c of el.children) {
        if (getComputedStyle(c).flexDirection === 'row-reverse') return true;
        next.push(c);
      }
      level = next;
    }
    return false;
  }
  function candidates(sc) {
    return [...sc.querySelectorAll('[role="article"]')].filter((a) =>
      visible(a) && !a.dataset.mcDone && !L.ignore.some((re) => re.test(ownText(a))) && isOwn(a));
  }

  // --- per-message flow -------------------------------------------------------------------
  // Hovering (or tapping) a message shows a "Message actions" toolbar: [... more] [reply] [react].
  // Only a toolbar level with this message counts; the previous message's toolbar can linger.
  function moreButton(article) {
    const ar = article.getBoundingClientRect();
    for (const tb of document.querySelectorAll('[role="toolbar"]')) {
      if (!visible(tb)) continue;
      const tr = tb.getBoundingClientRect(), cy = tr.top + tr.height / 2;
      if (cy < ar.top - 10 || cy > ar.bottom + 10) continue;
      const btns = [...tb.querySelectorAll('[role="button"]')].filter((b) => visible(b) && hitPoint(b));
      const byLabel = btns.find((b) => L.more.some((re) => re.test(label(b))));
      if (byLabel) return byLabel;
      // Never guess among labelled buttons: on videos the leftmost one is "Forward".
      if (!btns.some((b) => label(b))) { btns.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left); if (btns[0]) return btns[0]; }
    }
    return null;
  }
  // Pretend the mouse hovers the blank area beside the message: shows the toolbar without opening
  // photos / location cards (tapping those would open a viewer).
  // spot 0: blank area beside the message; spot 1: over the message content itself (photos, videos...).
  function hover(article, sc, spot) {
    const r = article.getBoundingClientRect(), c = sc.getBoundingClientRect();
    const top = Math.max(r.top, c.top, 0), bottom = Math.min(r.bottom, c.bottom, innerHeight);
    const x = spot === 0 ? r.left + 40 : r.right - 60, y = (top + bottom) / 2;
    const target = document.elementFromPoint(x, y) || article;
    const o = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
    for (const t of ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointermove', 'mousemove'])
      target.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, o));
  }
  const menuTexts = () => [...document.querySelectorAll('[role="menuitem"]')]
    .filter(visible).map(ownText).slice(0, 6).join('|');

  // Lazy-loading photos shift the layout while we work: re-centre until the message holds still on screen.
  async function bringIntoView(el, sc) {
    let lastTop = null;
    for (let i = 0; i < 10; i++) {
      el.scrollIntoView({ block: 'center' });
      await sleep(350);
      const r = el.getBoundingClientRect(), c = sc.getBoundingClientRect();
      const onScreen = Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top) >= Math.min(r.height, 60);
      if (onScreen && lastTop !== null && Math.abs(r.top - lastTop) < 2) return true;
      lastTop = r.top;
    }
    return false;
  }

  async function tryUnsend(bubble, sc) {
    if (!(await bringIntoView(bubble, sc))) { state.why = 'message kept moving'; return false; }
    let more = moreButton(bubble);
    for (let attempt = 0; attempt < 4 && !more; attempt++) {
      hover(bubble, sc, attempt % 2);
      more = await waitFor(() => moreButton(bubble), 1200);
    }
    if (!more) {
      // Fallback for plain text: tap the text itself (never a button, which would open a viewer).
      const text = [...bubble.querySelectorAll('[dir="auto"]')].find((t) => visible(t) && !t.closest('[role="button"]'));
      if (text && (await tap(text))) more = await waitFor(() => moreButton(bubble), 1500);
    }
    if (!more) { state.why = 'no actions toolbar'; return false; }
    if (!(await tap(more))) { state.why = 'toolbar not tappable'; escape(); return false; }
    const item = await waitFor(() => find(document, '[role="menuitem"]', L.menu), 1500);
    if (!item) { state.why = 'no Unsend in menu [' + menuTexts() + ']'; escape(); await sleep(300); return false; }
    if (!(await tap(item))) { state.why = 'Unsend item not tappable'; escape(); return false; }
    const dlg = await waitFor(dialog, 2000);
    if (!dlg) { state.why = 'no dialog'; return false; }
    // Two dialog variants: radio options ("Unsend for everyone" / "Unsend for you"), or a plain
    // confirmation titled "Unsend for everyone" (cards such as location sharing).
    const opt = await waitFor(() => find(dlg, 'label', L.everyone) ||
      (L.everyone.some((re) => re.test(ownText(dlg))) && !find(dlg, 'label', L.forYou) ? dlg : null), 1500);
    if (!opt) { state.why = 'no "for everyone" option'; escape(); await sleep(300); return false; }
    if (opt !== dlg) { await tap(opt); await sleep(300); } // preselected, but make sure
    const ok = find(dlg, '[role="button"]', L.confirm);
    if (!ok) { state.why = 'no Remove button'; escape(); return false; }
    if (!(await tap(ok))) { state.why = 'Remove not tappable'; escape(); return false; }
    // Success = the message turned into an "unsent" placeholder / disappeared, or the dialog closed.
    const gone = () => !bubble.isConnected || L.ignore.some((re) => re.test(ownText(bubble))) ||
      !dlg.isConnected || !visible(dlg);
    if (!(await waitFor(gone, 6000))) { state.why = 'dialog stayed open'; escape(); return false; }
    return true;
  }

  // One walk from the newest message to the start of the conversation; returns how many were unsent.
  async function pass() {
    let unsent = 0, stuck = 0;
    document.querySelectorAll('[data-mc-done]').forEach((e) => delete e.dataset.mcDone);
    let sc = scroller();
    sc.scrollTop = sc.scrollHeight;
    await sleep(1200);
    while (state.running) {
      if (!/\/messages\/(e2ee\/)?t\//.test(location.pathname)) { state.running = false; state.closed = true; return unsent; }
      sc = scroller();
      const list = candidates(sc);
      progress('[' + list.length + ' messages in view]');
      for (const bubble of list.reverse()) {      // newest first
        if (!state.running) break;
        bubble.dataset.mcDone = '1';
        let ok = false;
        for (let attempt = 1; attempt <= 3 && !ok && state.running; attempt++) {
          ok = await tryUnsend(bubble, sc);
          if (!ok) { escape(); await sleep(900); }   // retry transient failures
        }
        if (ok) { state.done++; unsent++; await sleep(900 + Math.random() * 700); }
        else { state.skipped++; state.fails.push(ownText(bubble).slice(0, 30) + ' :: ' + state.why); }
        progress();
      }
      if (!state.running) break;
      if (sc.scrollTop > 5) {
        sc.scrollTop = Math.max(0, sc.scrollTop - sc.clientHeight * 0.7);
        await sleep(700);
        continue;
      }
      // At the top: wait for older messages to load; stop when nothing new arrives.
      const h = sc.scrollHeight;
      await sleep(2500);
      stuck = (scroller().scrollHeight === h && scroller().scrollTop <= 5) ? stuck + 1 : 0;
      if (stuck >= 3) break;
    }
    return unsent;
  }

  // Repeat full passes until one finds nothing left to unsend, so a single run clears the chat.
  async function loop() {
    state.running = true;
    const inChat = () => /\/messages\/(e2ee\/)?t\//.test(location.pathname) && document.querySelector('[role="article"]');
    if (!(await waitFor(inChat, 12000))) {
      state.running = false;
      say('No messages found. Open a chat (wait until it has loaded), then tap Unsend all.');
      return;
    }
    for (let n = 1; n <= 5 && state.running; n++) {
      const unsent = await pass();
      if (unsent === 0) break;
      progress('[pass ' + n + ' done, checking again]');
    }
    const finished = state.running;
    state.running = false;
    if (state.closed) { say('The chat closed unexpectedly - open it again and tap Unsend all. Unsent ' + state.done); return; }
    say((finished ? 'Finished: reached the start, nothing left to unsend. ' : 'Stopped. ') +
      'Unsent ' + state.done + ', skipped ' + state.skipped);
  }

  window.__mc = {
    state,
    debug() {
      const sc = scroller(), b = sc.getBoundingClientRect();
      return { sc: sc.tagName + ' ' + Math.round(b.left) + ',' + Math.round(b.top) + ',' + Math.round(b.right) + ',' + Math.round(b.bottom),
        cands: candidates(sc).map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top) + ',' + Math.round(r.right) + ' ' + e.tagName + ' ' + ownText(e).slice(0, 20); }) };
    },
    start() { if (!state.running) loop(); },
    stop() { state.running = false; say('Stopping...'); },
  };
})();
