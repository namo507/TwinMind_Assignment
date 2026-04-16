/**
 * Minimal ambient typings for lucide-react. Some releases of the package ship
 * without the advertised `dist/lucide-react.d.ts` file; this shim gives us
 * strict-mode TypeScript support with exactly the shape we use.
 *
 * This is intentionally narrow — it types icons as React components accepting
 * SVG props. If we start reaching for lucide's more esoteric exports (dynamic
 * imports, createLucideIcon, etc.) we should replace this shim with a full
 * declaration or pin a lucide-react version that ships its types.
 */
declare module "lucide-react" {
  import type { ComponentType, SVGProps } from "react";

  export interface LucideProps extends SVGProps<SVGSVGElement> {
    size?: string | number;
    absoluteStrokeWidth?: boolean;
    strokeWidth?: string | number;
    color?: string;
  }

  export type LucideIcon = ComponentType<LucideProps>;

  export const AlertCircle: LucideIcon;
  export const BookOpen: LucideIcon;
  export const Download: LucideIcon;
  export const Eye: LucideIcon;
  export const EyeOff: LucideIcon;
  export const KeyRound: LucideIcon;
  export const MessageCircleQuestion: LucideIcon;
  export const Mic: LucideIcon;
  export const MicOff: LucideIcon;
  export const Quote: LucideIcon;
  export const RefreshCcw: LucideIcon;
  export const RotateCcw: LucideIcon;
  export const Send: LucideIcon;
  export const Settings: LucideIcon;
  export const ShieldCheck: LucideIcon;
  export const Sparkles: LucideIcon;
  export const Trash2: LucideIcon;
  export const X: LucideIcon;

  // Permissive fallback for any icon not explicitly listed above.
  const _default: Record<string, LucideIcon>;
  export default _default;
}
