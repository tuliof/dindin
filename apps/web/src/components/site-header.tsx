import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@dindin/ui/components/breadcrumb";
import { Separator } from "@dindin/ui/components/separator";
import { SidebarTrigger } from "@dindin/ui/components/sidebar";
import { useRouterState } from "@tanstack/react-router";
import { Fragment } from "react";

interface BreadcrumbEntry {
  href?: string;
  label: string;
}

function getBreadcrumbs(pathname: string): BreadcrumbEntry[] {
  if (pathname === "/logs") {
    return [{ label: "Debug" }, { label: "Logs" }];
  }

  if (pathname === "/settings/general") {
    return [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/settings/general", label: "Settings" },
      { label: "General" },
    ];
  }

  const pages: Record<string, string> = {
    "/ai": "AI",
    "/dashboard": "Dashboard",
    "/sync": "Sync",
    "/transactions": "Transactions",
  };
  const label = pages[pathname];

  return label ? [{ label }] : [{ href: "/dashboard", label: "Dashboard" }];
}

export function SiteHeader() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const breadcrumbs = getBreadcrumbs(pathname);

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex items-center gap-2 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator className="mr-2 h-4" orientation="vertical" />
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((breadcrumb, index) => {
              const isCurrent = index === breadcrumbs.length - 1;

              return (
                <Fragment key={breadcrumb.label}>
                  {index > 0 ? <BreadcrumbSeparator /> : null}
                  <BreadcrumbItem>
                    {isCurrent || !breadcrumb.href ? (
                      <BreadcrumbPage>{breadcrumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink href={breadcrumb.href}>
                        {breadcrumb.label}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  );
}
