#!/usr/bin/env node
// `npm run contract:build`: usa el script de PowerShell en Windows y el de bash en el resto.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const extra = process.argv.slice(2);
const r =
  process.platform === 'win32'
    ? spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(scripts, 'build-contract.ps1'), ...extra], { stdio: 'inherit' })
    : spawnSync('bash', [path.join(scripts, 'build-contract.sh'), ...extra], { stdio: 'inherit' });
process.exit(r.status ?? 1);
