/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* global ExtensionAPI */

// Child half of the browserAction stub. Extensions call browserAction from
// their background page, which runs in the child scope, so the parent-only
// module is not enough - without this they see an undefined namespace.

this.browserAction = class extends ExtensionAPI {
  getAPI(context) {
    const noop = () => {};
    const promise = value => () => Promise.resolve(value);

    return {
      browserAction: {
        setTitle: noop,
        getTitle: promise(""),
        setIcon: promise(undefined),
        setBadgeText: noop,
        getBadgeText: promise(""),
        setBadgeBackgroundColor: noop,
        getBadgeBackgroundColor: promise([0, 0, 0, 0]),
        setBadgeTextColor: noop,
        getBadgeTextColor: promise([0, 0, 0, 0]),
        setPopup: noop,
        getPopup: promise(""),
        enable: noop,
        disable: noop,
        isEnabled: promise(true),
        openPopup: promise(undefined),
        onClicked: {
          addListener: noop,
          removeListener: noop,
          hasListener: () => false,
        },
      },
    };
  }
};
