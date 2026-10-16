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
test('Pages preview uses the local Socket.IO server, never production Render', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/scamwithyourfriends/');
  await expect(page.locator('#backendUrl')).toHaveValue('http://127.0.0.1:3000');
});

test('two browsers play a voice call, help with a computer, share earnings and reconnect', async ({ browser }) => {
  const ctxA = await browser.newContext(), ctxB = await browser.newContext();
  const a = await ctxA.newPage(), b = await ctxB.newPage();
  const errors = []; a.on('pageerror', e => errors.push(e.message)); b.on('pageerror', e => errors.push(e.message));
  await speechMocks(a); await speechMocks(b);
  await a.goto('http://127.0.0.1:4173/scamwithyourfriends/');
  await a.locator('#playerName').fill('Host'); await a.locator('#enterBtn').click();
  await expect(a.locator('#app')).toBeVisible();
  const code = await a.locator('.roomCode').textContent();
  await expect(a.locator('#startShift')).toBeEnabled();
  await b.goto('http://127.0.0.1:4173/scamwithyourfriends/');
  await b.locator('#playerName').fill('Teammate'); await b.locator('#roomCode').fill(code); await b.locator('#joinBtn').click();
  await expect(b.locator('#app')).toBeVisible(); await expect(a.locator('#startShift')).toBeEnabled();
  await a.locator('#startShift').click();
  const firstCustomer=await a.locator('[data-call]').first().getAttribute('data-call');
  await a.locator('[data-call="'+firstCustomer+'"]').click();
  await expect(a.locator('#transcript')).toBeVisible(); await expect(b.locator('[data-call="'+firstCustomer+'"]')).toBeDisabled();
  await expect(a.locator('[data-quick]')).toHaveCount(0);
  await a.locator('#pitchInput').fill('Keep this draft while my teammate helps.');
  await b.locator('[data-app="computer"]').click();
  await b.locator('#terminalInput').fill('scan'); await b.locator('#terminalForm button').click();
  await expect(b.locator('#terminalLog')).toContainText('Fault detected');
  const fault = (await b.locator('#terminalLog').textContent()).match(/Fault detected in (\w+)/)[1];
  await b.locator('#terminalInput').fill('repair ' + fault); await b.locator('#terminalForm button').click();
  await b.locator('[data-program=router]').click();
  const sequence = await b.locator('.pcScreen .mono span').allTextContents();
  for (const answer of sequence) await b.locator(`[data-answer="${answer}"]`).click();
  await b.locator('[data-program=invoice]').click();
  const items = (await b.locator('#invoiceItems').textContent()).match(/\d+/g).map(Number);
  const invoice = items[0] * items[1] + items[2] - items[3];
  await b.locator('#invoiceInput').fill(String(invoice)); await b.locator('#invoiceForm button').click();
  await expect(b.locator('.pcScreen')).toContainText('VERIFIED');
  await expect(a.locator('#pitchInput')).toHaveValue('Keep this draft while my teammate helps.');
  await a.locator('#pitchInput').fill('');
  await a.locator('#micBtn').click(); await expect(a.locator('#micBtn')).toContainText('STOP');
  await a.evaluate(() => {
    const result = [{ transcript: 'The price is forty imaginary dollars and there is no recurring bill.' }]; result.isFinal = true;
    window.__recognizer.onresult({ resultIndex: 0, results: [result] });
  });
  await a.locator('#micBtn').click();
  await expect(a.locator('#transcript')).toContainText('The price is forty imaginary dollars and there is no recurring bill.');
  await expect(a.locator('#leftPanel')).toContainText('Turn 1/12');
  await a.locator('[data-app="settings"]').click();
  await a.locator('#handsfreeSetting').check();
  await a.locator('[data-app="phone"]').click();
  await a.waitForTimeout(1300);
  await a.locator('#pitchInput').fill('The antenna detects squirrels near the seven lawn flamingos.');
  await a.locator('#pitchForm button.actionbtn').click();
  await expect(a.locator('#dealBtn')).toBeEnabled();
  await expect(a.locator('.salesObjective')).toContainText('SELL:');
  await expect(a.locator('.pitchMark')).toHaveCount(3);
  await a.waitForTimeout(1300);
  await a.locator('#pitchInput').fill('We can test this fictional device, and I cannot guarantee real results.');
  await a.locator('#pitchForm button.actionbtn').click();
  await expect(a.locator('#dealBtn')).toBeEnabled();
  await expect.poll(() => a.evaluate(() => window.__spoken.length)).toBeGreaterThanOrEqual(3);
  await expect(a.locator('#micBtn')).toContainText('STOP');
  await a.screenshot({ path: 'test-results/desktop-call.png', fullPage: true });
  await a.locator('#dealBtn').click();
  // Probability rolls are covered deterministically in server tests; this checks synced money either way.
  await a.waitForTimeout(250);
  const earnings=await a.locator('#earnings').textContent();
  await expect(b.locator('#earnings')).toHaveText(earnings);
  await b.reload(); await b.locator('#enterBtn').click();
  await expect(b.locator('#app')).toBeVisible(); await expect(b.locator('#earnings')).toHaveText(earnings);
  await a.locator('#endShift').click();
  await expect(a.locator('#overlay')).toContainText('DAY 1 COMPLETE'); await expect(b.locator('#overlay')).toContainText('DAY 1 COMPLETE');
  await a.locator('#nextShift').click(); await expect(a.locator('#earnings')).toHaveText(earnings);
  await expect(b.locator('[data-call]').first()).toBeEnabled();
  expect(errors).toEqual([]); await ctxA.close(); await ctxB.close();
});
test('unsupported speech keeps typed calls available and a small screen fits', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; });
  await page.goto('http://127.0.0.1:4173/scamwithyourfriends/'); await page.locator('#enterBtn').click();
  await expect(page.locator('#app')).toBeVisible(); await page.locator('[data-app="settings"]').click();
  await expect(page.locator('#settingsPanel')).toContainText('Recognition unavailable');
  await expect(page.locator('#handsfreeSetting')).toBeDisabled();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(fits).toBe(true);
});

