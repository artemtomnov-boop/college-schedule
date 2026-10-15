import { fetchAndParseAll } from '../lib/update.js';

(async () => {
  const schedules = await fetchAndParseAll();
  for (const s of schedules) {
    console.log(`\n=== ${s.buildingName} (${s.lessons.length} занятий) ===`);
    console.log(s.lessons.slice(0, 20));
  }
})();