import type { IntentLevel, MatchLevel, OrganizationType, PipelineStatus, ProcurementType, SourceType } from './types';

/** Predefined hardware categories. Admins can add more at runtime (AppSettings.categories). */
export const HARDWARE_CATEGORIES = [
  'Laptops',
  'Desktop PCs',
  'Workstations',
  'Servers',
  'Storage',
  'Networking',
  'Switches',
  'Routers',
  'Firewalls',
  'Wireless Access Points',
  'Monitors',
  'Docking Stations',
  'Printers',
  'Scanners',
  'UPS',
  'Power Equipment',
  'Data Center Equipment',
  'RAM',
  'SSD',
  'HDD',
  'GPUs',
  'CPUs',
  'Accessories',
  'Cables',
  'Racks',
  'Security Hardware',
  'Telecom Equipment',
  'Other IT Hardware',
] as const;

/**
 * Category detection vocabulary. Order matters: more specific categories are
 * tested first so "network switches" becomes Switches, not Networking.
 * Patterns are matched against lower-cased text on word boundaries.
 */
export const CATEGORY_PATTERNS: { category: string; patterns: RegExp }[] = [
  { category: 'Docking Stations', patterns: /\b(docking stations?|usb-c docks?|thunderbolt docks?|laptop docks?)\b/ },
  { category: 'Wireless Access Points', patterns: /\b(wireless access points?|access points?|waps?|wi-?fi (?:6e?|7)? ?(?:aps?|access points?)|wireless aps?)\b/ },
  { category: 'Firewalls', patterns: /\b(firewalls?|next[- ]generation firewalls?|ngfw|utm appliances?)\b/ },
  { category: 'Switches', patterns: /\b((?:network|ethernet|poe\+?|core|access|layer ?[23]|managed|stackable|\d+-port(?: poe\+?)?)\s+switch(?:es)?|switches)\b/ },
  { category: 'Routers', patterns: /\b(routers?|sd-wan appliances?|edge routers?)\b/ },
  { category: 'Workstations', patterns: /\b(workstations?|cad (?:pcs?|computers?)|engineering workstations?)\b/ },
  { category: 'Laptops', patterns: /\b(laptops?|notebooks?|chromebooks?|2-in-1s?|ultrabooks?|mobile computers?)\b/ },
  { category: 'Desktop PCs', patterns: /\b(desktops?(?: pcs?| computers?)?|desktop pcs?|all-in-one(?:s| pcs?)?|aio pcs?|mini pcs?|micro pcs?|tower pcs?|personal computers?|pcs)\b/ },
  { category: 'Servers', patterns: /\b(servers?|rack servers?|blade servers?|hyperconverged|hci nodes?|compute nodes?)\b/ },
  { category: 'Storage', patterns: /\b(storage arrays?|san|nas|storage systems?|all-flash arrays?|backup appliances?|storage appliances?|network attached storage)\b/ },
  { category: 'Monitors', patterns: /\b(monitors?|lcd panels?|flat panel displays?)\b/ },
  { category: 'Printers', patterns: /\b(printers?|multifunction (?:printers?|devices?)|mfps?|mfds?|copiers?)\b/ },
  { category: 'Scanners', patterns: /\b(scanners?|document scanners?|barcode scanners?)\b/ },
  { category: 'UPS', patterns: /(?<![-\w])(ups|uninterruptible power(?: supply| supplies)?|battery backups?)\b/ },
  { category: 'Power Equipment', patterns: /\b(pdus?|power distribution units?|(?<!redundant |dual |hot-swap )power suppl(?:y|ies)|power equipment)\b/i },
  { category: 'CPUs', patterns: /\b(cpus?|processors?|server processors|replacement processors)\b/i },
  { category: 'Racks', patterns: /\b(server racks?|racks|rack enclosures?|network cabinets?|open-frame racks?)\b/ },
  { category: 'Data Center Equipment', patterns: /\b(data cent(?:er|re) equipment|kvm switches?|cooling units?|crac units?|in-row cooling)\b/ },
  { category: 'RAM', patterns: /\b(ram modules?|memory modules?|dimms|memory upgrades?|ddr[45] (?:memory )?modules?)\b/ },
  { category: 'SSD', patterns: /\b(ssds|solid[- ]state drives|nvme drives|ssd drives)\b/ },
  { category: 'HDD', patterns: /\b(hdds|hard (?:disk )?drives)\b/ },
  { category: 'GPUs', patterns: /\b(gpus?(?!\s+(?:compute\s+)?(?:nodes?|servers?))|graphics cards?|gpu accelerators?)\b/ },
  { category: 'CPUs', patterns: /\b(cpus|server processors|replacement processors)\b/ },
  { category: 'Cables', patterns: /\b((?:monitor|power|network|hdmi|displayport|usb-c|ethernet) cables?|cables|patch cords?|patch cables?|fiber (?:optic )?cables?|cat ?6a? cabling)\b/ },
  { category: 'Security Hardware', patterns: /\b(security cameras?|ip cameras?|nvrs?|access control (?:panels?|hardware)|badge readers?)\b/ },
  { category: 'Telecom Equipment', patterns: /\b(ip phones?|voip phones?|desk phones?|telephony equipment|pbx|conference phones?|headsets?)\b/ },
  { category: 'Networking', patterns: /\b(network(?:ing)? equipment|network hardware|networking|network infrastructure|transceivers?|sfps?)\b/ },
  { category: 'Accessories', patterns: /\b(keyboards?|mice|webcams?|carrying cases?|laptop bags?)\b/ },
  { category: 'Other IT Hardware', patterns: /\b(it (?:equipment|hardware)|computer equipment|technology equipment|computer hardware)\b/ },
];

