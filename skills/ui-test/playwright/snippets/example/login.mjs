// snippet: example / login
// area:     authentication
// authored: —
// verified: PENDING (adapt selectors + verify against your app)
//
// Logs in as a persona resolved from .claude/config.json#ui-test.<app>.credentials.
// This is the canonical building block — most specs that need auth start with it.
//
//   import { loginAsPersona } from '../snippets/example/login.mjs';
//   await t.step('login', async () => { await loginAsPersona(t.page, { app: 'app', persona: 'Dev1' }); });

import { resolveContext } from '../../lib/harness.mjs';
import { login } from '../../lib/auth.mjs';

export async function loginAsPersona(page, { app = 'app', persona, postLoginSelector } = {}) {
  const ctx = resolveContext({ app, persona });
  if (!ctx.persona) throw new Error(`No credential for persona "${persona}" in .claude/config.json#ui-test.${app}.credentials`);
  if (!ctx.persona.password) throw new Error(`Credential "${ctx.persona.name}" has no password configured`);
  return login(page, {
    baseUrl: ctx.baseUrl,
    email: ctx.persona.email,
    password: ctx.persona.password,
    postLoginSelector,
  });
}
