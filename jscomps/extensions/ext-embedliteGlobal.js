/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Extension support for EmbedLite, modelled on mobile/shared/components/
 * extensions/ext-android.js.
 *
 * The one structural difference: on Android every tab is its own chrome
 * window, so `browser.ownerGlobal.tab` identifies a tab. EmbedLite has a
 * single window and the browser UI owns the tab list outside of Gecko, so we
 * key tabs off the content window itself and hand each one an embedder
 * element out of a shared hidden document.
 */

ChromeUtils.defineESModuleGetters(this, {
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
});

var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);
var { ExtensionUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionUtils.sys.mjs"
);
var { EventEmitter } = ExtensionCommon;
var { DefaultWeakMap, ExtensionError } = ExtensionUtils;

const BrowserStatusFilter = Components.Constructor(
  "@mozilla.org/appshell/component/browser-status-filter;1",
  "nsIWebProgress",
  "addProgressListener"
);

const PROGRESS_LISTENER_FLAGS =
  Ci.nsIWebProgress.NOTIFY_STATE_ALL | Ci.nsIWebProgress.NOTIFY_LOCATION;

// EmbedLite has one window; tab ids are handed out per content window.
const EMBEDLITE_WINDOW_ID = 1;

// ---------------------------------------------------------------------------
// Embedder elements
//
// Content windows in EmbedLite have no embedder element of their own, but
// webNavigation, tabs and browserAction all reach for bc.top.embedderElement.
// We keep one hidden windowless document and park a <browser> in it per tab.
// ---------------------------------------------------------------------------

let sharedDoc = null;
let sharedBrowser = null;

function ensureSharedDoc() {
  if (sharedDoc) {
    return sharedDoc;
  }
  sharedBrowser = Services.appShell.createWindowlessBrowser(true);
  const shell = sharedBrowser.docShell;
  const nav = shell.QueryInterface(Ci.nsIWebNavigation);
  nav.loadURI(Services.io.newURI("chrome://extensions/content/dummy.xhtml"), {
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
  });
  sharedDoc = sharedBrowser.document;
  return sharedDoc;
}

function ensureEmbedderElement(win) {
  const bc = win.docShell?.browsingContext?.top;
  if (!bc) {
    return null;
  }
  if (bc.embedderElement) {
    return bc.embedderElement;
  }

  const doc = ensureSharedDoc();
  if (!doc || doc.readyState !== "complete") {
    return null;
  }

  const el = doc.createXULElement("browser");
  el.setAttribute("type", "content");
  el.setAttribute("remote", "false");
  doc.documentElement.appendChild(el);

  win.windowUtils.setEmbedderElement(el);
  // setEmbedderElement clears EmbedderElementType, and
  // ExtensionPolicyService::IsTabOrExtensionBrowser tests the message manager
  // group - without this, content scripts stop running.
  bc.setMessageManagerGroup?.("browsers");

  return bc.embedderElement;
}

// ---------------------------------------------------------------------------
// Progress listeners
// ---------------------------------------------------------------------------

class BrowserProgressListener {
  constructor(browser, listener, flags) {
    this.listener = listener;
    this.browser = browser;
    this.filter = new BrowserStatusFilter(this, flags);
    this.browser.webProgress?.addProgressListener(this.filter, flags);
  }

  destroy() {
    this.browser.webProgress?.removeProgressListener(this.filter);
    this.filter.removeProgressListener(this);
    this.browser = null;
    this.filter = null;
    this.listener = null;
  }

  delegate(method, ...args) {
    if (this.listener[method]) {
      this.listener[method](this.browser, ...args);
    }
  }

  onLocationChange(webProgress, request, locationURI, flags) {
    this.delegate("onLocationChange", webProgress, request, locationURI, flags);
  }

  onStateChange(webProgress, request, stateFlags, status) {
    this.delegate("onStateChange", webProgress, request, stateFlags, status);
  }

  QueryInterface = ChromeUtils.generateQI([
    "nsIWebProgressListener",
    "nsIWebProgressListener2",
    "nsISupportsWeakReference",
  ]);
}

class ProgressListenerWrapper {
  constructor(window, listener) {
    this.listener = new BrowserProgressListener(
      window,
      listener,
      PROGRESS_LISTENER_FLAGS
    );
  }

  destroy() {
    this.listener.destroy();
  }
}

// ---------------------------------------------------------------------------
// Window tracking
// ---------------------------------------------------------------------------

class WindowTracker extends WindowTrackerBase {
  constructor(...args) {
    super(...args);
    this.progressListeners = new DefaultWeakMap(() => new WeakMap());
  }

  get topWindow() {
    return currentContentWindow();
  }

  get topNonPBWindow() {
    return this.topWindow;
  }

  isBrowserWindow() {
    // EmbedLite has no XUL browser window; the single content window is it.
    return true;
  }

  addProgressListener(window, listener) {
    const listeners = this.progressListeners.get(window);
    if (!listeners.has(listener)) {
      listeners.set(listener, new ProgressListenerWrapper(window, listener));
    }
  }

