/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const Ci = Components.interfaces;
const Cc = Components.classes;

Services.scriptloader.loadSubScript("chrome://embedlite/content/Logger.js");

// Started from the embedlite-startup category. The add-on machinery ships in
// omni.ja but nothing starts it, because EmbedLite has no BrowserGlue.
export function $EmbedLiteAddons() {
  Logger.debug("JSComp: EmbedLiteAddons.js loaded");

  if (!Services.prefs.getBoolPref("embedlite.addons.enabled", false)) {
    return;
  }

  try {
    const { AddonManager } = ChromeUtils.importESModule(
      "resource://gre/modules/AddonManager.sys.mjs");
    // ExtensionParent only resolves browserStartupPromise from its
    // browser-delayed-startup-finished observer. Persistent background pages
    // wait on that promise when the startup reason is APP_STARTUP, so in
    // EmbedLite - which has no BrowserGlue to send it - they never start:
    // state stays "Startup: Complete" with backgroundState "stopped".
    // Import ExtensionParent first so its observer is in place, then notify
    // before any add-on processes its manifest.
    // Register the toolkit JSWindowActors. XRE does this from BrowserGlue,
    // which EmbedLite lacks, so ExtensionContent - the actor pair that injects
    // content scripts into pages - was never registered.
    ChromeUtils.importESModule("resource://gre/modules/ActorManagerParent.sys.mjs");

    const { ExtensionParent } = ChromeUtils.importESModule(
      "resource://gre/modules/ExtensionParent.sys.mjs");

    // browserAction lives in browser/components/extensions, which EmbedLite
    // does not build, so extensions that touch it during startup never finish
    // loading their background page. Register a stub that accepts the calls.
    ExtensionParent.apiManager.registerModules({
      browserAction: {
        url: "resource://embedlite-components/ext-browserAction.js",
        schema: "chrome://extensions/content/schemas/browser_action.json",
        scopes: ["addon_parent"],
        manifest: ["browser_action", "action"],
        paths: [["browserAction"], ["action"]],
      },
    });
    Services.obs.notifyObservers(null, "browser-delayed-startup-finished");
    // browserStartupPromise races sessionstore-windows-restored against
    // extensions-late-startup. EmbedLite has no SessionStore, so the latter is
    // the one that can resolve it - the same path Firefox Reality uses.
    Services.obs.notifyObservers(null, "extensions-late-startup");

    const { AddonManagerPrivate } = ChromeUtils.importESModule(
      "resource://gre/modules/AddonManager.sys.mjs");
    AddonManagerPrivate.startup();
    Logger.warn("AddonManager started, isReady=" + AddonManager.isReady);
    Logger.warn("AddonManager started");
  } catch (e) {
    Logger.warn("AddonManager failed to start: " + e);
  }
}

$EmbedLiteAddons.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),
  observe: function() {},
};
