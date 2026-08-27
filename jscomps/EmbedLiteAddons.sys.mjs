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

    // browserAction lives in browser/components, which EmbedLite does not build,
    // so extensions that call it during startup abort before their background
    // page finishes loading. Register a stub the same way Firefox for Android
    // does: through the webextension-modules category, parent scope only.
    Services.catMan.addCategoryEntry(
      "webextension-modules", "embedlite",
      "resource://embedlite-components/ext-embedlite.json", false, true);

    // Parent-side globals. ExtensionParent calls global.tabTracker.getBrowserData
    // for every extension page; without it, extension pages load with no browser
    // object at all. Firefox and Android register this the same way.
    Services.catMan.addCategoryEntry(
      "webextension-scripts", "embedlite",
      "resource://embedlite-components/ext-embedliteGlobal.js", false, true);


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
    Services.obs.notifyObservers(null, "browser-delayed-startup-finished");
    // browserStartupPromise races sessionstore-windows-restored against
    // extensions-late-startup. EmbedLite has no SessionStore, so the latter is
    // the one that can resolve it - the same path Firefox Reality uses.
    Services.obs.notifyObservers(null, "extensions-late-startup");

    const { AddonManagerPrivate } = ChromeUtils.importESModule(
      "resource://gre/modules/AddonManager.sys.mjs");
    // The parent half of an API module is only loaded when something in the
    // parent process asks for it. storage never gets that trigger here, so the
    // child half sends requests nobody answers, and extensions that read their
    // settings at startup wait forever.
    for (const name of ["storage", "runtime", "tabs", "webNavigation"]) {
      try {
        ExtensionParent.apiManager.loadModule(name);
      } catch (e) {
        Logger.warn("preloading " + name + " failed: " + e);
      }
    }

    AddonManagerPrivate.startup();
    Logger.warn("AddonManager started, isReady=" + AddonManager.isReady);

    // Event pages (persistent: false) only start when an event they registered
    // for arrives. Firefox restores those primed listeners from the startup
    // cache; that path does not run here, so they stay asleep forever and
    // never see a navigation. Wake them once at startup instead.
    AddonManager.getAllAddons().then(list => {
      for (const addon of list) {
        if (!addon.isActive || addon.type !== "extension") {
          continue;
        }
        const ext = ExtensionParent.GlobalManager.getExtension(addon.id);
        if (ext && ext.backgroundState === "stopped") {
          ext.wakeupBackground().catch(e => {
            Logger.warn("wakeupBackground failed for " + addon.id + ": " + e);
          });
        }
      }
    }, e => Logger.warn("getAllAddons failed: " + e));

    // Extension pages (options, popups, the uBlock dashboard) get their browser
    // object from ExtensionProcessScript.initExtensionDocument. Firefox calls it
    // from the ExtensionContent actor; EmbedLite never does, so those pages load
    // with no WebExtension API at all. Watch for extension documents instead.
    const { ExtensionProcessScript } = ChromeUtils.importESModule(
      "resource://gre/modules/ExtensionProcessScript.sys.mjs");
    Services.obs.addObserver({
      observe(win) {
        try {
          const uri = win.document.documentURIObject;
          if (!uri || uri.scheme !== "moz-extension") {
            return;
          }
          const policy = WebExtensionPolicy.getByHostname(uri.host);
          if (policy) {
            ExtensionProcessScript.initExtensionDocument(policy, win.document, false);
          }
        } catch (e) {
          Logger.warn("initExtensionDocument failed: " + e);
        }
      },
    }, "content-document-global-created", false);
    Logger.warn("AddonManager started");
  } catch (e) {
    Logger.warn("AddonManager failed to start: " + e);
  }
}

$EmbedLiteAddons.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),
  observe: function() {},
};
