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
        get: fail, getCurrent: () => Promise.resolve(undefined),
        query: () => Promise.resolve([]), create: fail, update: fail,
        remove: () => Promise.resolve(), reload: () => Promise.resolve(),
        sendMessage: fail, insertCSS: () => Promise.resolve(),
        removeCSS: () => Promise.resolve(),
        executeScript: () => Promise.resolve([]),
        onCreated: emptyEvent(context, "tabs.onCreated"),
        onUpdated: emptyEvent(context, "tabs.onUpdated"),
        onRemoved: emptyEvent(context, "tabs.onRemoved"),
        onActivated: emptyEvent(context, "tabs.onActivated"),
        onReplaced: emptyEvent(context, "tabs.onReplaced"),
      },
    };
  }
};
