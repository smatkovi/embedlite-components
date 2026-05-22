/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

var EXPORTED_SYMBOLS = ["EmbedLiteSearchEngine"];

const { ComponentUtils } = ChromeUtils.importESModule("resource://gre/modules/ComponentUtils.sys.mjs");
const { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

Services.scriptloader.loadSubScript("chrome://embedlite/content/Logger.js");

// Common helper service
function EmbedLiteSearchEngine()
{
  Logger.debug("JSComp: EmbedLiteSearchEngine.js loaded");
}

EmbedLiteSearchEngine.prototype = {
  classID: Components.ID("{924fe7ba-afa1-11e2-9d4f-533572064b73}"),

  _initSent: false,

  _notifyInit: function AC_notifyInit() {
    if (this._initSent) {
      return;
    }

    this._initSent = true;
    Services.search.getEngines().then((engines) => {
      let engineNames = engines.map(function (element) {
        return element.name;
      });
      let enginesAvailable = (engines && engines.length > 0);
      let defaultEngine = null;
      if (enginesAvailable) {
        try {
          defaultEngine = Services.search.defaultEngine;
        } catch (e) {
          Logger.warn("EmbedLiteSearchEngine failed to get default engine:", e);
        }
      }
      var messg = {
        msg: "init",
        engines: engineNames,
        defaultEngine: defaultEngine ? defaultEngine.name : null
      }
      Services.obs.notifyObservers(null, "embed:search", JSON.stringify(messg));
    }, (error) => {
      this._initSent = false;
      Logger.warn("EmbedLiteSearchEngine init failed:", error);
    });
  },

  observe: function (aSubject, aTopic, aData) {
    switch(aTopic) {
      // Engine DownloadManager notifications
      case "app-startup": {
        Services.obs.addObserver(this, "xpcom-shutdown", true);
        Services.obs.addObserver(this, "embedui:search", true);
        Services.obs.addObserver(this, "profile-after-change", false);
        this._notifyInit();
        break;
      }
      case "profile-after-change": {
        Services.obs.removeObserver(this, "profile-after-change");
        this._notifyInit();
        break;
      }
      case "embedui:search": {
        var data = JSON.parse(aData);
        switch (data.msg) {
          case "loadxml": {
            Services.search.addOpenSearchEngine(data.uri, null).then(
              engine => {
                var message = {
                  "msg": "search-engine-added",
                  "engine": (engine && engine.name) || "",
                  "errorCode": 0,
                }
                Services.obs.notifyObservers(null, "embed:search", JSON.stringify(message));
              },
              errorCode => {
                // For failure conditions see nsISearchService.idl
                var message = {
                  "msg": "search-engine-added",
                  "engine": "",
                  "errorCode": errorCode
                }
                Services.obs.notifyObservers(null, "embed:search", JSON.stringify(message));
              }
            );
            break;
          }
          case "setdefault": {
            var engine = Services.search.getEngineByName(data.name);
            if (engine) {
              Services.search.defaultEngine = engine;
              var message = {
                "msg": "search-engine-default-changed",
                "defaultEngine": (engine && engine.name) || "",
                "errorCode": 0,
              }

              Services.obs.notifyObservers(null, "embed:search", JSON.stringify(message));
            }
            break;
          }
          default:
            Logger.debug("Unhandled embedui:search message: " + data.msg);
            break;
        }
        break;
      }
      case "xpcom-shutdown": {
        Services.obs.removeObserver(this, "embedui:search");
        Services.obs.removeObserver(this, "xpcom-shutdown");
        break;
      }
      default:
        break;
    }
  },

  QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference])
};

if (ComponentUtils.generateNSGetFactory) {
  this.NSGetFactory = ComponentUtils.generateNSGetFactory([EmbedLiteSearchEngine]);
}
