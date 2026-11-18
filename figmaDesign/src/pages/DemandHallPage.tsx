import { useMemo, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import type { MainTab } from "../App";
import { demands, type Demand } from "../data/mockData";
import { DemandCard, EmptyState, SearchField, StatusBar, TabBar } from "../components/ui";

type Props = {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  onDemandOpen: (demand: Demand) => void;
  onToast: (message: string) => void;
};

export function DemandHallPage({ activeTab, onTabChange, onDemandOpen, onToast }: Props) {
  const [query, setQuery] = useState("");
  const [occasion, setOccasion] = useState("全部场合");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [activeFilter, setActiveFilter] = useState("");

  const filteredDemands = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return demands.filter((demand) => {
      const queryMatched =
        !normalized ||
        `${demand.title}${demand.merchant}${demand.occasion}${demand.district}`
          .toLowerCase()
          .includes(normalized);
      const occasionMatched = occasion === "全部场合" || demand.occasion === occasion;
      const availabilityMatched = !availableOnly || demand.status !== "已招满";
      return queryMatched && occasionMatched && availabilityMatched;
    });
  }, [query, occasion, availableOnly]);

  const clearFilters = () => {
    setQuery("");
    setOccasion("全部场合");
    setAvailableOnly(false);
    setActiveFilter("");
  };

  const cycleOccasion = () => {
    const values = ["全部场合", "婚礼跟妆", "影楼拍摄", "活动会展"];
    setOccasion((current) => values[(values.indexOf(current) + 1) % values.length]);
  };

  return (
    <div className="page page-with-tabs hall-page">
      <div className="hall-top">
        <StatusBar />
        <div className="page-title-row">
          <div>
            <span className="section-kicker">OPPORTUNITIES</span>
            <h1>需求大厅</h1>
          </div>
          <button
            className="filter-icon"
            onClick={() => onToast("已展示与你技能匹配的需求")}
            aria-label="筛选"
          >
            <SlidersHorizontal size={21} />
          </button>
        </div>
        <SearchField value={query} onChange={setQuery} />
        <div className="filter-strip">
          <button className={occasion !== "全部场合" ? "selected" : ""} onClick={cycleOccasion}>
            {occasion} <ChevronDown size={13} />
          </button>
          {["报酬", "日期", "距离"].map((item) => (
            <button
              key={item}
              className={activeFilter === item ? "selected" : ""}
              onClick={() => {
                setActiveFilter(activeFilter === item ? "" : item);
                onToast(activeFilter === item ? `已取消${item}筛选` : `已按${item}优先展示`);
              }}
            >
              {item} <ChevronDown size={13} />
            </button>
          ))}
          <button
            className={availableOnly ? "selected" : ""}
            onClick={() => setAvailableOnly((current) => !current)}
          >
            仅看可约
          </button>
        </div>
      </div>

      <div className="scroll-content hall-content">
        <div className="result-count">
          <span>为你找到 {filteredDemands.length} 个机会</span>
          <span>智能匹配</span>
        </div>
        {filteredDemands.length > 0 ? (
          <div className="card-list">
            {filteredDemands.map((demand) => (
              <DemandCard key={demand.id} demand={demand} onClick={() => onDemandOpen(demand)} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="当前城市暂无匹配需求"
            description="换个筛选条件，或开启新需求提醒"
            action="放宽筛选条件"
            onAction={clearFilters}
          />
        )}
      </div>
      <TabBar active={activeTab} onChange={onTabChange} />
    </div>
  );
}
