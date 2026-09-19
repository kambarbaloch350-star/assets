/** Minimal DOM helpers (no framework — keeps the bundle tiny and fast). */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (html !== undefined) n.innerHTML = html;
  return n;
}

export function clear(node: HTMLElement) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function on<K extends keyof HTMLElementEventMap>(
  node: HTMLElement,
  ev: K,
  fn: (e: HTMLElementEventMap[K]) => void,
  opts?: AddEventListenerOptions,
) {
  node.addEventListener(ev, fn as EventListener, opts);
  return () => node.removeEventListener(ev, fn as EventListener, opts);
}

/** Bold markup used by tutorial strings: *word* → <b>word</b> */
export function md(s: string): string {
  return s.replace(/\*([^*]+)\*/g, '<b>$1</b>');
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function raf(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

/** Floating "+50" style label that drifts up and fades. */
export function floatText(x: number, y: number, text: string, cls = '') {
  const n = el('div', `float-text ${cls}`, text);
  n.style.left = `${x}px`;
  n.style.top = `${y}px`;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 1400);
}

/** Brief toast at the bottom of the screen. */
let toastTimer: number | undefined;
export function toast(msg: string, kind: 'info' | 'warn' | 'good' = 'info') {
  let t = document.querySelector('.toast') as HTMLElement | null;
  if (!t) {
    t = el('div', 'toast');
    document.body.appendChild(t);
  }
  t.className = `toast toast--${kind} is-open`;
  t.textContent = msg;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t!.classList.remove('is-open'), 2100);
}

/** Confetti burst for wins. */
export function confetti(root: HTMLElement, count = 70) {
  const colors = ['#f6c445', '#e8574a', '#31b0a7', '#8b5cf6', '#f0f4ff', '#f59f3d'];
  for (let i = 0; i < count; i++) {
    const p = el('i', 'confetti');
    p.style.background = colors[i % colors.length];
    p.style.left = `${Math.random() * 100}%`;
    p.style.animationDelay = `${Math.random() * 0.5}s`;
    p.style.animationDuration = `${1.5 + Math.random() * 1.4}s`;
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    if (i % 3 === 0) p.style.borderRadius = '50%';
    root.appendChild(p);
    setTimeout(() => p.remove(), 3200);
  }
}
