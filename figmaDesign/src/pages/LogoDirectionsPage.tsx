import { useState, type ComponentType } from "react";
import { Check, ChevronRight } from "lucide-react";
import { Button, StatusBar } from "../components/ui";

type ConceptProps = {
  size?: number;
  className?: string;
};

type Concept = {
  id: string;
  name: string;
  english: string;
  description: string;
  traits: string[];
  Mark: ComponentType<ConceptProps>;
};

function MirrorSilhouette({ size = 76, className = "" }: ConceptProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="60" height="60" rx="17" fill="#241C1F" />
      <circle cx="30" cy="27.5" r="15" stroke="#C96D84" strokeWidth="4" />
      <path
        d="M29 18C24.7 20 23 23.8 23.6 28C24 31.1 26.2 32 27.3 34C28.1 35.5 27.4 37 26 38.5"
        stroke="white"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path d="M27 42.5L23 52" stroke="#C96D84" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function MirrorCrescent({ size = 76, className = "" }: ConceptProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="60" height="60" rx="17" fill="#B4566E" />
      <circle cx="31" cy="27" r="16" fill="#F7E7EC" />
      <path
        d="M38 13C32.5 15.6 30 20.2 30.5 25.7C30.8 29.4 33.5 31.4 35 34C36 35.8 35.2 38 33.4 40.6C41.2 39.5 47 32.8 47 24.7C47 19.1 43.4 14.3 38 13Z"
        fill="#B4566E"
      />
      <path d="M28 43L24 53" stroke="#F7E7EC" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function MirrorDual({ size = 76, className = "" }: ConceptProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="60" height="60" rx="17" fill="#FCF5F7" />
      <circle cx="32" cy="29" r="18" stroke="#B4566E" strokeWidth="3.5" />
      <path
        d="M25 18C29 20.5 30 24 28 27C26.8 28.8 26.5 30.5 28.5 32.5C30 34 29.5 37 27 40"
        stroke="#6B3342"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M39 18C35 20.5 34 24 36 27C37.2 28.8 37.5 30.5 35.5 32.5C34 34 34.5 37 37 40"
        stroke="#B4566E"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path d="M32 47V54" stroke="#B4566E" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function MirrorBrushCross({ size = 76, className = "" }: ConceptProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="17"
        fill="white"
        stroke="#E6CDD4"
        strokeWidth="2"
      />
      <circle cx="28" cy="27" r="14.5" stroke="#B4566E" strokeWidth="4" />
      <path
        d="M19 27C22 22.5 26 20.5 31 21"
        stroke="#F0CBD5"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M31 40L38 51" stroke="#B4566E" strokeWidth="5" strokeLinecap="round" />
      <path d="M37 42L47 22" stroke="#241C1F" strokeWidth="4" strokeLinecap="round" />
      <path d="M46.8 22L49.8 14.5C50.8 12 54.4 13 54 15.7L52.6 24L46.8 22Z" fill="#C96D84" />
    </svg>
  );
}

function MirrorMonogram({ size = 76, className = "" }: ConceptProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="60" height="60" rx="17" fill="#F7E7EC" />
      <path
        d="M18 43V22C18 17.6 21.6 14 26 14H38C42.4 14 46 17.6 46 22V43"
        stroke="#B4566E"
        strokeWidth="5"
      />
      <path
        d="M20 42L27 27L32 38L37 27L44 42"
        stroke="#6B3342"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M32 48V54" stroke="#B4566E" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function BloomFour({ size = 76, className = "" }: ConceptProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="17"
        fill="white"
        stroke="#E8D3D9"
        strokeWidth="2"
      />
      <path d="M32 31C22 29 16 21 19 14C26 14 32 20 32 31Z" fill="#B4566E" />
      <path d="M33 31C34 21 41 15 48 18C48 25 42 31 33 31Z" fill="#C96D84" />
      <path d="M33 33C43 34 49 41 46 48C39 48 33 42 33 33Z" fill="#B4566E" />
      <path d="M31 33C30 43 23 49 16 46C16 39 22 33 31 33Z" fill="#C96D84" />
      <circle cx="32" cy="32" r="4" fill="#6B3342" />
    </svg>
  );
}

function BloomFive({ size = 76, className = "" }: ConceptProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="60" height="60" rx="17" fill="#B4566E" />
      <path d="M32 31C25 26 24 17 31 12C38 17 39 26 32 31Z" fill="white" />
      <path d="M34 32C35 23 43 19 50 23C49 31 42 36 34 32Z" fill="#F7E7EC" />
      <path d="M33 35C42 33 48 39 47 47C39 49 33 43 33 35Z" fill="white" />
      <path d="M30 35C31 44 24 49 17 46C16 38 22 33 30 35Z" fill="#F7E7EC" />
      <path d="M30 32C22 36 15 31 15 23C22 19 29 23 30 32Z" fill="white" />
      <circle cx="32" cy="33" r="4" fill="#6B3342" />
    </svg>
  );
}

