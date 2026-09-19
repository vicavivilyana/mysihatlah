// The Supabase CLI shells out to `docker`. Docker Desktop doesn't always put
// its CLI on the shell PATH (e.g. it lives in ~/.docker/bin), which makes the
// CLI fail with "docker: command not found". Every script here resolves it
// itself so the npm commands work regardless of shell configuration.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CANDIDATE_DIRS = [
  path.join(os.homedir(), '.docker', 'bin'),
  '/Applications/Docker.app/Contents/Resources/bin',
  '/usr/local/bin',
  '/opt/homebrew/bin',
  '/usr/bin',
];

/** PATH with any directory that actually contains a `docker` binary prepended. */
export function pathWithDocker(basePath = process.env.PATH ?? '') {
  const existing = basePath.split(path.delimiter);
  const found = CANDIDATE_DIRS.filter(
    (dir) => !existing.includes(dir) && fs.existsSync(path.join(dir, 'docker')),
  );
  return found.length ? [...found, ...existing].join(path.delimiter) : basePath;
}

/** process.env with the docker-aware PATH. */
export function envWithDocker(base = process.env) {
  return { ...base, PATH: pathWithDocker(base.PATH ?? '') };
}
