import { NavLink } from "react-router-dom";
const items = [
  { to: "/", label: "Overview" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/trades", label: "Trades" },
  { to: "/decisions", label: "Decisions" },
  { to: "/backtest", label: "Backtest" },
  { to: "/settings", label: "Settings" }
];
export default function Sidebar() {
  return (
    <aside className="w-48 border-r border-neutral-800 p-3 space-y-1">
      <div className="font-bold text-lg mb-4">Bithumb × Claude</div>
      {items.map(i => (
        <NavLink key={i.to} to={i.to} end
          className={({ isActive }) => `block px-3 py-2 rounded ${isActive ? "bg-neutral-800" : "hover:bg-neutral-900"}`}>
          {i.label}
        </NavLink>
      ))}
    </aside>
  );
}
