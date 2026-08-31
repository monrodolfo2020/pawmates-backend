// Plain JS on purpose (see README's Deploying to Vercel section): the
// actual Nest app is TypeScript with decorators, compiled ahead of time
// by `npm run build` (this file's require() below only resolves once
// vercel.json's buildCommand has run) — routing this file itself through
// Vercel's own TS bundler would risk it not honoring
// experimentalDecorators/emitDecoratorMetadata or the @pawmates/common
// path alias the same way our own `nest build` does.
module.exports = require('../dist/apps/pawmates-api/apps/pawmates-api/src/serverless').default;
