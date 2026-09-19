import { el } from '../dom';
import { sfx } from '../../platform/audio';

export interface PanelHandle {
  root: HTMLElement;
  panel: HTMLElement;
  close(): void;
}

/** Build a modal overlay. Returns handles so callers can fill/close it. */
export function makePanel(opts: {
  closable?: boolean;
  onClose?: () => void;
  wide?: boolean;
}): PanelHandle {
  const root = el('div', 'overlay');
  const panel = el('div', 'panel');
  root.appendChild(panel);
  document.body.appendChild(root);

  const close = () => {
    root.classList.remove('is-open');
    setTimeout(() => root.remove(), 260);
    opts.onClose?.();
  };

  if (opts.closable !== false) {
    const x = el('button', 'panel__close', '✕');
    x.onclick = () => {
      sfx.play('tap');
      close();
    };
    panel.appendChild(x);
    root.onclick = (e) => {
      if (e.target === root) close();
    };
  }

  requestAnimationFrame(() => root.classList.add('is-open'));
  return { root, panel, close };
}

export function bigBtn(
  label: string,
  variant: 'play' | 'violet' | 'gold' | 'teal',
  onClick: () => void,
  icon?: string,
): HTMLButtonElement {
  const b = el('button', `bigbtn bigbtn--${variant}`) as HTMLButtonElement;
  if (icon) b.appendChild(el('span', 'bigbtn__ico', icon));
  b.appendChild(el('span', '', label));
  b.onclick = () => {
    sfx.play('tap');
    onClick();
  };
  return b;
}