/** Umbrella groups used by filters/search ("networking" includes switches, routers …). */
export const CATEGORY_GROUPS: Record<string, string[]> = {
  Networking: ['Networking', 'Switches', 'Routers', 'Firewalls', 'Wireless Access Points'],
  Storage: ['Storage', 'SSD', 'HDD'],
  Computers: ['Laptops', 'Desktop PCs', 'Workstations'],
  Power: ['UPS', 'Power Equipment'],
};

export const KNOWN_BRANDS = [
  'Dell',
  'HPE',
  'HP',
  'Lenovo',
  'Apple',
  'Microsoft',
  'Cisco Meraki',
  'Meraki',
  'Cisco',
  'Juniper',
  'Aruba',
  'Arista',
  'Extreme Networks',
  'Fortinet',
  'FortiGate',
  'Palo Alto Networks',
  'Palo Alto',
  'SonicWall',
  'Ubiquiti',
  'Netgear',
  'NetApp',
  'Pure Storage',
  'Synology',
  'Supermicro',
  'APC',
  'Eaton',
  'Vertiv',
  'Tripp Lite',
  'CyberPower',
  'Samsung',
  'LG',
  'ViewSonic',
  'Acer',
  'ASUS',
  'NVIDIA',
  'Intel',
  'AMD',
  'Seagate',
  'Western Digital',
  'Kingston',
  'Crucial',
  'Brother',
  'Xerox',
  'Canon',
  'Epson',
  'Zebra',
  'Fujitsu',
  'Poly',
  'Yealink',
  'Logitech',
  'Axis',
  'Panduit',
] as const;

export const BRAND_ALIASES: Record<string, string> = {
  fortigate: 'Fortinet',
  'palo alto': 'Palo Alto Networks',
  meraki: 'Cisco Meraki',
  'hewlett packard enterprise': 'HPE',
  'hewlett-packard': 'HP',
};

/** Product-line vocabulary helps the model-number extractor and the matcher. */
export const PRODUCT_LINES = [
  'Latitude', 'Precision', 'OptiPlex', 'PowerEdge', 'PowerVault', 'PowerStore', 'UltraSharp', 'Pro Max',
  'EliteBook', 'ProBook', 'EliteDesk', 'ProDesk', 'ZBook', 'ProLiant', 'Z4', 'Z8', 'LaserJet',
  'ThinkPad', 'ThinkCentre', 'ThinkStation', 'ThinkSystem', 'ThinkVision',
  'MacBook Air', 'MacBook Pro', 'Surface Laptop', 'Surface Pro',
  'Catalyst', 'Nexus', 'ISR', 'Meraki MR', 'Meraki MS', 'Meraki MX', 'MR', 'MS', 'MX',
  'CX', 'Instant On', 'EX', 'SRX', 'FortiGate', 'FortiSwitch', 'FortiAP', 'PA', 'UniFi',
  'AFF', 'FAS', 'FlashArray', 'RackStation', 'Smart-UPS', 'Back-UPS', 'NetShelter', '5PX', '9PX',
  '990 PRO', 'Odyssey',
];

