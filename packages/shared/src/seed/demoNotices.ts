// ============================================================================
// DEMO DATA — fictional organizations and sample notices.
//
// These are NOT real opportunities. Organization names, people, emails
// (*.example — a reserved, non-routable domain) and 555-01xx phone numbers are
// invented so the dashboard is usable before live connectors are configured.
// Every record produced from this file is flagged isDemo=true and badged
// "DEMO DATA" in the UI and in CSV exports.
//
// The notices are raw TEXT on purpose: they run through the exact same
// classify → extract → score → match pipeline as live documents, so the demo
// shows what the engine really extracts (including the nulls).
// ============================================================================

import type { ContactInfo, OrganizationType, ProcurementType, SourceConfidence, SourceType } from '../types';

export type DemoChannel = 'sam' | 'state' | 'local' | 'edu' | 'health' | 'web';

export const DEMO_CHANNELS: Record<DemoChannel, { name: string; type: SourceType; confidence: SourceConfidence }> = {
  sam: { name: 'DEMO · SAM.gov-format notice', type: 'FEDERAL_PROCUREMENT', confidence: 'HIGH' },
  state: { name: 'DEMO · State procurement portal', type: 'STATE_PROCUREMENT', confidence: 'HIGH' },
  local: { name: 'DEMO · County/City bid board', type: 'LOCAL_PROCUREMENT', confidence: 'HIGH' },
  edu: { name: 'DEMO · Education bid portal', type: 'EDUCATION', confidence: 'HIGH' },
  health: { name: 'DEMO · Healthcare supplier portal', type: 'HEALTHCARE', confidence: 'MEDIUM' },
  web: { name: 'DEMO · Public web page', type: 'PUBLIC_WEB', confidence: 'LOW' },
};

type D = (days: number) => string; // formatted date N days from seed time
type ISO = (days: number) => string;

export interface DemoNotice {
  key: string;
  channel: DemoChannel;
  /** 'initial' = loaded at seed; 'feed' = released by the Demo Feed connector on Sync Now */
  release: 'initial' | 'feed';
  publishedHoursAgo: number;
  discoveredMinutesAgo: number;
  title: string;
  text: (d: D) => string;
  structured?: (iso: ISO) => {
    organizationName: string;
    organizationType?: OrganizationType;
    city: string;
    state: string;
    zip: string;
    deadline?: string;
    procurementType: ProcurementType;
    contacts?: ContactInfo[];
    naics?: string;
    psc?: string;
    solicitationNumber?: string;
    setAside?: string;
  };
}

const poc = (name: string, title: string, email: string, phone: string): ContactInfo => ({
  name, title, email, phone, linkedin: null, role: 'Primary POC', provenance: 'SOURCE_VERIFIED',
});

