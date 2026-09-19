#!/usr/bin/env node
// Thin wrapper around the pinned Supabase CLI that guarantees `docker` is on
// PATH (see docker-path.mjs). Used by the sb:* npm scripts, so they work even
// when Docker Desktop's CLI isn't on the shell PATH.
//   node scripts/sb.mjs db reset      ->  supabase db reset
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { envWithDocker } from './docker-path.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const bin = path.join(root, 'node_modules', '.bin', 'supabase');

const r = spawnSync(bin, process.argv.slice(2), {
  cwd: root,
  stdio: 'inherit',
  env: envWithDocker(),
});
process.exit(r.status ?? 1);
