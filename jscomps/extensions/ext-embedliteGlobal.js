/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

/* global global, ExtensionCommon */

// ExtensionParent's GetFrameData handler calls global.tabTracker.getBrowserData
// on every extension page load. Firefox sets that up in browser/components and
// Android in mobile/shared; EmbedLite builds neither, so extension pages come up
// without a browser object at all - the uBlock dashboard renders empty.
//
// EmbedLite has a single window and manages tabs in the browser UI rather than
// in Gecko, so a fixed identity is enough to let the frame data through.

const EMBEDLITE_WINDOW_ID = 1;
const EMBEDLITE_TAB_ID = 1;

const tabTracker = {
  get activeTab() {
    return null;
  },
  getId() {
    return EMBEDLITE_TAB_ID;
  },
  getTab(id, default_ = undefined) {
    return default_;
  },
  getBrowserData(browser) {
    if (!browser || !browser.documentGlobal) {
      return { tabId: -1, windowId: -1 };
    }
    return { tabId: EMBEDLITE_TAB_ID, windowId: EMBEDLITE_WINDOW_ID };
  },
  on() {},
  off() {},
  init() {},
};

const windowTracker = {
  get topWindow() {
    return null;
  },
  getId() {
    return EMBEDLITE_WINDOW_ID;
  },
  getWindow() {
    return null;
  },
  addOpenListener() {},
  addCloseListener() {},
  on() {},
  off() {},
  init() {},
};

Object.assign(global, { tabTracker, windowTracker });
