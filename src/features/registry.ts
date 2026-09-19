import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays, Pill, MapPin, Map as MapIcon, Trophy,
  HeartPulse, ShoppingBag, Car,
} from 'lucide-react';

export interface FeatureDef {
  key: string;
  labelKey: string;
  descKey?: string;
  Icon: LucideIcon;
  route: string;
}

/** Shipped features reachable from the Home grid. */
export const LIVE_FEATURES: FeatureDef[] = [
  { key: 'appointments', labelKey: 'features.appointments', Icon: CalendarDays, route: '/appointments' },
  { key: 'meds', labelKey: 'nav.meds', Icon: Pill, route: '/meds' },
  { key: 'nearby', labelKey: 'features.nearby', Icon: MapPin, route: '/nearby' },
];

/** Roadmap: visible but disabled. No fake integrations. */
export const ROADMAP: FeatureDef[] = [
  { key: 'estore', labelKey: 'features.estore', descKey: 'featureDesc.estore', Icon: ShoppingBag, route: '/coming-soon/estore' },
  { key: 'guide', labelKey: 'features.guide', descKey: 'featureDesc.guide', Icon: MapIcon, route: '/coming-soon/guide' },
  { key: 'aia', labelKey: 'features.aia', descKey: 'featureDesc.aia', Icon: HeartPulse, route: '/coming-soon/aia' },
  { key: 'parking', labelKey: 'features.parking', descKey: 'featureDesc.parking', Icon: Car, route: '/coming-soon/parking' },
  { key: 'rewards', labelKey: 'features.rewards', descKey: 'featureDesc.rewards', Icon: Trophy, route: '/coming-soon/rewards' },
];

export function findFeature(key: string): FeatureDef | undefined {
  return [...LIVE_FEATURES, ...ROADMAP].find((f) => f.key === key);
}
