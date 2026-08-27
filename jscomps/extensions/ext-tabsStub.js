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
// Chrome-style extensions pass a callback as the last argument and wait for
// that rather than the returned promise; SchemaAPIInterface.callAsyncFunction
// normally translates. These hand-written entry points bypass the schema, so
// they have to handle the callback themselves.
function withCallback(fn) {
  return function (...args) {
    const cb = typeof args[args.length - 1] === "function" ? args.pop() : null;
    const result = Promise.resolve().then(() => fn.apply(this, args));
    if (!cb) {
      return result;
    }
    result.then(v => cb(v), () => cb(undefined));
    return undefined;
  };
}

function normalise(details) {
  return {
    code: details.code ?? null,
    file: details.file ?? null,
    frameId: details.frameId ?? null,
    allFrames: details.allFrames ?? false,
    matchAboutBlank: details.matchAboutBlank ?? false,
    runAt: details.runAt ?? "document_idle",
    // User sheets are accepted by addSheet but never take effect here, while
    // author sheets do. Extensions that block cookie banners ask for "user"
    // and would silently do nothing.
    cssOrigin: "author",
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
        get: withCallback(tabId => {
          const tab = context.extension.tabManager.get(tabId);
          if (!tab) {
            throw new Error("No tab with id: " + tabId);
          }
          return tab.convert();
        }),
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
        query: withCallback(() => {
          const tab = context.extension.tabManager.get(1);
          return tab ? [tab.convert()] : [];
        }),
        insertCSS: withCallback((tabId, details) => {
          const tab = context.extension.tabManager.get(tabId);
          return tab ? tab.insertCSS(context, normalise(details)) : undefined;
        }),
        removeCSS: withCallback((tabId, details) => {
          const tab = context.extension.tabManager.get(tabId);
          return tab ? tab.removeCSS(context, normalise(details)) : undefined;
        }),
        executeScript: withCallback((tabId, details) => {
          const tab = context.extension.tabManager.get(tabId);
          return tab ? tab.executeScript(context, normalise(details)) : [];
        }),
        onCreated: emptyEvent(context, "tabs.onCreated"),
        onUpdated: emptyEvent(context, "tabs.onUpdated"),
        onRemoved: emptyEvent(context, "tabs.onRemoved"),
        onActivated: emptyEvent(context, "tabs.onActivated"),
        onReplaced: emptyEvent(context, "tabs.onReplaced"),
      },
    };
  }
};
