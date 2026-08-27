Name:       embedlite-components-qt5-next153
Summary:    EmbedLite components Qt5
Version:    2.0.0
Release:    9
License:    MPLv2.0
URL:        https://github.com/sailfishos/embedlite-components
Source0:    %{name}-%{version}.tar.bz2

BuildRequires:  libtool
BuildRequires:  automake
BuildRequires:  autoconf
Requires:  xulrunner-qt5-next153 >= 115.35.0

%description
EmbedLite Components required for embedded browser UI

%prep
%setup -q -n %{name}-%{version}

%build

NO_CONFIGURE=yes ./autogen.sh
%configure

%make_build

%install
%make_install

mkdir -p %{buildroot}%{_prefix}/lib/udev/rules.d
install -m 644 data/70-fido-token.rules \
    %{buildroot}%{_prefix}/lib/udev/rules.d/70-fido-token.rules

%post
udevadm control --reload-rules >/dev/null 2>&1 || :
udevadm trigger --subsystem-match=hidraw >/dev/null 2>&1 || :
touch /var/lib/_MOZEMBED_CACHE_CLEAN_

%files
%{_prefix}/lib/udev/rules.d/70-fido-token.rules
%license COPYING
%{_libdir}/mozembedlite-next153

%changelog
* Thu Aug 27 2026 Sebastian Matkovich <sebastianmatkovich@gmail.com> - 2.0.0-9
- Rebuild the extension bindings on the toolkit base classes, following
  Firefox for Android: real TabTracker, TabBase, TabManager, Window and
  WindowManager subclasses in place of hand-written stubs. Tab ids are handed
  out per content window instead of being fixed at 1.
- Add a browsingContext getter to the tab wrapper, so frameId and allFrames
  resolve against the page rather than the stand-in embedder element. Cookie
  banners live in subframes and were never reached before.
- Honour Chrome-style callbacks in tabs.query, get, insertCSS, removeCSS and
  executeScript. Extensions written for Chrome wait for the callback rather
  than the promise, and the schema layer that normally translates is bypassed
  by these hand-written entry points, so callers waited forever.
- Force author-origin sheets in insertCSS: user sheets are accepted by
  addSheet but never take effect here, so cookie blockers asking for "user"
  silently did nothing.

* Wed Aug 26 2026 Sebastian Matkovich <sebastianmatkovich@gmail.com> - 2.0.0-8
- Ship a udev rule for FIDO/U2F security keys. The hidraw node is root-only on
  some ports, so WebAuthn worked on the Xperia 10 V and failed elsewhere.
- Add EmbedLiteAddonsHandler, which answers embedui:addons from the browser UI
  with the installed add-on list and handles enable, disable and uninstall.

* Wed Aug 26 2026 Sebastian Matkovich <sebastianmatkovich@gmail.com> - 2.0.0-7
- Add EmbedLiteDevTools, started from the embedlite-startup category: EmbedLite
  runs no startup JavaScript, so the DevTools server in omni.ja was never
  reachable. Behind embedlite.devtools.enabled, port from embedlite.devtools.port.
- Add EmbedLiteAddons the same way, behind embedlite.addons.enabled

* Mon Aug 24 2026 Sebastian Matkovich <sebastianmatkovich@gmail.com> - 2.0.0-6
- Remember the chrome event handler on the listener instead of asking for it
  again when the window closes: on slower devices it is already gone by then,
  the six listeners were never removed, and the process died on shutdown

* Sun Aug 23 2026 Sebastian Matkovich <sebastianmatkovich@gmail.com> - 2.0.0-5
- Form autocomplete uses searchLoginsAsync; findLogins was removed in ESR 153
- HTTP auth dialogs no longer throw when looking for saved logins

* Sun Aug 23 2026 Sebastian Matkovich <sebastianmatkovich@gmail.com> - 2.0.0-4
- ContentLinkHandler: skip link elements whose document is already gone

* Sun Aug 23 2026 Sebastian Matkovich <sebastianmatkovich@gmail.com> - 2.0.0-3
- Lazy getter for PrivateBrowsingUtils in the permission prompt, so the notification permission dialog appears
- Session history: sessionHistory already implements nsISHistory

* Sun Aug 23 2026 Sebastian Matkovich <sebastianmatkovich@gmail.com> - 2.0.0-2
- Register the bundled search engines from disk and port the search service to the ES module
- Use nsISHistory directly; legacySHistory was removed in ESR 153
- Resolve the view id for nodes, documents and windows alike (focus targets inside iframes)
- Add the system alerts service so web notifications reach the embedder