function BloomOrchid({ size = 76, className = "" }: ConceptProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="60" height="60" rx="17" fill="#FCF5F7" />
      <path d="M29 33C19 32 13 25 16 17C25 17 31 24 29 33Z" fill="#C96D84" />
      <path d="M31 31C28 21 33 13 42 12C46 20 41 29 31 31Z" fill="#B4566E" />
      <path d="M33 34C42 29 51 33 52 42C45 48 35 43 33 34Z" fill="#6B3342" />
      <path d="M31 35C30 43 27 49 22 54" stroke="#B4566E" strokeWidth="4" strokeLinecap="round" />
      <circle cx="31" cy="33" r="3.5" fill="white" />
    </svg>
  );
}

function BloomPuff({ size = 76, className = "" }: ConceptProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="60" height="60" rx="17" fill="#241C1F" />
      <rect x="25" y="10" width="14" height="24" rx="7" fill="#F7E7EC" />
      <rect
        x="30"
        y="27"
        width="14"
        height="24"
        rx="7"
        transform="rotate(90 30 27)"
        fill="#C96D84"
      />
      <rect
        x="39"
        y="30"
        width="14"
        height="24"
        rx="7"
        transform="rotate(180 39 30)"
        fill="#F7E7EC"
      />
      <rect
        x="34"
        y="39"
        width="14"
        height="24"
        rx="7"
        transform="rotate(-90 34 39)"
        fill="#C96D84"
      />
      <rect x="27" y="27" width="10" height="10" rx="3" fill="#B4566E" />
    </svg>
  );
}

