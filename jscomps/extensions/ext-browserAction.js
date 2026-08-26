/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* global ExtensionAPI, ExtensionCommon */

// EmbedLite has no toolbar, so browserAction has nowhere to draw. Firefox
// implements this in browser/components/extensions, which is not built here,
// and extensions that call it during startup (uBlock Origin calls setIcon)
// abort before their background page finishes loading. Accept the calls and
// keep the state, so those extensions run.

this.browserAction = class extends ExtensionAPI {
  getAPI(context) {
    const state = new Map();
    const noop = () => {};
    const setter = key => details => { state.set(key, details); };
    const getter = key => () => state.get(key) || null;

    return {
      browserAction: {
        setTitle: setter("title"),
        getTitle: getter("title"),
        setIcon: setter("icon"),
        setBadgeText: setter("badgeText"),
        getBadgeText: () => (state.get("badgeText") || {}).text || "",
        setBadgeBackgroundColor: setter("badgeBackgroundColor"),
        getBadgeBackgroundColor: getter("badgeBackgroundColor"),
        setBadgeTextColor: setter("badgeTextColor"),
        getBadgeTextColor: getter("badgeTextColor"),
        setPopup: setter("popup"),
        getPopup: () => (state.get("popup") || {}).popup || "",
        enable: noop,
        disable: noop,
        isEnabled: () => true,
        openPopup: noop,
        onClicked: new ExtensionCommon.EventManager({
          context,
          name: "browserAction.onClicked",
          register: () => () => {},
        }).api(),
      },
    };
  }
};
