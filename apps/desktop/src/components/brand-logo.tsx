import { darkLogoFile, logoNeedsBackdrop } from "@/lib/source-logos";

/**
 * Shared brand-mark renderer for source and model rows: an optional registered
 * dark twin stacks over the light file via `.dark`, and marks that read as
 * blank on light cards get a quiet backdrop. Callers own the fallback (letter
 * tile) so the same asset rules apply to both icon components.
 */
export function BrandLogo({ file, size }: { file: string; size: number }) {
  const darkLogo = darkLogoFile(file);

  const image = darkLogo ? (
    <span
      aria-hidden="true"
      className="grid shrink-0 select-none"
      style={{ height: size, width: size }}
    >
      <img
        alt=""
        className="col-start-1 row-start-1 object-contain dark:hidden"
        height={size}
        src={file}
        width={size}
      />
      <img
        alt=""
        className="col-start-1 row-start-1 hidden object-contain dark:block"
        height={size}
        src={darkLogo}
        width={size}
      />
    </span>
  ) : (
    <img
      alt=""
      aria-hidden="true"
      className="shrink-0 object-contain select-none"
      height={size}
      src={file}
      width={size}
    />
  );

  // White marks vanish on light cards — give them a quiet backdrop.
  if (logoNeedsBackdrop(file)) {
    return (
      <span
        aria-hidden="true"
        className="bg-default ring-border/60 inline-flex shrink-0 items-center justify-center rounded-[4px] ring-1 select-none"
        style={{ height: size, width: size }}
      >
        {image}
      </span>
    );
  }

  return image;
}
