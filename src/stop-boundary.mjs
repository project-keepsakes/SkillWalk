import fs from 'node:fs/promises';
export async function checkStopBoundary() {
  const file = process.env.SKILLWALK_STOP_FILE;
  if (!file) return;
  try { await fs.access(file); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw Error('Stopped at the requested operation boundary.');
}
