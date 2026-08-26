/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const Ci = Components.interfaces;
const Cc = Components.classes;

Services.scriptloader.loadSubScript("chrome://embedlite/content/Logger.js");

// Started from the embedlite-startup category, so it runs once when Gecko
// comes up - EmbedLite has no BrowserGlue to hang this off.
export function $EmbedLiteDevTools() {
  Logger.debug("JSComp: EmbedLiteDevTools.js loaded");

  if (!Services.prefs.getBoolPref("embedlite.devtools.enabled", false)) {
    return;
  }

  try {
    const { require } = ChromeUtils.importESModule(
      "resource://devtools/shared/loader/Loader.sys.mjs");
    const { DevToolsServer } = require("devtools/server/devtools-server");
    DevToolsServer.init();
    DevToolsServer.registerAllActors();
    DevToolsServer.allowChromeProcess = true;
    const port = Services.prefs.getIntPref("embedlite.devtools.port", 6000);
    const { SocketListener } = require("devtools/shared/security/socket");
    const listener = new SocketListener(DevToolsServer, { portOrPath: port });
    listener.open();
    Logger.warn("DevTools server listening on port " + port);
  } catch (e) {
    Logger.warn("DevTools server failed to start: " + e);
  }
}

$EmbedLiteDevTools.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),
  observe: function() {},
};
