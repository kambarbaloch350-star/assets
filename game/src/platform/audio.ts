import { player } from '../core/save';

/** Tiny pooled sfx player using the original game's .ogg bank. */
const BANK = {
  tap: 'sfx_ui_tap.ogg',
  bubble: 'sfx_ui_bubble.ogg',
  swoosh: 'sfx_ui_swoosh.ogg',
  cash: 'sfx_ui_cash.ogg',
  reward: 'sfx_ui_reward.ogg',
  slide1: 'sfx_card_slide1.ogg',
  slide2: 'sfx_card_slide2.ogg',
  slide3: 'sfx_card_slide3.ogg',
  move: 'sfx_card_move.ogg',
  deal: 'sfx_cards_dealing.ogg',
  discard: 'sfx_cards_discard.ogg',
  place: 'sfx_foundation_card_added.ogg',
  complete: 'sfx_foundation_success.ogg',
  hint: 'sfx_hint.ogg',
  undo: 'sfx_undo.ogg',
  win: 'sfx_win.ogg',
} as const;

export type Sfx = keyof typeof BANK;

class Audio2 {
  private pool = new Map<Sfx, HTMLAudioElement[]>();
  private unlocked = false;

  preload() {
    (Object.keys(BANK) as Sfx[]).forEach((k) => {
      const a = new Audio(`./sfx/${BANK[k]}`);
      a.preload = 'auto';
      a.volume = 0.55;
      this.pool.set(k, [a]);
    });
    const unlock = () => {
      this.unlocked = true;
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
  }

  play(k: Sfx, volume = 0.55) {
    if (!player.state.sound || !this.unlocked) return;
    let arr = this.pool.get(k);
    if (!arr) {
      arr = [new Audio(`./sfx/${BANK[k]}`)];
      this.pool.set(k, arr);
    }
    let a = arr.find((x) => x.paused || x.ended);
    if (!a) {
      if (arr.length > 6) return;
      a = new Audio(`./sfx/${BANK[k]}`);
      arr.push(a);
    }
    a.volume = volume;
    a.currentTime = 0;
    void a.play().catch(() => {});
  }

  /** Randomised card slide for a natural feel. */
  slide() {
    const k: Sfx[] = ['slide1', 'slide2', 'slide3'];
    this.play(k[Math.floor(Math.random() * k.length)], 0.4);
  }
}

export const sfx = new Audio2();
