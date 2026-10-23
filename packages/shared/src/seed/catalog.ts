import type { Product } from '../types';

/**
 * DEMO catalog — representative SKUs so matching works out of the box.
 * Prices are placeholders, not ETechMatter pricing. Replace via
 * /products → Import CSV (or POST /api/products/import).
 */
export const DEMO_CATALOG: Omit<Product, 'id' | 'createdAt'>[] = [
  p('ETM-LAT-5550', 'Dell', 'Latitude 5550', null, 'Laptops', '15.6" business laptop', 'Intel Core Ultra 5/7, 16–32GB, 512GB SSD', 1089, 'In stock', 1, '3-year ProSupport'),
  p('ETM-LAT-7450', 'Dell', 'Latitude 7450', null, 'Laptops', '14" premium business laptop', 'Intel Core Ultra 7, 16GB, 512GB SSD', 1449, 'In stock', 1, '3-year ProSupport'),
  p('ETM-HP-840G11', 'HP', 'EliteBook 840 G11', null, 'Laptops', '14" enterprise laptop', 'Intel Core Ultra 5, 16GB, 512GB SSD', 1299, 'In stock', 1, '3-year HP Care'),
  p('ETM-LEN-T14G5', 'Lenovo', 'ThinkPad T14 Gen 5', '21ML', 'Laptops', '14" business laptop', 'Intel Core Ultra 5, 16GB, 512GB SSD', 1199, '2–3 weeks', 5, '3-year onsite'),
  p('ETM-LEN-100E', 'Lenovo', '100e Chromebook Gen 4', '82W0', 'Laptops', 'Education Chromebook', 'MediaTek, 4GB, 32GB eMMC, rugged', 279, 'In stock', 10, '1-year depot'),
  p('ETM-OPT-7020M', 'Dell', 'OptiPlex 7020 Micro', null, 'Desktop PCs', 'Micro form-factor desktop', 'Intel Core i5-14500T, 16GB, 512GB SSD', 899, 'In stock', 1, '3-year ProSupport'),
  p('ETM-HP-Z4G5', 'HP', 'Z4 G5', null, 'Workstations', 'Tower workstation', 'Xeon W3-2425, 64GB, NVIDIA RTX A4000', 3899, '3–4 weeks', 1, '3-year onsite'),
  p('ETM-PRE-3680', 'Dell', 'Precision 3680 Tower', null, 'Workstations', 'Entry tower workstation', 'Intel Core i7-14700, 32GB, RTX A2000', 2199, 'In stock', 1, '3-year ProSupport'),
  p('ETM-PE-R760', 'Dell', 'PowerEdge R760', null, 'Servers', '2U dual-socket rack server', '2x Xeon Silver 4410Y, 256GB, 8x 1.92TB SSD', 14250, '2–3 weeks', 1, '3-year ProSupport NBD'),
  p('ETM-PE-R660', 'Dell', 'PowerEdge R660', null, 'Servers', '1U dual-socket rack server', '2x Xeon Silver 4410Y, 128GB, 4x 960GB SSD', 9800, 'In stock', 1, '3-year ProSupport NBD'),
  p('ETM-HPE-DL380G11', 'HPE', 'ProLiant DL380 Gen11', 'P52534-B21', 'Servers', '2U rack server', '2x Xeon Gold 5418Y, 256GB', 15900, '3–4 weeks', 1, '3-year Foundation Care'),
  p('ETM-CS-C9200L', 'Cisco', 'Catalyst 9200L-48P-4G', 'C9200L-48P-4G-E', 'Switches', '48-port PoE+ access switch', '48x 1G PoE+, 4x 1G SFP uplinks', 3650, 'In stock', 1, 'Limited lifetime'),
  p('ETM-CS-C9300', 'Cisco', 'Catalyst 9300-48P', 'C9300-48P-A', 'Switches', '48-port PoE+ stackable switch', '48x 1G PoE+, modular uplinks', 7900, '2–3 weeks', 1, 'Limited lifetime'),
  p('ETM-AR-6100', 'Aruba', 'CX 6100 48G Class4 PoE', 'JL675A', 'Switches', '48-port PoE access switch', '48x 1G PoE, 4x SFP+', 2890, 'In stock', 1, 'Limited lifetime'),
  p('ETM-FG-100F', 'Fortinet', 'FortiGate 100F', 'FG-100F', 'Firewalls', 'Mid-range NGFW', '20 Gbps firewall, 1 Gbps threat protection', 3350, 'In stock', 1, '1-year FortiCare'),
  p('ETM-PA-440', 'Palo Alto Networks', 'PA-440', 'PAN-PA-440', 'Firewalls', 'Branch NGFW', '2.4 Gbps firewall throughput', 1990, 'In stock', 1, '1-year support'),
  p('ETM-MR46', 'Cisco Meraki', 'MR46', 'MR46-HW', 'Wireless Access Points', 'Wi-Fi 6 indoor AP', '4x4 Wi-Fi 6, cloud managed', 1150, 'In stock', 1, 'Lifetime'),
  p('ETM-UBQ-U7PRO', 'Ubiquiti', 'UniFi U7 Pro', 'U7-Pro', 'Wireless Access Points', 'Wi-Fi 7 ceiling AP', 'Tri-band Wi-Fi 7, 2.5GbE', 189, 'In stock', 5, '1-year'),
  p('ETM-DL-P2425H', 'Dell', 'P2425H', null, 'Monitors', '24" FHD monitor', '1920x1080 IPS, height adjustable', 199, 'In stock', 1, '3-year Advanced Exchange'),
  p('ETM-DL-U2724D', 'Dell', 'UltraSharp U2724D', null, 'Monitors', '27" QHD monitor', '2560x1440 IPS Black', 429, 'In stock', 1, '3-year Advanced Exchange'),
  p('ETM-DL-WD19S', 'Dell', 'WD19S', 'WD19S130W', 'Docking Stations', 'USB-C dock', '130W, dual display', 219, 'In stock', 1, '3-year'),
  p('ETM-APC-SMT3000', 'APC', 'Smart-UPS SMT3000RM2U', 'SMT3000RM2U', 'UPS', '3000VA rack-mount UPS', '2U, 120V, LCD', 2150, 'In stock', 1, '3-year'),
  p('ETM-EAT-5PX3000', 'Eaton', '5PX 3000 G2', '5PX3000RT2UG2', 'UPS', '3000VA rack/tower UPS', 'Line-interactive, network card slot', 2290, '1–2 weeks', 1, '3-year'),
  p('ETM-SYN-RS2423', 'Synology', 'RackStation RS2423+', 'RS2423+', 'Storage', '12-bay rack NAS', 'AMD Ryzen V1780B, 8GB, 10GbE', 2699, 'In stock', 1, '5-year'),
  p('ETM-DL-ME5012', 'Dell', 'PowerVault ME5012', null, 'Storage', '12-drive SAN array', 'Dual controller, 12Gb SAS / iSCSI', 12400, '3–4 weeks', 1, '3-year ProSupport'),
  p('ETM-SAM-990P2T', 'Samsung', '990 PRO 2TB', 'MZ-V9P2T0B/AM', 'SSD', 'NVMe PCIe 4.0 SSD', '2TB, 7,450 MB/s read', 169, 'In stock', 5, '5-year'),
  p('ETM-APC-AR3100', 'APC', 'NetShelter SX 42U', 'AR3100', 'Racks', '42U server rack enclosure', '600mm x 1070mm, sides', 1590, '1–2 weeks', 1, '5-year'),
  p('ETM-HP-M611DN', 'HP', 'LaserJet Enterprise M611dn', '7PS84A', 'Printers', 'Mono enterprise laser printer', '65 ppm, duplex, network', 1049, 'In stock', 1, '1-year'),
];

function p(
  sku: string, manufacturer: string, model: string, partNumber: string | null, category: string, description: string,
  specifications: string, price: number, availability: string, moq: number, warranty: string,
): Omit<Product, 'id' | 'createdAt'> {
  return { sku, manufacturer, model, partNumber, category, description, specifications, price, availability, moq, warranty, url: 'https://etechmatter.com', isDemo: true };
}
