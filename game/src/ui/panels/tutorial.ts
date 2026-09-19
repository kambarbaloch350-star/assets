import { T } from '../../core/i18n';
import { el, md } from '../dom';
import { sfx } from '../../platform/audio';

const STEPS: { text: string; anchor?: string }[] = [
  { text: T.tut1, anchor: '.fnd' },
  { text: T.tut2, anchor: '.card--master' },
  { text: T.tut3, anchor: '.fnd' },
  { text: T.tut4, anchor: '[data-stock]' },
  { text: T.tut5 },
];

/** First-run coach marks. Non-blocking: the player can dismiss at any time. */
export function runTutorial(host: HTMLElement, onDone: () => void) {
  const layer = el('div', 'tut');
  const bubble = el('div', 'tut__bubble');
  const hand = el('div', 'tut__hand');
  layer.append(hand, bubble);
  host.appendChild(layer);
  requestAnimationFrame(() => layer.classList.add('is-on'));

  let i = 0;

  const next = el('button', 'tut__next', T.gotIt);
  const skip = el('button', '');
  skip.textContent = T.skip;
  skip.style.cssText =
    'margin-top:8px;font-size:12px;color:var(--muted);font-weight:700;width:100%';

  function place() {
    const s = STEPS[i];
    bubble.innerHTML = md(s.text);
    bubble.append(next, skip);

    if (s.anchor) {
      const t = host.querySelector(s.anchor) as HTMLElement | null;
      if (t) {
        const r = t.getBoundingClientRect();
        hand.style.display = 'block';
        hand.style.left = `${r.left + r.width / 2 - 14}px`;
        hand.style.top = `${r.top + r.height * 0.55}px`;
      } else hand.style.display = 'none';
    } else {
      hand.style.display = 'none';
    }
    next.textContent = i === STEPS.length - 1 ? T.gotIt : 'بعدی ›';
  }

  next.onclick = () => {
    sfx.play('tap');
    i++;
    if (i >= STEPS.length) return finish();
    place();
  };
  skip.onclick = () => {
    sfx.play('tap');
    finish();
  };

  function finish() {
    layer.classList.remove('is-on');
    setTimeout(() => layer.remove(), 320);
    onDone();
  }

  place();
}
