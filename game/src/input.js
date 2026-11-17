// input.js — keyboard + mouse state, pointer lock, and the drag-look fallback
// (headless / lock-denied browsers still get mouse aim by dragging).
export function createInput(canvasHost) {
  const keys = new Set();
  const input = {
    keys,
    yawDelta: 0, pitchDelta: 0,
    mouseDown: false, mouseDownRight: false,
    locked: false, lockFailed: false,
    onKey: null,      // (code, down) => void — set by main.js for discrete actions
    onMouseDown: null,
    onMouseUp: null,
  };
  let dragLook = false;
  let lastX = 0, lastY = 0;

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (input.onKey) input.onKey(e.code, true);
    if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (input.onKey) input.onKey(e.code, false);
  });
  window.addEventListener('blur', () => keys.clear());

  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement != null;
  });
  document.addEventListener('mousemove', (e) => {
    if (input.locked) {
      input.yawDelta -= e.movementX * 0.0022;
      input.pitchDelta -= e.movementY * 0.0022;
    } else if (dragLook) {
      input.yawDelta -= (e.clientX - lastX) * 0.0035;
      input.pitchDelta -= (e.clientY - lastY) * 0.0035;
      lastX = e.clientX; lastY = e.clientY;
    }
  });
  document.addEventListener('mousedown', (e) => {
    if (e.target.closest('.overlay, .panel, button')) return;
    if (e.button === 0) { input.mouseDown = true; if (input.onMouseDown) input.onMouseDown(0); }
    if (e.button === 2) { input.mouseDownRight = true; if (input.onMouseDown) input.onMouseDown(2); }
    if (!input.locked && !input.lockFailed) {
      dragLook = true; lastX = e.clientX; lastY = e.clientY;
    }
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) { input.mouseDown = false; if (input.onMouseUp) input.onMouseUp(0); }
    if (e.button === 2) { input.mouseDownRight = false; if (input.onMouseUp) input.onMouseUp(2); }
    dragLook = false;
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  input.requestLock = () => {
    const el = canvasHost;
    if (!el || document.pointerLockElement === el) return;
    try {
      const p = el.requestPointerLock();
      if (p && p.catch) p.catch(() => { input.lockFailed = true; });
    } catch (e) { input.lockFailed = true; }
  };
  input.consumeLook = () => {
    const y = input.yawDelta, p = input.pitchDelta;
    input.yawDelta = 0; input.pitchDelta = 0;
    return [y, p];
  };
  return input;
}
