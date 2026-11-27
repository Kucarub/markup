type BrandLogoProps = {
  size?: number;
  className?: string;
};

export function BrandLogo({ size = 64, className = "" }: BrandLogoProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="zhuangji-logo-title zhuangji-logo-description"
    >
      <title id="zhuangji-logo-title">妆集品牌标志</title>
      <desc id="zhuangji-logo-description">三片不对称化妆刷花瓣形成兰花姿态的豆沙玫瑰色标志</desc>
      <rect x="2" y="2" width="60" height="60" rx="17" fill="#FCF5F7" />
      <path d="M29 33C19 32 13 25 16 17C25 17 31 24 29 33Z" fill="#C96D84" />
      <path d="M31 31C28 21 33 13 42 12C46 20 41 29 31 31Z" fill="#B4566E" />
      <path d="M33 34C42 29 51 33 52 42C45 48 35 43 33 34Z" fill="#6B3342" />
      <path d="M31 35C30 43 27 49 22 54" stroke="#B4566E" strokeWidth="4" strokeLinecap="round" />
      <circle cx="31" cy="33" r="3.5" fill="white" />
    </svg>
  );
}
