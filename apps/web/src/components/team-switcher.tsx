"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@dindin/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@dindin/ui/components/sidebar";
import { ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import type * as React from "react";
import { useCallback } from "react";

function ViewMenuItem({
  index,
  onViewChange,
  view,
}: {
  index: number;
  onViewChange: (view: string) => void;
  view: {
    name: string;
    logo: React.ReactNode;
  };
}) {
  const handleClick = useCallback(
    () => onViewChange(view.name),
    [onViewChange, view.name]
  );

  return (
    <DropdownMenuItem className="gap-2 p-2" onClick={handleClick}>
      <div className="flex size-6 items-center justify-center rounded-md border">
        {view.logo}
      </div>
      {view.name}
      <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
    </DropdownMenuItem>
  );
}

export function TeamSwitcher({
  activeView,
  onViewChange,
  views,
}: {
  activeView: string;
  onViewChange: (view: string) => void;
  views: {
    name: string;
    logo: React.ReactNode;
    description: string;
  }[];
}) {
  const { isMobile } = useSidebar();
  const activeViewDetails = views.find((view) => view.name === activeView);
  if (!activeViewDetails) {
    return null;
  }
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
                size="lg"
              />
            }
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              {activeViewDetails.logo}
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">
                {activeViewDetails.name}
              </span>
              <span className="truncate text-xs">
                {activeViewDetails.description}
              </span>
            </div>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-fit"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                View
              </DropdownMenuLabel>
              {views.map((view, index) => (
                <ViewMenuItem
                  index={index}
                  key={view.name}
                  onViewChange={onViewChange}
                  view={view}
                />
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem className="gap-2 p-2">
                <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                  <PlusIcon className="size-4" />
                </div>
                <div className="font-medium text-muted-foreground">
                  Add team
                </div>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
