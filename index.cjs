'use strict';

const { realpathSync } = require('node:fs');
const { createRequire } = require('node:module');
const { dirname, resolve } = require('node:path');

const dependency = '@strapi/content-manager';
const virtualId = 'virtual:3xweb-content-manager-sidebar';

function patchSidebar(code) {
  function replaceOnce(anchor, replacement) {
    if (code.split(anchor).length !== 2) {
      throw new Error('[content-manager-sidebar] Unsupported Strapi sidebar source: ' + anchor);
    }
    code = code.replace(anchor, () => replacement);
  }

  replaceOnce("const COLLAPSED_FOLDERS_KEY", `
import { createSidebarControls } from '${virtualId}';
const useSidebarControls = createSidebarControls(React, { Box, Flex, Typography, TextInput, IconButton, Button, Dialog, Cog, Check, Plus, ArrowClockwise, Drag, Trash, ArrowUp, ArrowRight });
const COLLAPSED_FOLDERS_KEY`);
  code = "import { Button, Dialog, IconButton, TextInput } from '@strapi/design-system';\nimport { Cog, Check, Plus, ArrowClockwise, Drag, Trash, ArrowUp, ArrowRight } from '@strapi/icons';\n" + code;
  replaceOnce("    const trimmedSearch = search.trim();", `
    const [sidebarLayout, saveSidebarLayout] = useScopedPersistentState('3XWEB_CM_SIDEBAR_LAYOUT_V1', null);
    const organizer = useSidebarControls(sections, [...collectionTypeLinks, ...singleTypeLinks], sidebarLayout, saveSidebarLayout);
    const trimmedSearch = organizer.toolbar ? '' : search.trim();`);
  replaceOnce("    const renderMenuItem = (node, depth, sectionId)=>{", `
    const renderMenuItem = (node, depth, sectionId) =>
        organizer.wrap(node, renderNativeMenuItem(node, depth, sectionId));
    const renderNativeMenuItem = (node, depth, sectionId)=>{`);
  replaceOnce("open: !collapsedFolderTokens.includes(token),", `
            open: !(sectionId === 'organized' ? organizer.collapsed : collapsedFolderTokens).includes(token),`);
  replaceOnce("onToggle: (open)=>handleFolderToggle(token, open),", `
            onToggle: (open)=>sectionId === 'organized' ? organizer.toggle(token, open) : handleFolderToggle(token, open),`);
  replaceOnce("children: searchBar", "children: organizer.toolbar ? null : searchBar");
  replaceOnce("children: sections.map((section)=>{", "children: organizer.sections.map((section, index)=>{");
  replaceOnce("label: section.title,", "label: index === 0 ? organizer.heading(section.title) : section.title,");
  replaceOnce("children: sectionItems", "children: index === 0 && organizer.toolbar ? [organizer.toolbar, ...sectionItems] : sectionItems");
  return code;
}

function sidebarPlugin() {
  let target;
  let patched = false;
  return {
    name: '3xweb:content-manager-sidebar',
    enforce: 'pre',
    configResolved(config) {
      const appRequire = createRequire(resolve(config.root, 'package.json'));
      const managerRequire = createRequire(appRequire.resolve('@strapi/strapi/package.json'));
      const manifest = managerRequire.resolve(dependency + '/package.json');
      const { version } = managerRequire(manifest);
      if (!/^5\.(60|61|62)\.\d+$/.test(version)) {
        throw new Error('[content-manager-sidebar] Supported Content Manager versions: 5.60.x to 5.62.x; found ' + version);
      }
      target = realpathSync(resolve(dirname(manifest), 'dist/admin/components/LeftMenu.mjs'));
    },
    resolveId(id) {
      if (id === virtualId) return resolve(__dirname, 'sidebar.mjs');
    },
    transform(code, id) {
      const path = id.split('?')[0];
      if (!path.endsWith('/LeftMenu.mjs') || realpathSync(path) !== target) return null;
      const output = patchSidebar(code);
      patched = true;
      return { code: output, map: null };
    },
    generateBundle() {
      if (!patched) this.error('[content-manager-sidebar] The native Content Manager sidebar was not reached by the admin build.');
    },
  };
}

function withContentManagerSidebar(config) {
  return {
    ...config,
    optimizeDeps: {
      ...config.optimizeDeps,
      exclude: [...new Set([...(config.optimizeDeps?.exclude ?? []), dependency, dependency + '/strapi-admin'])],
    },
    plugins: [...(config.plugins ?? []), sidebarPlugin()],
  };
}

module.exports = { withContentManagerSidebar };
