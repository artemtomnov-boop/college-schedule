import { runFullUpdate } from '../lib/update.js';

(async () => {
  await runFullUpdate();
  console.log('Готово.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});