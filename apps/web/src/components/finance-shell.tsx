import { SidebarInset, SidebarProvider } from "@dindin/ui/components/sidebar";
import { type ReactNode, useCallback, useState } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";

type FinanceView = "Acme Inc" | "Household";

export function FinanceShell({
  user,
  children,
}: {
  user: {
    name: string;
    email: string;
  };
  children: (isHouseholdView: boolean) => ReactNode;
}) {
  const [financeView, setFinanceView] = useState<FinanceView>("Acme Inc");
  const handleViewChange = useCallback((view: string) => {
    if (view === "Acme Inc" || view === "Household") {
      setFinanceView(view);
    }
  }, []);

  return (
    <SidebarProvider
      className="[--header-height:calc(var(--spacing)*14)] lg:[--header-height:calc(var(--spacing)*16)]"
      defaultOpen
    >
      <AppSidebar
        activeView={financeView}
        onViewChange={handleViewChange}
        user={user}
      />
      <SidebarInset>
        <SiteHeader />
        {children(financeView === "Household")}
      </SidebarInset>
    </SidebarProvider>
  );
}
