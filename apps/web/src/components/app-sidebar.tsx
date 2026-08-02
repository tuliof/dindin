"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@dindin/ui/components/sidebar";
import {
  ArrowLeftRightIcon,
  BookOpenIcon,
  BotIcon,
  FrameIcon,
  MapIcon,
  PieChartIcon,
  RefreshCwIcon,
  Settings2Icon,
  TerminalSquareIcon,
  UsersRoundIcon,
  WalletCardsIcon,
} from "lucide-react";
import type * as React from "react";
import { NavMain } from "@/components/nav-main";
import { NavProjects } from "@/components/nav-projects";
import { NavUser } from "@/components/nav-user";
import { TeamSwitcher } from "@/components/team-switcher";

const data = {
  navMain: [
    {
      icon: <FrameIcon />,
      title: "Dashboard",
      url: "/dashboard",
    },
    {
      icon: <RefreshCwIcon />,
      title: "Sync",
      url: "/sync",
    },
    {
      icon: <ArrowLeftRightIcon />,
      title: "Transactions",
      url: "/transactions",
    },
    {
      icon: <TerminalSquareIcon />,
      isActive: true,
      items: [
        {
          title: "History",
          url: "#",
        },
        {
          title: "Starred",
          url: "#",
        },
        {
          title: "Settings",
          url: "#",
        },
      ],
      title: "Debug",
      url: "#",
    },
    {
      icon: <BotIcon />,
      title: "AI",
      url: "/ai",
    },
    {
      icon: <BookOpenIcon />,
      items: [
        {
          title: "Introduction",
          url: "#",
        },
        {
          title: "Get Started",
          url: "#",
        },
        {
          title: "Tutorials",
          url: "#",
        },
        {
          title: "Changelog",
          url: "#",
        },
      ],
      title: "Documentation",
      url: "#",
    },
    {
      icon: <Settings2Icon />,
      items: [
        {
          title: "General",
          url: "/settings/general",
        },
      ],
      title: "Settings",
      url: "/settings/general",
    },
  ],
  projects: [
    {
      icon: <FrameIcon />,
      name: "Design Engineering",
      url: "#",
    },
    {
      icon: <PieChartIcon />,
      name: "Sales & Marketing",
      url: "#",
    },
    {
      icon: <MapIcon />,
      name: "Travel",
      url: "#",
    },
  ],
  user: {
    avatar: "/avatars/shadcn.jpg",
    email: "m@example.com",
    name: "shadcn",
  },
  views: [
    {
      description: "Personal finances",
      logo: <WalletCardsIcon />,
      name: "Acme Inc",
    },
    {
      description: "Shared finances",
      logo: <UsersRoundIcon />,
      name: "Household",
    },
  ],
};

export function AppSidebar({
  activeView,
  onViewChange,
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  activeView: string;
  onViewChange: (view: string) => void;
  user: {
    name: string;
    email: string;
  };
}) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher
          activeView={activeView}
          onViewChange={onViewChange}
          views={data.views}
        />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={{ ...user, avatar: "" }} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
