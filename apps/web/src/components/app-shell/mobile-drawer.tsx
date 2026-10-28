import type { Profile } from "@/lib/auth/profile";
import type { NavCopy } from "@/lib/copy/nav";

import { Drawer } from "@heroui/react";

import { Brand } from "./brand";
import { NavItems } from "./nav-items";
import { SidebarProfile } from "./sidebar-profile";

/**
 * Mobile drawer (<lg) — same profile-first anatomy as the sidebar.
 * Rendered without the Drawer root: it wraps children in react-aria's
 * DialogTrigger, which warns when the overlay is controlled externally
 * without a trigger child. Backdrop carries the state here. The panel uses the
 * page background (not surface) so the active nav item's surface pill stays
 * visible, matching the desktop sidebar.
 */
export function MobileDrawer({
  copy,
  open,
  profile,
  onOpenChange,
  onRequestSignOut,
}: {
  copy: NavCopy;
  open: boolean;
  profile: Profile | null;
  onOpenChange: (open: boolean) => void;
  onRequestSignOut: () => void;
}) {
  return (
    <Drawer.Backdrop isOpen={open} onOpenChange={onOpenChange}>
      <Drawer.Content placement="left">
        <Drawer.Dialog
          aria-label="Token Usage"
          className="bg-background w-72 max-w-[86vw] p-0"
        >
          <Drawer.Header className="flex h-16 flex-row items-center gap-1 pr-12">
            <div className="min-w-0 flex-1">
              <Brand collapsed={false} />
            </div>
            <Drawer.CloseTrigger aria-label={copy.closeMenu} />
          </Drawer.Header>
          <Drawer.Body className="mt-0 flex flex-col gap-4 px-3 py-3">
            <NavItems
              collapsed={false}
              onNavigate={() => onOpenChange(false)}
            />
          </Drawer.Body>
          <Drawer.Footer className="mt-0 flex flex-col gap-2 px-3 py-3">
            <SidebarProfile
              collapsed={false}
              profile={profile}
              onRequestSignOut={() => {
                onOpenChange(false);
                onRequestSignOut();
              }}
            />
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
