import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/one-trade-rule", label: "One Trade Rule" },
  { to: "/history", label: "History" },
  { to: "/mt5-sync", label: "MT5 Sync" },
  { to: "/pathok", label: "পাঠক" },
  { to: "/settings", label: "Settings" },
];

export function AppShell({
  user,
  syncing,
  onSync,
  onSignOut,
  noticeError,
  noticeSuccess,
  onClearNotices,
  children,
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h2>OneTrade Rule</h2>
        <nav>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="secondary-btn" onClick={onSync} disabled={syncing}>
            {syncing ? "Syncing..." : "Sync"}
          </button>
          <div className="user-block">
            <div>{user.user_metadata?.username || "Trader"}</div>
            <small>{user.email}</small>
          </div>
          <button className="secondary-btn" onClick={onSignOut}>
            Sign Out
          </button>
        </div>
      </aside>
      <main className="content">
        {(noticeError || noticeSuccess) && (
          <div className="notices" onClick={onClearNotices}>
            {noticeSuccess ? <div className="notice success">{noticeSuccess}</div> : null}
            {noticeError ? <div className="notice error">{noticeError}</div> : null}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
