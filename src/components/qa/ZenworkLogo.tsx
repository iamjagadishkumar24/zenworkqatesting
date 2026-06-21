import zenworkLogo from "@/assets/zenwork-logo.png.asset.json";

type Props = {
  className?: string;
  alt?: string;
};

export function ZenworkLogo({ className = "h-8 w-auto", alt = "Zenwork" }: Props) {
  return <img src={zenworkLogo.url} alt={alt} className={className} />;
}