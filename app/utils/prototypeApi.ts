// Prototip API katmanı: backend yok. useApi.send bu fonksiyona sorar; bilinen uçlara kurgu veri döner,
// bilinmeyenlere boş yanıt. Böylece gerçek ekranlar (ErpSalesOrderForm dahil) DEĞİŞTİRİLMEDEN çalışır.

const CUSTOMERS = [
  { code: "120.01.0045", balance: 412500, creditLimit: 750000, commercialStatus: "A", forwarderCode: "320.99.0001", title: "YILDIZ TOPTAN GIDA KIRTASİYE LTD. ŞTİ.", representativeCode: "SELİM AKIN", salesPriceListNo: 1, paymentPlanNo: 30 },
  { code: "120.01.0112", balance: 1048000, creditLimit: 1200000, commercialStatus: "AB", title: "ÖZKAN OYUNCAK PAZARLAMA A.Ş.", representativeCode: "AYŞE KARAMAN", salesPriceListNo: 1, paymentPlanNo: 60 },
  { code: "120.02.0007", balance: 12300, creditLimit: 300000, commercialStatus: "B", forwarderCode: "320.99.0002", title: "MERT MARKET ZİNCİRİ TİC. A.Ş.", representativeCode: "SELİM AKIN", salesPriceListNo: 1, paymentPlanNo: 0 },
  { code: "120.03.0019", balance: 96000, creditLimit: 100000, commercialStatus: "A", title: "KARAKAYA TİCARET LTD. ŞTİ. (KİLİTLİ)", representativeCode: "AYŞE KARAMAN", salesPriceListNo: 1, paymentPlanNo: 30, locked: true },
  { code: "320.34.0014", balance: 0, creditLimit: 0, commercialStatus: "B", title: "ABKA KIRTASİYE SANAYİ VE TİCARET A.Ş. (TEDARİKÇİ)", representativeCode: "AYŞE KARAMAN", salesPriceListNo: 1, paymentPlanNo: 60, transactionType: 1, transactionTypeName: "Tedarikçi" },
  { code: "320.34.0021", balance: 0, creditLimit: 0, commercialStatus: "B", title: "ÇALKAN OYUNCAK İTHALAT İHRACAT LTD. ŞTİ. (TEDARİKÇİ)", representativeCode: "SELİM AKIN", salesPriceListNo: 1, paymentPlanNo: 75, transactionType: 1, transactionTypeName: "Tedarikçi" },
  { code: "320.34.0011", balance: 0, creditLimit: 0, commercialStatus: "B", title: "DİLMAN KIRTASİYE MATBAACILIK LTD. ŞTİ. (TEDARİKÇİ)", representativeCode: "SELİM AKIN", salesPriceListNo: 1, paymentPlanNo: 90, transactionType: 1, transactionTypeName: "Tedarikçi" },
].map((item, index) => ({ id: `c${index}`, locked: false, cancelled: false, transactionType: 0, transactionTypeName: "Müşteri", ...item }));

const ADDRESSES: Record<string, { district: string; province: string }[]> = {
  "120.01.0045": [{ district: "Fatih", province: "İstanbul" }, { district: "Gebze", province: "Kocaeli" }],
  "120.01.0112": [{ district: "Ostim", province: "Ankara" }],
  "120.03.0019": [{ district: "Kadıköy", province: "İstanbul" }],
  "320.34.0011": [{ district: "Bağcılar", province: "İstanbul" }],
  "320.34.0014": [{ district: "Esenyurt", province: "İstanbul" }, { district: "Gebze", province: "Kocaeli" }],
  "320.34.0021": [{ district: "Başakşehir", province: "İstanbul" }],
  "120.02.0007": [{ district: "Bornova", province: "İzmir" }, { district: "Yunusemre", province: "Manisa" }, { district: "Efeler", province: "Aydın" }],
};

