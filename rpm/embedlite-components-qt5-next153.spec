Name:       embedlite-components-qt5-next153
Summary:    EmbedLite components Qt5
Version:    2.0.0
Release:    1
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
