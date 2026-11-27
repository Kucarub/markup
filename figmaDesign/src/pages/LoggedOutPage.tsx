import { useState } from "react";
import { Brush, Check, ChevronRight, MessageCircle, Store, UsersRound } from "lucide-react";
import { BrandLogo } from "../components/BrandLogo";
import { Button, StatusBar } from "../components/ui";

type Role = "artist" | "business";

export function LoggedOutPage({ onToast }: { onToast: (message: string) => void }) {
  const [role, setRole] = useState<Role>("artist");
  const [agreed, setAgreed] = useState(false);

  const handleLogin = () => {
    if (!agreed) {
      onToast("请先阅读并同意用户协议");
      return;
    }
    onToast("登录功能尚未接入");
  };

  return (
    <div className="page logged-out-page">
      <StatusBar />
      <div className="auth-decoration auth-decoration-one" />
      <div className="auth-decoration auth-decoration-two" />

      <div className="auth-content">
        <header className="auth-brand">
          <BrandLogo size={68} className="auth-logo" />
          <div className="auth-wordmark">妆集</div>
          <p>让每一次练习，都被看见</p>
        </header>

        <section className="role-section" aria-labelledby="role-title">
          <div className="auth-section-heading">
            <span>WELCOME</span>
            <h1 id="role-title">选择你的身份</h1>
            <p>我们会为你准备更合适的工作台</p>
          </div>

          <div className="role-options" role="radiogroup" aria-label="选择身份">
            <button
              className={`role-card ${role === "artist" ? "selected" : ""}`}
              role="radio"
              aria-checked={role === "artist"}
              onClick={() => setRole("artist")}
            >
              <span className="role-icon artist-icon">
                <Brush size={25} />
              </span>
              <span className="role-copy">
                <strong>我是化妆师</strong>
                <small>建作品集，接真实妆面单</small>
                <em>
                  <UsersRound size={13} />
                  6,240 位化妆师正在成长
                </em>
              </span>
              <span className="role-check">
                {role === "artist" ? <Check size={14} /> : <ChevronRight size={17} />}
              </span>
            </button>

            <button
              className={`role-card ${role === "business" ? "selected" : ""}`}
              role="radio"
              aria-checked={role === "business"}
              onClick={() => setRole("business")}
            >
              <span className="role-icon business-icon">
                <Store size={25} />
              </span>
              <span className="role-copy">
                <strong>我是商家</strong>
                <small>发布用人需求，快速找到合适的人</small>
                <em>影楼 · 婚庆 · 工作室</em>
              </span>
              <span className="role-check">
                {role === "business" ? <Check size={14} /> : <ChevronRight size={17} />}
              </span>
            </button>
          </div>
        </section>
      </div>

      <footer className="auth-actions">
        <Button className="wechat-login" onClick={handleLogin}>
          <MessageCircle size={19} fill="currentColor" />
          微信一键登录
        </Button>
        <label className="agreement">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          <span className="agreement-check">{agreed && <Check size={11} />}</span>
          <span>
            已阅读并同意
            <button type="button" onClick={() => onToast("用户协议仅作界面展示")}>
              《用户协议》
            </button>
            <button type="button" onClick={() => onToast("隐私政策仅作界面展示")}>
              《隐私政策》
            </button>
          </span>
        </label>
      </footer>
    </div>
  );
}
