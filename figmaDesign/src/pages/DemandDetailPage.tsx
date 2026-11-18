import { useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Heart,
  MapPin,
  Navigation,
  Share2,
  Users,
  X,
} from "lucide-react";
import type { Demand } from "../data/mockData";
import { Button, Tag, TopNav } from "../components/ui";

type Props = {
  demand: Demand;
  isApplied: boolean;
  isFavorite: boolean;
  onBack: () => void;
  onFavorite: () => void;
  onApply: () => void;
  onToast: (message: string) => void;
};

export function DemandDetailPage({
  demand,
  isApplied,
  isFavorite,
  onBack,
  onFavorite,
  onApply,
  onToast,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const isFull = demand.status === "已招满";

  return (
    <div className="page detail-page">
      <TopNav
        title="需求详情"
        onBack={onBack}
        right={
          <button
            className="icon-btn"
            onClick={() => onToast("分享链接已准备好")}
            aria-label="分享需求"
          >
            <Share2 size={20} />
          </button>
        }
      />
      <div className="scroll-content detail-content">
        <section className="detail-hero">
          <div className="detail-label-row">
            <Tag tone={demand.status === "已招满" ? "neutral" : "success"}>{demand.status}</Tag>
            <span>{demand.deadline}</span>
          </div>
          <h1>{demand.title}</h1>
          <div className="merchant-row">
            <div className="merchant-logo">云</div>
            <span>{demand.merchant}</span>
            <BadgeCheck size={16} />
            <small>已认证</small>
          </div>
          <div className="detail-pay">
            <span>¥</span>
            {demand.pay}
            <small>
              /{demand.payUnit} · {demand.duration}
            </small>
          </div>
        </section>

        <section className="detail-section">
          <div className="detail-section-title">
            <span>01</span>
            <h2>需求信息</h2>
          </div>
          <div className="facts-grid">
            <div>
              <CalendarDays />
              <span>服务日期</span>
              <strong>{demand.dateFull}</strong>
            </div>
            <div>
              <Clock3 />
              <span>服务时段</span>
              <strong>{demand.time}</strong>
            </div>
            <div>
              <Users />
              <span>需求人数</span>
              <strong>{demand.people} 人</strong>
            </div>
            <div>
              <span className="makeup-icon">M</span>
              <span>妆容类型</span>
              <strong>{demand.makeupType}</strong>
            </div>
          </div>
          <button className="address-row" onClick={() => onToast("正在打开地图导航")}>
            <MapPin size={19} />
            <span>
              <small>服务地点</small>
              <strong>{demand.address}</strong>
            </span>
            <Navigation size={18} />
          </button>
          <div className="key-values">
            <div>
              <span>化妆箱</span>
              <strong>{demand.kit}</strong>
            </div>
            <div>
              <span>结算方式</span>
              <strong>{demand.settlement}</strong>
            </div>
          </div>
        </section>

        <section className="detail-section">
          <div className="detail-section-title">
            <span>02</span>
            <h2>商家要求</h2>
          </div>
          <p className={`requirements ${expanded ? "expanded" : ""}`}>{demand.requirements}</p>
          <button className="expand-btn" onClick={() => setExpanded((current) => !current)}>
            {expanded ? "收起" : "展开全部"}
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </section>

        <section className="match-card">
          <div className="match-top">
            <div>
              <span>与你的匹配度</span>
              <strong>{demand.match}%</strong>
            </div>
            <div
              className="match-ring"
              style={{ "--match": `${demand.match * 3.6}deg` } as React.CSSProperties}
            >
              <span>{demand.match}</span>
            </div>
          </div>
          <div className="skill-list">
            {demand.skills.map((skill) => (
              <span className={skill.matched ? "matched" : "unmatched"} key={skill.name}>
                {skill.matched ? <Check size={13} /> : <X size={13} />}
                {skill.name}
              </span>
            ))}
          </div>
        </section>
      </div>

      <div className="detail-action-bar">
        <button className={`favorite-btn ${isFavorite ? "active" : ""}`} onClick={onFavorite}>
          <Heart size={21} fill={isFavorite ? "currentColor" : "none"} />
          <span>{isFavorite ? "已收藏" : "收藏"}</span>
        </button>
        <Button
          variant={isApplied ? "secondary" : "primary"}
          disabled={isFull}
          onClick={() => (isApplied ? onToast("投递进度：商家尚未查看") : onApply())}
        >
          {isFull ? "该需求已招满" : isApplied ? "已投递，查看进度" : "投递作品集"}
        </Button>
      </div>
    </div>
  );
}
