'use strict';
const assert = require('node:assert/strict');
const { readFileSync, realpathSync } = require('node:fs');
const { createRequire } = require('node:module');
const { dirname, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { withContentManagerSidebar } = require('./index.cjs');

for (const root of (process.env.STRAPI_FIXTURES ?? '').split(':').filter(Boolean)) {
  test('transforms the native Content Manager module loaded from ' + root, () => {
    const appRequire = createRequire(resolve(root, 'package.json'));
    const strapiRequire = createRequire(appRequire.resolve('@strapi/strapi/package.json'));
    const path = realpathSync(resolve(dirname(strapiRequire.resolve('@strapi/content-manager/package.json')), 'dist/admin/components/LeftMenu.mjs'));
    const { plugins } = withContentManagerSidebar({});
    const [plugin] = plugins;
    plugin.configResolved({ root });
    const { code } = plugin.transform(readFileSync(path, 'utf8'), path);
    assert.match(code, /SubNav.Link/);
    assert.match(code, /organizer.sections.map/);
    assert.equal(spawnSync(process.execPath, ['--input-type=module', '--check'], { input: code }).status, 0);
    plugin.generateBundle.call({ error: assert.fail });
  });
}