// type: H = hazır stok (depoda), D = drop (tedarikçiden yerinden); sellable yalnız H'de anlamlıdır.
// İsk 1 (%) fiyat kuralından gelir (satırda değiştirilemez); kurgu değerler.
const DISCOUNT1 = [0, 5, 0, 10, 0, 7.5, 0, 12, 5, 0, 8, 3];
// Insert (kampanya) tanımları: stok kodu + geçerlilik aralığı. Evrak tarihi aralıktaysa satır insert'lidir.
const dayOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const INSERTS = [
  { productCode: "111592", name: "Okula Dönüş İnserti", from: dayOffset(-10), to: dayOffset(20) },
  { productCode: "599526", name: "Fuar İnserti", from: dayOffset(-3), to: dayOffset(30) },
  { productCode: "443673", name: "Yaz İnserti", from: dayOffset(-60), to: dayOffset(-1) }, // süresi dolmuş
  { productCode: "241494", name: "Sezon İnserti", from: dayOffset(7), to: dayOffset(40) }, // henüz başlamamış
];
const activeInsert = (code: string, date: string) => INSERTS.find((item) => item.productCode === code && item.from <= date && date <= item.to);
// Bütçe hesabı: tedarikçi sözleşme oranları (kurgu). 272052 bilerek sözleşmesiz (hesaba girmez).
const SUPPLIERS = {
  DILMAN: { supplierCode: "320.34.0011", supplierName: "Dilman Kırtasiye" },
  ABKA: { supplierCode: "320.34.0014", supplierName: "Abka Kırtasiye" },
  CALKAN: { supplierCode: "320.34.0021", supplierName: "Çalkan Oyuncak" },
  MEHTAP: { supplierCode: "320.34.0033", supplierName: "Mehtap Mutfak" },
  SINBO: { supplierCode: "320.34.0040", supplierName: "Sinbo Elektronik" },
  PRESTIJ: { supplierCode: "320.34.0052", supplierName: "Prestij Oyuncak" },
  LETS: { supplierCode: "320.34.0061", supplierName: "Lets Boya" },
  PANTHER: { supplierCode: "320.34.0070", supplierName: "Panther Elektronik" },
  BD: { supplierCode: "320.34.0083", supplierName: "B&d Kırtasiye" },
  AURIS: { supplierCode: "320.34.0090", supplierName: "Auris Aksesuar" },
} as const;
const BUDGET_TERMS: Record<string, { s: keyof typeof SUPPLIERS; purchase: number; bonus: number; pTerm: number; sTerm: number; freight: number; contractSales: number } | undefined> = {
  "111592": { s: "DILMAN", purchase: 14, bonus: 2, pTerm: 90, sTerm: 60, freight: 2, contractSales: 3 },
  "136194": { s: "DILMAN", purchase: 12, bonus: 2, pTerm: 90, sTerm: 60, freight: 2, contractSales: 3 },
  "241494": { s: "ABKA", purchase: 13, bonus: 1, pTerm: 60, sTerm: 45, freight: 2, contractSales: 4 },
  "599526": { s: "CALKAN", purchase: 15, bonus: 2, pTerm: 75, sTerm: 60, freight: 3, contractSales: 4 },
  "354235": { s: "MEHTAP", purchase: 12, bonus: 1, pTerm: 60, sTerm: 60, freight: 3, contractSales: 3 },
  "709341": { s: "SINBO", purchase: 11, bonus: 1, pTerm: 90, sTerm: 45, freight: 4, contractSales: 3 },
  "471058": { s: "PRESTIJ", purchase: 16, bonus: 2, pTerm: 75, sTerm: 60, freight: 2, contractSales: 4 },
  "136291": { s: "LETS", purchase: 13, bonus: 1, pTerm: 60, sTerm: 45, freight: 2, contractSales: 3 },
  "443673": { s: "PANTHER", purchase: 14, bonus: 2, pTerm: 90, sTerm: 60, freight: 2, contractSales: 4 },
  "573251": { s: "BD", purchase: 13, bonus: 1, pTerm: 75, sTerm: 60, freight: 2, contractSales: 3 },
  "737212": { s: "AURIS", purchase: 12, bonus: 1, pTerm: 60, sTerm: 45, freight: 3, contractSales: 3 },
};
const budgetTermOf = (code: string) => {
  const term = BUDGET_TERMS[code];
  if (!term) return null;
  return {
    ...SUPPLIERS[term.s], purchaseDiscountPercent: term.purchase, bonusPercent: term.bonus, purchaseTermDays: term.pTerm,
    salesTermDays: term.sTerm, freightRatePercent: term.freight, contractSalesDiscountPercent: term.contractSales,
  };
};
const PALLET_CASES: Record<string, number> = { "111592": 20, "136194": 10, "241494": 25, "599526": 30, "354235": 40, "709341": 50 };
const PRODUCTS = [
  { code: "111592", name: "Dilman Nöbet Defteri 96 Yaprak Ciltli", casePack: 24, price: 38.5, tax: 10, type: "H", sellable: 1850 },
  { code: "136194", name: "Dilman Fon Kartonu 9115 50*70 Karışık", casePack: 100, price: 12.9, tax: 10, type: "H", sellable: 9400 },
  { code: "241494", name: "Abka Kitap Kabı Sarı 5'Li Blisterli", casePack: 48, price: 21.75, tax: 20, type: "D", sellable: null },
  { code: "599526", name: "Çalkan Clk-187 Minik Stand", casePack: 12, price: 164, tax: 20, type: "H", sellable: 96 },
  { code: "354235", name: "Mehtap Tencere 18Cm Çift Taraf Teflon Onyx", casePack: 6, price: 289.9, tax: 20, type: "H", sellable: 0 },
  { code: "709341", name: "Sinbo Vantilatör 16\" Sf-6789 Ayaklı 60w Beyaz", casePack: 4, price: 1149, tax: 20, type: "D", sellable: null },
  { code: "471058", name: "Prestij Piyano Pr18 Pilli Sevimli Kutuda Tavşanlı", casePack: 12, price: 215, tax: 20, type: "H", sellable: 324 },
  { code: "136291", name: "Lets Parmak Boyası L-5500 6 Renk 25Mg", casePack: 36, price: 47.9, tax: 20, type: "D", sellable: null },
  { code: "443673", name: "Panther Pt-z614 Usb Şarjlı Sinek Öldürücü Işık", casePack: 20, price: 96.5, tax: 20, type: "H", sellable: 58 },
  { code: "573251", name: "B&d Kalem Çantası Bd-kcs090 Disco Simli Büyük Boy", casePack: 24, price: 62.75, tax: 20, type: "H", sellable: 1260 },
  { code: "272052", name: "Abka Proje Çantası Art College 28*38 Renkli", casePack: 10, price: 184, tax: 20, type: "D", sellable: null },
  { code: "737212", name: "Auris Mkb01 M.Media Klavye", casePack: 20, price: 139, tax: 20, type: "H", sellable: 410 },
  { code: "815604", name: "Faber-Castell Kurşun Kalem 12'li Kutu", casePack: 36, price: 74.5, tax: 20, type: "H", sellable: 880 },
  { code: "815612", name: "Pilot Tükenmez Kalem Mavi 50'li", casePack: 20, price: 142, tax: 20, type: "H", sellable: 240 },
].map((item, index) => ({
  id: `p${index}`,
  masterBarcode: `8690${item.code}${String(index + 1).padStart(3, "0")}`,
  stockType: item.type,
  sellableQuantity: item.sellable,
  listPrice: item.price,
  multiCode: `M${item.code}`,
  discount1: DISCOUNT1[index] ?? 0,
  ...item,
  // Kurgu stok dağılımı: H'de mevcut = satılabilir + rezerve; D (drop) bazı stoklar depoya alınmış olabilir. İkitelli %60, kalanı Plaza.
  ...(() => {
    const hazir = item.type === "H";
    const reserved = hazir ? Math.round((item.sellable ?? 0) * 0.15) + (index % 3) * 6 : 0;
    const onHand = hazir ? (item.sellable ?? 0) + reserved : (index % 2) * item.casePack * 3;
    const ikitelli = Math.round(onHand * 0.6);
    return {
      palletPack: item.casePack * (PALLET_CASES[item.code] ?? 20),
      stockQuantity: onHand,
      customerOrderQuantity: reserved,
      incomingOrderQuantity: (index % 2) * item.casePack * 5,
      purchaseOrderedQuantity: (index % 2) * item.casePack * 8,
      depotBalances: [{ depotNo: 1, depotName: "İkitelli Depo", depotCode: null, quantity: ikitelli }, { depotNo: 83, depotName: "Plaza Depo", depotCode: null, quantity: onHand - ikitelli }],
    };
  })(),
}));

