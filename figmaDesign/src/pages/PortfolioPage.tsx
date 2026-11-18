import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { MainTab } from "../App";
import { PortfolioCard } from "../components/PortfolioCard";
import { Button, EmptyState, StatusBar, TabBar } from "../components/ui";
import { portfolios } from "../data/mockData";

type Props = {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  onToast: (message: string) => void;
};

const categories = ["全部", "新娘妆", "生活妆", "舞台妆", "证件照"];

export function PortfolioPage({ activeTab, onTabChange, onToast }: Props) {
  const [category, setCategory] = useState("全部");
  const filtered = useMemo(
    () =>
      category === "全部" ? portfolios : portfolios.filter((item) => item.category === category),
    [category],
  );

  return (
    <div className="page page-with-tabs portfolio-page">
      <div className="portfolio-top">
        <StatusBar />
        <div className="page-title-row">
          <div>
            <span className="section-kicker">MY WORK</span>
            <h1>作品集</h1>
          </div>
          <Button onClick={() => onToast("作品集编辑器将在下一版本开放")}>
            <Plus size={17} /> 新建作品集
          </Button>
        </div>
        <div className="segment-control">
          {categories.map((item) => (
            <button
              key={item}
              className={category === item ? "active" : ""}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-content portfolio-content-scroll">
        <div className="portfolio-summary">
          <span>{filtered.length} 组作品</span>
          <span>最近更新：今天</span>
        </div>
        {filtered.length > 0 ? (
          <div className="portfolio-grid">
            {filtered.map((item) => (
              <PortfolioCard
                key={item.id}
                item={item}
                onClick={() => onToast(`${item.title} · 共 ${item.count} 张作品`)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="还没有作品集"
            description="上传第一组作品，让商家看到你"
            action="创建作品集"
            onAction={() => onToast("作品集编辑器将在下一版本开放")}
          />
        )}
      </div>
      <TabBar active={activeTab} onChange={onTabChange} />
    </div>
  );
}
