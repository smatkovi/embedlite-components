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

// ext-tabs-base.js checks `details.code === null` against `details.file === null`,
// which the schema layer normally guarantees. Called directly, undefined fails
// that check, so fill the whole shape in.
function normalise(details) {
  return {
    code: details.code ?? null,
    file: details.file ?? null,
    frameId: details.frameId ?? null,
    allFrames: details.allFrames ?? false,
    matchAboutBlank: details.matchAboutBlank ?? false,
    runAt: details.runAt ?? "document_idle",
    cssOrigin: details.cssOrigin ?? "author",
  };
}

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
        get: tabId => {
          const tab = context.extension.tabManager.get(tabId);
          return tab ? Promise.resolve(tab.convert())
                     : Promise.reject(new Error("No tab with id: " + tabId));
        },
        getCurrent: () => {
          const tab = context.extension.tabManager.get(1);
          return Promise.resolve(tab ? tab.convert() : undefined);
        },
        create: fail,
        update: fail,
        remove: () => Promise.resolve(),
        reload: () => Promise.resolve(),
        sendMessage: fail,

        // ext-tabs-base.js does the injection through the ExtensionContent
        // actor; ext-embedliteGlobal.js supplies the Tab wrapper it needs.
        // The schema layer normally fills these in, so normalise them here.
        query: () => {
          const tab = context.extension.tabManager.get(1);
          return Promise.resolve(tab ? [tab.convert()] : []);
        },
        insertCSS: (tabId, details) => {
          const tab = context.extension.tabManager.get(tabId);
          return tab ? tab.insertCSS(context, normalise(details))
                     : Promise.resolve();
        },
        removeCSS: (tabId, details) => {
          const tab = context.extension.tabManager.get(tabId);
          return tab ? tab.removeCSS(context, normalise(details))
                     : Promise.resolve();
        },
        executeScript: (tabId, details) => {
          const tab = context.extension.tabManager.get(tabId);
          return tab ? tab.executeScript(context, normalise(details))
                     : Promise.resolve([]);
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
