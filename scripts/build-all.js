// Builds every app defined in nest-cli.json. Used by `npm run build` and CI.
const { execSync } = require('child_process');
const nestCli = require('../nest-cli.json');

const apps = Object.entries(nestCli.projects)
  .filter(([, def]) => def.type === 'application')
  .map(([name]) => name);

let failed = [];
for (const app of apps) {
  console.log(`\n=== building ${app} ===`);
  try {
    execSync(`npx nest build ${app}`, { stdio: 'inherit' });
  } catch (e) {
    failed.push(app);
  }
}

if (failed.length) {
  console.error(`\nFAILED: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`\nAll ${apps.length} apps built successfully.`);