test('desktop windows drag, minimize and restore; calculator and notes work',async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/scamwithyourfriends/'); await page.locator('#enterBtn').click();
  await page.locator('[data-app=calculator]').click();
  await page.locator('#calculatorInput').fill('(40 * 3) + 7 - 2'); await page.locator('#calculatorForm button').click();
  await expect(page.locator('#calculatorResult')).toHaveText('125');
  const win = page.locator('[data-window=calculator]'), before = await win.boundingBox();
  const head = await win.locator('.windowhead').boundingBox();
  await page.mouse.move(head.x + 70,head.y + 20); await page.mouse.down(); await page.mouse.move(head.x + 190,head.y + 70); await page.mouse.up();
  const after = await win.boundingBox(); expect(after.x).toBeGreaterThan(before.x + 70);
  await page.getByRole('button',{ name:'Minimize CALCULATOR',exact:true }).click(); await expect(win).toBeHidden();
  await page.locator('[data-task=calculator]').click(); await expect(win).toBeVisible();
  await page.getByRole('button',{ name:'Maximize CALCULATOR',exact:true }).click(); await expect(win).toHaveClass(/maximized/);
  await page.getByRole('button',{ name:'Close CALCULATOR',exact:true }).click();
  await page.locator('[data-app=notes]').click(); await page.locator('#deskNotes').fill('Doug wants clear cancellation terms.');
  await page.getByRole('button',{ name:'Minimize NOTEPAD',exact:true }).click();
  await page.locator('[data-task=notes]').click(); await expect(page.locator('#deskNotes')).toHaveValue('Doug wants clear cancellation terms.');
  await page.locator('[data-app=files]').click(); await page.locator('[data-file=concerns]').click();
  await expect(page.locator('#filesPanel')).toContainText('cost');
});

test('solo room can start immediately and closing odds are visible without repairing computer',async({page})=>{
  await page.goto('http://127.0.0.1:4173/scamwithyourfriends/');
  await page.locator('#enterBtn').click();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#startShift')).toBeEnabled();
  await page.locator('#startShift').click();
  await expect(page.locator('#remaining')).toHaveText('$600');
  await page.locator('[data-call]').first().click();
  await expect(page.locator('.salesObjective')).toContainText('SELL:');
  await expect(page.locator('.pitchMark')).toHaveCount(3);
  await expect(page.locator('#dealBtn')).toBeEnabled();
  await expect(page.locator('#openComputer')).toContainText('OPTIONAL');
  await expect(page.locator('#dealBtn')).toContainText('%');
  await expect(page.locator('#leftPanel')).not.toContainText('fictional');
});
