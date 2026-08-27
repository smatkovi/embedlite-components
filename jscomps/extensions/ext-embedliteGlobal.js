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
  getId() {
    return EMBEDLITE_TAB_ID;
  },
  getTab(id, default_ = undefined) {
    return currentContentWindow() || default_;
  },
  get activeTab() {
    return currentContentWindow();
  },
  getBrowserData(browser) {
    // Since content windows carry an embedder element, browser is a XUL
    // <browser> here, which has no documentGlobal. ext-webNavigation drops the
    // event when tabId comes back negative, so only reject a missing browser.
    if (!browser) {
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

// tabs.insertCSS and tabs.executeScript go through TabBase in ext-tabs-base.js,
// which ships in toolkit. It needs a Tab wrapper that can name a browser for a
// given tab id. EmbedLite has one content window at a time, so the wrapper just
// points at it.

// Gecko reads BrowsingContext::Top()->GetEmbedderElement() in WebNavigation.fire,
// the tabs API and browserAction, and gives up when it is null. EmbedLite renders
// into a Qt window rather than a XUL <browser>, so it never has one. Keep a single
// hidden document around and hand out a <browser> element per content window.

let sharedBrowserDoc = null;

function ensureSharedDoc() {
  if (sharedBrowserDoc && sharedBrowserDoc.defaultView) {
    return sharedBrowserDoc;
  }
  const wlb = Services.appShell.createWindowlessBrowser(true);
  const nav = wlb.docShell.QueryInterface(Ci.nsIWebNavigation);
  nav.loadURI(Services.io.newURI("chrome://extensions/content/dummy.xhtml"), {
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
  });
  sharedBrowserDoc = wlb.document;
  return sharedBrowserDoc;
}

function ensureEmbedderElement(win) {
  try {
    const bc = win.docShell && win.docShell.browsingContext;
    if (!bc || bc.top.embedderElement) {
      return;
    }
    const doc = ensureSharedDoc();
    if (!doc || !doc.documentElement) {
      return;
    }
    const br = doc.createXULElement("browser");
    br.setAttribute("type", "content");
    br.setAttribute("remote", "false");
    doc.documentElement.appendChild(br);
    win.windowUtils.setEmbedderElement(br);
    // SetEmbedderElement also writes EmbedderElementType and clears the message
    // manager group, which ExtensionPolicyService checks before running content
    // scripts. Put it back.
    bc.top.messageManagerGroup = "browsers";
  } catch (e) {}
}

// Only worth doing when something actually uses it.
Services.obs.addObserver({
  observe(subject) {
    try {
      const win = subject;
      const bc = win.docShell && win.docShell.browsingContext;
      if (bc && bc.isContent && !bc.parent) {
        ensureEmbedderElement(win);
      }
    } catch (e) {}
  },
}, "content-document-global-created", false);

// tabs.insertCSS and tabs.executeScript run through TabBase in ext-tabs-base.js,
// which toolkit already registers as b-tabs-base in this same category. It only
// needs a wrapper that can name a browser for a tab id - and EmbedLite shows one
// content window at a time, so the wrapper points at whatever is current.

function currentContentWindow() {
  const e = Services.ww.getWindowEnumerator();
  let found = null;
  while (e.hasMoreElements()) {
    const w = e.getNext();
    try {
      const bc = w.docShell && w.docShell.browsingContext;
      // about:blank and the windowless browser used for background pages both
      // pass the isContent check, so pick the one actually showing a page.
      const href = String(w.location.href);
      if (bc && bc.isContent && !bc.parent &&
          (href.startsWith("http") || href.startsWith("file"))) {
        found = w;
      }
    } catch (ex) {}
  }
  return found;
}

class EmbedLiteTab extends TabBase {
  // TabBase asks PrivateBrowsingUtils.isBrowserPrivate(browser), which wants a
  // XUL browser with a chrome window behind it. EmbedLite has neither.
  get _incognito() { return false; }
  get incognito() { return false; }
  get _favIconUrl() { return undefined; }
  get attention() { return false; }
  get audible() { return false; }
  // The embedder element is a real XUL <browser>, which is what TabBase and
  // PrivateBrowsingUtils expect; the content window is not.
  get browser() {
    try {
      const el = this.nativeTab.docShell.browsingContext.top.embedderElement;
      return el || this.nativeTab;
    } catch (e) {
      return this.nativeTab;
    }
  }
  get browsingContext() {
    return this.nativeTab && this.nativeTab.docShell
      ? this.nativeTab.docShell.browsingContext : null;
  }
  get alwaysOnTop() { return false; }
  get autoDiscardable() { return false; }
  get focused() { return true; }
  get groupId() { return -1; }
  get left() { return 0; }
  get splitViewId() { return -1; }
  get state() { return undefined; }
  get discarded() { return false; }
  get isArticle() { return false; }
  get isInReaderMode() { return false; }
  get sharingState() { return { camera: false, microphone: false, screen: undefined }; }
  get muted() { return false; }
  get volume() { return 1; }
  get openerTabId() { return undefined; }
  get cookieStoreId() { return "firefox-default"; }
  get height() { return this.nativeTab ? this.nativeTab.innerHeight : 0; }
  get width() { return this.nativeTab ? this.nativeTab.innerWidth : 0; }
  get hidden() { return false; }
  get index() { return 0; }
  get mutedInfo() { return { muted: false }; }
  get lastAccessed() { return 0; }
  get pinned() { return false; }
  get active() { return true; }
  get highlighted() { return true; }
  get selected() { return true; }
  get status() { return "complete"; }
  get successorTabId() { return -1; }
  get windowId() { return EMBEDLITE_WINDOW_ID; }
  get isArticle() { return false; }
  get isInReaderMode() { return false; }
}

class EmbedLiteTabManager extends TabManagerBase {
  get(tabId, default_ = undefined) {
    const win = currentContentWindow();
    return win ? this.getWrapper(win) : default_;
  }
  addActiveTabPermission(nativeTab = currentContentWindow()) {
    return super.addActiveTabPermission(nativeTab);
  }
  revokeActiveTabPermission(nativeTab = currentContentWindow()) {
    return super.revokeActiveTabPermission(nativeTab);
  }
  canAccessTab() { return true; }
  wrapTab(nativeTab) {
    return new EmbedLiteTab(this.extension, nativeTab, EMBEDLITE_TAB_ID);
  }
}

Object.assign(global, {
  tabTracker,
  windowTracker,
  Tab: EmbedLiteTab,
  TabManager: EmbedLiteTabManager,
});

// Every extension gets its own tabManager; Firefox and Android wire this up the
// same way. Without it, tabs.insertCSS and tabs.executeScript have nothing to
// inject into.
// eslint-disable-next-line mozilla/balanced-listeners
extensions.on("startup", (type, extension) => {
  defineLazyGetter(extension, "tabManager",
                   () => new EmbedLiteTabManager(extension));
});
