import {
  Archive,
  BracketsCurly,
  CheckCircle,
  Compass,
  Fingerprint,
  Graph,
  Pulse,
  Ruler,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

const icons: Record<string, Icon> = {
  compass: Compass,
  archive: Archive,
  blueprint: Ruler,
  network: Graph,
  fingerprint: Fingerprint,
  check: CheckCircle,
  pulse: Pulse,
  code: BracketsCurly,
};

export function DomainIcon({ name, size = 28, weight = "duotone" }: { name: string; size?: number; weight?: "duotone" | "bold" | "fill" }) {
  const Component = icons[name] ?? Compass;
  return <Component aria-hidden size={size} weight={weight} />;
}
