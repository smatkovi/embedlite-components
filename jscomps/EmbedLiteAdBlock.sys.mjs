/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Blocks requests to ad and tracking servers by host name, and marks requests
// with Save-Data for sites that send lighter pages then.
//
// The block list is a Set of the host names in LIST_DIR/*.txt (hosts-file
// lines or one name per line). A request is cancelled when its host or one
// of its parent domains is in the Set, before a connection is made. Top-level
// documents always load. This runs inside UserAgentOverrideHelper's
// http-on-modify-request observer, so it adds no observer of its own.
//
//   embedlite.adblock.enabled  (default true)
//   embedlite.adblock.log      (default false) dump() every blocked host
//   embedlite.save-data        (default false) send "Save-Data: on"

const Ci = Components.interfaces;
const Cr = Components.results;

const LIST_DIR = "/usr/share/embedlite-n950/adblock";
const PREF_ENABLED = "embedlite.adblock.enabled";
const PREF_LOG = "embedlite.adblock.log";
const PREF_SAVE_DATA = "embedlite.save-data";
const ADDRESSES = new Set(["0.0.0.0", "127.0.0.1", "::", "::1"]);
const NOT_HOSTS = new Set(["localhost", "localhost.localdomain", "local", "broadcasthost", "0.0.0.0"]);

export const AdBlock = {
  enabled: true,
  saveData: false,
  blocked: 0,
  _log: false,
  _hosts: null,
  _loading: false,

  init() {
    this._readPrefs();
    for (const pref of [PREF_ENABLED, PREF_LOG, PREF_SAVE_DATA]) {
      Services.prefs.addObserver(pref, () => this._readPrefs());
    }
  },

  _readPrefs() {
    this.enabled = Services.prefs.getBoolPref(PREF_ENABLED, true);
    this._log = Services.prefs.getBoolPref(PREF_LOG, false);
    this.saveData = Services.prefs.getBoolPref(PREF_SAVE_DATA, false);
    if (this.enabled) {
      this._load();
    }
  },

  async _load() {
    if (this._hosts || this._loading) {
      return;
    }
    this._loading = true;
    const hosts = new Set();
    const start = ChromeUtils.now();
    try {
      for (const path of await IOUtils.getChildren(LIST_DIR)) {
        if (!path.endsWith(".txt")) {
          continue;
        }
        const lines = (await IOUtils.readUTF8(path)).split("\n");
        for (let i = 0; i < lines.length; i++) {
          // a long list in pieces: the main thread stays responsive
          if (i && i % 4000 == 0) {
            await new Promise(resolve => ChromeUtils.idleDispatch(resolve));
          }
          let line = lines[i];
          const hash = line.indexOf("#");
          if (hash >= 0) {
            line = line.substring(0, hash);
          }
          const fields = line.trim().split(/\s+/);
          const host = (ADDRESSES.has(fields[0]) ? fields[1] : fields[0] || "").toLowerCase();
          if (host && host.includes(".") && !NOT_HOSTS.has(host)) {
            hosts.add(host);
          }
        }
      }
    } catch (e) {
      // no list directory: nothing is blocked
    }
    this._hosts = hosts;
    this._loading = false;
    if (this._log) {
      dump(`EL-adblock: ${hosts.size} hosts in ${(ChromeUtils.now() - start).toFixed(0)} ms\n`);
    }
  },

  // Called for every HTTP request; true when the request was cancelled.
  onRequest(channel) {
    if (this.saveData) {
      try {
        channel.setRequestHeader("Save-Data", "on", false);
      } catch (e) {}
    }
    if (!this.enabled || !this._hosts || !this._hosts.size) {
      return false;
    }
    const loadInfo = channel.loadInfo;
    if (!loadInfo || loadInfo.externalContentPolicyType == Ci.nsIContentPolicy.TYPE_DOCUMENT) {
      return false;
    }
    let host;
    try {
      host = channel.URI.asciiHost;
    } catch (e) {
      return false;
    }
    for (let name = host; ; ) {
      if (this._hosts.has(name)) {
        channel.cancel(Cr.NS_ERROR_ABORT);
        this.blocked++;
        if (this._log) {
          dump(`EL-adblock: blocked ${host}\n`);
        }
        return true;
      }
      const dot = name.indexOf(".");
      if (dot < 0) {
        return false;
      }
      name = name.substring(dot + 1);
      if (!name.includes(".")) {
        return false;
      }
    }
  },
};