const matches = (term: string, ...values: (string | null)[]) => {
  const needle = term.toLocaleLowerCase("tr");
  return values.some((value) => value?.toLocaleLowerCase("tr").includes(needle));
};

const page = <T,>(items: T[], query: Record<string, unknown>) => ({
  items,
  totalCount: items.length,
  page: Number(query.page ?? 1),
  pageSize: Number(query.pageSize ?? 10),
});


// Kurgu satın alma siparişleri: 24 adet — 8 Bekliyor (hiç teslim yok), 8 Kısmi Teslim Alınan, 8 Teslim Alınan.
// Başlık tutarları ve satır sayıları satırlardan türetilir; böylece liste ile detay (accordion) birbirini tutar.
let purchaseOrderCache: { orders: Record<string, any>[]; lines: Map<string, Record<string, any>[]> } | null = null;
const purchaseOrderData = () => {
  if (purchaseOrderCache) return purchaseOrderCache;
  const suppliers = Object.values(SUPPLIERS);
  const today = new Date();
  const iso = (offsetDays: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + offsetDays).toISOString().slice(0, 10);
  const lines = new Map<string, Record<string, any>[]>();
  const salespersons = ["AHMET ERİŞ", "AHMET ERİŞ", "NAMIK ÖZTÜRK", "SELİM AKIN"];
  const orders = Array.from({ length: 24 }, (_, i) => {
    const status = i < 8 ? "pending" : i < 16 ? "partial" : "received";
    const k = status === "pending" ? i : status === "partial" ? i - 8 : i - 16;
    const supplier = suppliers[(i * 5 + k) % suppliers.length]!;
    const series = ["SA06", "53", "SA22"][i % 3]!;
    const number = series === "SA06" ? 17000 + i * 6 : series === "53" ? 1645900 + i * 3 : 3700 + i * 4;
    // Her 5 siparişten biri USD (kur 43,25): satır fiyatları dolar cinsindendir.
    const currencyCode = i % 5 === 1 ? "USD" : "TRY";
    const exchangeRate = currencyCode === "USD" ? 43.25 : 1;
    const orderAgo = status === "pending" ? 1 + k * 2 : status === "partial" ? 12 + k * 4 : 35 + k * 15;
    const deliveryDate = iso(status === "pending" ? 10 - k : status === "partial" ? 3 - k * 2 : -(orderAgo - 14));
    const own = PRODUCTS.filter((p) => budgetTermOf(p.code)?.supplierCode === supplier.supplierCode);
    const pool = own.length >= 2 ? own : PRODUCTS;
    const lineCount = Math.min(pool.length, 2 + ((i * 3) % 4));

    const rows = Array.from({ length: lineCount }, (_, j) => {
      const product = pool[(i * 3 + j) % pool.length]!;
      const quantity = product.casePack * (2 + ((i + j * 2) % 6));
      const unitPrice = Math.round(product.price * (0.62 + (j % 3) * 0.01) / exchangeRate * 10000) / 10000;
      const discounts = [j % 2 === 0 ? 5 : 3, j % 3 === 0 ? 2 : 0, 0, 0];
      // Gerçek API gibi: lineTotal = iskonto öncesi brüt tutar, discountN = kademeli iskonto TUTARLARI.
      const grossLine = Math.round(quantity * unitPrice * 100) / 100;
      let rest = grossLine;
      const discountAmounts = discounts.map((d) => { const amount = rest * d / 100; rest -= amount; return amount; });
      const depotNo = [1, 1, 83, 3][(i + j) % 4]!;
      return { product, quantity, unitPrice, discounts, discountAmounts, grossLine, depotNo, lineTotal: Math.round(rest * 100) / 100, tax: product.tax };
    });
    const orderedQuantity = rows.reduce((sum, r) => sum + r.quantity, 0);
    let remaining = status === "pending" ? 0 : status === "received" ? orderedQuantity : Math.round(orderedQuantity * (0.25 + (k % 4) * 0.2));
    const deliveredQuantity = remaining;
    const orderLines = rows.map((r, j) => {
      const delivered = Math.min(r.quantity, remaining);
      remaining -= delivered;
      return {
        id: `${series}-${number}-${j + 1}`, lineGuid: `${series}-${number}-${j + 1}`, orderSeries: series, orderNumber: number, lineNo: j + 1,
        productCode: r.product.code, productName: r.product.name, unitPntr: 1, unitName: "Adet", quantity: r.quantity, deliveredQuantity: delivered,
        unitPrice: r.unitPrice, lineTotal: r.grossLine, discount1: r.discountAmounts[0], discount2: r.discountAmounts[1], discount3: 0, discount4: 0, discount5: 0, discount6: 0,
        taxPntr: 1, taxPercent: r.tax, taxAmount: Math.round(r.lineTotal * r.tax) / 100, deliveryDate, note1: null, note2: null, projectCode: null,
        priceListNo: 1, open: delivered < r.quantity, closeReasonCode: null, closeReasonName: null, listPrice: r.product.price, hasActiveInsert: false,
        createdByName: null, mainGroupName: null, productManagerName: null, discontinued: false, createdAt: null, version: "1", depotNo: r.depotNo,
        unitName1: "Adet", unitName2: "Koli", unitName3: "Palet", unitName4: null,
        unitCoefficient2: r.product.casePack, unitCoefficient3: r.product.casePack * (PALLET_CASES[r.product.code] ?? 20), unitCoefficient4: null,
      };
    });
    lines.set(`${series}-${number}`, orderLines);
    const gross = Math.round(rows.reduce((sum, r) => sum + r.quantity * r.unitPrice, 0) * 100) / 100;
    const netExcl = rows.reduce((sum, r) => sum + r.lineTotal, 0);
    const netTotal = Math.round(rows.reduce((sum, r) => sum + r.lineTotal * (1 + r.tax / 100), 0) * 100) / 100;
    const closedLineCount = orderLines.filter((l) => !l.open).length;
    return {
      currencyCode, exchangeRate,
      orderSeries: series, orderNumber: number, orderDate: iso(-orderAgo), deliveryDate,
      supplierCode: supplier.supplierCode, supplierTitle: supplier.supplierName.toLocaleUpperCase("tr") + " TİC. A.Ş.", salespersonName: salespersons[i % salespersons.length]!,
      grossTotal: gross, discountTotal: Math.round((gross - netExcl) * 100) / 100, netTotal,
      projectCode: null, openLineCount: lineCount - closedLineCount, closedLineCount, orderedQuantity, deliveredQuantity,
      depotNos: [...new Set(rows.map((r) => r.depotNo))],
      note1: i % 7 === 3 ? "Acil sevk" : i % 7 === 5 ? "Fuar siparişi" : null, note2: null, note9: null, addressNo: 1, addressTitle: null, paymentPlanNo: null, paymentPlanName: null,
      representativeCode: null, costCenterCode: null, documentNo: null,
    };
  });
  return (purchaseOrderCache = { orders, lines });
};