export const DEMO_NOTICES: DemoNotice[] = [
  // ------------------------------------------------------------------ HOT
  {
    key: 'bluebonnet-laptops',
    channel: 'state',
    release: 'initial',
    publishedHoursAgo: 20,
    discoveredMinutesAgo: 12,
    title: 'RFQ 26-114: Student and Staff Laptop Refresh — 250 Dell Latitude 5550 Laptops',
    text: (d) => `Issuing Agency: Bluebonnet Independent School District
Location: Austin, TX 78745

Bluebonnet Independent School District is seeking quotations for the following technology equipment:
- 250 Dell Latitude 5550 laptops, Intel Core Ultra 5, 16GB RAM, 512GB SSD, Windows 11 Pro
- 250 USB-C docking stations
- 250 24" monitors

Quotes are due ${d(8)} at 2:00 PM CST. Delivery to: Bluebonnet ISD Technology Center, 4100 Ranch Road, Austin, TX 78745.
Vendors must be an authorized Dell reseller. Pricing must include a 3-year onsite warranty and asset tagging.
Point of Contact: Maria Delgado, Purchasing Coordinator, purchasing@bluebonnetisd.example, (512) 555-0142`,
  },
  {
    key: 'gulfcoast-servers',
    channel: 'health',
    release: 'initial',
    publishedHoursAgo: 6,
    discoveredMinutesAgo: 8,
    title: 'Request for Quotation — Data Center Server Refresh (50 Dell PowerEdge R760 Servers)',
    text: (d) => `Gulf Coast Regional Health System is requesting quotations for 50 Dell PowerEdge R760 rack servers and 4 Cisco Catalyst 9300-48P switches to support its electronic health record platform.
Organization: Gulf Coast Regional Health System, Houston, TX 77030
Server configuration: 2x Intel Xeon Gold, 512GB RAM, redundant power supplies, 5-year ProSupport Plus.
Responses due ${d(6)}. Installation, racking and cabling are required at the primary data center.
Vendor must comply with HIPAA security requirements and provide a signed BAA.
Contact: Daniel Okafor, Director of IT Infrastructure, it-procurement@gulfcoasthealth.example, 713-555-0199`,
  },
  {
    key: 'fed-network-refresh',
    channel: 'sam',
    release: 'initial',
    publishedHoursAgo: 30,
    discoveredMinutesAgo: 41,
    title: 'Combined Synopsis/Solicitation: Network Switches and Firewalls — Region 6 Field Offices',
    text: (d) => `This is a combined synopsis/solicitation for commercial items. Solicitation number DEMO-26-Q-0412 is issued as a Request for Quotation (RFQ).
The Interagency Demo Logistics Center, Region 6, intends to purchase:
Line 0001: 40 Cisco Catalyst 9300-48P switches (Part Number: C9300-48P-A)
Line 0002: 12 Fortinet FortiGate 100F firewalls with 3-year FortiCare
All items must be TAA compliant. This acquisition is a total small business set-aside.
Offers are due ${d(5)} by 1:00 PM CT. Place of performance: Dallas, TX 75242.
Questions should be directed to: Karen Whitfield, Contracting Officer, karen.whitfield@idlc.example, 214-555-0110.`,
    structured: (iso) => ({
      organizationName: 'Interagency Demo Logistics Center — Region 6',
      organizationType: 'Federal Government',
      city: 'Dallas', state: 'TX', zip: '75242',
      deadline: iso(5),
      procurementType: 'COMBINED_SYNOPSIS',
      naics: '423430', psc: '7B22', solicitationNumber: 'DEMO-26-Q-0412', setAside: 'Total Small Business',
      contacts: [poc('Karen Whitfield', 'Contracting Officer', 'karen.whitfield@idlc.example', '214-555-0110')],
    }),
  },
  {
    key: 'cedar-ridge-chromebooks',
    channel: 'edu',
    release: 'initial',
    publishedHoursAgo: 50,
    discoveredMinutesAgo: 1535,
    title: 'Invitation to Bid #2026-07: 1,200 Student Chromebooks',
    text: (d) => `Cedar Ridge Unified School District is inviting sealed bids for 1,200 education Chromebooks with management licenses and protective cases.
District: Cedar Ridge Unified School District, Fresno, CA 93721
Minimum specs: 11.6" rugged chassis, 4GB RAM, 32GB storage, Chrome Education Upgrade.
Bids are due ${d(12)} at 10:00 AM PT. Bidders must be E-Rate eligible vendors and hold a California seller's permit.
Budget: Not-to-exceed $420,000.
Buyer: Thomas Nguyen, Purchasing Manager, bids@cedarridgeusd.example, (559) 555-0133`,
  },
  {
    key: 'port-meridian-aps',
    channel: 'local',
    release: 'initial',
    publishedHoursAgo: 28,
    discoveredMinutesAgo: 180,
    title: 'RFQ: Wireless Access Points and PoE Switches for City Hall Wi-Fi Upgrade',
    text: (d) => `The City of Port Meridian is requesting quotes for 85 Cisco Meraki MR46 wireless access points and 6 48-port PoE switches to upgrade Wi-Fi coverage at City Hall and the Public Safety Building.
City of Port Meridian, Tampa, FL 33602
Quotes due ${d(3)} by 5:00 PM ET. Installation and heat-mapping services are requested.
Contact: purchasing@portmeridianfl.example | 813-555-0167`,
  },
  {
    key: 'northgate-workstations',
    channel: 'edu',
    release: 'initial',
    publishedHoursAgo: 60,
    discoveredMinutesAgo: 3000,
    title: 'Request for Proposal: Engineering Lab Workstations (RFP NSU-26-031)',
    text: (d) => `Northgate State University is soliciting proposals for 60 HP Z4 G5 workstations and 60 27" QHD monitors for the College of Engineering CAD labs.
Institution: Northgate State University
Location: Columbus, OH 43210
Workstation specs: Xeon W3-2425, 64GB RAM, NVIDIA RTX A4000, 1TB NVMe.
Proposals are due ${d(16)}. Vendors shall include imaging and on-site installation. Equipment must be EPEAT Gold registered.
Procurement Officer: Alicia Moreno, Senior Buyer, procurement@northgate.example, 614-555-0158`,
  },
  {
    key: 'lakeshore-ups',
    channel: 'health',
    release: 'initial',
    publishedHoursAgo: 10,
    discoveredMinutesAgo: 25,
    title: 'Quote Request: 24 APC Smart-UPS SMT3000RM2U units for network closets',
    text: (d) => `Lakeshore Community Hospital is requesting quotations for 24 APC Smart-UPS SMT3000RM2U rack-mount UPS units with network management cards.
Lakeshore Community Hospital, Milwaukee, WI 53202
Quotes due ${d(4)}. Delivery to the hospital receiving dock.
Contact: Priya Raman, IT Operations Manager, itbuying@lakeshorehospital.example, (414) 555-0121`,
  },
  {
    key: 'crescent-web-laptops',
    channel: 'web',
    release: 'initial',
    publishedHoursAgo: 14,
    discoveredMinutesAgo: 60,
    title: 'Vendors wanted: we need 40 business laptops for new Memphis hub',
    text: () => `Crescent Logistics Inc. is opening a new distribution hub in Memphis, TN 38118 and we need 40 business laptops (14", 16GB RAM, 512GB SSD) plus 40 docking stations delivered within 30 days.
We are looking for a supplier who can quote Dell or HP models with 3-year warranty. Quotes requested by email: it-purchasing@crescentlogistics.example`,
  },
  {
    key: 'pinecrest-network',
    channel: 'edu',
    release: 'initial',
    publishedHoursAgo: 60,
    discoveredMinutesAgo: 3120,
    title: 'RFQ PTC-2026-19: Campus Network Upgrade — Aruba CX 6100 Switches',
    text: (d) => `Pinecrest Technical College is seeking quotations for 30 Aruba CX 6100 48G Class4 PoE switches (Part Number: JL675A) and 30 3-year Foundation Care support contracts.
Pinecrest Technical College, Raleigh, NC 27603
Quotes are due ${d(9)}. Vendors must be HUB certified or provide a HUB subcontracting plan.
Contact: Brian Castillo, Network Services Manager, purchasing@pinecrest.example, 919-555-0184`,
  },
  {
    key: 'silvercreek-storage',
    channel: 'local',
    release: 'initial',
    publishedHoursAgo: 80,
    discoveredMinutesAgo: 4380,
    title: 'Invitation for Bid: SCADA Storage Array and Backup Appliance',
    text: (d) => `Silver Creek Water Authority is inviting bids for 2 storage arrays (minimum 100TB usable, dual controller) and 1 backup appliance for its SCADA historian environment.
Silver Creek Water Authority, Phoenix, AZ 85003
Bids due ${d(14)}. Estimated budget: $180,000. On-site installation and 5-year support are required.
Contact: procurement@silvercreekwater.example, 602-555-0115`,
  },
  {
    key: 'maple-valley-desktops',
    channel: 'health',
    release: 'initial',
    publishedHoursAgo: 30,
    discoveredMinutesAgo: 1590,
    title: 'Request for Quotation: 180 Dell OptiPlex 7020 Micro desktops and monitors',
    text: (d) => `Maple Valley Health Partners is requesting quotations for 180 Dell OptiPlex 7020 Micro desktops and 180 Dell P2425H monitors for clinic workstations.
Maple Valley Health Partners, Albany, NY 12207
Quotes due ${d(7)}. Pricing must include imaging, asset tagging and white-glove deployment.
Contact: Sandra Kim, Procurement Specialist, sourcing@maplevalleyhealth.example, 518-555-0171`,
  },
  {
    key: 'tri-county-rugged',
    channel: 'local',
    release: 'initial',
    publishedHoursAgo: 110,
    discoveredMinutesAgo: 5790,
    title: 'RFQ TCTA-26-08: Rugged Tablets and Vehicle Docks',
    text: (d) => `The Tri-County Transit Authority is seeking quotations for 75 rugged laptops (MIL-STD-810H) and 75 vehicle docks for its paratransit fleet.
Tri-County Transit Authority, Harrisburg, PA 17101
Quotes due ${d(11)}. Vendor must provide in-vehicle installation.
Buyer: Gregory Lang, Procurement Officer, bids@tricountytransit.example, 717-555-0126`,
  },
  {
    key: 'fed-laptops-sources-sought',
    channel: 'sam',
    release: 'initial',
    publishedHoursAgo: 70,
    discoveredMinutesAgo: 3380,
    title: 'Sources Sought: Enterprise Laptops and Docking Stations',
    text: (d) => `THIS IS A SOURCES SOUGHT NOTICE FOR MARKET RESEARCH PURPOSES ONLY.
The Federal Example Agency, Data Services Division, anticipates a requirement for approximately 600 enterprise laptops and 600 USB-C docking stations with 4-year warranty.
Interested vendors should submit capability statements by ${d(10)}. Responses must address TAA compliance and Section 889 certification.
Place of performance: Kansas City, MO 64106.`,
    structured: (iso) => ({
      organizationName: 'Federal Example Agency — Data Services Division',
      organizationType: 'Federal Government',
      city: 'Kansas City', state: 'MO', zip: '64106',
      deadline: iso(10),
      procurementType: 'SOURCES_SOUGHT',
      naics: '334111', psc: '7E20', solicitationNumber: 'DEMO-FEA-26-SS-018',
      contacts: [poc('Leon Hart', 'Contract Specialist', 'leon.hart@fea.example', '816-555-0102')],
    }),
  },
  {
    key: 'riverbend-library',
    channel: 'local',
    release: 'initial',
    publishedHoursAgo: 130,
    discoveredMinutesAgo: 7300,
    title: 'Riverbend Public Library District — Quotes Requested for Public Computers',
    text: (d) => `Riverbend Public Library District is seeking quotes for 45 all-in-one PCs for public use and 6 HP LaserJet Enterprise M611dn printers.
Riverbend Public Library District, Peoria, IL 61602
Quotes due ${d(18)}. Contact: Evelyn Brooks, Business Manager, ebrooks@riverbendlibrary.example`,
  },
  {
    key: 'summitview-network',
    channel: 'edu',
    release: 'initial',
    publishedHoursAgo: 40,
    discoveredMinutesAgo: 1640,
    title: 'E-Rate Form 470 RFP: Internal Connections — Firewalls and Access Points',
    text: (d) => `Summitview Charter Academy is requesting proposals for 2 Palo Alto Networks PA-440 firewalls, 48 Wi-Fi 6 access points and 4 PoE switches under E-Rate Category Two.
Summitview Charter Academy, Atlanta, GA 30303
Proposals due ${d(20)}. Bidders must hold a valid E-Rate SPIN.
Contact: techbids@summitview.example, 404-555-0148`,
  },
  {
    key: 'harlan-county-servers',
    channel: 'local',
    release: 'initial',
    publishedHoursAgo: 150,
    discoveredMinutesAgo: 8640,
    title: 'Harlan Ridge County — RFQ for Virtualization Hosts and Rack Enclosures',
    text: (d) => `Harlan Ridge County is requesting quotations for 6 HPE ProLiant DL380 Gen11 servers and 2 42U server racks for the county data center.
Harlan Ridge County, Denver, CO 80202
Quotes are due ${d(13)}. Warranty: 5-year 24x7 4-hour response.
Point of Contact: Nadia Petrov, IT Director, itprocurement@harlanridgeco.example, 303-555-0164`,
  },
  {
    key: 'bayside-gpus',
    channel: 'edu',
    release: 'initial',
    publishedHoursAgo: 200,
    discoveredMinutesAgo: 11520,
    title: 'RFQ: GPU Compute Nodes for Research Computing',
    text: (d) => `Bayside Institute of Technology is seeking quotations for 8 GPU compute nodes, each with 4 NVIDIA L40S GPUs, 1TB RAM and 2x 3.84TB NVMe drives.
Bayside Institute of Technology, Seattle, WA 98195
Quotes due ${d(21)}. Contact: Research Computing Procurement, rcprocure@bayside.example`,
  },
  {
    key: 'prairie-monitors',
    channel: 'state',
    release: 'initial',
    publishedHoursAgo: 18,
    discoveredMinutesAgo: 75,
    title: 'State Solicitation: 500 24-inch Monitors for Department Workstations',
    text: (d) => `The State of Nebraska Department of Demo Services is requesting quotations for 500 24" monitors (1920x1080, height-adjustable) and 500 monitor cables.
Location: Lincoln, NE 68508
Quotes due ${d(2)} at 3:00 PM CT. Vendors must be registered in the state vendor portal.
Contact: Jordan Ellis, Procurement Analyst, jordan.ellis@demoservices-ne.example, 402-555-0187`,
  },
  {
    key: 'granite-apple',
    channel: 'edu',
    release: 'initial',
    publishedHoursAgo: 230,
    discoveredMinutesAgo: 12960,
    title: 'RFQ: 120 Apple MacBook Air laptops for Media Arts program',
    text: (d) => `Granite Falls School District is seeking quotations for 120 Apple MacBook Air 13" laptops (M3, 16GB, 512GB) with AppleCare for Schools.
Granite Falls School District, Salt Lake City, UT 84111
Quotes due ${d(15)}. Contact: purchasing@granitefallssd.example`,
  },

  // ------------------------------------------------------------------ WARM
  {
    key: 'bluebonnet-refresh-plan',
    channel: 'web',
    release: 'initial',
    publishedHoursAgo: 250,
    discoveredMinutesAgo: 14400,
    title: 'Board approves 2027 technology refresh plan',
    text: () => `Following board approval, Bluebonnet Independent School District plans to refresh approximately 1,800 staff laptops and replace network switches at 12 campuses in the next fiscal year. The technology refresh plan was approved at the September board meeting.
Bluebonnet Independent School District, Austin, TX`,
  },
  {
    key: 'evergreen-hospital-plan',
    channel: 'health',
    release: 'initial',
    publishedHoursAgo: 300,
    discoveredMinutesAgo: 17280,
    title: 'Capital plan: imaging workstation and server upgrades',
    text: () => `Evergreen Valley Medical Center is planning a technology upgrade later this year that will replace radiology workstations and virtualization servers. The capital budget was approved by the finance committee.
Evergreen Valley Medical Center, Portland, OR 97201`,
  },
  {
    key: 'fed-presol-storage',
    channel: 'sam',
    release: 'initial',
    publishedHoursAgo: 180,
    discoveredMinutesAgo: 10080,
    title: 'Presolicitation: Enterprise Storage Expansion',
    text: (d) => `Presolicitation notice. The Federal Example Agency intends to issue a solicitation for storage arrays and SAN switches to expand its primary data center capacity. The solicitation is expected to be released on or about ${d(25)}.
Place of performance: Kansas City, MO 64106.`,
    structured: () => ({
      organizationName: 'Federal Example Agency — Data Services Division',
      organizationType: 'Federal Government',
      city: 'Kansas City', state: 'MO', zip: '64106',
      procurementType: 'PRESOLICITATION',
      naics: '334112', psc: '7B21', solicitationNumber: 'DEMO-FEA-26-P-044',
    }),
  },

  // ------------------------------------------------------------------ DUPLICATE (same RFQ, different source)
  {
    key: 'bluebonnet-laptops-repost',
    channel: 'web',
    release: 'initial',
    publishedHoursAgo: 16,
    discoveredMinutesAgo: 30,
    title: 'Bluebonnet ISD RFQ 26-114 — Laptop Refresh (250 Dell Latitude 5550 laptops)',
    text: (d) => `Bid aggregator re-post. Bluebonnet Independent School District is seeking quotations for 250 Dell Latitude 5550 laptops, 250 USB-C docking stations and 250 24" monitors. Quotes are due ${d(8)} at 2:00 PM CST.
Location: Austin, TX 78745`,
  },

  // ------------------------------------------------------------------ LOW (historical / expired)
  {
    key: 'fed-award-servers',
    channel: 'sam',
    release: 'initial',
    publishedHoursAgo: 330,
    discoveredMinutesAgo: 18720,
    title: 'Award Notice: Rack Servers for Regional Data Center',
    text: () => `Award notice. Contract award for 20 Dell PowerEdge R660 rack servers was awarded to a small business reseller. Award amount: $212,400.
Place of performance: Dallas, TX 75242.`,
    structured: () => ({
      organizationName: 'Interagency Demo Logistics Center — Region 6',
      organizationType: 'Federal Government',
      city: 'Dallas', state: 'TX', zip: '75242',
      procurementType: 'AWARD',
      naics: '334111', psc: '7B20', solicitationNumber: 'DEMO-26-A-0099',
    }),
  },
  {
    key: 'oakdale-expired',
    channel: 'local',
    release: 'initial',
    publishedHoursAgo: 290,
    discoveredMinutesAgo: 15840,
    title: 'RFQ: Police Department Mobile Data Laptops',
    text: (d) => `City of Oakdale Springs is requesting quotes for 30 rugged laptops for patrol vehicles.
City of Oakdale Springs, Boise, ID 83702
Quotes were due ${d(-3)}. Contact: purchasing@oakdalesprings.example`,
  },

  // ------------------------------------------------------------------ IRRELEVANT (kept for audit, hidden by default)
  {
    key: 'news-laptop-review',
    channel: 'web',
    release: 'initial',
    publishedHoursAgo: 12,
    discoveredMinutesAgo: 50,
    title: 'Hands-on review: the best Dell and Lenovo business laptops of the year',
    text: () => `In our hands-on review, we tested 12 business laptops including the Dell Latitude 7450 and Lenovo ThinkPad T14. According to analysts, laptop shipments rose 6% last quarter. Benchmarks show strong battery life.`,
  },
  {
    key: 'job-it-manager',
    channel: 'web',
    release: 'initial',
    publishedHoursAgo: 22,
    discoveredMinutesAgo: 70,
    title: 'Job Opening: IT Manager — Network and Servers',
    text: () => `We are hiring an IT Manager to maintain servers, firewalls and network switches. Responsibilities include patching servers and managing laptops. Qualifications: 5+ years of experience. Salary: $95,000–$115,000. Apply now. Equal opportunity employer.`,
  },
  {
    key: 'ad-laptop-sale',
    channel: 'web',
    release: 'initial',
    publishedHoursAgo: 5,
    discoveredMinutesAgo: 20,
    title: 'Back to school sale — laptops 30% off',
    text: () => `Shop now! Business laptops and monitors 30% off. Free shipping on orders over $500. Limited-time offer — add to cart today.`,
  },

  // ------------------------------------------------------------------ additional HOT/WARM to round out the set
  {
    key: 'coastal-college-printers',
    channel: 'edu',
    release: 'initial',
    publishedHoursAgo: 36,
    discoveredMinutesAgo: 1700,
    title: 'RFQ: Multifunction Printers and Document Scanners',
    text: (d) => `Coastal Plains Community College is requesting quotations for 25 multifunction printers and 10 document scanners for its student services offices.
Coastal Plains Community College, Charleston, SC 29401
Quotes due ${d(10)}. Contact: Latoya James, Purchasing Agent, purchasing@coastalplains.example, 843-555-0138`,
  },
  {
    key: 'mesa-verde-ssd',
    channel: 'web',
    release: 'initial',
    publishedHoursAgo: 8,
    discoveredMinutesAgo: 35,
    title: 'Looking to purchase 200 Samsung 990 PRO 2TB SSDs — quotes requested',
    text: () => `Mesa Verde Analytics LLC, Albuquerque, NM 87102 is looking to purchase 200 Samsung 990 PRO 2TB SSDs (Part Number: MZ-V9P2T0B/AM) for a workstation upgrade. Quotes requested by email to ops@mesaverdeanalytics.example.`,
  },
  {
    key: 'fed-ups-rfq',
    channel: 'sam',
    release: 'initial',
    publishedHoursAgo: 4,
    discoveredMinutesAgo: 15,
    title: 'RFQ: Uninterruptible Power Supplies for Field Office Network Closets',
    text: (d) => `Request for Quotation. The Interagency Demo Logistics Center requires 36 Eaton 5PX 3000 G2 UPS units (Part Number: 5PX3000RT2UG2) with network cards and 3-year warranty.
Quotes are due ${d(7)} by 12:00 PM ET. Place of performance: Atlanta, GA 30303. All items must be TAA compliant.`,
    structured: (iso) => ({
      organizationName: 'Interagency Demo Logistics Center — Southeast Field Office',
      organizationType: 'Federal Government',
      city: 'Atlanta', state: 'GA', zip: '30303',
      deadline: iso(7),
      procurementType: 'RFQ',
      naics: '335999', psc: '6130', solicitationNumber: 'DEMO-26-Q-0431',
      contacts: [poc('Monica Reyes', 'Contract Specialist', 'monica.reyes@idlc.example', '404-555-0119')],
    }),
  },

  // ------------------------------------------------------------------ FEED (released by Sync Now in demo mode)
  {
    key: 'feed-sunbelt-laptops',
    channel: 'edu',
    release: 'feed',
    publishedHoursAgo: 1,
    discoveredMinutesAgo: 0,
    title: 'RFQ: 300 Lenovo ThinkPad T14 Gen 5 laptops for teachers',
    text: (d) => `Sunbelt Unified School District is seeking quotations for 300 Lenovo ThinkPad T14 Gen 5 laptops and 300 USB-C docks for its teacher device program.
Sunbelt Unified School District, Tucson, AZ 85701
Quotes due ${d(9)}. Contact: Oscar Villanueva, Director of Purchasing, purchasing@sunbeltusd.example, 520-555-0177`,
  },
  {
    key: 'feed-ozark-firewalls',
    channel: 'local',
    release: 'feed',
    publishedHoursAgo: 2,
    discoveredMinutesAgo: 0,
    title: 'Quotes requested: 14 FortiGate 100F firewalls for county branch offices',
    text: (d) => `Ozark Hills County is requesting quotes for 14 Fortinet FortiGate 100F firewalls with 3-year UTM bundle for its branch offices.
Ozark Hills County, Springfield, MO 65806
Quotes due ${d(6)}. Contact: Rachel Tate, IT Manager, rtate@ozarkhillscounty.example, 417-555-0152`,
  },
  {
    key: 'feed-bayou-servers',
    channel: 'health',
    release: 'feed',
    publishedHoursAgo: 3,
    discoveredMinutesAgo: 0,
    title: 'RFQ: 12 Dell PowerEdge R660 servers and Synology NAS for clinic network',
    text: (d) => `Bayou Family Health Clinics is requesting quotations for 12 Dell PowerEdge R660 servers and 3 Synology RackStation RS2423+ NAS units.
Bayou Family Health Clinics, Baton Rouge, LA 70801
Quotes due ${d(5)}. Contact: Andre Fontenot, IT Director, andre.fontenot@bayoufamilyhealth.example, 225-555-0109`,
  },
  {
    key: 'feed-fed-monitors',
    channel: 'sam',
    release: 'feed',
    publishedHoursAgo: 1,
    discoveredMinutesAgo: 0,
    title: 'Combined Synopsis/Solicitation: 400 27-inch Monitors',
    text: (d) => `Combined synopsis/solicitation. The Federal Example Agency requires 400 27" QHD monitors (Dell UltraSharp U2724D or equal). Offers due ${d(8)}. TAA compliant items only.
Place of performance: Denver, CO 80202.`,
    structured: (iso) => ({
      organizationName: 'Federal Example Agency — Mountain Region',
      organizationType: 'Federal Government',
      city: 'Denver', state: 'CO', zip: '80202',
      deadline: iso(8),
      procurementType: 'COMBINED_SYNOPSIS',
      naics: '334118', psc: '7025', solicitationNumber: 'DEMO-FEA-26-Q-102',
      contacts: [poc('Paul Weston', 'Contracting Officer', 'paul.weston@fea.example', '303-555-0131')],
    }),
  },
  {
    key: 'feed-keystone-switches',
    channel: 'state',
    release: 'feed',
    publishedHoursAgo: 2,
    discoveredMinutesAgo: 0,
    title: 'Solicitation: 60 Cisco Catalyst 9200L-48P-4G switches for state offices',
    text: (d) => `The Commonwealth of Pennsylvania Office of Demo Administration is seeking quotations for 60 Cisco Catalyst 9200L-48P-4G switches (Part Number: C9200L-48P-4G-E).
Location: Harrisburg, PA 17101
Quotes due ${d(4)}. Contact: Emily Shaw, Procurement Specialist, eshaw@demoadmin-pa.example, 717-555-0193`,
  },
  {
    key: 'feed-news-noise',
    channel: 'web',
    release: 'feed',
    publishedHoursAgo: 1,
    discoveredMinutesAgo: 0,
    title: 'Analysts say server market share shifted in Q3',
    text: () => `According to analysts, server market share shifted in the third quarter as shipments rose. The report discusses rack servers and storage arrays.`,
  },
  {
    key: 'feed-redwood-docks',
    channel: 'web',
    release: 'feed',
    publishedHoursAgo: 4,
    discoveredMinutesAgo: 0,
    title: 'Seeking vendor: 150 Dell WD19S docks and 150 monitors',
    text: () => `Redwood Coast Credit Union, Eureka, CA 95501 is seeking vendors to quote 150 Dell WD19S docking stations and 150 24" monitors for a branch refresh. Please send quotes to procurement@redwoodcoastcu.example.`,
  },
];
