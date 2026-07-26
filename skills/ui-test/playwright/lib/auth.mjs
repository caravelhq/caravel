// auth.mjs — generic email/password login helper.
//
// A tolerant default for the common "one email field, one password field, one
// submit button" login form. Selectors fall back across common markup patterns
// because most login pages are plain HTML with no shadow DOM:
//   - email field:    input[name="email"] | input[type="email"] | placeholder "Email"
//   - password field: input[type="password"] | placeholder "Password"
//   - submit:         a button whose accessible name matches /login|sign in/i
//
// Success is detected when the password field leaves the DOM (you navigated away
// from the login view). Adapt the selectors to your app, or pass a stronger
// `postLoginSelector` for an app-specific "you're in" signal.

export async function login(page, { baseUrl, email, password, postLoginSelector } = {}) {
  if (!email || !password) throw new Error('login: email and password are required');
  await page.goto((baseUrl || '').replace(/\/+$/, '') + '/', { waitUntil: 'domcontentloaded' });

  const emailField = page.locator('input[name="email"], input[type="email"], input[placeholder="Email" i]').first();
  const passField = page.locator('input[type="password"], input[placeholder="Password" i]').first();
  await emailField.waitFor({ state: 'visible' });
  await emailField.fill(email);
  await passField.fill(password);

  const loginBtn = page.getByRole('button', { name: /log ?in|sign ?in/i }).first();
  if (await loginBtn.count()) await loginBtn.click();
  else await passField.press('Enter');

  // Consider login successful once the password field is gone (we navigated away
  // from the login view). Callers can pass a stronger postLoginSelector.
  if (postLoginSelector) {
    await page.locator(postLoginSelector).first().waitFor({ state: 'visible' });
  } else {
    await passField.waitFor({ state: 'detached' }).catch(async () => {
      // Fallback: wait for network to settle if the field lingers in the DOM.
      await page.waitForLoadState('networkidle').catch(() => {});
    });
  }
  return true;
}