export const STATES: { code: string; name: string; col: number; row: number }[] = [
  // Tile-grid layout (col,row) for the U.S. map view — equal-area tiles so small
  // states are as readable as large ones.
  { code: 'AK', name: 'Alaska', col: 0, row: 0 },
  { code: 'ME', name: 'Maine', col: 11, row: 0 },
  { code: 'VT', name: 'Vermont', col: 10, row: 1 },
  { code: 'NH', name: 'New Hampshire', col: 11, row: 1 },
  { code: 'WA', name: 'Washington', col: 1, row: 2 },
  { code: 'ID', name: 'Idaho', col: 2, row: 2 },
  { code: 'MT', name: 'Montana', col: 3, row: 2 },
  { code: 'ND', name: 'North Dakota', col: 4, row: 2 },
  { code: 'MN', name: 'Minnesota', col: 5, row: 2 },
  { code: 'IL', name: 'Illinois', col: 6, row: 2 },
  { code: 'WI', name: 'Wisconsin', col: 7, row: 2 },
  { code: 'MI', name: 'Michigan', col: 8, row: 2 },
  { code: 'NY', name: 'New York', col: 9, row: 2 },
  { code: 'RI', name: 'Rhode Island', col: 10, row: 2 },
  { code: 'MA', name: 'Massachusetts', col: 11, row: 2 },
  { code: 'OR', name: 'Oregon', col: 1, row: 3 },
  { code: 'NV', name: 'Nevada', col: 2, row: 3 },
  { code: 'WY', name: 'Wyoming', col: 3, row: 3 },
  { code: 'SD', name: 'South Dakota', col: 4, row: 3 },
  { code: 'IA', name: 'Iowa', col: 5, row: 3 },
  { code: 'IN', name: 'Indiana', col: 6, row: 3 },
  { code: 'OH', name: 'Ohio', col: 7, row: 3 },
  { code: 'PA', name: 'Pennsylvania', col: 8, row: 3 },
  { code: 'NJ', name: 'New Jersey', col: 9, row: 3 },
  { code: 'CT', name: 'Connecticut', col: 10, row: 3 },
  { code: 'CA', name: 'California', col: 1, row: 4 },
  { code: 'UT', name: 'Utah', col: 2, row: 4 },
  { code: 'CO', name: 'Colorado', col: 3, row: 4 },
  { code: 'NE', name: 'Nebraska', col: 4, row: 4 },
  { code: 'MO', name: 'Missouri', col: 5, row: 4 },
  { code: 'KY', name: 'Kentucky', col: 6, row: 4 },
  { code: 'WV', name: 'West Virginia', col: 7, row: 4 },
  { code: 'VA', name: 'Virginia', col: 8, row: 4 },
  { code: 'MD', name: 'Maryland', col: 9, row: 4 },
  { code: 'DE', name: 'Delaware', col: 10, row: 4 },
  { code: 'AZ', name: 'Arizona', col: 2, row: 5 },
  { code: 'NM', name: 'New Mexico', col: 3, row: 5 },
  { code: 'KS', name: 'Kansas', col: 4, row: 5 },
  { code: 'AR', name: 'Arkansas', col: 5, row: 5 },
  { code: 'TN', name: 'Tennessee', col: 6, row: 5 },
  { code: 'NC', name: 'North Carolina', col: 7, row: 5 },
  { code: 'SC', name: 'South Carolina', col: 8, row: 5 },
  { code: 'DC', name: 'District of Columbia', col: 9, row: 5 },
  { code: 'OK', name: 'Oklahoma', col: 4, row: 6 },
  { code: 'LA', name: 'Louisiana', col: 5, row: 6 },
  { code: 'MS', name: 'Mississippi', col: 6, row: 6 },
  { code: 'AL', name: 'Alabama', col: 7, row: 6 },
  { code: 'GA', name: 'Georgia', col: 8, row: 6 },
  { code: 'HI', name: 'Hawaii', col: 0, row: 7 },
  { code: 'TX', name: 'Texas', col: 4, row: 7 },
  { code: 'FL', name: 'Florida', col: 9, row: 7 },
];

