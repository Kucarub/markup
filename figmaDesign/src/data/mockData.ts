export type DemandStatus = "招募中" | "即将截止" | "已招满";

export type Demand = {
  id: number;
  title: string;
  merchant: string;
  pay: number;
  payUnit: string;
  occasion: string;
  people: number;
  duration: string;
  date: string;
  dateFull: string;
  time: string;
  district: string;
  address: string;
  distance: string;
  deadline: string;
  status: DemandStatus;
  makeupType: string;
  kit: string;
  settlement: string;
  requirements: string;
  match: number;
  skills: { name: string; matched: boolean }[];
};

export type Portfolio = {
  id: number;
  title: string;
  category: string;
  image: string;
  tags: string[];
  count: number;
  status: "已发布" | "草稿" | "审核中";
  ratio: "portrait" | "square";
};

export const profileImage =
  "https://images.unsplash.com/photo-1624091844772-554661d10173?auto=format&fit=crop&w=240&q=85";

export const demands: Demand[] = [
  {
    id: 1,
    title: "10月20日婚礼跟妆 · 需2人",
    merchant: "云朵婚礼定制",
    pay: 800,
    payUnit: "人",
    occasion: "婚礼跟妆",
    people: 2,
    duration: "全天 8h",
    date: "10月20日",
    dateFull: "2026年10月20日",
    time: "06:00–14:00",
    district: "徐汇区",
    address: "上海市徐汇区衡山路 12 号",
    distance: "3.2km",
    deadline: "剩 18 小时",
    status: "即将截止",
    makeupType: "新娘妆、盘发",
    kit: "化妆师自备",
    settlement: "服务结束后当日结算",
    requirements:
      "需要有新娘早妆经验，能够独立完成底妆、眼妆与盘发造型。现场需配合摄影师节奏，准时到场，妆面以清透自然为主。请投递包含正面妆面和发型细节的作品集。",
    match: 85,
    skills: [
      { name: "新娘妆", matched: true },
      { name: "盘发", matched: true },
      { name: "早妆", matched: false },
    ],
  },
  {
    id: 2,
    title: "秋季婚纱样片拍摄化妆",
    merchant: "光屿摄影工作室",
    pay: 1200,
    payUnit: "天",
    occasion: "影楼拍摄",
    people: 1,
    duration: "6h",
    date: "10月23日",
    dateFull: "2026年10月23日",
    time: "09:00–15:00",
    district: "静安区",
    address: "上海市静安区巨鹿路 158 号",
    distance: "5.8km",
    deadline: "剩 3 天",
    status: "招募中",
    makeupType: "清透妆、复古妆",
    kit: "商家提供",
    settlement: "拍摄完成后 3 个工作日",
    requirements:
      "本次拍摄包含两组室内景和一组街景，需要根据服装快速调整唇色与发型。希望你熟悉镜头妆感，能够与造型师顺畅协作。",
    match: 92,
    skills: [
      { name: "镜头妆", matched: true },
      { name: "复古妆", matched: true },
      { name: "盘发", matched: true },
    ],
  },
  {
    id: 3,
    title: "品牌秋冬发布会后台妆造",
    merchant: "缪斯活动策划",
    pay: 680,
    payUnit: "天",
    occasion: "活动会展",
    people: 4,
    duration: "5h",
    date: "10月25日",
    dateFull: "2026年10月25日",
    time: "13:00–18:00",
    district: "浦东新区",
    address: "上海市浦东新区龙阳路 2345 号",
    distance: "8.6km",
    deadline: "剩 5 天",
    status: "招募中",
    makeupType: "舞台妆",
    kit: "化妆师自备",
    settlement: "活动结束当日结算",
    requirements:
      "需在规定时间内完成模特基础妆造，现场有主造型师统一协调。要求工具消毒规范，有大型活动后台经验优先。",
    match: 78,
    skills: [
      { name: "舞台妆", matched: true },
      { name: "快速妆造", matched: true },
      { name: "男妆", matched: false },
    ],
  },
  {
    id: 4,
    title: "古风主题写真妆发",
    merchant: "拾光照相馆",
    pay: 500,
    payUnit: "单",
    occasion: "写真拍摄",
    people: 1,
    duration: "3h",
    date: "10月28日",
    dateFull: "2026年10月28日",
    time: "10:00–13:00",
    district: "黄浦区",
    address: "上海市黄浦区福州路 211 号",
    distance: "2.4km",
    deadline: "剩 7 天",
    status: "招募中",
    makeupType: "古风妆、发簪造型",
    kit: "商家提供",
    settlement: "拍摄结束当日结算",
    requirements: "熟悉古风眉形、面部修容和发包造型，现场提供服装与主要发饰。请携带个人常用刷具。",
    match: 88,
    skills: [
      { name: "古风妆", matched: true },
      { name: "发簪造型", matched: true },
      { name: "男妆", matched: false },
    ],
  },
  {
    id: 5,
    title: "企业形象照轻妆服务",
    merchant: "一格商业摄影",
    pay: 900,
    payUnit: "天",
    occasion: "企业拍摄",
    people: 8,
    duration: "7h",
    date: "11月02日",
    dateFull: "2026年11月2日",
    time: "09:00–16:00",
    district: "长宁区",
    address: "上海市长宁区定西路 727 号",
    distance: "6.1km",
    deadline: "已结束",
    status: "已招满",
    makeupType: "生活妆、男妆",
    kit: "化妆师自备",
    settlement: "服务后 5 个工作日",
    requirements: "以自然、职业的形象照妆面为主，需要同时处理男士基础妆容。",
    match: 70,
    skills: [
      { name: "生活妆", matched: true },
      { name: "男妆", matched: false },
      { name: "快速妆造", matched: true },
    ],
  },
  {
    id: 6,
    title: "周末证件照妆容协作",
    merchant: "简影照相馆",
    pay: 450,
    payUnit: "天",
    occasion: "证件照",
    people: 6,
    duration: "4h",
    date: "11月06日",
    dateFull: "2026年11月6日",
    time: "13:00–17:00",
    district: "杨浦区",
    address: "上海市杨浦区大学路 88 号",
    distance: "10.2km",
    deadline: "剩 12 天",
    status: "招募中",
    makeupType: "证件照妆",
    kit: "商家提供",
    settlement: "当日结算",
    requirements: "妆面干净自然，能够根据不同面部特点快速调整。平均每位顾客服务时间约 30 分钟。",
    match: 80,
    skills: [
      { name: "生活妆", matched: true },
      { name: "快速妆造", matched: true },
      { name: "男妆", matched: false },
    ],
  },
];

