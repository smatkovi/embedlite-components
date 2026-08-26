/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* global ExtensionAPI, ExtensionCommon */

// Minimal tabs stub. Firefox implements this in browser/components and Android
// in mobile/shared, neither of which EmbedLite builds. Extensions listening on
// tabs.onUpdated during startup - uBlock Origin does - abort without it. The
// events never fire, so per-tab logic stays inert, but webRequest filtering
// works regardless.

function emptyEvent(context, name) {
  return new ExtensionCommon.EventManager({
    context, name, register: () => () => {},
  }).api();
}

this.tabs = class extends ExtensionAPI {
  getAPI(context) {
    const fail = () => Promise.reject(new Error("tabs API is not available"));
    return {
      tabs: {
        get: fail,
        getCurrent: () => Promise.resolve(undefined),
        create: fail,
        update: fail,
        remove: () => Promise.resolve(),
        reload: () => Promise.resolve(),
        sendMessage: fail,

        // These do real work. ext-tabs-base.js handles the injection once it
        // has a Tab wrapper, and ext-embedliteGlobal.js provides one. Cookie
        // banner blockers and userscript managers inject this way.
        query: () => {
          const tab = context.extension.tabManager.get(1);
          return Promise.resolve(tab ? [tab.convert()] : []);
        },
        insertCSS: (tabId, details) => {
          const tab = context.extension.tabManager.get(tabId);
          return tab ? tab.insertCSS(context, details) : Promise.resolve();
        },
        removeCSS: (tabId, details) => {
          const tab = context.extension.tabManager.get(tabId);
          return tab ? tab.removeCSS(context, details) : Promise.resolve();
        },
        executeScript: (tabId, details) => {
          const tab = context.extension.tabManager.get(tabId);
          return tab ? tab.executeScript(context, details) : Promise.resolve([]);
        },
        onCreated: emptyEvent(context, "tabs.onCreated"),
        onUpdated: emptyEvent(context, "tabs.onUpdated"),
        onRemoved: emptyEvent(context, "tabs.onRemoved"),
        onActivated: emptyEvent(context, "tabs.onActivated"),
        onReplaced: emptyEvent(context, "tabs.onReplaced"),
      },
    };
  }
};
