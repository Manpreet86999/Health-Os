import { spawnSync } from 'node:child_process';

/** Checks the optional local Docling runtime without downloading models or sending documents anywhere. */
export function doclingStatus() {
  const python = process.platform === 'win32' ? 'py' : 'python3';
  const result = spawnSync(python, ['-3', '-c', 'import docling; print(docling.__version__)'], { encoding:'utf8', timeout:5000, windowsHide:true });
  if (result.status === 0) return { available:true, version:result.stdout.trim(), command:python };
  return { available:false, message:'Install Python 3.10+ and Docling on this PC before importing PDF, Office, image, or scanned documents.' };
}
