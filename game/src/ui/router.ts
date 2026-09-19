import { el } from './dom';

export type ScreenName = 'menu' | 'levels' | 'game' | 'store';

export interface Screen {
  name: ScreenName;
  root: HTMLElement;
  onEnter?(params?: unknown): void;
  onLeave?(): void;
}

class Router {
  private screens = new Map<ScreenName, Screen>();
  private host!: HTMLElement;
  current?: ScreenName;
  /** where "back" should go from the current screen */
  private history: ScreenName[] = [];

  mount(host: HTMLElement) {
    this.host = host;
  }

  register(s: Screen) {
    s.root.classList.add('screen');
    this.host.appendChild(s.root);
    this.screens.set(s.name, s);
  }

  go(name: ScreenName, params?: unknown, track = true) {
    if (this.current === name) {
      this.screens.get(name)?.onEnter?.(params);
      return;
    }
    const prev = this.current ? this.screens.get(this.current) : undefined;
    const next = this.screens.get(name);
    if (!next) return;

    prev?.onLeave?.();
    prev?.root.classList.remove('is-active');

    next.onEnter?.(params);
    // force reflow so the transition always plays
    void next.root.offsetHeight;
    next.root.classList.add('is-active');

    if (track && this.current) this.history.push(this.current);
    this.current = name;
  }

  back() {
    const prev = this.history.pop();
    this.go(prev ?? 'menu', undefined, false);
  }
}

export const router = new Router();

/** Shared top bar used by the sub-screens. */
export function topbar(
  title: string,
  onBack: () => void,
  right?: HTMLElement,
): HTMLElement {
  const bar = el('div', 'topbar');
  const back = el('button', 'iconbtn', '›');
  back.style.fontSize = '30px';
  back.style.lineHeight = '0.8';
  back.setAttribute('aria-label', 'بازگشت');
  back.onclick = onBack;
  bar.appendChild(back);
  bar.appendChild(el('div', 'topbar__title', title));
  if (right) bar.appendChild(right);
  else {
    const sp = el('div');
    sp.style.width = '42px';
    bar.appendChild(sp);
  }
  return bar;
}
