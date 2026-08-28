import type { LocationId } from '@/engine'
import {
  BankIcon,
  BriefcaseIcon,
  BurgerIcon,
  CartIcon,
  CasinoIcon,
  ClinicIcon,
  ClothingIcon,
  FactoryIcon,
  GadgetsIcon,
  GradCapIcon,
  HomeIcon,
  MarketIcon,
  PawnShopIcon,
  RentOfficeIcon,
  type IconProps,
} from './Icon'

export const LOCATION_ICONS: Record<LocationId, (props: IconProps) => React.JSX.Element> = {
  home: HomeIcon,
  employment: BriefcaseIcon,
  burgers: BurgerIcon,
  megamart: CartIcon,
  university: GradCapIcon,
  factory: FactoryIcon,
  bank: BankIcon,
  clothing: ClothingIcon,
  gadgets: GadgetsIcon,
  market: MarketIcon,
  pawn: PawnShopIcon,
  rentoffice: RentOfficeIcon,
  clinic: ClinicIcon,
  casino: CasinoIcon,
}

/** Which of the four goal categories a location's actions mainly serve —
 * used to tint its board tile and location-panel header, so color carries
 * meaning ("this place helps this goal") instead of being decoration.
 * `null` locations stay neutral so the board doesn't turn into a rainbow;
 * `risk` (casino) reuses the existing --bad red rather than a new hue. */
export type LocationCategory = 'wealth' | 'career' | 'edu' | 'happy' | 'risk'

export const LOCATION_CATEGORY: Record<LocationId, LocationCategory | null> = {
  home: null,
  employment: 'career',
  burgers: 'happy',
  megamart: null,
  university: 'edu',
  factory: 'career',
  bank: 'wealth',
  clothing: null,
  gadgets: null,
  market: null,
  pawn: null,
  rentoffice: 'wealth',
  clinic: null,
  casino: 'risk',
}
