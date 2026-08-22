/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EmbedLite system alerts service (@mozilla.org/system-alerts-service;1).
// nsAlertsService hands every alert to the system service first; this one
// forwards it to the embedder as the "embed:alert" observer topic (Sailfish
// shows it through Nemo.Notifications) and reports clicks and closes back to
// the alert listener, like a native backend would.

Services.scriptloader.loadSubScript("chrome://embedlite/content/Logger.js");

const TOPIC_SHOW = "embed:alert";           // service -> UI
const TOPIC_CLOSE = "embed:alert-close";    // service -> UI
const TOPIC_CLICKED = "embed:alert-clicked"; // UI -> service
const TOPIC_CLOSED = "embed:alert-closed";   // UI -> service

export function EmbedLiteAlertsService() {
  this._alerts = new Map();
  Services.obs.addObserver(this, TOPIC_CLICKED);
  Services.obs.addObserver(this, TOPIC_CLOSED);
  Logger.debug("JSComp: EmbedLiteAlertsService.sys.mjs loaded");
}

EmbedLiteAlertsService.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIAlertsService", "nsIObserver"]),

  showAlertNotification(aImageURL, aTitle, aText, aTextClickable, aCookie,
                        aListener, aName, aDir, aLang, aData, aPrincipal,
                        aInPrivateBrowsing, aRequireInteraction) {
    this._show({ name: aName, imageURL: aImageURL, title: aTitle, text: aText,
                 textClickable: !!aTextClickable, cookie: aCookie,
                 principal: aPrincipal, requireInteraction: !!aRequireInteraction },
               aListener);
  },

  showAlert(aAlert, aListener) {
    this._show({ name: aAlert.name, imageURL: aAlert.imageURL, title: aAlert.title,
                 text: aAlert.text, textClickable: aAlert.textClickable,
                 cookie: aAlert.cookie, principal: aAlert.principal,
                 requireInteraction: aAlert.requireInteraction }, aListener);
  },

  closeAlert(aName) {
    if (!aName || !this._alerts.has(aName)) {
      return;
    }
    Services.obs.notifyObservers(null, TOPIC_CLOSE, JSON.stringify({ name: aName }));
    this._finish(aName);
  },

  _show(aFields, aListener) {
    let name = aFields.name || "embedlite-alert-" + Date.now();
    let origin = "";
    try {
      if (aFields.principal && !aFields.principal.isSystemPrincipal) {
        origin = aFields.principal.originNoSuffix;
      }
    } catch (e) {}
    this._alerts.set(name, { listener: aListener, cookie: aFields.cookie || "" });
    Services.obs.notifyObservers(null, TOPIC_SHOW, JSON.stringify({
      name, origin,
      title: aFields.title || "",
      text: aFields.text || "",
      imageURL: aFields.imageURL || "",
      textClickable: !!aFields.textClickable,
      requireInteraction: !!aFields.requireInteraction,
    }));
    this._notify(name, "alertshow");
  },

  observe(aSubject, aTopic, aData) {
    let msg;
    try {
      msg = JSON.parse(aData);
    } catch (e) {
      return;
    }
    if (!msg || !this._alerts.has(msg.name)) {
      return;
    }
    if (aTopic === TOPIC_CLICKED) {
      this._notify(msg.name, "alertclickcallback");
      this._finish(msg.name);
    } else if (aTopic === TOPIC_CLOSED) {
      this._finish(msg.name);
    }
  },

  _notify(aName, aTopic) {
    let entry = this._alerts.get(aName);
    if (entry && entry.listener) {
      try {
        entry.listener.observe(null, aTopic, entry.cookie);
      } catch (e) {
        Logger.debug("EmbedLiteAlertsService: listener " + aTopic + " failed: " + e);
      }
    }
  },

  _finish(aName) {
    this._notify(aName, "alertfinished");
    this._alerts.delete(aName);
  },
};
