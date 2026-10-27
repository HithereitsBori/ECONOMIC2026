import path from 'node:path';
import { build } from '../../scripts/build.mjs';

const PUB = (key, gid) => `https://docs.google.com/spreadsheets/d/e/${key}/pub?gid=${gid}&single=true&output=csv`;
export const TEST_ENV = {
  SCHEDULE_CSV_URL: PUB('TESTPUBLIC', 1),
  PUBLIC_FAQ_CSV_URL: PUB('TESTPUBLIC', 2),
  STAFF_FAQ_CSV_URL: PUB('TESTSTAFF', 3),
  BUILD_ID: 'e2e',
};

export default async function globalSetup() {
  const root = path.resolve('.tmp/e2e');
  await build({ audience: 'attendee', outDir: path.join(root, 'attendee'), env: TEST_ENV });
  await build({ audience: 'staff', outDir: path.join(root, 'staff'), env: TEST_ENV });
  await build({ audience: 'attendee', outDir: path.join(root, 'unconfigured'), env: { BUILD_ID: 'e2e' } });
  await build({ audience: 'attendee', outDir: path.join(root, 'fixtures'), env: { BUILD_ID: 'e2e' }, fixtures: true });
  await build({ audience: 'staff', outDir: path.join(root, 'fixtures-staff'), env: { BUILD_ID: 'e2e' }, fixtures: true });
}

// Run directly by playwright's webServer (webServer starts before globalSetup).
if (process.argv[1] && process.argv[1].endsWith('build-e2e.mjs')) {
  globalSetup().then(() => console.log('e2e sites built in .tmp/e2e'));
}