export const STATE_BY_CODE: Record<string, string> = Object.fromEntries(STATES.map((s) => [s.code, s.name]));
export const STATE_BY_NAME: Record<string, string> = Object.fromEntries(STATES.map((s) => [s.name.toLowerCase(), s.code]));

export const ORGANIZATION_TYPES: OrganizationType[] = [
  'Federal Government',
  'State Government',
  'County Government',
  'City Government',
  'K-12 Education',
  'Higher Education',
  'Healthcare',
  'Public Agency',
  'Commercial',
  'Nonprofit',
  'Unknown',
];

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  FEDERAL_PROCUREMENT: 'Federal Procurement',
  STATE_PROCUREMENT: 'State Procurement',
  LOCAL_PROCUREMENT: 'Local Government',
  EDUCATION: 'Education',
  HEALTHCARE: 'Healthcare',
  PUBLIC_WEB: 'Public Web',
  HISTORICAL_SPENDING: 'Historical Spending',
};

export const PROCUREMENT_LABELS: Record<ProcurementType, string> = {
  RFQ: 'RFQ',
  RFP: 'RFP',
  ITB: 'Invitation to Bid',
  SOLICITATION: 'Solicitation',
  COMBINED_SYNOPSIS: 'Combined Synopsis/Solicitation',
  SOURCES_SOUGHT: 'Sources Sought',
  PRESOLICITATION: 'Presolicitation',
  SOLE_SOURCE: 'Sole Source / J&A',
  AWARD: 'Award Notice',
  PLANNED_PURCHASE: 'Planned Purchase',
  DIRECT_REQUEST: 'Direct Buying Request',
  UNKNOWN: 'Unknown',
};

export const INTENT_META: Record<IntentLevel, { label: string; emoji: string; order: number }> = {
  HOT: { label: 'Hot', emoji: '🔥', order: 0 },
  WARM: { label: 'Warm', emoji: '🟠', order: 1 },
  LOW: { label: 'Low', emoji: '🟢', order: 2 },
  IRRELEVANT: { label: 'Irrelevant', emoji: '⚪', order: 3 },
};

export const MATCH_LABELS: Record<MatchLevel, string> = {
  EXACT: 'Exact Match',
  HIGH: 'High Match',
  ALTERNATIVE: 'Alternative Match',
  NONE: 'No Match',
};

export const PIPELINE_STAGES: { key: PipelineStatus; label: string }[] = [
  { key: 'NEW', label: 'New' },
  { key: 'REVIEWED', label: 'Reviewed' },
  { key: 'CONTACTED', label: 'Contacted' },
  { key: 'QUOTED', label: 'Quoted' },
  { key: 'NEGOTIATION', label: 'Negotiation' },
  { key: 'WON', label: 'Won' },
  { key: 'LOST', label: 'Lost' },
];

/** Default public-web discovery vocabulary (editable in /admin → Keywords). */
export const DEFAULT_BUYING_KEYWORDS = [
  'request for quote', 'request for quotation', 'RFQ', 'RFP', 'request for proposal', 'invitation to bid',
  'looking for supplier', 'seeking vendor', 'IT equipment', 'computer equipment', 'laptops', 'desktop computers',
  'servers', 'network equipment', 'network switches', 'firewalls', 'storage', 'data center equipment', 'monitors',
  'workstations', 'UPS', 'wireless access points', 'IT hardware', 'technology equipment', 'bulk laptops',
  'hardware procurement', 'technology refresh',
];

export const DEFAULT_INTENT_PHRASES = [
  'we need', 'looking to purchase', 'seeking quotations', 'vendors interested', 'quotes requested', 'purchase of',
  'equipment needed', 'technology upgrade', 'IT refresh',
];
