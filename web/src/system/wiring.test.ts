// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachDelegates, findSoundTarget } from './wiring';

function fx() {
  return { tick: vi.fn(), click: vi.fn(), confirm: vi.fn(), warn: vi.fn() };
}

function pointerOver(target: Element, related: Element | null = null, pointerType = 'mouse') {
  const e = new MouseEvent('pointerover', { bubbles: true, relatedTarget: related });
  Object.defineProperty(e, 'pointerType', { value: pointerType });
  target.dispatchEvent(e);
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('findSoundTarget', () => {
  it('finds links, buttons and opted-in elements', () => {
    document.body.innerHTML =
      '<a id="a" href="#x"><span id="in">x</span></a><button id="b">b</button><div id="d" data-sound></div><p id="p">p</p>';
    expect(findSoundTarget(document.getElementById('in'))?.id).toBe('a');
    expect(findSoundTarget(document.getElementById('b'))?.id).toBe('b');
    expect(findSoundTarget(document.getElementById('d'))?.id).toBe('d');
    expect(findSoundTarget(document.getElementById('p'))).toBeNull();
  });

  it('skips disabled controls and opt-outs', () => {
    document.body.innerHTML =
      '<button id="x" disabled>x</button><div data-sound="off"><button id="y">y</button></div><button id="z" aria-disabled="true">z</button>';
    expect(findSoundTarget(document.getElementById('x'))).toBeNull();
    expect(findSoundTarget(document.getElementById('y'))).toBeNull();
    expect(findSoundTarget(document.getElementById('z'))).toBeNull();
  });
});

describe('attachDelegates', () => {
  it('ticks when a mouse enters a control, once', () => {
    document.body.innerHTML = '<button id="b"><span id="c">c</span></button><p id="p">p</p>';
    const e = fx();
    const detach = attachDelegates(document, e);
    pointerOver(document.getElementById('b') as Element, document.getElementById('p'));
    expect(e.tick).toHaveBeenCalledTimes(1);
    // Moving from the button into its own child is not a new entry.
    pointerOver(document.getElementById('c') as Element, document.getElementById('b'));
    expect(e.tick).toHaveBeenCalledTimes(1);
    detach();
  });

  it('does not tick for touch', () => {
    document.body.innerHTML = '<button id="b">b</button>';
    const e = fx();
    attachDelegates(document, e);
    pointerOver(document.getElementById('b') as Element, null, 'touch');
    expect(e.tick).not.toHaveBeenCalled();
  });

  it('ignores a script clicking (a launched link), which is not a person pressing', () => {
    document.body.innerHTML = '<button id="a">a</button>';
    const e = fx();
    attachDelegates(document, e);
    (document.getElementById('a') as HTMLElement).click();
    expect(e.click).not.toHaveBeenCalled();
  });

  it('plays the press sound for a click, and honours data-sound', () => {
    document.body.innerHTML =
      '<button id="a">a</button><button id="b" data-sound="confirm">b</button><button id="c" data-sound="warn">c</button><button id="d" data-sound="off">d</button>';
    const e = fx();
    attachDelegates(document, e, { trustedOnly: false });
    for (const id of ['a', 'b', 'c', 'd']) (document.getElementById(id) as HTMLElement).click();
    expect(e.click).toHaveBeenCalledTimes(1);
    expect(e.confirm).toHaveBeenCalledTimes(1);
    expect(e.warn).toHaveBeenCalledTimes(1);
  });

  it('detaches cleanly', () => {
    document.body.innerHTML = '<button id="b">b</button>';
    const e = fx();
    const detach = attachDelegates(document, e);
    detach();
    pointerOver(document.getElementById('b') as Element);
    expect(e.tick).not.toHaveBeenCalled();
  });
});
