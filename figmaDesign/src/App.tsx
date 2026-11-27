import { useEffect, useState } from "react";
import { Toast } from "./components/ui";
import { HomePage } from "./pages/HomePage";
import { DemandHallPage } from "./pages/DemandHallPage";
import { DemandDetailPage } from "./pages/DemandDetailPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { MinePage } from "./pages/MinePage";
import { LoggedOutPage } from "./pages/LoggedOutPage";
import { MyRequestsPage } from "./pages/MyRequestsPage";
import type { Demand } from "./data/mockData";

export type MainTab = "home" | "demands" | "portfolio" | "mine";

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTab>("home");
  const [selectedDemand, setSelectedDemand] = useState<Demand | null>(null);
  const [detailSource, setDetailSource] = useState<MainTab>("home");
  const [appliedIds, setAppliedIds] = useState<Set<number>>(new Set());
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState("");
  const isAuthenticated = false;
  const isReviewingRequestTabs = true;

  const showToast = (message: string) => setToast(message);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const openDemand = (demand: Demand, source: MainTab = activeTab) => {
    setDetailSource(source);
    setSelectedDemand(demand);
  };

  const goToTab = (tab: MainTab) => {
    setSelectedDemand(null);
    setActiveTab(tab);
  };

  const toggleFavorite = (id: number) => {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        showToast("已取消收藏");
      } else {
        next.add(id);
        showToast("已收藏，可在「我的收藏」查看");
      }
      return next;
    });
  };

  const applyToDemand = (id: number) => {
    setAppliedIds((current) => new Set(current).add(id));
    showToast("作品集投递成功，商家会尽快查看");
  };

  const page = selectedDemand ? (
    <DemandDetailPage
      demand={selectedDemand}
      isApplied={appliedIds.has(selectedDemand.id)}
      isFavorite={favoriteIds.has(selectedDemand.id)}
      onBack={() => {
        setSelectedDemand(null);
        setActiveTab(detailSource);
      }}
      onFavorite={() => toggleFavorite(selectedDemand.id)}
      onApply={() => applyToDemand(selectedDemand.id)}
      onToast={showToast}
    />
  ) : (
    <>
      {activeTab === "home" && (
        <HomePage
          activeTab={activeTab}
          onTabChange={goToTab}
          onDemandOpen={(demand) => openDemand(demand, "home")}
          onToast={showToast}
        />
      )}
      {activeTab === "demands" && (
        <DemandHallPage
          activeTab={activeTab}
          onTabChange={goToTab}
          onDemandOpen={(demand) => openDemand(demand, "demands")}
          onToast={showToast}
        />
      )}
      {activeTab === "portfolio" && (
        <PortfolioPage activeTab={activeTab} onTabChange={goToTab} onToast={showToast} />
      )}
      {activeTab === "mine" && (
        <MinePage
          activeTab={activeTab}
          onTabChange={goToTab}
          onNavigate={goToTab}
          onToast={showToast}
        />
      )}
    </>
  );

  return (
    <main className="app-stage">
      <section className="mobile-shell" aria-label="妆集化妆师端">
        {isReviewingRequestTabs ? (
          <MyRequestsPage onToast={showToast} />
        ) : isAuthenticated ? (
          <>{page}</>
        ) : (
          <LoggedOutPage onToast={showToast} />
        )}
        <Toast message={toast} />
      </section>
    </main>
  );
}
