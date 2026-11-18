import { Bell, ChevronRight, MapPin } from "lucide-react";
import type { MainTab } from "../App";
import { demands, profileImage, type Demand } from "../data/mockData";
import { Avatar, Button, DemandCard, StatusBar, TabBar } from "../components/ui";

type Props = {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  onDemandOpen: (demand: Demand) => void;
  onToast: (message: string) => void;
};

const schedule = [
  { weekday: "今天", day: "16", state: "today" },
  { weekday: "周六", day: "17", state: "available" },
  { weekday: "周日", day: "18", state: "booked" },
  { weekday: "周一", day: "19", state: "available" },
  { weekday: "周二", day: "20", state: "booked" },
  { weekday: "周三", day: "21", state: "available" },
  { weekday: "周四", day: "22", state: "available" },
];

export function HomePage({ activeTab, onTabChange, onDemandOpen, onToast }: Props) {
  return (
    <div className="page page-with-tabs">
      <div className="home-header">
        <StatusBar />
        <div className="home-nav">
          <button onClick={() => onToast("当前试点城市：上海")}>
            <MapPin size={17} />
            上海
            <span>⌄</span>
          </button>
          <div className="wordmark">
            妆集<span>ZHOWN</span>
          </div>
          <button
            className="notification-btn"
            onClick={() => onToast("你有 2 条新消息")}
            aria-label="消息中心"
          >
            <Bell size={22} />
            <i />
          </button>
        </div>
      </div>

      <div className="scroll-content home-content">
        <section className="profile-card">
          <Avatar src={profileImage} size="lg" level="L2" alt="化妆师林知夏" />
          <div className="profile-copy">
            <h1>林知夏</h1>
            <p>L2 初级 · 作品 12 个 · 本月投递 5 次</p>
            <div className="completion">
              <span>
                <i style={{ width: "82%" }} />
              </span>
              资料 82%
            </div>
          </div>
          <Button variant="secondary" onClick={() => onToast("资料编辑功能将在下一版本开放")}>
            完善资料
          </Button>
        </section>

        <section className="stats-strip" aria-label="数据概览">
          {[
            ["128", "作品浏览"],
            ["23", "被查看"],
            ["2", "待回复"],
            ["4", "本月邀约"],
          ].map(([value, label]) => (
            <div key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </section>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <span className="section-kicker">AVAILABILITY</span>
              <h2>近期档期</h2>
            </div>
            <button onClick={() => onToast("档期设置将在下一版本开放")}>
              设置 <ChevronRight size={15} />
            </button>
          </div>
          <div className="schedule-strip">
            {schedule.map((item) => (
              <button
                key={item.day}
                className={`schedule-day ${item.state}`}
                onClick={() =>
                  onToast(item.state === "booked" ? "该日期已有预约" : `${item.day} 日当前可约`)
                }
              >
                <span>{item.weekday}</span>
                <strong>{item.day}</strong>
                {item.state === "available" && <i />}
              </button>
            ))}
          </div>
        </section>

        <section className="section-block recommendations">
          <div className="section-heading">
            <div>
              <span className="section-kicker">FOR YOU</span>
              <h2>适合你的需求</h2>
            </div>
            <button onClick={() => onTabChange("demands")}>
              全部 <ChevronRight size={15} />
            </button>
          </div>
          <div className="card-list">
            {demands.slice(0, 3).map((demand) => (
              <DemandCard
                key={demand.id}
                demand={demand}
                compact
                onClick={() => onDemandOpen(demand)}
              />
            ))}
          </div>
        </section>
      </div>
      <TabBar active={activeTab} onChange={onTabChange} />
    </div>
  );
}
