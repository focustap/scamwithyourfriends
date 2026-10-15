import { test, expect } from '@playwright/test';

// Browser speech providers are external and do not run in headless Chromium.
// These doubles exercise our actual microphone/speech event wiring deterministically.
async function speechMocks(page) {
  await page.addInitScript(() => {
    window.__spoken = [];
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, 'speechSynthesis', { value: {
      getVoices: () => [{ lang: 'en-US' }], cancel() {},
      speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend?.(), 100); },
    } });
    window.SpeechRecognition = class {
      constructor() { window.__recognizer = this; }
      start() { this.onstart?.(); }
      stop() { this.onend?.(); }
      abort() {}
    };
  });
}
test('two browsers play a voice call, help with a computer, share earnings and reconnect', async ({ browser }) => {
  const ctxA = await browser.newContext(), ctxB = await browser.newContext();
  const a = await ctxA.newPage(), b = await ctxB.newPage();
  const errors = []; a.on('pageerror', e => errors.push(e.message)); b.on('pageerror', e => errors.push(e.message));
  await speechMocks(a); await speechMocks(b);
  await a.goto('http://127.0.0.1:4173/scamwithyourfriends/');
  await a.locator('#playerName').fill('Host'); await a.locator('#enterBtn').click();
  await expect(a.locator('#app')).toBeVisible();
  const code = await a.locator('.roomCode').textContent();
  await expect(a.locator('#startShift')).toBeDisabled();
  await b.goto('http://127.0.0.1:4173/scamwithyourfriends/');
  await b.locator('#playerName').fill('Teammate'); await b.locator('#roomCode').fill(code); await b.locator('#joinBtn').click();
  await expect(b.locator('#app')).toBeVisible(); await expect(a.locator('#startShift')).toBeEnabled();
  await a.locator('#startShift').click(); await a.locator('[data-call="doug"]').click();
  await expect(a.locator('#transcript')).toBeVisible(); await expect(b.locator('[data-call="doug"]')).toBeDisabled();
  await expect.poll(() => a.evaluate(() => window.__spoken.length)).toBeGreaterThan(0);
  await a.locator('#pitchInput').fill('Keep this draft while my teammate helps.');
  await b.locator('[data-app="computer"]').click();
  const sequence = await b.locator('.pcScreen .mono span').allTextContents();
  for (const answer of sequence) await b.locator(`[data-answer="${answer}"]`).click();
  await expect(b.locator('.pcScreen .infoBox')).toContainText('TOTAL DUE');
  const invoice = (await b.locator('.pcScreen .infoBox').textContent()).match(/\d+/)[0];
  await b.locator(`[data-answer="${invoice}"]`).click();
  await expect(b.locator('.pcScreen')).toContainText('VERIFIED');
  await expect(a.locator('#pitchInput')).toHaveValue('Keep this draft while my teammate helps.');
  await a.locator('#pitchInput').fill('');
  await a.locator('#micBtn').click(); await expect(a.locator('#micBtn')).toContainText('STOP');
  await a.evaluate(() => {
    const result = [{ transcript: 'Please tell me about your lawn flamingos.' }]; result.isFinal = true;
    window.__recognizer.onresult({ resultIndex: 0, results: [result] });
  });
  await a.locator('#micBtn').click();
  await expect(a.locator('#transcript')).toContainText('Please tell me about your lawn flamingos.');
  await expect(a.locator('#leftPanel')).toContainText('Turn 1/12');
  await a.locator('[data-app="settings"]').click();
  await a.locator('#handsfreeSetting').check();
  await a.locator('[data-app="phone"]').click();
  await a.waitForTimeout(1300);
  await a.locator('#pitchInput').fill('I appreciate your concerns. Our imaginary antenna respects flamingos.');
  await a.locator('#pitchForm button.actionbtn').click();
  await expect(a.locator('#dealBtn')).toBeEnabled();
  await expect.poll(() => a.evaluate(() => window.__spoken.length)).toBeGreaterThanOrEqual(3);
  await expect(a.locator('#micBtn')).toContainText('STOP');
  await a.screenshot({ path: 'test-results/desktop-call.png', fullPage: true });
  await a.locator('#dealBtn').click();
  await expect(a.locator('#earnings')).toHaveText('$400'); await expect(b.locator('#earnings')).toHaveText('$400');
  await b.reload(); await b.locator('#enterBtn').click();
  await expect(b.locator('#app')).toBeVisible(); await expect(b.locator('#earnings')).toHaveText('$400');
  await a.locator('#endShift').click();
  await expect(a.locator('#overlay')).toContainText('SHIFT COMPLETE'); await expect(b.locator('#overlay')).toContainText('SHIFT COMPLETE');
  await a.locator('#nextShift').click(); await expect(a.locator('#earnings')).toHaveText('$0');
  await expect(b.locator('[data-call="doug"]')).toBeEnabled();
  expect(errors).toEqual([]); await ctxA.close(); await ctxB.close();
});
test('unsupported speech keeps typed calls available and a small screen fits', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; });
  await page.goto('http://127.0.0.1:4173/scamwithyourfriends/'); await page.locator('#enterBtn').click();
  await expect(page.locator('#app')).toBeVisible(); await page.locator('[data-app="settings"]').click();
  await expect(page.locator('#leftPanel')).toContainText('Recognition unavailable');
  await expect(page.locator('#handsfreeSetting')).toBeDisabled();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(fits).toBe(true);
});
