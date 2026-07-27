// The unframed home for this piece.
//
// It matters that this is a *different origin* to wherever the page happens to
// be embedded. An embedded copy is typically sandboxed, which silently blocks
// target="_blank", and hosts that provide an escape channel only forward links
// that leave their origin — a same-origin link is exactly the one that cannot
// get out. So the way out has to point somewhere else entirely.
export const PAGES_URL = 'https://izelniego.github.io/mobile-scratchpad/';

// iOS in-app browsers (WKWebView inside another app) generally will not hand
// over the motion sensors even on an unframed page. This scheme asks iOS to
// reopen the URL in Safari proper. Undocumented and not universally honoured,
// which is why it sits beside the copyable URL rather than in place of it.
export const SAFARI_URL = PAGES_URL.replace(/^https:/, 'x-safari-https:');

export const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
