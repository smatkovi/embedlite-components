/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

/* global extensions */

// Loaded from the webextension-scripts-addon category, like Gecko's own
// ext-toolkit.js. The category expects a script that registers modules, not
// an API implementation.
dump("EL-CHILD script loaded, extensions=" + (typeof extensions) + "\n");

extensions.registerModules({
  browserAction: {
    url: "resource://embedlite-components/ext-browserActionChild.js",
    scopes: ["addon_child"],
    paths: [["browserAction"], ["action"]],
  },
});
