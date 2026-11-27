import { useState } from "react";
import {
  BriefcaseBusiness,
  ChevronRight,
  CircleDot,
  Home,
  MapPin,
  MoreHorizontal,
  Plus,
  Search,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Button, StatusBar, Tag } from "../components/ui";

type RequestStatus = "全部" | "待响应" | "已响应" | "已选定" | "已关闭";

const tabs: { label: RequestStatus; count: number }[] = [
  { label: "全部", count: 1 },
  { label: "待响应", count: 1 },
  { label: "已响应", count: 0 },
  { label: "已选定", count: 0 },
  { label: "已关闭", count: 0 },
];

export function MyRequestsPage({ onToast }: { onToast: (message: string) => void }) {
  const [activeTab, setActiveTab] = useState<RequestStatus>("全部");
  const hasRequest = activeTab === "全部" || activeTab === "待响应";

  return (
    <div className="page merchant-requests-page">
      <header className="merchant-mini-header">
        <StatusBar />
        <div className="merchant-nav-row">
          <span />
          <strong>我的需求</strong>
          <button onClick={() => onToast("更多操作")} aria-label="更多操作">
            <MoreHorizontal size={20} />
            <i>
              <CircleDot size={19} />
            </i>
          </button>
        </div>
      </header>

      <div className="merchant-requests-scroll">
        <section className="requests-title">
          <span>MY REQUESTS</span>
          <h1>我的需求</h1>
          <p>发布后等待同城化妆师响应，价格与履约线下确认</p>
        </section>

        <button className="request-search" onClick={() => onToast("搜索与筛选功能仅作界面展示")}>
          <Search size={16} />
          <span>找化妆师 · 按风格、档期、距离筛选</span>
          <ChevronRight size={14} />
        </button>

        <div className="request-tabs-wrap">
          <div className="request-status-tabs" role="tablist" aria-label="需求状态">
            {tabs.map((tab) => (
              <button
                key={tab.label}
                role="tab"
                aria-selected={activeTab === tab.label}
                className={activeTab === tab.label ? "active" : ""}
                onClick={() => setActiveTab(tab.label)}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && <i>{tab.count}</i>}
              </button>
            ))}
          </div>
          <div className="tab-context">
            <span>{activeTab === "全部" ? "全部需求" : activeTab}</span>
            <small>{hasRequest ? "共 1 条" : "暂无记录"}</small>
          </div>
        </div>

        {hasRequest ? (
          <article className="merchant-request-card">
            <div className="request-card-top">
              <div>
                <span className="request-date">11月25日</span>
                <h2>日常妆造 · 1 人</h2>
              </div>
              <Tag tone="warning">待响应</Tag>
            </div>
            <div className="request-quick-info">
              <span>
                <MapPin size={14} />
                太仓 · 1km
              </span>
              <span>
                <UsersRound size={14} />1 人
              </span>
              <strong>¥1–2</strong>
            </div>
            <div className="request-tags">
              <span>清新</span>
              <span>日常妆</span>
            </div>
            <div className="request-card-footer">
              <div>
                <CircleDot size={15} />
                等待化妆师响应
              </div>
              <Button variant="secondary" onClick={() => onToast("关闭需求功能仅作界面展示")}>
                关闭需求
              </Button>
            </div>
          </article>
        ) : (
          <div className="request-empty">
            <span>
              <BriefcaseBusiness size={25} />
            </span>
            <strong>这里还没有需求</strong>
            <p>切换其他状态，或发布一条新的用人需求</p>
          </div>
        )}

        {hasRequest && <div className="list-end">没有更多了</div>}
      </div>

      <button className="publish-request-fab" onClick={() => onToast("发布需求功能仅作界面展示")}>
        <Plus size={17} />
        发布需求
      </button>

      <nav className="merchant-bottom-nav" aria-label="商家主导航">
        <button onClick={() => onToast("工作台")}>
          <Home size={21} />
          <span>工作台</span>
        </button>
        <button className="active">
          <BriefcaseBusiness size={21} />
          <span>我的需求</span>
        </button>
        <button onClick={() => onToast("我的")}>
          <UserRound size={21} />
          <span>我的</span>
        </button>
      </nav>
    </div>
  );
}
