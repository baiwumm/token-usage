"use client";

import type { Profile } from "@/lib/auth/profile";

import {
  ArrowRightFromSquare,
  ChevronsExpandVertical,
  Gear,
} from "@gravity-ui/icons";
import { Avatar, Dropdown, Label, Popover, Separator } from "@heroui/react";
import { useRouter } from "next/navigation";
import { type Key } from "react";

import { NAV_COPY } from "@/lib/copy/nav";
import { useLocale } from "@/lib/copy/locale";

function initialsFor(name: string, email: string | null): string {
  if (name.trim()) return name.trim().charAt(0).toUpperCase();
  if (email) return email.charAt(0).toUpperCase();

  return "?";
}

function ProfileAvatar({
  profile,
  displayName,
  email,
}: {
  profile: Profile | null;
  displayName: string;
  email: string | null;
}) {
  return (
    <Avatar className="size-8 shrink-0" color="accent" variant="soft">
      {profile?.avatarUrl ? (
        <Avatar.Image alt={displayName} src={profile.avatarUrl} />
      ) : null}
      <Avatar.Fallback>
        {initialsFor(profile?.displayName ?? "", email)}
      </Avatar.Fallback>
    </Avatar>
  );
}

/**
 * Profile block pinned to the bottom of the sidebar: avatar + name + account
 * email, opening a dropdown with account settings and sign-out (the only
 * sign-out entry point). Collapsed shows the avatar only.
 */
export function SidebarProfile({
  collapsed,
  profile,
  onRequestSignOut,
}: {
  collapsed: boolean;
  profile: Profile | null;
  onRequestSignOut: () => void;
}) {
  const router = useRouter();
  const [locale] = useLocale();
  const copy = NAV_COPY[locale];
  const email = profile?.email ?? null;
  const displayName = profile?.displayName || email || "…";

  const handleAction = (key: Key) => {
    if (key === "settings") {
      router.push("/settings");
    } else if (key === "signout") {
      onRequestSignOut();
    }
  };

  return (
    <div className={`px-2 pt-1 pb-2 ${collapsed ? "flex justify-center" : ""}`}>
      <Dropdown>
        <Dropdown.Trigger
          aria-label={collapsed ? displayName : undefined}
          className={`hover:bg-default flex items-center gap-2.5 rounded-3xl p-2 text-start transition-colors ${
            collapsed ? "justify-center" : "w-full"
          }`}
        >
          <ProfileAvatar
            displayName={displayName}
            email={email}
            profile={profile}
          />
          {collapsed ? null : (
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm leading-tight font-medium">
                  {displayName}
                </span>
                {email ? (
                  <span className="text-muted mt-0.5 truncate text-xs">
                    {email}
                  </span>
                ) : null}
              </span>
              <ChevronsExpandVertical className="text-muted size-3.5 shrink-0" />
            </>
          )}
        </Dropdown.Trigger>

        <Dropdown.Popover className="min-w-60 scrollbar-none">
          <Popover.Arrow />
          <div className="flex items-center gap-3 px-3 pt-3 pb-1">
            <ProfileAvatar
              displayName={displayName}
              email={email}
              profile={profile}
            />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {displayName}
              </span>
              {email ? (
                <span className="text-muted truncate text-xs">{email}</span>
              ) : null}
            </span>
          </div>

          <Separator />

          <Dropdown.Menu onAction={handleAction}>
            <Dropdown.Item id="settings" textValue={copy.accountSettings}>
              <Gear className="text-muted size-4 shrink-0" />
              <Label>{copy.accountSettings}</Label>
            </Dropdown.Item>

            <Separator />

            <Dropdown.Item
              id="signout"
              textValue={copy.signOut}
              variant="danger"
            >
              <ArrowRightFromSquare className="text-danger size-4 shrink-0" />
              <Label>{copy.signOut}</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </div>
  );
}
