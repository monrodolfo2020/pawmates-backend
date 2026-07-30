// One-time scaffolding script — generates nest-cli.json and per-app tsconfig
// files for the 14-service monorepo. Not part of the runtime.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SERVICES = [
  'identity-svc',
  'trust-safety-svc',
  'pets-svc',
  'marketplace-svc',
  'booking-svc',
  'payments-svc',
  'gps-svc',
  'messaging-svc',
  'reviews-svc',
  'notifications-svc',
  'support-svc',
  'marketing-svc',
  'analytics-svc',
  'admin-svc',
];

const LIBS = ['common', 'proto'];

const nestCli = {
  $schema: 'https://json.schemastore.org/nest-cli',
  collection: '@nestjs/schematics',
  sourceRoot: 'apps/booking-svc/src',
  monorepo: true,
  root: 'apps/booking-svc',
  compilerOptions: {
    webpack: false,
    tsConfigPath: 'apps/booking-svc/tsconfig.app.json',
    deleteOutDir: true,
  },
  projects: {},
};

for (const svc of SERVICES) {
  nestCli.projects[svc] = {
    type: 'application',
    root: `apps/${svc}`,
    entryFile: 'main',
    sourceRoot: `apps/${svc}/src`,
    compilerOptions: { tsConfigPath: `apps/${svc}/tsconfig.app.json` },
  };
}
for (const lib of LIBS) {
  nestCli.projects[lib] = {
    type: 'library',
    root: `libs/${lib}`,
    entryFile: 'index',
    sourceRoot: `libs/${lib}/src`,
    compilerOptions: { tsConfigPath: `libs/${lib}/tsconfig.lib.json` },
  };
}

fs.writeFileSync(path.join(ROOT, 'nest-cli.json'), JSON.stringify(nestCli, null, 2) + '\n');

const appTsconfig = (svc) => ({
  extends: '../../tsconfig.json',
  compilerOptions: {
    outDir: `../../dist/apps/${svc}`,
    tsBuildInfoFile: `../../dist/apps/${svc}/tsconfig.app.tsbuildinfo`,
  },
  include: ['src/**/*'],
  exclude: ['**/*.spec.ts'],
});

const libTsconfig = (lib) => ({
  extends: '../../tsconfig.json',
  compilerOptions: {
    outDir: `../../dist/libs/${lib}`,
    tsBuildInfoFile: `../../dist/libs/${lib}/tsconfig.lib.tsbuildinfo`,
    declaration: true,
  },
  include: ['src/**/*'],
  exclude: ['**/*.spec.ts'],
});

for (const svc of SERVICES) {
  const dir = path.join(ROOT, 'apps', svc, 'src');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, 'apps', svc, 'tsconfig.app.json'),
    JSON.stringify(appTsconfig(svc), null, 2) + '\n',
  );
}
for (const lib of LIBS) {
  const dir = path.join(ROOT, 'libs', lib, 'src');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, 'libs', lib, 'tsconfig.lib.json'),
    JSON.stringify(libTsconfig(lib), null, 2) + '\n',
  );
}

console.log('Scaffolded', SERVICES.length, 'apps and', LIBS.length, 'libs.');
