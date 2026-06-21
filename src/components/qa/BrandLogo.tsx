import { cn } from "@/lib/utils";
import logoAsset from "@/assets/zenwork-logo.png.asset.json";

type Props = {
  className?: string;
  alt?: string;
};

/**
 * Official Zenwork brand mark. Always render alongside the "Zenwork"
 * wordmark — never as a standalone replacement for the product name.
 */
export function BrandLogo({ className, alt = "Zenwork logo" }: Props) {
  return (
    <img
      src={logoAsset.url}
      alt={alt}
      width={40}
      height={40}
      className={cn("h-8 w-8 shrink-0 object-contain select-none", className)}
      draggable={false}
    />
  );
}