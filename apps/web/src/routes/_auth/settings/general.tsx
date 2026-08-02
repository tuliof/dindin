import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dindin/ui/components/card";
import { Label } from "@dindin/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dindin/ui/components/select";
import { createFileRoute } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { FinanceShell } from "@/components/finance-shell";

export const Route = createFileRoute("/_auth/settings/general")({
  component: GeneralSettingsPage,
});

function GeneralSettingsPage() {
  const { session } = Route.useRouteContext();

  return (
    <FinanceShell
      user={{
        email: session?.user.email ?? "",
        name: session?.user.name ?? "User",
      }}
    >
      {() => (
        <main className="flex flex-1 flex-col gap-6 p-4 pt-0 lg:p-6 lg:pt-0">
          <div className="border-b py-5">
            <p className="text-muted-foreground text-sm">Settings</p>
            <h1 className="font-semibold text-2xl tracking-tight">General</h1>
          </div>
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Choose how DinDin looks on this device.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ThemePreference />
            </CardContent>
          </Card>
        </main>
      )}
    </FinanceShell>
  );
}

function ThemePreference() {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="theme-preference">Theme</Label>
      <Select onValueChange={setTheme} value={theme}>
        <SelectTrigger className="w-full max-w-sm" id="theme-preference">
          <SelectValue placeholder="Select a theme" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="system">Device</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <p className="text-muted-foreground text-sm">
        Device follows your operating system preference.
      </p>
    </div>
  );
}
