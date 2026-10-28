import type { Profile } from "@/lib/auth/profile";

import { ScrollShadow } from "@heroui/react";

import { Brand } from "./brand";
import { NavItems } from "./nav-items";
import { SidebarProfile } from "./sidebar-profile";

/** Desktop sidebar (lg+) — fixed, transparent over the page background. */
export function Sidebar({
  collapsed,
  profile,
  onRequestSignOut,
}: {
  collapsed: boolean;
  profile: Profile | null;
  onRequestSignOut: () => void;
}) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 hidden flex-col transition-[width] duration-200 lg:flex ${
        collapsed ? "w-19" : "w-66"
      }`}
    >
      <Brand collapsed={collapsed} />
      <ScrollShadow className="min-h-0 flex-1 px-3 py-2" size={24}>
        <NavItems collapsed={collapsed} />
      </ScrollShadow>
      <SidebarProfile
        collapsed={collapsed}
        profile={profile}
        onRequestSignOut={onRequestSignOut}
      />
    </aside>
  );
}
