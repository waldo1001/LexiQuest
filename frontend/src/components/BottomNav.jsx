import { NavLink, useMatch } from "react-router-dom";
import { useT } from "../i18n/useT.js";

const LINKS = [
  { to: "/dashboard", labelKey: "nav.dashboard" },
  { to: "/home", labelKey: "nav.study" },
  { to: "/family", labelKey: "nav.family" },
  { to: "/settings", labelKey: "nav.settings" },
];

function NavItem({ to, label }) {
  const match = useMatch(to);
  return (
    <NavLink to={to} aria-current={match ? "page" : undefined}>
      {label}
    </NavLink>
  );
}

export default function BottomNav() {
  const t = useT();
  return (
    <nav aria-label="bottom navigation">
      {LINKS.map(({ to, labelKey }) => (
        <NavItem key={to} to={to} label={t(labelKey)} />
      ))}
    </nav>
  );
}
