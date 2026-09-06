// Run with agent-browser eval --stdin in a local test room (waiting or finished).
// Uses the real UI and WebSocket server; composition events are synthetic, not a native keyboard test.
(async () => {
  const report = [];
  const field = document.querySelector('#wordInput');
  const form = document.querySelector('#wordForm');
  const button = form.querySelector('button');
  const hint = document.querySelector('#hintButton');
  const until = async (fn, timeout = 16000) => {
    const end = Date.now() + timeout;
    while (!fn()) {
      if (Date.now() > end) throw new Error('Timed out: ' + fn.toString());
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  };
  const check = (name, condition) => { if (!condition) throw new Error(name); report.push(name); };
  const type = value => {
    field.dispatchEvent(new InputEvent('beforeinput', {bubbles: true, inputType: 'insertText', data: value}));
    field.value = value;
    field.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: value}));
  };
  const start = document.querySelector('#resultOverlay').hidden ? document.querySelector('#startButton') : document.querySelector('#rematchButton');
  start.click();
  await until(() => !button.disabled);
  field.focus({preventScroll: true});
  await until(() => document.activeElement === field);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const before = field.getBoundingClientRect();
  const required = document.querySelector('#requiredSyllable').getBoundingClientRect();
  const timer = document.querySelector('#timerText').getBoundingClientRect();
  const viewport = window.visualViewport;
  check('input-visible-above-viewport-bottom', before.bottom <= viewport.offsetTop + viewport.height && before.top >= viewport.offsetTop);
  check('required-syllable-and-timer-visible', required.top >= viewport.offsetTop && required.bottom <= before.top && timer.top >= viewport.offsetTop && timer.bottom <= before.top);
  check('no-horizontal-overflow', document.documentElement.scrollWidth <= innerWidth + 1);

  type(document.querySelector('#requiredSyllable').textContent + '뷁쀍');
  form.requestSubmit();
  check('submit-immediately-clears-input', field.value === '');
  await until(() => form.classList.contains('invalid'));
  check('rejected-word-is-not-restored', field.value === '');
  check('rejection-keeps-focus', document.activeElement === field && !field.disabled);

  hint.click();
  await until(() => field.value.length > 0);
  const known = field.value;
  form.requestSubmit();
  await until(() => document.querySelector('#wordHistory').textContent.includes(known));
  check('accepted-dictionary-word-clears-input', field.value === '');
  check('opponent-turn-keeps-keyboard-focus', document.activeElement === field && !field.disabled);
  check('opponent-cannot-submit', button.disabled);
  type('이전값');
  await until(() => !button.disabled);
  check('next-turn-starts-empty-with-same-input-node', field.value === '' && field === document.querySelector('#wordInput') && document.activeElement === field);

  hint.click(); await until(() => field.value.length > 0);
  const composedWord = field.value;
  field.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}));
  const imeEnter = new KeyboardEvent('keydown', {key: 'Enter', isComposing: true, bubbles: true, cancelable: true});
  field.dispatchEvent(imeEnter);
  check('composition-enter-prevented', imeEnter.defaultPrevented);
  form.requestSubmit();
  check('composition-does-not-submit', field.value === composedWord && form.getAttribute('aria-busy') === 'false');
  field.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: composedWord}));
  await new Promise(resolve => setTimeout(resolve, 100));
  form.requestSubmit();
  await until(() => document.querySelector('#wordHistory').textContent.includes(composedWord));
  check('committed-korean-word-submits-once', field.value === '');

  field.blur();
  await until(() => !button.disabled);
  check('dismissed-keyboard-is-not-forced-open', document.activeElement !== field);
  field.focus({preventScroll: true}); type('미완성');
  await until(() => field.value === '', 16000);
  check('timeout-clears-incomplete-draft', field.value === '');
  check('timeout-does-not-disable-surviving-player-input', !field.disabled);
  return {passed: report.length, checks: report, viewport: {width: innerWidth, height: innerHeight}, nativeKeyboardTested: false};
})()
