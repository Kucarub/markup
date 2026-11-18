import type { ReactNode } from "react";
import {
  BriefcaseBusiness,
  ChevronLeft,
  CircleUserRound,
  Home,
  Images,
  MapPin,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type { MainTab } from "../App";
import type { Demand } from "../data/mockData";

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "text";
}) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Tag({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "brand" | "success" | "warning" | "error" | "neutral";
  className?: string;
}) {
  return <span className={`tag tag-${tone} ${className}`}>{children}</span>;
}

export function LevelBadge({ level = "L2" }: { level?: string }) {
  return <span className="level-badge">{level}</span>;
}

export function Avatar({
  src,
  size = "md",
  level,
  alt = "",
}: {
  src: string;
  size?: "sm" | "md" | "lg";
  level?: string;
  alt?: string;
}) {
  return (
    <span className={`avatar avatar-${size}`}>
      <img src={src} alt={alt} />
      {level && <LevelBadge level={level} />}
    </span>
  );
}

export function StatusBar() {
  return (
    <div className="status-bar" aria-hidden="true">
      <span>9:41</span>
      <div className="status-icons">
        <span className="signal">▮▮▮</span>
        <span>⌁</span>
        <span className="battery" />
      </div>
    </div>
  );
}

export function TopNav({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <header className="top-nav">
      <StatusBar />
      <div className="nav-row">
        <div className="nav-slot">
          {onBack && (
            <button className="icon-btn" onClick={onBack} aria-label="返回">
              <ChevronLeft size={23} />
            </button>
          )}
        </div>
        <h1>{title}</h1>
        <div className="nav-slot nav-right">{right}</div>
      </div>
    </header>
  );
}

const tabs: { id: MainTab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "工作台", icon: Home },
  { id: "demands", label: "需求大厅", icon: BriefcaseBusiness },
  { id: "portfolio", label: "作品集", icon: Images },
  { id: "mine", label: "我的", icon: CircleUserRound },
];

export function TabBar({
  active,
  onChange,
}: {
  active: MainTab;
  onChange: (tab: MainTab) => void;
}) {
  return (
    <nav className="tab-bar" aria-label="主导航">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          className={active === id ? "active" : ""}
          onClick={() => onChange(id)}
          aria-current={active === id ? "page" : undefined}
        >
          <Icon size={22} strokeWidth={active === id ? 2.4 : 1.8} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export function DemandCard({
  demand,
  onClick,
  compact = false,
}: {
  demand: Demand;
  onClick: () => void;
  compact?: boolean;
}) {
  const tone =
    demand.status === "招募中" ? "success" : demand.status === "即将截止" ? "warning" : "neutral";
  return (
    <button className={`demand-card ${compact ? "compact" : ""}`} onClick={onClick}>
      <div className="demand-card-head">
        <div>
          <p className="eyebrow">{demand.merchant}</p>
          <h3>{demand.title}</h3>
        </div>
        <Tag tone={tone}>{demand.status}</Tag>
      </div>
      <div className="demand-meta">
        <span>{demand.occasion}</span>
        <i />
        <span>{demand.people} 人</span>
        <i />
        <span>{demand.duration}</span>
      </div>
      <div className="demand-card-foot">
        <div className="pay">
          <span>¥</span>
          {demand.pay}
          <small>/{demand.payUnit}</small>
        </div>
        <div className="location">
          <span>
            <MapPin size={13} />
            {demand.district} · {demand.distance}
          </span>
          <span>{demand.date}</span>
        </div>
      </div>
      {!compact && (
        <div className={`deadline ${demand.status === "即将截止" ? "urgent" : ""}`}>
          {demand.deadline}
        </div>
      )}
    </button>
  );
}

export function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="search-field">
      <Search size={18} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="搜索需求/场合/商家"
        aria-label="搜索需求"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="清空搜索">
          ×
        </button>
      )}
    </label>
  );
}

export function EmptyState({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="empty-state">
      <div className="empty-illustration" aria-hidden="true">
        <div className="empty-card">
          <Search size={26} />
          <span />
          <span />
        </div>
        <SlidersHorizontal className="empty-filter" size={30} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <Button variant="secondary" onClick={onAction}>
        {action}
      </Button>
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  return (
    <div className={`toast ${message ? "show" : ""}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
