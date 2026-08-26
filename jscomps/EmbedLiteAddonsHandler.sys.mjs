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
        optionsURL: a.optionsURL || "",
      }));
    Services.obs.notifyObservers(null, "embed:addons",
                                 JSON.stringify({ msg: "list", addons: list }));
  },

  async _search(query) {
    // addons.mozilla.org has a public search API; the UI shows the results and
    // hands back a download URL to installFromURL.
    const url = "https://addons.mozilla.org/api/v5/addons/search/" +
                "?q=" + encodeURIComponent(query) +
                "&app=firefox&type=extension&page_size=20";
    try {
      const res = await fetch(url);
      const json = await res.json();
      const list = (json.results || []).map(r => ({
        id: r.guid,
        name: typeof r.name === "string" ? r.name : (r.name && (r.name["en-US"] || Object.values(r.name)[0])) || r.slug,
        summary: typeof r.summary === "string" ? r.summary : (r.summary && (r.summary["en-US"] || Object.values(r.summary)[0])) || "",
        iconURL: r.icon_url || "",
        users: r.average_daily_users || 0,
        rating: (r.ratings && r.ratings.average) || 0,
        url: (r.current_version && r.current_version.file && r.current_version.file.url) || "",
      })).filter(r => r.url);
      Services.obs.notifyObservers(null, "embed:addons",
        JSON.stringify({ msg: "searchResults", addons: list }));
    } catch (e) {
      Logger.warn("addon search failed: " + e);
      Services.obs.notifyObservers(null, "embed:addons",
        JSON.stringify({ msg: "searchResults", addons: [], error: String(e) }));
    }
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
      case "search":
        this._search(data.query);
        break;
      case "installFromURL":
        AddonManager.getInstallForURL(data.url).then(install => {
          install.addListener({
            onInstallEnded: () => this._send(),
            onInstallFailed: () => {
              Services.obs.notifyObservers(null, "embed:addons",
                JSON.stringify({ msg: "installFailed", url: data.url }));
              this._send();
            },
          });
          install.install();
        }, e => {
          Logger.warn("getInstallForURL failed: " + e);
          Services.obs.notifyObservers(null, "embed:addons",
            JSON.stringify({ msg: "installFailed", url: data.url }));
        });
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
