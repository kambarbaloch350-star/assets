import { Engine } from '../core/engine';
import type { Card, Move } from '../core/types';
import { starsFor } from '../core/levels';
import { T, faNum } from '../core/i18n';
import { player } from '../core/save';
import { PRICES, EXTRA_MOVES_AMOUNT } from '../core/economy';
import { clear, el, toast, wait } from '../ui/dom';
import { router, type Screen } from '../ui/router';
import { coinChip } from '../ui/coinchip';
import { sfx } from '../platform/audio';
import { ads } from '../platform/tapsell';
import { showWin, showOutOfMoves, showStuck, showPause, showNeedCoins } from '../ui/panels/gamePanels';
import { runTutorial } from '../ui/panels/tutorial';

interface GameParams {
  level: number;
}

/** Overlap ratio for stacked cards in a column (fraction of card height). */
const OVERLAP = 0.27;

export function createGame(): Screen {
  const root = el('div', 'game');

  // ---------------------------------------------------------------- chrome
  const hud = el('div', 'hud');
  const pause = el('button', 'iconbtn', '❚❚');
  pause.style.fontSize = '13px';

  const statLevel = stat(T.level);
  const statMoves = stat(T.movesLeft);
  const wallet = coinChip(() => router.go('store'));

  hud.append(pause, statLevel.node, statMoves.node, wallet);
  root.appendChild(hud);

  const progWrap = el('div', 'hud__prog');
  const progBar = el('i');
  progWrap.appendChild(progBar);
  root.appendChild(progWrap);

  const board = el('div', 'board');
  const fndRow = el('div', 'fnd-row');
  const tableau = el('div', 'tableau');
  board.append(fndRow, tableau);
  root.appendChild(board);

  const tools = el('div', 'tools');
  root.appendChild(tools);

  // --------------------------------------------------------------- state
  let eng: Engine;
  let level = 1;
  let attempt = 0;
  let busy = false;
  let finished = false;
  let hintTimer: number | undefined;
  /** card id → element, rebuilt on each render */
  const cardEls = new Map<number, HTMLElement>();
  let selected: { pile: number; index: number } | null = null;

  // ------------------------------------------------------------- helpers
  function stat(label: string) {
    const node = el('div', 'hud__stat');
    const b = el('b', 'num', '۰');
    node.append(b, el('span', '', label));
    return { node, set: (v: string) => (b.textContent = v) };
  }

  function cardH(): number {
    const w = tableau.querySelector('.pile')?.clientWidth ?? 70;
    return w * (335 / 247);
  }

  // ---------------------------------------------------------------- tools
  const toolDefs = [
    { key: 'hint' as const, icon: './ui/img_btn_hint.png', label: T.hint, price: PRICES.hint },
    { key: 'undo' as const, icon: './ui/img_btn_undo.png', label: T.undo, price: PRICES.undo },
    { key: 'joker' as const, icon: './ui/img_btn_joker.png', label: T.joker, price: PRICES.joker },
  ];
  const toolBtns = new Map<string, { btn: HTMLButtonElement; badge: HTMLElement }>();

  function buildTools() {
    clear(tools);
    toolBtns.clear();

    // stock
    const stock = el('button', 'stock') as HTMLButtonElement;
    const sn = el('span', 'stock__n num', '۰');
    stock.appendChild(sn);
    stock.setAttribute('data-stock', '1');
    stock.onclick = () => doMove({ t: 'stock' });
    tools.appendChild(stock);
    toolBtns.set('stock', { btn: stock, badge: sn });

    for (const d of toolDefs) {
      const btn = el('button', 'tool') as HTMLButtonElement;
      const img = el('img');
      img.src = d.icon;
      img.alt = '';
      const badge = el('span', 'tool__badge');
      btn.append(img, badge, el('span', 'tool__lbl', d.label));
      btn.onclick = () => useTool(d.key, d.price);
      tools.appendChild(btn);
      toolBtns.set(d.key, { btn, badge });
    }

    // extra foundation slot
    const add = el('button', 'tool') as HTMLButtonElement;
    const aimg = el('img');
    aimg.src = './ui/img_btn_add_columns.png';
    aimg.alt = '';
    const abadge = el('span', 'tool__badge tool__badge--cost');
    abadge.textContent = faNum(PRICES.foundation);
    add.append(aimg, abadge, el('span', 'tool__lbl', T.newSlot));
    add.onclick = () => buyFoundation();
    tools.appendChild(add);
    toolBtns.set('foundation', { btn: add, badge: abadge });
  }

  function syncTools() {
    const st = toolBtns.get('stock')!;
    st.badge.textContent = faNum(eng.stock.length);
    (st.btn as HTMLButtonElement).disabled = eng.stock.length === 0 || busy;

    for (const d of toolDefs) {
      const t = toolBtns.get(d.key)!;
      const owned = player.state.inv[d.key];
      if (owned > 0) {
        t.badge.className = 'tool__badge';
        t.badge.textContent = faNum(owned);
      } else {
        t.badge.className = 'tool__badge tool__badge--cost';
        t.badge.textContent = faNum(d.price);
      }
      if (d.key === 'undo') (t.btn as HTMLButtonElement).disabled = !eng.canUndo || busy;
      else (t.btn as HTMLButtonElement).disabled = busy;
    }
    const f = toolBtns.get('foundation')!;
    (f.btn as HTMLButtonElement).disabled = eng.foundations.length >= 6 || busy;
  }

  /** Spend an inventory item, or coins if the player has none left. */
  function consume(key: 'hint' | 'undo' | 'joker', price: number): boolean {
    if (player.useItem(key)) return true;
    if (player.spend(price)) {
      sfx.play('cash', 0.4);
      return true;
    }
    showNeedCoins(price, () => router.go('store'));
    return false;
  }

  function useTool(key: 'hint' | 'undo' | 'joker', price: number) {
    if (busy || finished) return;
    if (key === 'undo' && !eng.canUndo) return;
    if (!consume(key, price)) return;

    if (key === 'hint') {
      sfx.play('hint', 0.45);
      showHint();
    } else if (key === 'undo') {
      sfx.play('undo');
      eng.undo();
      selected = null;
      render();
    } else {
      sfx.play('bubble');
      eng.addJoker();
      render(true);
      toast('جوکر اضافه شد! روی هر کارتی قرار می‌گیرد.', 'good');
    }
    syncTools();
  }

  function buyFoundation() {
    if (busy || finished) return;
    if (eng.foundations.length >= 6) return;
    if (!player.spend(PRICES.foundation)) {
      showNeedCoins(PRICES.foundation, () => router.go('store'));
      return;
    }
    sfx.play('cash', 0.4);
    eng.addFoundation();
    render();
    toast('یک خانهٔ جدید باز شد!', 'good');
  }

  // ----------------------------------------------------------- rendering
  function render(animateNew = false) {
    renderFoundations();
    renderTableau(animateNew);
    syncHud();
    syncTools();
  }

  function renderFoundations() {
    clear(fndRow);
    eng.foundations.forEach((f, i) => {
      const n = el('div', 'fnd');
      n.dataset.fnd = String(i);
      if (f.family !== -1) {
        n.classList.add('fnd--active');
        n.appendChild(el('div', 'fnd__val num', faNum(eng.familyValue[f.family])));

        const stack = el('div', 'fnd__stack');
        // show up to 3 mini chips representing progress
        const shown = f.cards.slice(-3);
        shown.forEach((c, k) => {
          const chip = el('div', 'fnd__chip', c.kind === 'joker' ? '★' : c.label);
          chip.style.transform = `translateY(${(shown.length - 1 - k) * -5}px) scale(${
            1 - (shown.length - 1 - k) * 0.05
          })`;
          chip.style.zIndex = String(k);
          stack.appendChild(chip);
        });
        n.appendChild(stack);
        n.appendChild(
          el('div', 'fnd__count num', `${faNum(f.cards.length)}/${faNum(f.needed)}`),
        );
      } else {
        n.appendChild(el('div', 'fnd__ghost', '◈'));
      }
      fndRow.appendChild(n);
    });
  }

  function renderTableau(animateNew: boolean) {
    const prevIds = new Set(cardEls.keys());
    clear(tableau);
    cardEls.clear();

    const h = cardH();
    eng.piles.forEach((pile, pi) => {
      const p = el('div', 'pile');
      p.dataset.pile = String(pi);

      pile.forEach((c, ci) => {
        const n = makeCard(c);
        n.style.top = `${ci * h * OVERLAP}px`;
        n.dataset.pile = String(pi);
        n.dataset.index = String(ci);
        if (animateNew && !prevIds.has(c.id)) {
          n.classList.add('is-deal');
          n.style.animationDelay = `${ci * 22}ms`;
        }
        cardEls.set(c.id, n);
        p.appendChild(n);
      });

      tableau.appendChild(p);
    });
  }

  function makeCard(c: Card): HTMLElement {
    const n = el('div', 'card');
    n.dataset.id = String(c.id);
    if (!c.faceUp) n.classList.add('card--down');
    else if (c.kind === 'master') n.classList.add('card--master');
    else if (c.kind === 'joker') n.classList.add('card--joker');

    const face = el('div', 'card__face');
    if (c.faceUp && c.kind === 'master') {
      const cr = el('img', 'card__crown');
      cr.src = './ui/img_crown.png';
      cr.alt = '';
      face.appendChild(cr);
    }
    face.appendChild(el('div', 'card__label', c.faceUp ? c.label : ''));
    n.appendChild(face);
    return n;
  }

  function syncHud() {
    statLevel.set(faNum(level));
    const left = eng.movesLeft;
    statMoves.set(left > 9000 ? '∞' : faNum(left));
    statMoves.node.classList.toggle('is-low', left <= 8 && left <= 9000);
    progBar.style.width = `${Math.round(eng.progress * 100)}%`;
  }

  // ------------------------------------------------------------- hinting
  function clearHints() {
    window.clearTimeout(hintTimer);
    root.querySelectorAll('.is-hint').forEach((n) => n.classList.remove('is-hint'));
  }

  function showHint() {
    clearHints();
    const m = eng.hint();
    if (!m) {
      toast(T.noMovesMsg, 'warn');
      return;
    }
    if (m.t === 'stock') {
      toolBtns.get('stock')!.btn.classList.add('is-hint');
    } else if (m.t === 'foundation' || m.t === 'tableau') {
      const pile = eng.piles[m.from];
      const card = pile[pile.length - m.count];
      if (card) cardEls.get(card.id)?.classList.add('is-hint');
      if (m.t === 'foundation') {
        fndRow.querySelector(`[data-fnd="${m.fnd}"]`)?.classList.add('is-hint');
      } else {
        (tableau.children[m.to] as HTMLElement)?.classList.add('is-hint');
      }
    }
    hintTimer = window.setTimeout(clearHints, 4200);
  }

  // -------------------------------------------------------------- moving
  async function doMove(m: Move): Promise<boolean> {
    if (busy || finished) return false;
    clearHints();
    selected = null;

    const before = eng.piles.map((p) => p.length);
    const res = eng.apply(m);
    if (!res.ok) return false;

    busy = true;

    if (m.t === 'stock') {
      sfx.play('deal', 0.45);
      render(true);
    } else if (m.t === 'foundation') {
      sfx.play('place', 0.55);
      render();
      if (res.clearedFoundation !== undefined) {
        const node = fndRow.querySelector(`[data-fnd="${res.clearedFoundation}"]`);
        node?.classList.add('is-pop');
        sfx.play('complete', 0.6);
        toast(T.familyCleared, 'good');
        await wait(340);
        node?.classList.remove('is-pop');
      }
    } else {
      sfx.slide();
      render();
    }

    if (res.flipped !== undefined) {
      const pile = eng.piles[res.flipped];
      const top = pile[pile.length - 1];
      if (top) cardEls.get(top.id)?.classList.add('is-flip');
    }
    void before;

    busy = false;
    syncTools();
    await checkEnd();
    return true;
  }

  async function checkEnd() {
    if (finished) return;

    if (eng.won) {
      finished = true;
      await wait(260);
      await onWin();
      return;
    }

    if (eng.movesLeft <= 0) {
      finished = true;
      await wait(200);
      showOutOfMoves(
        PRICES.extraMoves,
        () => {
          if (!player.spend(PRICES.extraMoves)) {
            showNeedCoins(PRICES.extraMoves, () => router.go('store'));
            return false;
          }
          sfx.play('cash', 0.4);
          eng.grantMoves(EXTRA_MOVES_AMOUNT);
          finished = false;
          syncHud();
          return true;
        },
        () => restart(),
        () => router.go('menu'),
      );
      return;
    }

    if (eng.stuck) {
      showStuck(
        PRICES.joker,
        () => {
          if (!consume('joker', PRICES.joker)) return false;
          eng.addJoker();
          render(true);
          return true;
        },
        () => restart(),
      );
    }
  }

  async function onWin() {
    sfx.play('win', 0.6);
    const stars = starsFor(eng.cfg, eng.movesUsed);
    const { earned } = player.completeLevel(level, stars, eng.movesUsed);
    ads.noteLevelFinished();

    await showWin({
      level,
      stars,
      earned,
      moves: eng.movesUsed,
      onNext: async () => {
        // interstitial between levels, paced like the original
        if (ads.canShowInterstitial(level)) await ads.showInterstitial();
        start(level + 1);
      },
      onReplay: () => restart(),
      onMenu: () => router.go('menu'),
    });
  }

  // --------------------------------------------------------- interaction
  function pileFromPoint(x: number, y: number): number | null {
    const piles = Array.from(tableau.querySelectorAll('.pile')) as HTMLElement[];
    for (const p of piles) {
      const r = p.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top - 10 && y <= r.bottom) {
        return Number(p.dataset.pile);
      }
    }
    return null;
  }

  function fndFromPoint(x: number, y: number): number | null {
    const nodes = Array.from(fndRow.querySelectorAll('.fnd')) as HTMLElement[];
    for (const n of nodes) {
      const r = n.getBoundingClientRect();
      if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 14 && y <= r.bottom + 14) {
        return Number(n.dataset.fnd);
      }
    }
    return null;
  }

  /** Best automatic destination for a tapped card (tap-to-play). */
  function autoMove(pi: number, ci: number): Move | null {
    const pile = eng.piles[pi];
    const count = pile.length - ci;
    if (eng.runLength(pi, ci) !== count) return null;

    // 1) foundation that COMPLETES a family
    for (let f = 0; f < eng.foundations.length; f++) {
      if (!eng.canMoveToFoundation(pi, f, count)) continue;
      const fnd = eng.foundations[f];
      if (fnd.cards.length + count >= fnd.needed) return { t: 'foundation', from: pi, fnd: f, count };
    }
    // 2) any foundation that continues an existing family
    for (let f = 0; f < eng.foundations.length; f++) {
      if (eng.foundations[f].family !== -1 && eng.canMoveToFoundation(pi, f, count)) {
        return { t: 'foundation', from: pi, fnd: f, count };
      }
    }
    // 3) open a new foundation with a master
    for (let f = 0; f < eng.foundations.length; f++) {
      if (eng.canMoveToFoundation(pi, f, count)) return { t: 'foundation', from: pi, fnd: f, count };
    }
    // 4) a same-family column (prefer one that uncovers a face-down card)
    let best: { m: Move; s: number } | null = null;
    for (let q = 0; q < eng.piles.length; q++) {
      if (!eng.canMoveToPile(pi, count, q)) continue;
      let s = eng.piles[q].length ? 10 : 2;
      const under = pile[ci - 1];
      if (under && !under.faceUp) s += 20;
      if (!best || s > best.s) best = { m: { t: 'tableau', from: pi, to: q, count }, s };
    }
    return best?.m ?? null;
  }

  function badFeedback(node: HTMLElement, msg?: string) {
    node.classList.remove('is-bad');
    void node.offsetWidth;
    node.classList.add('is-bad');
    sfx.play('bubble', 0.25);
    if (msg) toast(msg, 'warn');
    setTimeout(() => node.classList.remove('is-bad'), 340);
  }

  // pointer drag & drop + tap
  let drag: {
    ids: number[];
    nodes: HTMLElement[];
    pi: number;
    ci: number;
    ox: number;
    oy: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null = null;

  function onDown(e: PointerEvent) {
    if (busy || finished) return;
    const target = (e.target as HTMLElement).closest('.card') as HTMLElement | null;
    if (!target) return;
    const pi = Number(target.dataset.pile);
    const ci = Number(target.dataset.index);
    const pile = eng.piles[pi];
    if (!pile?.[ci]?.faceUp) return;

    const count = pile.length - ci;
    if (eng.runLength(pi, ci) !== count) {
      badFeedback(target, T.sameFamilyOnly);
      return;
    }

    const nodes = pile.slice(ci).map((c) => cardEls.get(c.id)!).filter(Boolean);
    const r = target.getBoundingClientRect();

    drag = {
      ids: pile.slice(ci).map((c) => c.id),
      nodes,
      pi,
      ci,
      ox: e.clientX - r.left,
      oy: e.clientY - r.top,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };

    nodes.forEach((n, k) => {
      n.classList.add('is-drag');
      n.style.width = `${r.width}px`;
      n.style.left = `${r.left}px`;
      n.style.top = `${r.top + k * cardH() * OVERLAP}px`;
      n.style.position = 'fixed';
      n.style.zIndex = String(900 + k);
    });

    clearHints();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onMove(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;

    const h = cardH();
    drag.nodes.forEach((n, k) => {
      n.style.left = `${e.clientX - drag!.ox}px`;
      n.style.top = `${e.clientY - drag!.oy + k * h * OVERLAP}px`;
    });

    // live highlight of the hovered drop target
    tableau.querySelectorAll('.pile').forEach((p) => p.classList.remove('is-target'));
    fndRow.querySelectorAll('.fnd').forEach((p) => p.classList.remove('is-target'));

    const f = fndFromPoint(e.clientX, e.clientY);
    if (f !== null && eng.canMoveToFoundation(drag.pi, f, drag.ids.length)) {
      fndRow.querySelector(`[data-fnd="${f}"]`)?.classList.add('is-target');
      return;
    }
    const q = pileFromPoint(e.clientX, e.clientY);
    if (q !== null && eng.canMoveToPile(drag.pi, drag.ids.length, q)) {
      (tableau.children[q] as HTMLElement)?.classList.add('is-target');
    }
  }

  function onUp(e: PointerEvent) {
    if (!drag) return;
    const d = drag;
    drag = null;

    tableau.querySelectorAll('.pile').forEach((p) => p.classList.remove('is-target'));
    fndRow.querySelectorAll('.fnd').forEach((p) => p.classList.remove('is-target'));

    // reset inline styles; render() will lay the cards out again
    d.nodes.forEach((n) => {
      n.classList.remove('is-drag');
      n.style.position = '';
      n.style.left = '';
      n.style.width = '';
      n.style.zIndex = '';
    });

    // simple tap → auto-move
    if (!d.moved) {
      const m = autoMove(d.pi, d.ci);
      if (m) void doMove(m);
      else {
        const node = cardEls.get(d.ids[0]);
        if (node) badFeedback(node, T.nothingHere);
        render();
      }
      return;
    }

    const f = fndFromPoint(e.clientX, e.clientY);
    if (f !== null) {
      if (eng.canMoveToFoundation(d.pi, f, d.ids.length)) {
        void doMove({ t: 'foundation', from: d.pi, fnd: f, count: d.ids.length });
        return;
      }
      const fnd = eng.foundations[f];
      const first = eng.piles[d.pi][d.ci];
      render();
      const node = cardEls.get(d.ids[0]);
      if (node) {
        badFeedback(
          node,
          fnd.family === -1 && first.kind !== 'master'
            ? T.onlyMasterOnEmpty
            : fnd.cards.length >= fnd.needed
              ? T.foundationFull
              : T.sameFamilyOnly,
        );
      }
      return;
    }

    const q = pileFromPoint(e.clientX, e.clientY);
    if (q !== null && q !== d.pi && eng.canMoveToPile(d.pi, d.ids.length, q)) {
      void doMove({ t: 'tableau', from: d.pi, to: q, count: d.ids.length });
      return;
    }

    render();
    if (q !== null && q !== d.pi) {
      const node = cardEls.get(d.ids[0]);
      if (node) badFeedback(node, T.sameFamilyOnly);
    }
  }

  root.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  pause.onclick = () => {
    sfx.play('tap');
    showPause(
      () => restart(),
      () => router.go('menu'),
      () => router.go('store'),
    );
  };

  // ------------------------------------------------------------- lifecycle
  function start(lv: number) {
    level = Math.max(1, lv);
    attempt = 0;
    finished = false;
    busy = false;
    selected = null;
    eng = new Engine(level, attempt);
    buildTools();
    render(true);
    sfx.play('deal', 0.5);

    if (!player.state.tutorialDone && level <= 2) {
      setTimeout(() => runTutorial(root, () => player.markTutorial()), 620);
    }
  }

  function restart() {
    attempt++;
    finished = false;
    busy = false;
    eng = new Engine(level, attempt);
    render(true);
    sfx.play('deal', 0.5);
  }

  let resizeRaf = 0;
  const onResize = () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      if (eng) renderTableau(false);
    });
  };
  window.addEventListener('resize', onResize);

  return {
    name: 'game',
    root,
    onEnter(params) {
      const p = params as GameParams | undefined;
      const want = p?.level ?? player.state.unlocked;
      if (!eng || want !== level) start(want);
      else {
        render();
      }
      if (!player.state.noAds) ads.showBanner();
      void selected;
    },
    onLeave() {
      clearHints();
    },
  };
}