/** Tanımsız dönerse gerçek istek atılır; prototipte hiçbir uç gerçek istek atmaz. */
export const prototypeApi = (path: string, opts: { query?: Record<string, unknown> } = {}): unknown => {
  const query = opts.query ?? {};
  const [route] = path.split("?");

  if (route === "/api/erp/permissions/mine") return ["ERP.CashSale.Create", "ERP.CashSale.Read", "ERP.Customer.Create", "ERP.Customer.CreditLimit", "ERP.Customer.Lock", "ERP.Customer.Read", "ERP.Customer.Update", "ERP.Dashboard.View", "ERP.DropshipOrder.Cancel", "ERP.DropshipOrder.Read", "ERP.DropshipOrder.Update", "ERP.FairApproval.Read", "ERP.FairApproval.Update", "ERP.FairShipment.Read", "ERP.FairShipment.Update", "ERP.GoodsReceipt.Read", "ERP.InterDepotOrder.Close", "ERP.InterDepotOrder.Create", "ERP.InterDepotOrder.Read", "ERP.InterDepotOrder.Update", "ERP.OrderManagement.Close", "ERP.OrderManagement.Depot", "ERP.OrderManagement.Plan", "ERP.OrderManagement.Read", "ERP.OrderManagement.RevokeApproval", "ERP.OrderManagement.Split", "ERP.OrderReport.Read", "ERP.PriceDifference.Read", "ERP.PriceListDefinition.Read", "ERP.PriceListDefinition.Write", "ERP.Product.Create", "ERP.Product.Read", "ERP.Product.Update", "ERP.ProductCategory.Assign", "ERP.ProductCategory.Read", "ERP.PurchaseCondition.Create", "ERP.PurchaseCondition.Delete", "ERP.PurchaseCondition.Read", "ERP.PurchaseCondition.Update", "ERP.PurchaseOrder.Close", "ERP.PurchaseOrder.Create", "ERP.PurchaseOrder.Read", "ERP.PurchaseOrder.Update", "ERP.ReturnRequest.Approve", "ERP.ReturnRequest.Create", "ERP.ReturnRequest.Delete", "ERP.ReturnRequest.Read", "ERP.RolePermission.Read", "ERP.RolePermission.Update", "ERP.SalesDocument.Create", "ERP.SalesDocument.Read", "ERP.SalesOrder.Create", "ERP.SalesOrder.Read", "ERP.SalesOrder.Update", "ERP.SalesOrder.View", "ERP.SalesOrderApproval.Edit", "ERP.SalesOrderApproval.Read", "ERP.SalesQuote.Approve", "ERP.SalesQuote.Read", "ERP.SalesQuote.Update", "ERP.ShipmentPlan.Assign", "ERP.ShipmentPlan.Group", "ERP.ShipmentPlan.Read", "ERP.SupplierContract.Create", "ERP.SupplierContract.Delete", "ERP.SupplierContract.Read", "ERP.SupplierContract.Update", "ERP.Ticket.Read", "ERP.User.AssignRoles", "ERP.User.Read", "ERP.User.UpdatePermissions", "ERP.X.View"];

  if (route === "/api/erp/customers/") {
    const term = String(query.search ?? "");
    return page(CUSTOMERS.filter((item) => matches(term, item.code, item.title)), query);
  }
  const customerMatch = route!.match(/^\/api\/erp\/customers\/([^/]+)$/);
  if (customerMatch) {
    const code = decodeURIComponent(customerMatch[1]!);
    const supplier = Object.values(SUPPLIERS).find((item) => item.supplierCode === code);
    const customer = CUSTOMERS.find((item) => item.code === code) ?? (supplier
      ? ({ code, balance: 0, creditLimit: 0, commercialStatus: "B", title: `${supplier.supplierName.toLocaleUpperCase("tr")} TİC. A.Ş. (TEDARİKÇİ)`, province: "İstanbul", district: "Bağcılar" } as unknown as (typeof CUSTOMERS)[number])
      : undefined);
    if (!customer) return null;
    return {
      customer,
      addresses: (ADDRESSES[code] ?? (supplier ? [{ district: "Bağcılar", province: "İstanbul" }] : [])).map((address, index) => ({
        id: `${code}-a${index + 1}`, customerCode: code, addressNo: index + 1, title: null, cancelled: false, ...address,
      })),
      contacts: [],
    };
  }

  if (route === "/api/erp/products/") {
    const term = String(query.search ?? "");
    const supplier = query.supplierCode ? String(query.supplierCode) : "";
    const ofSupplier = (code: string) => !supplier || budgetTermOf(code)?.supplierCode === supplier;
    return page(PRODUCTS.filter((item) => ofSupplier(item.code) && matches(term, item.code, item.name, item.masterBarcode, item.multiCode)), query);
  }

  if (route === "/api/erp/sales-orders/lookups") {
    return {
      depots: [{ no: 1, name: "İkitelli Depo" }, { no: 3, name: "Mağaza" }, { no: 83, name: "Plaza Depo" }],
      paymentPlans: [{ no: 0, name: "PEŞİN" }, { no: 30, name: "30 GÜN" }, { no: 60, name: "60 GÜN" }, { no: 90, name: "90 GÜN" }],
      deliveryTypes: [
        { code: "WAREHOUSE", name: "Ambar" }, { code: "TIMON_SERVICE", name: "Timon Servis" },
        { code: "CUSTOMER_TRUCK", name: "Müşteri Kamyonu" }, { code: "SELF_PICKUP", name: "Kendisi Alacak" },
      ],
      representatives: [{ code: "SELİM AKIN", name: "Selim Akın" }, { code: "AYŞE KARAMAN", name: "Ayşe Karaman" }],
      projects: [{ code: "FUAR-2026", name: "Fuar 2026", active: true }, { code: "FUAR-2025", name: "Fuar 2025", active: false }],
      closeReasons: [],
      orderSeries: ["A", "B"],
      forwarders: [{ code: "320.99.0001", name: "Çelik Ambar" }, { code: "320.99.0002", name: "Yılmaz Nakliyat Ambarı" }, { code: "320.99.0003", name: "Ege Ambar" }],
      nextOrderNumber: 900001,
    };
  }
  const productInfo = route!.match(/^\/api\/erp\/sales-orders\/products\/([^/]+)$/);
  if (productInfo) {
    const product = PRODUCTS.find((item) => item.code === decodeURIComponent(productInfo[1]!));
    if (!product) return null;
    const insert = activeInsert(product.code, String(query.date ?? dayOffset(0)));
    return {
      code: product.code, name: product.name, defaultUnitPntr: 1,
      insertName: insert?.name ?? null, insertValidTo: insert?.to ?? null, budgetTerm: budgetTermOf(product.code),
      units: [
        { pntr: 1, name: "Adet", factor: 1 }, { pntr: 2, name: "Koli", factor: product.casePack },
        // Palet: palette sığan koli sayısı × koli içi (kurgu; stok başına değişir).
        { pntr: 3, name: "Palet", factor: product.casePack * (PALLET_CASES[product.code] ?? 20) },
      ],
      taxPntr: 1, taxPercent: product.tax, listPrice: product.price, discount1: product.discount1, priceListNo: 1,
      passive: false, salesStopped: false, physicalStateCode: null,
    };
  }
  // ── Satın alma siparişi ──────────────────────────────────────────────────────────────
  if (route === "/api/erp/exchange-rates") return { USD: 43.25, EUR: 47.1 };
  if (route === "/api/erp/purchase-orders/close-reasons") {
    return [{ code: "01", name: "Tedarikçi temin edemiyor" }, { code: "02", name: "Fiyat anlaşmazlığı" }, { code: "03", name: "Mükerrer sipariş" }, { code: "04", name: "Vazgeçildi" }];
  }
  if (route === "/api/erp/purchase-orders/lines/close" && (opts as { method?: string }).method === "POST") return true;
  const stockOrders = route!.match(/^\/api\/erp\/purchase-orders\/stock-orders\/([^/]+)$/);
  if (stockOrders) {
    const product = PRODUCTS.find((item) => item.code === decodeURIComponent(stockOrders[1]!));
    if (!product) return { received: [], given: [] };
    const today = new Date();
    const iso = (d: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + d).toISOString().slice(0, 10);
    const customers = ["YILDIZ TOPTAN GIDA KIRTASİYE LTD. ŞTİ.", "MERT MARKET ZİNCİRİ TİC. A.Ş.", "ANADOLU TOPTAN PAZARLAMA A.Ş.", "BEREKET GIDA SAN. LTD. ŞTİ."];
    const DEPOT_NAMES = ["İkitelli Depo", "Plaza Depo", "Mağaza"];
    const OWNERS = ["AHMET ERİŞ", "NAMIK ÖZTÜRK", "SELİM AKIN"];
    const no = Number(product.code.slice(-3));
    // Alınan: rezerve miktarı 1–3 müşteri siparişine bölünür (toplam = customerOrderQuantity).
    const reserved = product.customerOrderQuantity ?? 0;
    const parts = reserved > 0 ? Math.min(3, 1 + (no % 3)) : 0;
    const received = Array.from({ length: parts }, (_, i) => {
      const quantity = i === parts - 1 ? reserved - Math.floor(reserved / parts) * (parts - 1) : Math.floor(reserved / parts);
      return { orderDate: iso(-(2 + i * 4)), documentNo: `SS-${2026000 + no * 3 + i}`, partyTitle: customers[(no + i) % customers.length]!, quantity, deliveredQuantity: 0, deliveryDate: iso(3 + i * 2), depotName: DEPOT_NAMES[(no + i) % 3]!, unitPrice: product.price, discountPercents: [i % 2 === 0 ? 5 : 0, 0, 0, 0], ownerName: OWNERS[(no + i) % 3]! };
    });
    // Verilen: açık satın alma siparişleri; bekleyen kısım = incomingOrderQuantity, kalanı teslim alınmış.
    const waiting = product.incomingOrderQuantity ?? 0;
    const ordered = product.purchaseOrderedQuantity ?? 0;
    const supplier = Object.values(SUPPLIERS)[no % Object.values(SUPPLIERS).length]!;
    const given = ordered > 0 ? [
      { orderDate: iso(-6), documentNo: `A-${900100 + no}`, partyTitle: supplier.supplierName.toLocaleUpperCase("tr") + " TİC. A.Ş.", quantity: waiting, deliveredQuantity: 0, deliveryDate: iso(8), depotName: DEPOT_NAMES[no % 3]!, unitPrice: Math.round(product.price * 0.62 * 100) / 100, discountPercents: [5, 2, 0, 0], ownerName: OWNERS[no % 3]! },
      ...(ordered > waiting ? [{ orderDate: iso(-30), documentNo: `A-${900060 + no}`, partyTitle: supplier.supplierName.toLocaleUpperCase("tr") + " TİC. A.Ş.", quantity: ordered - waiting, deliveredQuantity: ordered - waiting, deliveryDate: iso(-12), depotName: DEPOT_NAMES[(no + 1) % 3]!, unitPrice: Math.round(product.price * 0.6 * 100) / 100, discountPercents: [3, 0, 0, 0], ownerName: OWNERS[(no + 1) % 3]! }] : []),
    ] : [];
    return { received, given };
  }
  const orderDetail = route!.match(/^\/api\/erp\/purchase-orders\/(?!product-defaults|invoice-history|sales-history|stock-orders)([^/]+)\/(\d+)$/);
  if (orderDetail) {
    const { orders, lines } = purchaseOrderData();
    const header = orders.find((o) => o.orderSeries === decodeURIComponent(orderDetail[1]!) && o.orderNumber === Number(orderDetail[2]));
    return { header: header ?? null, lines: header ? lines.get(`${header.orderSeries}-${header.orderNumber}`) ?? [] : [] };
  }
  const invoiceHistory = route!.match(/^\/api\/erp\/purchase-orders\/invoice-history\/([^/]+)$/);
  if (invoiceHistory) {
    const product = PRODUCTS.find((item) => item.code === decodeURIComponent(invoiceHistory[1]!));
    if (!product) return [];
    // Kurgu veri: son 5 yıla yayılmış, fiyatı zamanla artan 7 alış faturası.
    const suppliers = Object.values(SUPPLIERS);
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(today.getFullYear(), today.getMonth() - i * 8 - 1, 12 + (i % 10));
      const unitPrice = Math.round(product.price * (0.62 - i * 0.04) * 100) / 100;
      const discountPercents = [i % 3 === 0 ? 5 : 3, i % 2 === 0 ? 2 : 0, 0, 0];
      const netUnitPrice = Math.round(discountPercents.reduce((p, d) => p * (1 - d / 100), unitPrice) * 100) / 100;
      const quantity = product.casePack * (10 + i * 5);
      const supplier = suppliers[i % suppliers.length]!;
      return {
        invoiceDate: date.toISOString().slice(0, 10),
        invoiceNo: `AF${date.getFullYear()}${String(1000 + Number(product.code.slice(-3)) * 3 + i * 17).padStart(9, "0")}`,
        supplierCode: supplier.supplierCode, supplierTitle: supplier.supplierName,
        quantity, unitPrice, discountPercents, netUnitPrice,
        lineTotal: Math.round(netUnitPrice * quantity * 100) / 100,
      };
    });
  }
  const salesHistory = route!.match(/^\/api\/erp\/purchase-orders\/sales-history\/([^/]+)$/);
  if (salesHistory) {
    const product = PRODUCTS.find((item) => item.code === decodeURIComponent(salesHistory[1]!));
    if (!product) return { onHandQuantity: 0, sellableQuantity: 0, items: [] };
    // Kurgu veri: son 12 aya yayılmış 14 satış faturası, yeniden eskiye.
    const customers = ["Yıldız Kırtasiye", "Anadolu Toptan", "Güneş Market Zinciri", "Bereket Gıda", "Ege Pazarlama"];
    const depots = ["İkitelli Depo", "Plaza Depo", "Mağaza"];
    const today = new Date();
    const items = Array.from({ length: 14 }, (_, i) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 4 - i * 26);
      const discount = i % 3 === 0 ? 5 : 0;
      return {
        date: date.toISOString().slice(0, 10),
        documentNo: `SF${date.getFullYear()}${String(2000 + Number(product.code.slice(-3)) + i * 29).padStart(9, "0")}`,
        customerTitle: customers[i % customers.length]!,
        quantity: product.casePack * (1 + (i % 4)),
        unitPrice: Math.round(product.price * 100) / 100,
        discountPercents: [discount, 0, 0, 0],
        depotName: depots[i % depots.length]!,
      };
    });
    return { onHandQuantity: product.sellable ?? 0, sellableQuantity: product.sellable ?? 0, items };
  }
  const purchaseDefaults = route!.match(/^\/api\/erp\/purchase-orders\/product-defaults\/([^/]+)$/);
  if (purchaseDefaults) {
    const product = PRODUCTS.find((item) => item.code === decodeURIComponent(purchaseDefaults[1]!));
    if (!product) return null;
    const term = BUDGET_TERMS[product.code];
    // Açık satın alma şartı yalnız sözleşmesi olan stoklarda var; yoksa liste fiyatına düşülür.
    const hasCondition = Boolean(term);
    return {
      productCode: product.code, productName: product.name, unitPntr: 1,
      unitName1: "Adet", unitName2: "Koli", unitName3: "Palet", unitName4: null,
      unitCoefficient2: product.casePack, unitCoefficient3: product.casePack * (PALLET_CASES[product.code] ?? 20), unitCoefficient4: null,
      taxPntr: 1, taxPercent: product.tax,
      conditionUnitPrice: hasCondition ? Math.round(product.price * 0.62 * 100) / 100 : null,
      conditionDiscountPercents: hasCondition ? [term!.purchase, term!.bonus, 0, 0, 0, 0] : [],
      lastPurchasePrice: Math.round(product.price * 0.6 * 100) / 100,
      listPrice: product.price,
    };
  }
  if ((route === "/api/erp/purchase-orders" || route === "/api/erp/purchase-orders/") && !(opts as { method?: string }).method) {
    const { orders } = purchaseOrderData();
    const term = String(query.search ?? "");
    return page(orders.filter((o) => !term || matches(term, `${o.orderSeries}-${o.orderNumber}`, o.supplierTitle, o.supplierCode)), query);
  }
  if (route === "/api/erp/purchase-orders/" && (opts as { method?: string }).method === "POST") {
    const body = (opts as { body?: { orderSeries?: string; orderNumber?: number | null } }).body ?? {};
    return { orderSeries: body.orderSeries || "A", orderNumber: (body as { orderNumber?: number | null }).orderNumber ?? 900001 };
  }
  if (route === "/api/erp/sales-orders/" && (opts as { method?: string }).method === "POST") {
    const body = (opts as { body?: { orderType?: number; orderSeries?: string } }).body ?? {};
    return { orderType: body.orderType ?? 0, orderSeries: body.orderSeries || "A", orderNumber: 900001 };
  }
  return null;
};