export const portfolios: Portfolio[] = [
  {
    id: 1,
    title: "清透晨光新娘妆",
    category: "新娘妆",
    image:
      "https://images.unsplash.com/photo-1593260853607-d0e0f639bdab?auto=format&fit=crop&w=620&q=86",
    tags: ["清透", "高级感"],
    count: 12,
    status: "已发布",
    ratio: "portrait",
  },
  {
    id: 2,
    title: "东方红韵",
    category: "新娘妆",
    image:
      "https://images.unsplash.com/photo-1686044662204-ea3b6a7a0336?auto=format&fit=crop&w=620&q=86",
    tags: ["中式", "复古"],
    count: 9,
    status: "已发布",
    ratio: "square",
  },
  {
    id: 3,
    title: "柔雾日常妆",
    category: "生活妆",
    image:
      "https://images.unsplash.com/photo-1589525231707-f2de2428f59c?auto=format&fit=crop&w=620&q=86",
    tags: ["自然", "柔雾"],
    count: 8,
    status: "已发布",
    ratio: "square",
  },
  {
    id: 4,
    title: "鎏金舞台造型",
    category: "舞台妆",
    image:
      "https://images.unsplash.com/photo-1717041358897-ee10e8043879?auto=format&fit=crop&w=620&q=86",
    tags: ["舞台", "光泽"],
    count: 15,
    status: "审核中",
    ratio: "portrait",
  },
  {
    id: 5,
    title: "职场形象轻妆",
    category: "证件照",
    image:
      "https://images.unsplash.com/photo-1623992417892-83260e5c4d5a?auto=format&fit=crop&w=620&q=86",
    tags: ["干净", "自然"],
    count: 6,
    status: "草稿",
    ratio: "portrait",
  },
  {
    id: 6,
    title: "法式复古晚宴妆",
    category: "生活妆",
    image:
      "https://images.unsplash.com/photo-1623992417427-f6b2794bbd71?auto=format&fit=crop&w=620&q=86",
    tags: ["复古", "晚宴"],
    count: 11,
    status: "已发布",
    ratio: "square",
  },
];
