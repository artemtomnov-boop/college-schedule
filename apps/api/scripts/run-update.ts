import { runFullUpdate } from '../lib/update.ts';

(async () => {
  await runFullUpdate();
  console.log('Готово.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});