function BloomSingleBrush({ size = 76, className = "" }: ConceptProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="17"
        fill="white"
        stroke="#E8D3D9"
        strokeWidth="2"
      />
      <path d="M31.5 51V32" stroke="#6B3342" strokeWidth="5" strokeLinecap="round" />
      <path d="M31.5 33C22 31 16 24 18 16C26 16 32 23 31.5 33Z" fill="#C96D84" />
      <path d="M32.5 33C33 23 40 16 48 17C50 25 43 32 32.5 33Z" fill="#B4566E" />
      <path d="M32 34C25 38 25 45 31.5 48C38 45 39 38 32 34Z" fill="#F7E7EC" />
      <path
        d="M24 18C26 22 28 26 31.5 31M41 19C39 23 36 27 32.5 31"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const mirrorConcepts: Concept[] = [
  {
    id: "M1",
    name: "侧影镜",
    english: "SILHOUETTE",
    description: "深色镜面内用单线勾勒侧脸，成熟克制，适合高质感作品平台。",
    traits: ["高级", "克制", "人物"],
    Mark: MirrorSilhouette,
  },
  {
    id: "M2",
    name: "月相镜",
    english: "CRESCENT",
    description: "用月牙负形表现脸部轮廓，符号感强，小尺寸依然清晰。",
    traits: ["诗意", "简洁", "识别"],
    Mark: MirrorCrescent,
  },
  {
    id: "M3",
    name: "双面镜",
    english: "DUAL FACE",
    description: "两张相对的侧脸构成镜中负形，表达商家与化妆师的双向连接。",
    traits: ["连接", "平衡", "平台"],
    Mark: MirrorDual,
  },
  {
    id: "M4",
    name: "镜刷",
    english: "MIRROR & BRUSH",
    description: "手镜与化妆刷交叠，职业属性最直接，轮廓轻盈现代。",
    traits: ["专业", "直接", "现代"],
    Mark: MirrorBrushCross,
  },
  {
    id: "M5",
    name: "镜框 M",
    english: "MIRROR MONOGRAM",
    description: "镜框内部形成抽象 M 字，兼顾国际感与品牌记忆点。",
    traits: ["几何", "国际", "利落"],
    Mark: MirrorMonogram,
  },
];

const bloomConcepts: Concept[] = [
  {
    id: "B1",
    name: "四瓣刷花",
    english: "FOUR PETALS",
    description: "四枚刷毛旋转围合，结构稳定，亲和而不幼稚。",
    traits: ["平衡", "亲和", "稳定"],
    Mark: BloomFour,
  },
  {
    id: "B2",
    name: "五瓣绽放",
    english: "FIVE PETALS",
    description: "五枚刷头构成完整花簇，视觉饱满，适合作为小程序图标。",
    traits: ["饱满", "传播", "女性"],
    Mark: BloomFive,
  },
  {
    id: "B3",
    name: "兰妆",
    english: "ORCHID",
    description: "三片不对称刷瓣形成兰花姿态，更轻盈，也更有东方审美。",
    traits: ["东方", "灵动", "雅致"],
    Mark: BloomOrchid,
  },
  {
    id: "B4",
    name: "粉扑花",
    english: "PUFF BLOOM",
    description: "四枚圆角粉扑交叠成花，在深色底上更醒目、更年轻。",
    traits: ["年轻", "醒目", "图形"],
    Mark: BloomPuff,
  },
  {
    id: "B5",
    name: "一刷生花",
    english: "BLOOMING BRUSH",
    description: "刷柄向上绽放为花瓣，直接表达练习、成长与作品积累。",
    traits: ["成长", "故事", "温度"],
    Mark: BloomSingleBrush,
  },
];

const allConcepts = [...mirrorConcepts, ...bloomConcepts];

function ConceptGroup({
  title,
  subtitle,
  concepts,
  selected,
  onSelect,
}: {
  title: string;
  subtitle: string;
  concepts: Concept[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="logo-concept-group">
      <div className="concept-group-heading">
        <span>{subtitle}</span>
        <h2>{title}</h2>
      </div>
      {concepts.map(({ id, name, english, description, traits, Mark }) => (
        <button
          key={id}
          className={`logo-concept-card ${selected === id ? "selected" : ""}`}
          onClick={() => onSelect(id)}
          aria-pressed={selected === id}
        >
          <span className="concept-number">{id}</span>
          <span className="concept-mark-wrap">
            <Mark />
            <span className="concept-mini">
              <Mark size={24} />
            </span>
          </span>
          <span className="concept-copy">
            <span className="concept-title">
              <strong>{name}</strong>
              <small>{english}</small>
            </span>
            <span className="concept-description">{description}</span>
            <span className="concept-traits">
              {traits.map((trait) => (
                <i key={trait}>{trait}</i>
              ))}
            </span>
          </span>
          <span className="concept-select">
            {selected === id ? <Check size={14} /> : <ChevronRight size={17} />}
          </span>
        </button>
      ))}
    </section>
  );
}

export function LogoDirectionsPage({ onToast }: { onToast: (message: string) => void }) {
  const [selected, setSelected] = useState("M2");
  const selectedConcept = allConcepts.find((concept) => concept.id === selected)!;

  return (
    <div className="page logo-review-page">
      <StatusBar />
      <header className="logo-review-header">
        <span>BRAND EXPLORATION · ROUND 02</span>
        <h1>镜影 × 刷花</h1>
        <p>两个方向，各 5 款深化方案</p>
      </header>

      <div className="logo-concept-list">
        <ConceptGroup
          title="镜影方向"
          subtitle="MIRROR SERIES"
          concepts={mirrorConcepts}
          selected={selected}
          onSelect={setSelected}
        />
        <ConceptGroup
          title="刷花方向"
          subtitle="BLOOM SERIES"
          concepts={bloomConcepts}
          selected={selected}
          onSelect={setSelected}
        />
      </div>

      <footer className="logo-review-footer">
        <div>
          <span>当前选择</span>
          <strong>
            {selected} · {selectedConcept.name}
          </strong>
        </div>
        <Button onClick={() => onToast(`已暂存 ${selected}「${selectedConcept.name}」`)}>
          选定此方向
        </Button>
      </footer>
    </div>
  );
}
