Name:       embedlite-components-qt5-next153
Summary:    EmbedLite components Qt5
Version:    2.0.0
Release:    5
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

%post
touch /var/lib/_MOZEMBED_CACHE_CLEAN_

%files
%license COPYING
%{_libdir}/mozembedlite-next153

%changelog
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
