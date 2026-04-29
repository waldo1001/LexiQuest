import { NavLink, useMatch } from "react-router-dom";
import { useT } from "../i18n/useT.js";

const LINKS = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: "\u{1F3E0}" },
  { to: "/home", labelKey: "nav.study", icon: "\u{1F4DA}" },
  { to: "/family", labelKey: "nav.family", icon: "\u{1F46A}" },
  { to: "/settings", labelKey: "nav.settings", icon: "\u2699\uFE0F" },
  { to: "/", labelKey: "nav.picker", icon: "\u{1F465}" },
];

function NavItem({ to, label, icon }) {
  const match = useMatch(to);
  return (
    <NavLink to={to} className="bottom-nav-item" aria-current={match ? "page" : undefined}>
      <span className="bottom-nav-icon">{icon}</span>
      <span className="bottom-nav-label">{label}</span>
    </NavLink>
  );
}

export default function BottomNav() {
  const t = useT();
  return (
    <nav className="bottom-nav" aria-label="bottom navigation">
      {LINKS.map(({ to, labelKey, icon }) => (
        <NavItem key={to} to={to} label={t(labelKey)} icon={icon} />
      ))}
    </nav>
  );
}
