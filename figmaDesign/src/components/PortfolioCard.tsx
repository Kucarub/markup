import { Image as ImageIcon } from "lucide-react";
import type { Portfolio } from "../data/mockData";
import { Tag } from "./ui";

export function PortfolioCard({ item, onClick }: { item: Portfolio; onClick: () => void }) {
  const tone =
    item.status === "已发布" ? "success" : item.status === "审核中" ? "warning" : "neutral";

  return (
    <button className="portfolio-card" onClick={onClick}>
      <div className={`portfolio-cover ${item.ratio}`}>
        <img src={item.image} alt={`${item.title}作品封面`} />
        <div className="photo-count">
          <ImageIcon size={12} />
          {item.count}
        </div>
      </div>
      <div className="portfolio-content">
        <h3>{item.title}</h3>
        <div className="portfolio-tags">
          {item.tags.map((tag) => (
            <Tag key={tag} tone="brand">
              {tag}
            </Tag>
          ))}
        </div>
        <div className="portfolio-status">
          <span>{item.category}</span>
          <Tag tone={tone}>{item.status}</Tag>
        </div>
      </div>
    </button>
  );
}
