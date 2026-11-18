import {
  Award,
  Bookmark,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  FileCheck2,
  Heart,
  Info,
  LogOut,
  Send,
} from "lucide-react";
import type { MainTab } from "../App";
import { Avatar, Button, StatusBar, TabBar } from "../components/ui";
import { profileImage } from "../data/mockData";

type Props = {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  onNavigate: (tab: MainTab) => void;
  onToast: (message: string) => void;
};

const menuItems = [
  { label: "我的投递", icon: Send, badge: "2" },
  { label: "我的收藏", icon: Bookmark },
  { label: "档期管理", icon: CalendarDays },
  { label: "技能认证", icon: FileCheck2, note: "2 项待认证" },
  { label: "我的等级", icon: Award, note: "距 L3 还差 80 分" },
  { label: "帮助与反馈", icon: CircleHelp },
  { label: "关于我们", icon: Info },
];

export function MinePage({ activeTab, onTabChange, onNavigate, onToast }: Props) {
  return (
    <div className="page page-with-tabs mine-page">
      <section className="mine-hero">
        <StatusBar />
        <div className="mine-heading">
          <span className="section-kicker">PROFILE</span>
          <h1>我的</h1>
        </div>
        <div className="mine-profile">
          <Avatar src={profileImage} size="lg" level="L2" alt="化妆师林知夏" />
          <div>
            <h2>林知夏</h2>
            <p>上海 · 成长中的专业化妆师</p>
          </div>
          <button aria-label="编辑个人资料" onClick={() => onToast("资料编辑功能将在下一版本开放")}>
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="mine-progress">
          <div>
            <span>资料完整度</span>
            <strong>82%</strong>
          </div>
          <span>
            <i style={{ width: "82%" }} />
          </span>
        </div>
      </section>

      <div className="scroll-content mine-content">
        <section className="mine-stats">
          <button onClick={() => onNavigate("portfolio")}>
            <strong>12</strong>
            <span>作品</span>
          </button>
          <button onClick={() => onToast("你收藏了 8 条需求")}>
            <strong>8</strong>
            <span>收藏</span>
          </button>
          <button onClick={() => onToast("本月已投递 5 次")}>
            <strong>5</strong>
            <span>投递</span>
          </button>
        </section>

        <section className="menu-card">
          {menuItems.map(({ label, icon: Icon, badge, note }, index) => (
            <button
              key={label}
              className={index === 5 ? "menu-separator" : ""}
              onClick={() => onToast(`${label}功能将在下一版本开放`)}
            >
              <span className="menu-icon">
                <Icon size={19} />
              </span>
              <span className="menu-label">{label}</span>
              {badge && <i>{badge}</i>}
              {note && <small>{note}</small>}
              <ChevronRight size={17} />
            </button>
          ))}
        </section>

        <div className="growth-note">
          <Heart size={18} />
          <div>
            <strong>每一次认真练习，都在积累专业</strong>
            <span>继续完善作品，你会被更多商家看到</span>
          </div>
        </div>

        <Button
          variant="ghost"
          className="logout-btn"
          onClick={() => onToast("演示模式下不会退出登录")}
        >
          <LogOut size={17} />
          退出登录
        </Button>
      </div>
      <TabBar active={activeTab} onChange={onTabChange} />
    </div>
  );
}
