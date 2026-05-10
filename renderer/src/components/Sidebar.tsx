import { NavLink } from "react-router-dom";
const items = [
  { to: "/", label: "대시보드" },
  { to: "/portfolio", label: "포트폴리오" },
  { to: "/trades", label: "거래 내역" },
  { to: "/decisions", label: "AI 판단" },
  { to: "/backtest", label: "백테스트" },
  { to: "/settings", label: "설정" }
];
export default function Sidebar() {
  return (
    <aside className="w-52 border-r border-neutral-800 p-3 space-y-1">
      <div className="mb-4">
        <div className="font-bold text-lg">빗썸 × Claude</div>
        <div className="text-xs text-neutral-500">자동 매매 트레이더</div>
      </div>
      {items.map(i => (
        <NavLink key={i.to} to={i.to} end
          className={({ isActive }) => `block px-3 py-2 rounded ${isActive ? "bg-neutral-800" : "hover:bg-neutral-900"}`}>
          {i.label}
        </NavLink>
      ))}
    </aside>
  );
}
