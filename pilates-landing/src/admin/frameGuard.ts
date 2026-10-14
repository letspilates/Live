// The portal refuses to run inside a frame, so another site can't show it under a decoy
// and trick a signed-in owner into clicks (clickjacking). GitHub Pages can't send a
// frame-ancestors header and a <meta> CSP can't set one, so main.tsx imports this first:
// in a frame it throws before any other portal code runs, so nothing is drawn and the
// sign-in is never read.
if (window.top !== window.self) {
  throw new Error('The studio admin does not run inside a frame. Open it in its own tab.');
}

export {};
