import { spawn } from 'node:child_process';
import electron from 'electron';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.TOOLKIT_DEV;
const child = spawn(electron, ['tests/smoke-electron.mjs', ...process.argv.slice(2)], { env, windowsHide: true, stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
