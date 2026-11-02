"use client";

// README snippet block shared by the badge card and the one-time token
// reveal (docs/badge.md §7.4): a single/dual-theme toggle, the read-only
// snippet and a copy button. The card passes the placeholder token; the
// reveal dialog passes the real one.

import type { BadgeCopy } from "@/lib/copy/badge";
import type { BadgeView } from "@/lib/badge/api";

import { Copy } from "@gravity-ui/icons";
import {
  Button,
  TextArea,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  toast,
} from "@heroui/react";
import { useState } from "react";

import { firstKey } from "./appearance-helpers";
import { dualThemeSnippet, singleThemeSnippet } from "./badge-helpers";

type Variant = "single" | "dual";

export async function copyText(
  text: string,
  copy: Pick<BadgeCopy, "copied" | "copyFailed">,
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(copy.copied);
  } catch {
    toast(copy.copyFailed);
  }
}

export function BadgeSnippetSection({
  copy,
  origin,
  token,
  view,
}: {
  copy: BadgeCopy;
  origin: string;
  token: string;
  view: BadgeView;
}) {
  const [variant, setVariant] = useState<Variant>("single");
  const snippet =
    variant === "single"
      ? singleThemeSnippet(origin, token, view)
      : dualThemeSnippet(origin, token, view);

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleButtonGroup
          disallowEmptySelection
          aria-label={copy.snippetLabel}
          selectedKeys={[variant]}
          selectionMode="single"
          size="sm"
          onSelectionChange={(keys) => {
            const key = firstKey(keys);

            if (key === "single" || key === "dual") setVariant(key);
          }}
        >
          <ToggleButton id="single">{copy.snippetSingle}</ToggleButton>
          <ToggleButton id="dual">
            <ToggleButtonGroup.Separator />
            {copy.snippetDual}
          </ToggleButton>
        </ToggleButtonGroup>
        <Button
          size="sm"
          variant="secondary"
          onPress={() => {
            void copyText(snippet, copy);
          }}
        >
          <Copy aria-hidden="true" className="size-4" />
          {copy.copy}
        </Button>
      </div>
      <TextField isReadOnly aria-label={copy.snippetLabel} value={snippet}>
        <TextArea
          className="font-mono text-xs"
          rows={variant === "single" ? 3 : 6}
          spellCheck={false}
          variant="secondary"
        />
      </TextField>
    </div>
  );
}
