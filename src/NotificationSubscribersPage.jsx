import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import "./NotificationSubscribersPage.css";

const PLATFORM_OPTIONS = [
  { value: "all", label: "All platforms" },
  { value: "android", label: "Android" },
  { value: "ios", label: "iOS" },
  { value: "windows", label: "Windows" },
  { value: "macos", label: "macOS" },
  { value: "linux", label: "Linux" },
  { value: "other", label: "Other" },
];

function asDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = asDate(value);
  return date
    ? date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}

function getCustomerName(user = {}) {
  return (
    user.fullName ||
    user.name ||
    user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    "Unnamed customer"
  );
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export default function NotificationSubscribersPage() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const [appType, setAppType] = useState("all");
  const [lastLoaded, setLastLoaded] = useState(null);

  const loadSubscribers = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      // This reads only enabled device registrations from every user's subcollection.
      const devicesQuery = query(
        collectionGroup(db, "notificationDevices"),
        where("enabled", "==", true)
      );
      const snapshot = await getDocs(devicesQuery);

      const validDocs = snapshot.docs.filter((deviceDoc) => {
        const data = deviceDoc.data();
        return typeof data.token === "string" && data.token.trim().length > 0;
      });

      // Fetch each parent user document once, even when they have multiple devices.
      const userRefs = new Map();
      validDocs.forEach((deviceDoc) => {
        const userRef = deviceDoc.ref.parent.parent;
        if (userRef) userRefs.set(userRef.path, userRef);
      });

      const userEntries = await Promise.all(
        [...userRefs.entries()].map(async ([path, userRef]) => {
          try {
            const userSnapshot = await getDoc(userRef);
            return [path, userSnapshot.exists() ? userSnapshot.data() : {}];
          } catch {
            return [path, {}];
          }
        })
      );
      const usersByPath = new Map(userEntries);

      const rows = validDocs.map((deviceDoc) => {
        const data = deviceDoc.data();
        const userRef = deviceDoc.ref.parent.parent;
        const user = userRef ? usersByPath.get(userRef.path) || {} : {};

        return {
          id: deviceDoc.id,
          userId: userRef?.id || "",
          userPath: userRef?.path || "",
          name: getCustomerName(user),
          email: user.email || user.emailAddress || "",
          phone: user.phoneNumber || user.phone || user.mobile || "",
          platform: String(data.platform || "other").toLowerCase(),
          installedApp: data.installedApp === true,
          updatedAt: data.updatedAt || data.createdAt || null,
          tokenPresent: Boolean(data.token),
        };
      });

      rows.sort((a, b) => {
        const aTime = asDate(a.updatedAt)?.getTime() || 0;
        const bTime = asDate(b.updatedAt)?.getTime() || 0;
        return bTime - aTime;
      });

      setDevices(rows);
      setLastLoaded(new Date());
    } catch (loadError) {
      console.error("Could not load notification subscribers:", loadError);
      setError(
        loadError?.message ||
          "Could not load notification subscribers. Check Firestore permissions and try again."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSubscribers();
  }, [loadSubscribers]);

  const filteredDevices = useMemo(() => {
    const term = search.trim().toLowerCase();

    return devices.filter((device) => {
      const matchesPlatform =
        platform === "all" || device.platform === platform;
      const matchesApp =
        appType === "all" ||
        (appType === "installed" && device.installedApp) ||
        (appType === "browser" && !device.installedApp);
      const matchesSearch =
        !term ||
        [
          device.name,
          device.email,
          device.phone,
          device.userId,
          device.platform,
        ].some((value) => String(value || "").toLowerCase().includes(term));

      return matchesPlatform && matchesApp && matchesSearch;
    });
  }, [devices, search, platform, appType]);

  const uniqueUsers = useMemo(
    () => new Set(filteredDevices.map((device) => device.userId)).size,
    [filteredDevices]
  );

  const platformCounts = useMemo(() => {
    return devices.reduce((counts, device) => {
      counts[device.platform] = (counts[device.platform] || 0) + 1;
      return counts;
    }, {});
  }, [devices]);

  const exportCsv = () => {
    const headers = [
      "Customer",
      "Email",
      "Phone",
      "User ID",
      "Platform",
      "Installed app",
      "Last updated",
    ];
    const lines = filteredDevices.map((device) =>
      [
        device.name,
        device.email,
        device.phone,
        device.userId,
        device.platform,
        device.installedApp ? "Yes" : "No",
        formatDate(device.updatedAt),
      ]
        .map(escapeCsv)
        .join(",")
    );
    const csv = [headers.map(escapeCsv).join(","), ...lines].join("\r\n");
    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `notification-subscribers-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="ns-page">
      <div className="ns-header">
        <div>
          <div className="ns-eyebrow">
            <span className="ns-eyebrow-dot" />
            CUSTOMER ENGAGEMENT
          </div>
          <h1>Notification subscribers</h1>
          <p>
            Customers and devices that have successfully enabled push
            notifications.
          </p>
        </div>

        <div className="ns-header-actions">
          <button
            type="button"
            className="ns-button ns-button-secondary"
            onClick={() => loadSubscribers(true)}
            disabled={loading || refreshing}
          >
            <span className={refreshing ? "ns-refresh-icon is-spinning" : "ns-refresh-icon"}>
              ↻
            </span>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            className="ns-button ns-button-primary"
            onClick={exportCsv}
            disabled={!filteredDevices.length}
          >
            <span aria-hidden="true">↓</span>
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="ns-error" role="alert">
          <strong>Unable to load subscribers</strong>
          <span>{error}</span>
          <button type="button" onClick={() => loadSubscribers(true)}>
            Try again
          </button>
        </div>
      )}

      <section className="ns-stats" aria-label="Subscriber statistics">
        <article className="ns-stat-card ns-stat-featured">
          <div className="ns-stat-top">
            <span className="ns-stat-label">Subscribed customers</span>
            <span className="ns-stat-icon">♙</span>
          </div>
          <strong>{loading ? "—" : uniqueUsers.toLocaleString()}</strong>
          <span className="ns-stat-foot">Unique customers in current view</span>
        </article>
        <article className="ns-stat-card">
          <div className="ns-stat-top">
            <span className="ns-stat-label">Registered devices</span>
            <span className="ns-stat-icon">▣</span>
          </div>
          <strong>{loading ? "—" : filteredDevices.length.toLocaleString()}</strong>
          <span className="ns-stat-foot">Enabled devices with a saved token</span>
        </article>
        <article className="ns-stat-card">
          <div className="ns-stat-top">
            <span className="ns-stat-label">Mobile devices</span>
            <span className="ns-stat-icon">⌕</span>
          </div>
          <strong>
            {loading
              ? "—"
              : (
                  (platformCounts.android || 0) +
                  (platformCounts.ios || 0)
                ).toLocaleString()}
          </strong>
          <span className="ns-stat-foot">Android and iOS registrations</span>
        </article>
        <article className="ns-stat-card">
          <div className="ns-stat-top">
            <span className="ns-stat-label">Installed apps</span>
            <span className="ns-stat-icon">◫</span>
          </div>
          <strong>
            {loading
              ? "—"
              : devices.filter((device) => device.installedApp).length.toLocaleString()}
          </strong>
          <span className="ns-stat-foot">Home Screen or desktop app</span>
        </article>
      </section>

      <section className="ns-panel">
        <div className="ns-panel-heading">
          <div>
            <h2>Subscribed devices</h2>
            <p>
              {loading
                ? "Loading registrations…"
                : `${filteredDevices.length.toLocaleString()} device${filteredDevices.length === 1 ? "" : "s"} shown`}
              {lastLoaded && !loading
                ? ` · Updated ${lastLoaded.toLocaleTimeString()}`
                : ""}
            </p>
          </div>
          <span className="ns-live-indicator">
            <span />
            Enabled only
          </span>
        </div>

        <div className="ns-filters">
          <label className="ns-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, phone, email or user ID"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                ×
              </button>
            )}
          </label>

          <select
            value={platform}
            onChange={(event) => setPlatform(event.target.value)}
            aria-label="Filter by platform"
          >
            {PLATFORM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={appType}
            onChange={(event) => setAppType(event.target.value)}
            aria-label="Filter by app type"
          >
            <option value="all">All app types</option>
            <option value="installed">Installed app</option>
            <option value="browser">Browser</option>
          </select>
        </div>

        <div className="ns-table-wrap">
          <table className="ns-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Platform</th>
                <th>App type</th>
                <th>Last registered</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`skeleton-${index}`}>
                    <td colSpan="5">
                      <div className="ns-skeleton-row" />
                    </td>
                  </tr>
                ))
              ) : filteredDevices.length ? (
                filteredDevices.map((device) => (
                  <tr key={`${device.userPath}/${device.id}`}>
                    <td>
                      <div className="ns-customer">
                        <div className="ns-avatar">
                          {device.name === "Unnamed customer"
                            ? "?"
                            : device.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="ns-customer-info">
                          <strong>{device.name}</strong>
                          <span>{device.email || device.phone || device.userId}</span>
                          {device.email && device.phone && (
                            <small>{device.phone}</small>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`ns-platform ns-platform-${device.platform}`}>
                        <span className="ns-platform-dot" />
                        {device.platform.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className="ns-app-type">
                        {device.installedApp ? "Installed app" : "Browser"}
                      </span>
                    </td>
                    <td className="ns-date">{formatDate(device.updatedAt)}</td>
                    <td>
                      <span className="ns-status">
                        <span />
                        Subscribed
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5">
                    <div className="ns-empty">
                      <div className="ns-empty-icon">♧</div>
                      <strong>No notification subscribers found</strong>
                      <span>
                        {devices.length
                          ? "Try changing your search or filters."
                          : "Customers will appear here after they enable notifications."}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="ns-note">
        <span aria-hidden="true">ⓘ</span>
        <p>
          This page lists device registrations where <code>enabled</code> is
          true and a notification token is present. A saved token does not
          guarantee that the device is still reachable; tokens can expire and
          should be cleaned up when Firebase reports them as invalid.
        </p>
      </div>
    </main>
  );
}
