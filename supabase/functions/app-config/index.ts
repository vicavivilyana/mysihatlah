// app-config: tiny PUBLIC endpoint describing how this backend is configured.
// It exists so the client can show a persistent "DEMO" badge without DEMO_MODE
// ever becoming a VITE_ variable (the flag stays server-side and authoritative).
//
// Returns no secrets — only posture the UI must surface. verify_jwt = false
// because the badge has to render before anyone logs in.
import { serve } from '../_shared/serve.ts';
import { isDemoMode } from '../_shared/demo.ts';
import { optionalEnv } from '../_shared/env.ts';

const FN = 'app-config';

serve(FN, (_req, res) =>
  Promise.resolve(
    res.json({
      demo_mode: isDemoMode(),
      policy_version: optionalEnv('POLICY_VERSION') ?? null,
    }),
  ),
);