  removeProgressListener(window, listener) {
    const listeners = this.progressListeners.get(window);
    const wrapper = listeners.get(listener);
    if (wrapper) {
      wrapper.destroy();
      listeners.delete(listener);
    }
  }
}

const windowTracker = new WindowTracker();

/**
 * Returns the content window the browser UI is currently showing. Windows
 * without an http(s) document - the hidden extension pages, about:blank -
 * are skipped, since an extension asking for "the tab" means the page.
 */
function currentContentWindow() {
  const e = Services.ww.getWindowEnumerator();
  let found = null;
  while (e.hasMoreElements()) {
    const win = e.getNext();
    let href;
    try {
      href = String(win.location.href);
    } catch (ex) {
      continue;
    }
    if (href.startsWith("http")) {
      found = win;
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Tab tracking
// ---------------------------------------------------------------------------

class TabTracker extends TabTrackerBase {
  constructor() {
    super();
    this._nextId = 1;
    this._idsByWindow = new WeakMap();
    this._windowsById = new Map();
  }

  init() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    Services.obs.addObserver(this, "content-document-global-created");
    Services.obs.addObserver(this, "outer-window-destroyed");
  }

  observe(subject, topic) {
    if (topic === "content-document-global-created") {
      const win = subject;
      let href;
      try {
        href = String(win.location.href);
      } catch (e) {
        return;
      }
      if (!href.startsWith("http")) {
        return;
      }
      ensureEmbedderElement(win);
      const isNew = !this._idsByWindow.has(win);
      const nativeTab = this._trackWindow(win);
      if (isNew) {
        this.emit("tab-created", { nativeTab });
      }
    } else if (topic === "outer-window-destroyed") {
      // The id stays in _windowsById until something asks for it; the weak
      // map drops the window on its own.
    }
  }

  _trackWindow(win) {
    let id = this._idsByWindow.get(win);
    if (id === undefined) {
      id = this._nextId++;
      this._idsByWindow.set(win, id);
      this._windowsById.set(id, Cu.getWeakReference(win));
    }
    return win;
  }

  getId(nativeTab) {
    return this._trackWindow(nativeTab) && this._idsByWindow.get(nativeTab);
  }

  getTab(id, default_ = undefined) {
    const ref = this._windowsById.get(id);
    const win = ref && ref.get();
    if (win) {
      return win;
    }
    // Fall back to whatever the browser is showing - the UI owns the tab list,
    // so an id we never saw is usually the current page.
    const current = currentContentWindow();
    if (current) {
      return current;
    }
    if (default_ !== undefined) {
      return default_;
    }
    throw new ExtensionError(`Invalid tab ID: ${id}`);
  }

  getBrowserData(browser) {
    if (!browser) {
      return { tabId: -1, windowId: -1 };
    }
    // browser is the embedder element we parked in the hidden document, so
    // ownerGlobal points there rather than at the page. Walk the other way.
    const bc = browser.browsingContext;
    const win = bc && bc.window;
    if (win && this._idsByWindow.has(win)) {
      return {
        tabId: this._idsByWindow.get(win),
        windowId: EMBEDLITE_WINDOW_ID,
      };
    }
    const current = currentContentWindow();
    if (current) {
      return {
        tabId: this.getId(current),
        windowId: EMBEDLITE_WINDOW_ID,
      };
    }
    return { tabId: -1, windowId: -1 };
  }

  getBrowserDataForContext(context) {
    if (context.xulBrowser) {
      return this.getBrowserData(context.xulBrowser);
    }
    return { tabId: -1, windowId: EMBEDLITE_WINDOW_ID };
  }

  get activeTab() {
    return currentContentWindow();
  }

  getTabForBrowser(browser) {
    const { tabId } = this.getBrowserData(browser);
    if (tabId < 0) {
      return null;
    }
    return this.getTab(tabId, null);
  }
}

const tabTracker = new TabTracker();
tabTracker.init();

Object.assign(global, { tabTracker, windowTracker });

// ---------------------------------------------------------------------------
// Tab, Window and their managers
// ---------------------------------------------------------------------------

class Tab extends TabBase {
  get _favIconUrl() {
    return undefined;
  }

  get browser() {
    return ensureEmbedderElement(this.nativeTab);
  }

  // The embedder element is a stand-in living in a hidden document and has no
  // browsing context of its own. Frame lookups (frameId, allFrames) need the
  // real one from the content window.
  get browsingContext() {
    return this.nativeTab.docShell?.browsingContext ?? null;
  }

  // TabBase reads browser.currentURI, but the embedder element is a stand-in
  // and never navigates - it always reports about:blank.
  get _url() {
    try {
      return String(this.nativeTab.location.href);
    } catch (e) {
      return "about:blank";
    }
  }

  get _title() {
    try {
      return this.nativeTab.document.title || "";
    } catch (e) {
      return "";
    }
  }

  get attention() {
    return false;
  }

  get audible() {
    return false;
  }

  get discarded() {
    return false;
  }

  get cookieStoreId() {
    return "firefox-default";
  }

  get height() {
    return this.nativeTab.innerHeight || 0;
  }

  get width() {
    return this.nativeTab.innerWidth || 0;
  }

  get incognito() {
    const browser = this.browser;
    return browser ? PrivateBrowsingUtils.isBrowserPrivate(browser) : false;
  }

  get index() {
    return 0;
  }

  get mutedInfo() {
    return { muted: false };
  }

  get lastAccessed() {
    return Date.now();
  }

  get pinned() {
    return false;
  }

  get active() {
    return this.nativeTab === currentContentWindow();
  }

  get highlighted() {
    return this.active;
  }

  get selected() {
    return this.active;
  }

  get status() {
    try {
      return this.nativeTab.document.readyState === "complete"
        ? "complete"
        : "loading";
    } catch (e) {
      return "complete";
    }
  }

  get successorTabId() {
    return -1;
  }

  get groupId() {
    return -1;
  }

  get openerTabId() {
    return undefined;
  }

  get window() {
    return this.nativeTab;
  }

  get windowId() {
    return EMBEDLITE_WINDOW_ID;
  }

  get hidden() {
    return false;
  }

  get autoDiscardable() {
    return false;
  }

  get splitViewId() {
    return -1;
  }

  get isArticle() {
    return false;
  }

  get isInReaderMode() {
    return false;
  }

  get sharingState() {
    return { screen: undefined, microphone: false, camera: false };
  }
}

class TabContext extends EventEmitter {
  constructor(getDefaultPrototype) {
    super();
    this.getDefaultPrototype = getDefaultPrototype;
    this.tabData = new Map();
  }

  get(tabId) {
    if (!this.tabData.has(tabId)) {
      this.tabData.set(tabId, Object.create(this.getDefaultPrototype(tabId)));
    }
    return this.tabData.get(tabId);
  }

  clear(tabId) {
    this.tabData.delete(tabId);
  }

  shutdown() {
    this.tabData.clear();
  }
}

class Window extends WindowBase {
  get focused() {
    try {
      return this.window.document.hasFocus();
    } catch (e) {
      return true;
    }
  }

  get top() {
    return 0;
  }

  get left() {
    return 0;
  }

  get width() {
    return this.window.innerWidth || 0;
  }

  get height() {
    return this.window.innerHeight || 0;
  }

  get incognito() {
    return false;
  }

  get alwaysOnTop() {
    return false;
  }

  get isLastFocused() {
    return true;
  }

  get state() {
    return "fullscreen";
  }

  get type() {
    return "normal";
  }

  get title() {
    try {
      return this.window.document.title || "";
    } catch (e) {
      return "";
    }
  }

  *getTabs() {
    yield this.activeTab;
  }

  *getHighlightedTabs() {
    yield this.activeTab;
  }

  get activeTab() {
    const { tabManager } = this.extension;
    const win = currentContentWindow();
    return win ? tabManager.getWrapper(win) : null;
  }

  getTabAtIndex(index) {
    return index === 0 ? this.activeTab : undefined;
  }
}

Object.assign(global, { Tab, TabContext, Window });

class TabManager extends TabManagerBase {
  get(tabId, default_ = undefined) {
    const nativeTab = tabTracker.getTab(tabId, default_);
    if (nativeTab) {
      return this.getWrapper(nativeTab);
    }
    return default_;
  }

  addActiveTabPermission(nativeTab = tabTracker.activeTab) {
    return super.addActiveTabPermission(nativeTab);
  }

  revokeActiveTabPermission(nativeTab = tabTracker.activeTab) {
    return super.revokeActiveTabPermission(nativeTab);
  }

  canAccessTab() {
    return true;
  }

  wrapTab(nativeTab) {
    return new Tab(this.extension, nativeTab, tabTracker.getId(nativeTab));
  }
}

class WindowManager extends WindowManagerBase {
  get(windowId, context) {
    const win = currentContentWindow();
    return this.getWrapper(win, context);
  }

  *getAll() {
    const win = currentContentWindow();
    if (win) {
      yield this.getWrapper(win);
    }
  }

  wrapWindow(window) {
    return new Window(this.extension, window, EMBEDLITE_WINDOW_ID);
  }
}

extensions.on("startup", (type, extension) => {
  defineLazyGetter(extension, "tabManager", () => new TabManager(extension));
  defineLazyGetter(
    extension,
    "windowManager",
    () => new WindowManager(extension)
  );
});

extensions.on("page-shutdown", (type, context) => {
  if (context.viewType === "tab") {
    context.close();
  }
});

global.openOptionsPage = async extension => {
  const url = extension.manifest.options_ui?.page;
  if (!url) {
    throw new ExtensionError("No options page");
  }
  throw new ExtensionError("Options pages are not supported yet");
};
