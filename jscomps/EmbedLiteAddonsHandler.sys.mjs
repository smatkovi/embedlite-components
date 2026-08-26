/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const Ci = Components.interfaces;

const { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs");

Services.scriptloader.loadSubScript("chrome://embedlite/content/Logger.js");

// Bridges the add-on list to the browser UI: the QML side sends
// embedui:addons requests and receives embed:addons replies.
export function $EmbedLiteAddonsHandler() {
  Logger.debug("JSComp: EmbedLiteAddonsHandler.js loaded");
  Services.obs.addObserver(this, "embedui:addons", true);
}

$EmbedLiteAddonsHandler.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),

  async _send() {
    const { AddonManager } = ChromeUtils.importESModule(
      "resource://gre/modules/AddonManager.sys.mjs");
    const addons = await AddonManager.getAllAddons();
    const list = addons
      .filter(a => a.type === "extension")
      .map(a => ({
        id: a.id,
        name: a.name,
        version: a.version,
        description: a.description || "",
        enabled: !a.userDisabled,
        active: a.isActive,
        iconURL: a.iconURL || "",
      }));
    Services.obs.notifyObservers(null, "embed:addons",
                                 JSON.stringify({ msg: "list", addons: list }));
  },

  observe(aSubject, aTopic, aData) {
    if (aTopic !== "embedui:addons") {
      return;
    }
    let data;
    try {
      data = JSON.parse(aData);
    } catch (e) {
      Logger.warn("EmbedLiteAddonsHandler: bad request: " + e);
      return;
    }

    const { AddonManager } = ChromeUtils.importESModule(
      "resource://gre/modules/AddonManager.sys.mjs");

    switch (data.msg) {
      case "list":
        this._send();
        break;
      case "setEnabled":
        AddonManager.getAddonByID(data.id).then(a => {
          if (!a) return null;
          return data.enabled ? a.enable() : a.disable();
        }).then(() => this._send());
        break;
      case "uninstall":
        AddonManager.getAddonByID(data.id).then(a => {
          if (a) a.uninstall();
        }).then(() => this._send());
        break;
      case "installFromFile":
        AddonManager.getInstallForFile(
          new FileUtils.File(data.path), null, null).then(install => {
            install.addListener({
              onInstallEnded: () => this._send(),
              onInstallFailed: () => this._send(),
            });
            install.install();
          });
        break;
    }
  },
};
