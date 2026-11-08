<script setup lang="ts">
// Kesit 15 · ekran 06 (Satın Alma Sipariş formu) — başlık + satır ızgarası.
// Legacy FormSatinalmaSiparis'in karşılığı: cari seçilir, satırlar eklenir, fiyat/iskonto
// açık SATINALMA ŞARTINDAN önerilir (timerpfn_GetirAcikSasBilgi'nin dört aşamalı geri
// düşüşü sunucuda), kullanıcı ezebilir.
//
// Kapsam dışı (ölçüldü — CUTOVER_UAT'de kayıtlı): park dosyası (yerel diske JSON yedek),
// panodan yapıştırma, Excel'e aktar, yazdırma (D18) ve raporlar. Satır silme kapatma
// dönüşümüne çevrilir (D19): satır ızgaradan çıkarıldığında sunucu miktarı sıfırlayıp
// neden 900 ile kapatır.
import { useDebounceFn } from "@vueuse/core";
import { History, Plus, Search, Trash2, X } from "lucide-vue-next";
import type {
  ErpPurchaseOrder,
  ErpPurchaseInvoiceHistoryItem,
  ErpStockSalesHistory,
  ErpPurchaseOrderLine,
  ErpPurchaseOrderSavePayload,
} from "~/composables/useErpPurchaseOrders";
import type { ErpSalesOrderLookups } from "~/composables/useErpSalesOrders";
import { discountPercentsOf } from "~/composables/useErpSalesOrders";
import { addDays, localIsoDate } from "~/utils/dates";
import { applyDiscountChain, formatMoney, formatQuantity, parseDecimal, reverseDiscountPercent, summarize } from "~/utils/money";
import { priceForUnit, unitFactor } from "~/utils/orderUnits";
import type { ErpCustomerAddress } from "~/composables/useErpCustomers";
import type { ErpProduct } from "~/composables/useErpProducts";

const props = defineProps<{
  detail?: { header: ErpPurchaseOrder | null; lines: ErpPurchaseOrderLine[] } | null;
  lookups: ErpSalesOrderLookups | null;
  saving?: boolean;
}>();

const emit = defineEmits<{ submit: [payload: ErpPurchaseOrderSavePayload] }>();

const NONE = "__none__";

interface EditorLine {
  id: string | null;
  productCode: string;
  productName: string;
  unitPntr: number;
  units: { pntr: number; name: string; factor: number }[];
  quantity: number;
  unitPrice: number;
  discount1: number;
  discount2: number;
  discount3: number;
  discount4: number;
  /** İsk 5–6: ızgarada kolon yok ama taşınır — şartın/evrakın kademeleri kaybolmasın. */
  otherDiscounts: number[];
  taxPercent: number;
  depotNo: number;
  deliveryDate: string;
  note1: string;
  /** Yalnız bilgi amaçlı — legacy ızgarasındaki iki karşılaştırma kolonu. */
  lastPurchasePrice: number | null;
  listPrice: number | null;
  fromCondition: boolean;
  /** Satın alma şartındaki birim fiyat (seçili birim başına): birim fiyat bunun ÜSTÜNE çıkamaz, altına inebilir. Şart yoksa null. */
  maxUnitPrice: number | null;
}

const customersApi = useErpCustomers();
const productsApi = useErpProducts();
const purchaseApi = useErpPurchaseOrders();

const isEdit = computed(() => Boolean(props.detail?.header));

// ── Başlık ────────────────────────────────────────────────────────────────────────────
// Seri, sıra no ve sipariş tarihi kullanıcıdan alınmaz; yeni evrakta sunucu sıra no verir. shortcut: seri sabit "A", seri kuralı gelince sunucudan alınmalı.
const series = ref("A");
const supplierCode = ref("");
const supplierTitle = ref("");
const supplierInfo = ref<{ location: string; balance: number | null }>({ location: "", balance: null });
const addresses = ref<ErpCustomerAddress[]>([]);
const addressNo = ref<number | null>(null);
const projectCode = ref(NONE);
// Yalnız aktif projeler; düzenlemede kayıtlı proje pasif olsa bile görünsün diye seçili olan korunur.
const activeProjects = computed(() =>
  (props.lookups?.projects ?? []).filter((p) => p.active !== false || p.code === projectCode.value));
const deliveryDate = ref(addDays(3));
// Üstteki depo / teslim tarihi satırlara yazılır; satırda ayrıca değiştirilebilir.
const headerDepot = ref(1);
const setHeaderDepot = (no: number) => { headerDepot.value = no; lines.value.forEach((l) => (l.depotNo = no)); };
const setHeaderDelivery = (v: string | number | null | undefined) => { deliveryDate.value = String(v ?? ""); lines.value.forEach((l) => (l.deliveryDate = deliveryDate.value)); };
const note1 = ref("");

const lines = ref<EditorLine[]>([]);
const errorText = ref("");

// ── Cari (tedarikçi) arama ────────────────────────────────────────────────────────────
const supplierSearch = ref("");
const supplierResults = ref<{ code: string; title: string; province: string | null; district: string | null; balance: number | null }[]>([]);
const supplierSearching = ref(false);

const searchSuppliers = useDebounceFn(async () => {
  const term = supplierSearch.value.trim();
  if (term.length < 2) { supplierResults.value = []; return; }
  supplierSearching.value = true;
  try {
    const result = await customersApi.list({ search: term, page: 1, pageSize: 10 });
    supplierResults.value = result.items.map((c) => ({ code: c.code, title: c.title ?? c.code, province: c.province, district: c.district, balance: c.balance }));
  } catch {
    supplierResults.value = [];
  } finally {
    supplierSearching.value = false;
  }
}, 350);

const pickSupplier = async (code: string, title: string) => {
  supplierCode.value = code;
  supplierTitle.value = title;
  supplierResults.value = [];
  supplierSearch.value = "";
  await loadAddresses(code);
};

const loadAddresses = async (code: string) => {
  try {
    const detail = await customersApi.get(code);
    addresses.value = detail.addresses;
    if (addressNo.value === null && detail.addresses.length > 0)
      addressNo.value = detail.addresses[0]!.addressNo ?? 1;
    if (!supplierTitle.value) supplierTitle.value = detail.customer.title ?? code;
    supplierInfo.value = {
      location: [detail.customer.province, detail.customer.district].filter(Boolean).join(" / "),
      balance: detail.customer.balance,
    };
  } catch {
    addresses.value = [];
  }
};

const addressLabel = (address: ErpCustomerAddress) =>
  [address.addressNo, [address.district, address.province].filter(Boolean).join(" / ")]
    .filter(Boolean).join(" — ");

// ── Stok arama + satır ekleme ─────────────────────────────────────────────────────────
const productSearch = ref("");

// ── Stok seçim penceresi (satış siparişiyle aynı): Enter → kod/barkod/multi kod tam eşleşip tek stok varsa direkt eklenir, aksi halde çoklu seçim penceresi açılır ──
const pickerOpen = ref(false);
const pickerLoading = ref(false);
const pickerItems = ref<ErpProduct[]>([]);
const pickerSelected = ref<string[]>([]);
const pickerAdding = ref(false);

// Yalnız seçili tedarikçinin ürünleri (varsayılan açık); tedarikçi yoksa süzme uygulanmaz.
const onlySupplierProducts = ref(true);
const supplierFilterOn = computed(() => onlySupplierProducts.value && Boolean(supplierCode.value));
const clearAllLines = () => {
  if (lines.value.length && window.confirm(`${lines.value.length} satırın tümü silinsin mi?`)) lines.value = [];
};

const openPicker = async () => {
  const term = productSearch.value.trim();
  if (!term) return;
  errorText.value = "";
  pickerLoading.value = true;
  try {
    pickerItems.value = (await productsApi.list({
      search: term, page: 1, pageSize: 50,
      supplierCode: supplierFilterOn.value ? supplierCode.value : undefined,
    })).items;
  } catch {
    pickerItems.value = [];
  } finally {
    pickerLoading.value = false;
  }
  if (pickerItems.value.length === 0) { errorText.value = supplierFilterOn.value ? `"${term}" ile bu tedarikçinin ürünlerinde eşleşen stok yok.` : `"${term}" ile eşleşen stok yok.`; return; }
  const needle = term.toLocaleLowerCase("tr");
  const exact = pickerItems.value.filter((item) =>
    [item.code, item.masterBarcode, item.multiCode].some((v) => v && v.toLocaleLowerCase("tr") === needle));
  if (exact.length === 1) { await addLine(exact[0]!); return; }
  pickerSelected.value = [];
  pickerOpen.value = true;
};
const pickerAllSelected = computed(() => pickerItems.value.length > 0 && pickerSelected.value.length === pickerItems.value.length);
const togglePickerAll = (checked: boolean | "indeterminate") => {
  pickerSelected.value = checked === true ? pickerItems.value.map((item) => item.code) : [];
};
const togglePicker = (code: string, checked: boolean | "indeterminate") => {
  pickerSelected.value = checked === true ? [...new Set([...pickerSelected.value, code])] : pickerSelected.value.filter((c) => c !== code);
};
const addPicked = async () => {
  pickerAdding.value = true;
  try {
    for (const product of pickerItems.value.filter((item) => pickerSelected.value.includes(item.code))) await addLine(product);
    pickerOpen.value = false;
  } finally {
    pickerAdding.value = false;
  }
};

// ── Miktar: yalnız tam sayı; koli parçalanıyorsa uyarı; üstte koli / palet özeti (satış siparişiyle aynı) ──
const blockedQuantityKeys = [",", ".", "e", "E", "+", "-"];
const onQuantityKeydown = (e: KeyboardEvent) => { if (blockedQuantityKeys.includes(e.key)) e.preventDefault(); };
const normalizeQuantity = (line: EditorLine, input: HTMLInputElement) => {
  line.quantity = Math.max(1, Math.round(Number(input.value) || 1));
  input.value = String(line.quantity);
};
const unitFactorByName = (line: EditorLine, name: string) =>
  line.units.find((u) => u.name.toLocaleLowerCase("tr") === name)?.factor ?? null;
const baseQuantityOf = (line: EditorLine) => line.quantity * (line.units.find((u) => u.pntr === line.unitPntr)?.factor ?? 1);
const round2Qty = (v: number) => Math.round(v * 100) / 100;
// Temel birim miktarı koli içi adede tam bölünmüyorsa koli parçalanıyor demektir.
const caseBreak = (line: EditorLine) => {
  const caseFactor = unitFactorByName(line, "koli");
  return caseFactor && caseFactor > 1 && Number.isFinite(line.quantity) && baseQuantityOf(line) % caseFactor !== 0 ? caseFactor : null;
};
const packRows = computed(() => lines.value.map((line) => {
  const base = baseQuantityOf(line);
  const caseFactor = unitFactorByName(line, "koli");
  const palletFactor = unitFactorByName(line, "palet");
  return {
    name: line.productName, base,
    cases: caseFactor ? round2Qty(base / caseFactor) : null,
    pallets: palletFactor ? round2Qty(base / palletFactor) : null,
  };
}));
const packTotals = computed(() => ({
  base: packRows.value.reduce((sum, r) => sum + r.base, 0),
  cases: round2Qty(packRows.value.reduce((sum, r) => sum + (r.cases ?? 0), 0)),
  pallets: round2Qty(packRows.value.reduce((sum, r) => sum + (r.pallets ?? 0), 0)),
}));

// ── Klavye ile gezinme (Excel gibi): ok tuşları satır tablosundaki kutular arasında gezer ──
// Yukarı/aşağı: aynı sütunda önceki/sonraki satır (hücrede alt alta iki kutu varsa önce hücre içinde).
// Sağ/sol: yan hücre; metin kutusunda imleç kenardaysa geçer. Tarih kutusunda sağ/sol alanlar arasında gezer, yukarı/aşağı hücre değiştirir.
const GRID_CONTROLS = 'input:not([readonly]):not([disabled]), button[role="combobox"]:not([disabled])';
const focusControl = (el: HTMLElement | undefined) => {
  if (!el) return false;
  el.focus();
  if (el instanceof HTMLInputElement && el.type !== "date") el.select();
  return true;
};
const onGridKeydown = (e: KeyboardEvent) => {
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
  const el = e.target as HTMLElement;
  const td = el.closest("td");
  if (!td || !el.matches(GRID_CONTROLS)) return;
  const vertical = e.key === "ArrowUp" || e.key === "ArrowDown";
  const input = el instanceof HTMLInputElement ? el : null;
  if (!vertical && input) {
    if (input.type === "date") return;
    if (input.type === "text" && (input.selectionStart !== input.selectionEnd
      || (e.key === "ArrowLeft" ? input.selectionStart !== 0 : input.selectionStart !== input.value.length))) return;
  }
  let target: HTMLElement | undefined;
  if (vertical) {
    const controls = [...td.querySelectorAll<HTMLElement>(GRID_CONTROLS)];
    const index = controls.indexOf(el);
    const down = e.key === "ArrowDown";
    target = controls[index + (down ? 1 : -1)];
    for (let row = td.parentElement?.[down ? "nextElementSibling" : "previousElementSibling"]; !target && row; row = row[down ? "nextElementSibling" : "previousElementSibling"]) {
      const cell = (row as HTMLTableRowElement).cells[td.cellIndex];
      const found = cell ? [...cell.querySelectorAll<HTMLElement>(GRID_CONTROLS)] : [];
      target = down ? found[0] : found[found.length - 1];
    }
  } else {
    const right = e.key === "ArrowRight";
    for (let cell = right ? td.nextElementSibling : td.previousElementSibling; !target && cell; cell = right ? cell.nextElementSibling : cell.previousElementSibling) {
      const found = [...cell.querySelectorAll<HTMLElement>(GRID_CONTROLS)];
      target = right ? found[0] : found[found.length - 1];
    }
  }
  // Hedef yoksa varsayılan davranış kalır (ör. sayı kutusunda yukarı/aşağı değer değiştirmesin diye yine de engelle).
  if (!target) { if (vertical && input?.type === "number") e.preventDefault(); return; }
  e.preventDefault();
  e.stopPropagation();
  focusControl(target);
};

// ── Satış hareketleri (son 12 ay, faturalanan, tüm müşteriler) — modaldaki Satış Hareketleri sekmesi ──
const salesCache = ref<Record<string, ErpStockSalesHistory>>({});
const monthsAgoIso = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
};
const loadSales = async (code: string) => {
  if (salesCache.value[code]) return;
  try {
    salesCache.value[code] = await purchaseApi.salesHistory(code);
  } catch {
    salesCache.value[code] = { onHandQuantity: 0, sellableQuantity: 0, items: [] };
  }
};
const historyTab = ref<"purchase" | "sales">("purchase");
const salesMonths = ref(3);
const salesView = computed(() => {
  const data = salesCache.value[historyCode.value];
  const from = monthsAgoIso(salesMonths.value);
  const items = (data?.items ?? []).filter((m) => m.date >= from);
  const total = items.reduce((sum, m) => sum + m.quantity, 0);
  return { items, total, monthly: total / salesMonths.value, onHand: data?.onHandQuantity ?? 0, sellable: data?.sellableQuantity ?? 0, loaded: Boolean(data) };
});

// ── Excel'den yapıştır: Stok Kodu/Barkod/Multi Kod · Miktar · Birim · Birim Fiyat · İsk 1–4 ──
// İlk satır başlıksa sütunlar başlık adlarıyla eşlenir (sıra serbest); değilse yukarıdaki sıra varsayılır. Boş hücre = stoğun şartından gelen değer kalır.
// Stok kartı yoksa, seçili tedarikçiye ait değilse, birim tanımsızsa, fiyat şart üst sınırını aşıyorsa ya da iskonto geçersizse satır EKLENMEZ ve uyarılır.
type PasteField = "code" | "quantity" | "unit" | "price" | "d1" | "d2" | "d3" | "d4";
const PASTE_DEFAULT_ORDER: PasteField[] = ["code", "quantity", "unit", "price", "d1", "d2", "d3", "d4"];
const pasteFieldOf = (header: string): PasteField | null => {
  const n = header.toLocaleLowerCase("tr").replace(/[^a-z0-9çğıöşü]/g, "");
  const disc = n.match(/isk(?:onto)?([1-4])/);
  if (disc) return `d${disc[1]}` as PasteField;
  if (n.includes("fiyat")) return "price";
  if (n.includes("miktar")) return "quantity";
  if (n === "birim") return "unit";
  if (n.includes("kod") || n.includes("stok")) return "code";
  return null;
};
const pasteOpen = ref(false);
const pasteText = ref("");
const pasteBusy = ref(false);
const pasteIssues = ref<{ code: string; text: string }[]>([]);
const pasteAdded = ref(0);
const openPaste = () => { pasteText.value = ""; pasteIssues.value = []; pasteAdded.value = 0; pasteOpen.value = true; };
const matchesCode = (item: ErpProduct, needle: string) =>
  [item.code, item.masterBarcode, item.multiCode].some((v) => v && v.toLocaleLowerCase("tr") === needle);
const importPasted = async () => {
  const table = pasteText.value.split(/\r?\n/).map((r) => r.split("\t").map((c) => c.trim())).filter((r) => r.some(Boolean));
  if (!table.length) return;
  let order = PASTE_DEFAULT_ORDER;
  const headerFields = table[0]!.map(pasteFieldOf);
  if (headerFields.filter(Boolean).length >= 2) {
    if (!headerFields.includes("code")) { pasteIssues.value = [{ code: "—", text: "Başlık satırında Stok Kodu sütunu yok." }]; return; }
    order = headerFields as PasteField[];
    table.shift();
  }
  pasteBusy.value = true;
  pasteIssues.value = [];
  pasteAdded.value = 0;
  const issues: typeof pasteIssues.value = [];
  try {
    for (const cells of table) {
      const get = (field: PasteField) => { const i = order.indexOf(field); return i >= 0 ? (cells[i] ?? "") : ""; };
      const code = get("code");
      if (!code) continue;
      const fail = (text: string) => issues.push({ code, text });
      const needle = code.toLocaleLowerCase("tr");

      const rawQty = get("quantity");
      const quantity = rawQty === "" ? 1 : parseDecimal(rawQty);
      if (quantity === null || !Number.isInteger(quantity) || quantity <= 0) { fail(`Miktar geçersiz ("${rawQty}"): tam sayı ve sıfırdan büyük olmalı.`); continue; }
      const rawPrice = get("price");
      const price = rawPrice === "" ? null : parseDecimal(rawPrice);
      if (rawPrice !== "" && (price === null || price < 0)) { fail(`Birim fiyat geçersiz ("${rawPrice}").`); continue; }
      const discounts = (["d1", "d2", "d3", "d4"] as const).map((f) => ({ f, raw: get(f) }));
      const badDiscount = discounts.find(({ raw }) => raw !== "" && (() => { const v = parseDecimal(raw); return v === null || v < 0 || v >= 100; })());
      if (badDiscount) { fail(`İskonto geçersiz ("${badDiscount.raw}"): %0–99 arasında olmalı.`); continue; }

      const found = (await productsApi.list({ search: code, page: 1, pageSize: 20 })).items.filter((i) => matchesCode(i, needle));
      if (found.length === 0) { fail("Stok kartı bulunamadı."); continue; }
      const own = (await productsApi.list({ search: code, supplierCode: supplierCode.value, page: 1, pageSize: 20 })).items.filter((i) => matchesCode(i, needle));
      if (own.length === 0) { fail(`${found[0]!.name ?? ""} — seçilen tedarikçiye ait değil, eklenmedi.`); continue; }
      const product = own[0]!;
      if (lines.value.some((l) => l.productCode === product.code)) { fail("Siparişte zaten var, atlandı."); continue; }

      await addLine(product);
      const line = lines.value[lines.value.length - 1]!;
      const rawUnit = get("unit");
      if (rawUnit) {
        const unit = line.units.find((u) => u.name.toLocaleLowerCase("tr") === rawUnit.toLocaleLowerCase("tr"));
        if (!unit) { lines.value.pop(); fail(`${product.name ?? ""} — "${rawUnit}" birimi bu stokta tanımlı değil (${line.units.map((u) => u.name).join(", ")}).`); continue; }
        if (unit.pntr !== line.unitPntr) changeUnit(line, unit.pntr);
      }
      line.quantity = quantity;
      if (price !== null) line.unitPrice = price;
      if (overMaxPrice(line)) {
        const limit = line.maxUnitPrice!;
        lines.value.pop();
        fail(`Birim fiyat satın alma şartındaki fiyatın (${formatMoney(limit)}) üstüne çıkamaz, eklenmedi.`);
        continue;
      }
      for (const { f, raw } of discounts) if (raw !== "") line[`discount${f[1]}` as "discount1"] = parseDecimal(raw)!;
      pasteAdded.value++;
    }
  } finally {
    pasteBusy.value = false;
    pasteIssues.value = issues;
  }
  if (!issues.length) pasteOpen.value = false;
};

// ── Tedarikçi stok listesi (kısa rapor): seçili tedarikçinin aktif stokları + satış miktarları; buradan satıra eklenebilir ──
const stockListOpen = ref(false);
const stockListLoading = ref(false);
const stockListItems = ref<ErpProduct[]>([]);
const stockListSelected = ref<string[]>([]);
const stockListSearch = ref("");
const stockListMonths = ref(3);
const stockListAdding = ref(false);
// Listedeki tüm miktarlar seçilen birimle gösterilir (temel birim = adet). Stokta o birim tanımlı değilse Adet'e düşer.
const stockListUnit = ref<"Adet" | "Koli" | "Palet">("Adet");
const stockUnitOf = (item: ErpProduct) => {
  const factor = stockListUnit.value === "Koli" ? item.casePack : stockListUnit.value === "Palet" ? item.palletPack : 1;
  return factor && factor > 1 ? { name: stockListUnit.value, factor } : { name: "Adet", factor: 1 };
};
// Satılabilir: H stokta kartın değeri; D (drop) stokta kart değeri yoksa depoya alınmış mevcut stoktan rezerve düşülür.
const sellableOf = (item: ErpProduct) =>
  item.sellableQuantity ?? Math.max(0, (item.stockQuantity ?? 0) - (item.customerOrderQuantity ?? 0));
const uq = (item: ErpProduct, base: number) => formatQuantity(Math.round((base / stockUnitOf(item).factor) * 100) / 100);
// Satılabilir miktarın üstüne gelince depo dağılımı / rezerve / tedarik siparişi açılır.
const stockHoverCode = ref<string | null>(null);
const salesQty = (code: string, months: number) => {
  const from = monthsAgoIso(months);
  return (salesCache.value[code]?.items ?? []).filter((m) => m.date >= from).reduce((sum, m) => sum + m.quantity, 0);
};
const openStockList = async () => {
  if (!supplierCode.value) return;
  stockListOpen.value = true;
  stockListSelected.value = [];
  stockListSearch.value = "";
  stockListLoading.value = true;
  try {
    const result = await productsApi.list({ supplierCode: supplierCode.value, page: 1, pageSize: 200 });
    stockListItems.value = result.items.filter((item) => !item.discontinued && !item.isPassive);
    await Promise.all(stockListItems.value.map((item) => loadSales(item.code)));
  } catch {
    stockListItems.value = [];
  } finally {
    stockListLoading.value = false;
  }
};
const stockListRows = computed(() => {
  const term = stockListSearch.value.trim().toLocaleLowerCase("tr");
  return stockListItems.value
    .filter((item) => !term || [item.code, item.name, item.masterBarcode].some((v) => v?.toLocaleLowerCase("tr").includes(term)))
    .map((item) => ({ item, sold: salesQty(item.code, stockListMonths.value), inOrder: lines.value.some((l) => l.productCode === item.code) }))
    .sort((a, b) => b.sold - a.sold);
});
const stockListSelectable = computed(() => stockListRows.value.filter((r) => !r.inOrder).map((r) => r.item.code));
const stockListAllSelected = computed(() => stockListSelectable.value.length > 0 && stockListSelectable.value.every((c) => stockListSelected.value.includes(c)));
const toggleStockListAll = (checked: boolean | "indeterminate") => {
  stockListSelected.value = checked === true ? [...stockListSelectable.value] : [];
};
const toggleStockList = (code: string, checked: boolean | "indeterminate") => {
  stockListSelected.value = checked === true ? [...new Set([...stockListSelected.value, code])] : stockListSelected.value.filter((c) => c !== code);
};
const addFromStockList = async () => {
  stockListAdding.value = true;
  try {
    for (const item of stockListItems.value.filter((i) => stockListSelected.value.includes(i.code))) await addLine(item);
    stockListOpen.value = false;
  } finally {
    stockListAdding.value = false;
  }
};

// ── Geçmiş alış faturaları (son 5 yıl) ────────────────────────────────────────────────
const historyOpen = ref(false);
const historyLoading = ref(false);
const historyTitle = ref("");
const historyCode = ref("");
const historyItems = ref<ErpPurchaseInvoiceHistoryItem[]>([]);
const openHistory = async (line: EditorLine, tab: "purchase" | "sales" = "purchase") => {
  historyTitle.value = `${line.productCode} · ${line.productName}`;
  historyCode.value = line.productCode;
  historyTab.value = tab;
  void loadSales(line.productCode);
  historyItems.value = [];
  historyOpen.value = true;
  historyLoading.value = true;
  try {
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const from = fiveYearsAgo.toISOString().slice(0, 10);
    historyItems.value = (await purchaseApi.invoiceHistory(line.productCode))
      .filter((item) => item.invoiceDate >= from)
      .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
  } catch {
    historyItems.value = [];
  } finally {
    historyLoading.value = false;
  }
};

const addLine = async (product: ErpProduct) => {
  productSearch.value = "";
  const depot = headerDepot.value;
  const info = await purchaseApi
    .productDefaults(product.code, {
      supplierCode: supplierCode.value || undefined,
      depotNo: depot,
      projectCode: projectCode.value === NONE ? undefined : projectCode.value,
    })
    .catch(() => null);

  const percents = info?.conditionDiscountPercents ?? [];
  lines.value.push({
    id: null,
    productCode: product.code,
    productName: product.name ?? product.code,
    unitPntr: info?.unitPntr ?? 1,
    units: unitsOf(info),
    quantity: 1,
    // Legacy sırası: açık satın alma şartı > 1 numaralı liste fiyatı > 0.
    unitPrice: info?.conditionUnitPrice ?? info?.listPrice ?? 0,
    discount1: percents[0] ?? 0,
    discount2: percents[1] ?? 0,
    discount3: percents[2] ?? 0,
    discount4: percents[3] ?? 0,
    otherDiscounts: [percents[4] ?? 0, percents[5] ?? 0],
    taxPercent: info?.taxPercent ?? 0,
    depotNo: depot,
    deliveryDate: deliveryDate.value,
    note1: "",
    lastPurchasePrice: info?.lastPurchasePrice ?? null,
    listPrice: info?.listPrice ?? null,
    fromCondition: info?.conditionUnitPrice !== null && info?.conditionUnitPrice !== undefined,
    maxUnitPrice: info?.conditionUnitPrice ?? null,
  });
};

function unitsOf(info: { unitName1: string | null; unitName2: string | null;
                         unitName3: string | null; unitName4: string | null;
                         unitCoefficient2: number | null; unitCoefficient3: number | null;
                         unitCoefficient4: number | null } | null) {
  if (!info) return [{ pntr: 1, name: "Birim 1", factor: 1 }];
  return [
    { pntr: 1, name: info.unitName1 ?? "Birim 1", factor: 1 },
    { pntr: 2, name: info.unitName2 ?? "", factor: unitFactor(info.unitCoefficient2) },
    { pntr: 3, name: info.unitName3 ?? "", factor: unitFactor(info.unitCoefficient3) },
    { pntr: 4, name: info.unitName4 ?? "", factor: unitFactor(info.unitCoefficient4) },
  ].filter((u) => u.pntr === 1 || u.name.trim().length > 0);
}

const removeLine = (index: number) => lines.value.splice(index, 1);

// Fiyat seçili birim başınadır: Adet → Koli geçişinde adet fiyatı kalırsa evrak 1/katsayı tutarla yazılırdı.
const changeUnit = (line: EditorLine, pntr: number) => {
  const factorOf = (p: number) => line.units.find((u) => u.pntr === p)?.factor ?? 1;
  line.unitPrice = priceForUnit(line.unitPrice, factorOf(line.unitPntr), factorOf(pntr));
  if (line.maxUnitPrice !== null) line.maxUnitPrice = priceForUnit(line.maxUnitPrice, factorOf(line.unitPntr), factorOf(pntr));
  line.unitPntr = pntr;
};

// Toplu birim (Birim sütun başlığından): SAYI KORUNUR — 120 adet → 120 koli (tek satırdaki değişimle aynı); fiyat katsayıyla çevrilir.
// Seçilen birimi tanımlı olmayan satır değişmez ve altta bildirilir.
const bulkUnitNote = ref("");
const applyBulkUnit = (name: string) => {
  const wanted = name.toLocaleLowerCase("tr");
  const noUnit: string[] = [];
  for (const line of lines.value) {
    const unit = line.units.find((u) => u.name.toLocaleLowerCase("tr") === wanted);
    if (!unit) { noUnit.push(line.productCode); continue; }
    if (unit.pntr !== line.unitPntr) changeUnit(line, unit.pntr);
  }
  bulkUnitNote.value = noUnit.length ? `${noUnit.length} satırda ${name} birimi tanımlı değil, değişmedi (${noUnit.join(", ")}).` : "";
};

// İskonto kutusu: 0 ise tıklayınca içi boşalır (0'ı silmekle uğraşılmaz); boş bırakılıp çıkılırsa 0'a döner.
const clearIfZero = (e: FocusEvent) => {
  const input = e.target as HTMLInputElement;
  if (Number(input.value) === 0) input.value = "";
};
const restoreZero = (line: EditorLine, key: "discount1" | "discount2" | "discount3" | "discount4", e: FocusEvent) => {
  const input = e.target as HTMLInputElement;
  if (input.value.trim() === "") { line[key] = 0; input.value = "0"; }
};

// Toplu iskonto: dolu bırakılan İsk kutuları tüm satırlara yazılır, boş bırakılanlara dokunulmaz (0 yazmak iskontoyu sıfırlar).
const bulkDiscountOpen = ref(false);
const bulkDiscountInputs = ref(["", "", "", ""]);
const bulkDiscountError = ref("");
const applyBulkDiscount = () => {
  const values = bulkDiscountInputs.value.map((raw) => (raw.trim() === "" ? null : parseDecimal(raw)));
  if (values.every((v) => v === null)) { bulkDiscountError.value = "En az bir iskonto girin."; return; }
  if (values.some((v, i) => bulkDiscountInputs.value[i]!.trim() !== "" && (v === null || v < 0 || v >= 100))) {
    bulkDiscountError.value = "İskontolar %0–99 arasında olmalı."; return;
  }
  for (const line of lines.value) {
    if (values[0] != null) line.discount1 = values[0]!;
    if (values[1] != null) line.discount2 = values[1]!;
    if (values[2] != null) line.discount3 = values[2]!;
    if (values[3] != null) line.discount4 = values[3]!;
  }
  bulkDiscountInputs.value = ["", "", "", ""];
  bulkDiscountError.value = "";
  bulkDiscountOpen.value = false;
};

function defaultDepot() {
  // Legacy formu yalnız üç depoyu açıyor (1 Depo, 3 Mağaza, 83 Plaza); 1 varsayılan.
  return props.lookups?.depots.find((d) => d.no === 1)?.no ?? props.lookups?.depots[0]?.no ?? 1;
}

// ── Toplamlar — legacy kaskadı (~/utils/money) ───────────────────────────────────────
const discountsOf = (line: EditorLine) =>
  [line.discount1, line.discount2, line.discount3, line.discount4, ...line.otherDiscounts];
const lineNet = (line: EditorLine) => applyDiscountChain(line.quantity * line.unitPrice, discountsOf(line));
// İskontolu (net) birim fiyat: KDV hariç ve dahil. Bu kutulara yazılınca İsk 2 geri hesaplanır (satış siparişiyle aynı);
// İsk 1/3/4 sabit kalır, birim fiyatın üstüne çıkılamaz (İsk 2 en az 0).
const netUnitPrice = (line: EditorLine) => applyDiscountChain(line.unitPrice, discountsOf(line));
const netUnitPriceWithTax = (line: EditorLine) => (netUnitPrice(line) * (100 + line.taxPercent)) / 100;
const formatUnitPrice = (value: number) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
const applyNetPrice = (line: EditorLine, input: HTMLInputElement, includesTax: boolean) => {
  const typed = parseDecimal(input.value);
  if (typed !== null && typed >= 0) {
    const target = includesTax ? (typed * 100) / (100 + line.taxPercent) : typed;
    const withoutDiscount2 = applyDiscountChain(line.unitPrice, [line.discount1, line.discount3, line.discount4, ...line.otherDiscounts]);
    line.discount2 = reverseDiscountPercent(withoutDiscount2, target) ?? 0;
  }
  nextTick(() => { input.value = formatUnitPrice(includesTax ? netUnitPriceWithTax(line) : netUnitPrice(line)); });
};
// ÖNEMLİ KURAL: birim fiyat satın alma şartındaki birim fiyatın üstüne çıkamaz; altına inebilir (FEATURES.md).
const overMaxPrice = (line: EditorLine) => line.maxUnitPrice !== null && line.unitPrice > line.maxUnitPrice + 0.00001;
const clampUnitPrice = (line: EditorLine) => {
  if (!overMaxPrice(line)) return;
  errorText.value = `${line.productCode}: birim fiyat satın alma şartındaki fiyatın (${formatMoney(line.maxUnitPrice)}) üstüne çıkamaz.`;
  line.unitPrice = line.maxUnitPrice!;
};
const lineTax = (line: EditorLine) => (lineNet(line) * line.taxPercent) / 100;

const totals = computed(() => {
  const summary = summarize(lines.value.map((l) => ({
    quantity: l.quantity, unitPrice: l.unitPrice, discounts: discountsOf(l), taxRatePercent: l.taxPercent,
  })));
  return { gross: summary.gross, discount: summary.discount, tax: summary.taxTotal, net: summary.total };
});

// ── Yükleme (düzenleme) ───────────────────────────────────────────────────────────────
watch(() => props.detail, async (detail) => {
  if (!detail?.header) return;
  const header = detail.header;
  series.value = header.orderSeries ?? "A";
  supplierCode.value = header.supplierCode ?? "";
  supplierTitle.value = header.supplierTitle ?? "";
  addressNo.value = header.addressNo ?? null;
  projectCode.value = header.projectCode ?? NONE;
  deliveryDate.value = header.deliveryDate?.slice(0, 10) ?? addDays(3);
  note1.value = header.note1 ?? "";
  headerDepot.value = detail.lines[0]?.depotNo ?? defaultDepot();

  lines.value = detail.lines.map((line) => {
    // İsk 4–6 da okunur: yalnız 1–3 okunup gönderilince kaydetme evraktaki 4+ kademeleri siliyordu.
    const percents = discountPercentsOf(line);
    return {
      id: line.id,
      productCode: line.productCode ?? "",
      productName: line.productName ?? line.productCode ?? "",
      unitPntr: line.unitPntr ?? 1,
      units: unitsOf(line),
      quantity: line.quantity ?? 0,
      unitPrice: line.unitPrice ?? 0,
      discount1: percents[0] ?? 0,
      discount2: percents[1] ?? 0,
      discount3: percents[2] ?? 0,
      discount4: percents[3] ?? 0,
      otherDiscounts: percents.slice(4),
      taxPercent: line.taxPercent ?? 0,
      depotNo: line.depotNo ?? defaultDepot(),
      deliveryDate: line.deliveryDate?.slice(0, 10) ?? deliveryDate.value,
      note1: line.note1 ?? "",
      lastPurchasePrice: null,
      listPrice: line.listPrice ?? null,
      fromCondition: false,
      maxUnitPrice: null,
    };
  });
  // Kayıtlı evrakta da şart fiyatı üst sınırı geçerli: şartı yeniden çekip birim bazında uygula.
  for (const line of lines.value) {
    purchaseApi.productDefaults(line.productCode, { supplierCode: supplierCode.value || undefined, depotNo: line.depotNo })
      .then((info) => {
        if (info.conditionUnitPrice === null) return;
        const factorOf = (p: number) => line.units.find((u) => u.pntr === p)?.factor ?? 1;
        line.maxUnitPrice = priceForUnit(info.conditionUnitPrice, 1, factorOf(line.unitPntr));
        line.fromCondition = true;
      })
      .catch(() => undefined);
  }
  if (supplierCode.value) await loadAddresses(supplierCode.value);
}, { immediate: true });

// ── Kaydet ────────────────────────────────────────────────────────────────────────────
const submit = () => {
  errorText.value = "";
  if (!supplierCode.value) { errorText.value = "Cari geçersiz."; return; }
  if (!addressNo.value) { errorText.value = "Adres geçersiz."; return; }
  if (!series.value.trim()) { errorText.value = "Evrak serisi seçilmedi."; return; }
  if (lines.value.length === 0) { errorText.value = "En az bir satır ekleyin."; return; }
  // v-model.number boşaltılan hücrede "" bırakır; Number.isFinite onu da yakalar (satış formuyla aynı).
  if (lines.value.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0)) { errorText.value = "Miktar tam sayı ve sıfırdan büyük olmalı."; return; }
  const over = lines.value.find(overMaxPrice);
  if (over) { errorText.value = `${over.productCode}: birim fiyat satın alma şartındaki fiyatın üstüne çıkamaz.`; return; }
  if (lines.value.some((l) => !Number.isFinite(l.unitPrice) || l.unitPrice < 0)) { errorText.value = "Birim fiyat boş ya da negatif olamaz."; return; }
  if (lines.value.some((l) => discountsOf(l).some((v) => !Number.isFinite(v) || v < 0 || v >= 100))) { errorText.value = "İskontolar %0–99 arasında olmalı."; return; }
  if ([deliveryDate.value, ...lines.value.map((l) => l.deliveryDate)].some((d) => d && d < localIsoDate())) {
    errorText.value = "Teslim tarihi, sipariş tarihinden önce olamaz.";
    return;
  }

  emit("submit", {
    orderSeries: series.value.trim(),
    orderNumber: props.detail?.header?.orderNumber ?? null,
    supplierCode: supplierCode.value,
    addressNo: addressNo.value,
    paymentPlanNo: props.detail?.header?.paymentPlanNo ?? 0,
    representativeCode: props.detail?.header?.representativeCode ?? null,
    projectCode: projectCode.value === NONE ? null : projectCode.value,
    costCenterCode: props.detail?.header?.costCenterCode ?? null,
    deliveryDate: deliveryDate.value || null,
    notes: [note1.value, ""],
    lines: lines.value.map((line) => ({
      id: line.id,
      productCode: line.productCode,
      unitPntr: line.unitPntr,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercents: discountsOf(line),
      depotNo: line.depotNo,
      deliveryDate: line.deliveryDate || null,
      note1: line.note1 || null,
      note2: null,
    })),
    version: props.detail?.lines[0]?.version ?? null,
  });
};

defineExpose({ submit });
</script>

<template>
  <div class="space-y-4">
    <Alert v-if="errorText" variant="destructive">{{ errorText }}</Alert>

    <Card>
      <CardContent class="grid gap-4 p-4 md:grid-cols-3">
        <div class="space-y-1.5 md:col-span-2">
          <Label for="po-supplier">Cari</Label>
          <div v-if="supplierCode" class="flex items-center gap-2">
            <span class="font-mono text-[13px]">{{ supplierCode }}</span>
            <span class="truncate text-[13px] text-ink-muted">{{ supplierTitle }}</span>
            <span class="shrink-0 text-[12px] text-ink-muted">{{ supplierInfo.location || "—" }}</span>
            <span class="shrink-0 font-mono text-[12px]">Bakiye: {{ supplierInfo.balance == null ? "—" : formatMoney(supplierInfo.balance) }}</span>
            <Button v-if="!isEdit" variant="ghost" size="sm" @click="supplierCode = ''; addresses = []; supplierInfo = { location: '', balance: null }">
              <X class="size-4" />
            </Button>
          </div>
          <div v-else class="relative">
            <Input
              id="po-supplier"
              v-model="supplierSearch"
              placeholder="Cari kodu veya unvan (en az 2 karakter)…"
              @update:model-value="searchSuppliers()"
            />
            <div
              v-if="supplierResults.length"
              class="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-line bg-surface shadow"
            >
              <button
                v-for="item in supplierResults"
                :key="item.code"
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-surface-2"
                @click="pickSupplier(item.code, item.title)"
              >
                <span class="font-mono">{{ item.code }}</span>
                <span class="truncate text-ink-muted">{{ item.title }}</span>
                <span class="ml-auto shrink-0 text-[12px] text-ink-muted">{{ [item.province, item.district].filter(Boolean).join(" / ") || "—" }}</span>
                <span class="w-28 shrink-0 text-right font-mono text-[12px]">{{ item.balance == null ? "—" : formatMoney(item.balance) }}</span>
              </button>
            </div>
            <p v-if="supplierSearching" class="mt-1 text-[12px] text-ink-muted">Aranıyor…</p>
          </div>
        </div>




        <div class="space-y-1.5">
          <Label for="po-address">Adres</Label>
          <Select v-model="addressNo">
            <SelectTrigger id="po-address"><SelectValue placeholder="Adres seçin" /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="a in addresses" :key="a.addressNo ?? 0" :value="a.addressNo ?? 0">
                {{ addressLabel(a) }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>


        <div class="space-y-1.5">
          <Label for="po-depot">Depo</Label>
          <Select :model-value="headerDepot" @update:model-value="(v) => setHeaderDepot(Number(v))">
            <SelectTrigger id="po-depot"><SelectValue placeholder="Depo seçin" /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="d in lookups?.depots ?? []" :key="d.no" :value="d.no">{{ d.name }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-1.5">
          <Label for="po-delivery">Teslim Tarihi</Label>
          <Input id="po-delivery" :model-value="deliveryDate" type="date" @update:model-value="setHeaderDelivery" />
        </div>


        <div class="space-y-1.5">
          <Label for="po-project">Proje</Label>
          <Select v-model="projectCode">
            <SelectTrigger id="po-project"><SelectValue placeholder="Proje" /></SelectTrigger>
            <SelectContent>
              <SelectItem :value="NONE">— Yok —</SelectItem>
              <SelectItem v-for="p in activeProjects" :key="p.code" :value="p.code">
                {{ p.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>


        <div class="space-y-1.5 md:col-span-2">
          <Label for="po-note1">Açıklama</Label>
          <Input id="po-note1" v-model="note1" />
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardContent class="space-y-3 p-4">
        <div class="flex flex-wrap items-end justify-between gap-4">
        <div class="relative w-full max-w-xl flex-1">
          <Label for="po-product">Satır Ekle</Label>
          <div class="mt-1.5 flex items-center gap-2">
            <Search class="size-4 text-ink-muted" />
            <Input
              id="po-product"
              v-model="productSearch"
              placeholder="Stok kodu veya adı yazıp Enter…"
              @keydown.enter.prevent="openPicker"
            />
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <label class="flex cursor-pointer items-center gap-2 text-[13px]" :class="supplierCode ? '' : 'cursor-not-allowed opacity-50'">
            <Checkbox v-model="onlySupplierProducts" :disabled="!supplierCode" aria-label="Yalnız bu tedarikçinin ürünleri" />
            Yalnız bu tedarikçinin ürünleri
          </label>
          <!-- Yalnız buton: indirme API/backend tarafında yapılacak (prototipte işlevi yok). -->
          <Button variant="secondary" size="sm" :disabled="!lines.length">Excel indir</Button>
          <Button variant="secondary" size="sm" :disabled="!supplierCode" :title="supplierCode ? '' : 'Önce tedarikçi seçin'" @click="openPaste">Excel'den yapıştır</Button>
          <Button variant="secondary" size="sm" :disabled="!supplierCode" :title="supplierCode ? '' : 'Önce tedarikçi seçin'" @click="openStockList">Stok listesi</Button>
          <Popover v-model:open="bulkDiscountOpen">
            <PopoverTrigger as-child>
              <Button variant="secondary" size="sm" :disabled="!lines.length">Toplu iskonto</Button>
            </PopoverTrigger>
            <PopoverContent align="end" class="w-[320px] space-y-3 p-4">
              <div class="text-[13px] font-medium">Toplu İskonto — tüm satırlar</div>
              <p class="text-[12px] text-ink-muted">Dolu bıraktığınız iskonto tüm satırlara yazılır, boş bıraktığınıza dokunulmaz. 0 yazarsanız o iskonto sıfırlanır.</p>
              <div class="grid grid-cols-2 gap-2">
                <div v-for="n in 4" :key="n" class="space-y-1">
                  <Label :for="`bulk-disc-${n}`" class="text-[12px]">İsk {{ n }} %</Label>
                  <Input :id="`bulk-disc-${n}`" v-model="bulkDiscountInputs[n - 1]" type="text" inputmode="decimal" class="h-8 text-right font-mono" placeholder="—" @keydown.enter.prevent="applyBulkDiscount" />
                </div>
              </div>
              <p v-if="bulkDiscountError" class="text-[12px] text-red-700">{{ bulkDiscountError }}</p>
              <div class="flex justify-end gap-2">
                <Button variant="secondary" size="sm" @click="bulkDiscountOpen = false">Vazgeç</Button>
                <Button size="sm" @click="applyBulkDiscount">Tüm satırlara uygula</Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="secondary" size="sm" :disabled="!lines.length" @click="clearAllLines">
            <Trash2 class="mr-1.5 size-4" /> Tümünü temizle
          </Button>
        </div>
        <Popover v-if="lines.length">
          <PopoverTrigger as-child>
            <button type="button" title="Satır dökümü için tıklayın" class="flex items-stretch divide-x divide-line overflow-hidden rounded border border-line bg-surface-2 text-center hover:bg-surface">
              <span class="flex items-center px-3 text-[11px] font-medium uppercase leading-tight tracking-wider text-ink-muted">Miktar<br>Özeti</span>
              <span class="min-w-[84px] px-3 py-1.5"><span class="block text-[11px] uppercase tracking-wider text-ink-muted">Adet</span><span class="block font-mono text-[17px] font-semibold tabular-nums">{{ formatQuantity(packTotals.base) }}</span></span>
              <span class="min-w-[84px] px-3 py-1.5"><span class="block text-[11px] uppercase tracking-wider text-ink-muted">Koli</span><span class="block font-mono text-[17px] font-semibold tabular-nums">{{ formatQuantity(packTotals.cases) }}</span></span>
              <span class="min-w-[84px] px-3 py-1.5"><span class="block text-[11px] uppercase tracking-wider text-ink-muted">Palet</span><span class="block font-mono text-[17px] font-semibold tabular-nums">{{ formatQuantity(packTotals.pallets) }}</span></span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" class="w-[380px] p-0">
            <div class="border-b border-line px-4 py-3 text-[13px] font-medium">Miktar Özeti — satırlar</div>
            <ul class="max-h-72 divide-y divide-line/60 overflow-y-auto text-[12px]">
              <li v-for="(row, index) in packRows" :key="index" class="px-4 py-2">
                <div class="truncate" :title="row.name">{{ row.name }}</div>
                <div class="font-mono tabular-nums text-ink-muted">{{ formatQuantity(row.base) }} adet · {{ row.cases === null ? "—" : formatQuantity(row.cases) }} koli · {{ row.pallets === null ? "—" : formatQuantity(row.pallets) }} palet</div>
              </li>
            </ul>
          </PopoverContent>
        </Popover>
        </div>

        <p v-if="bulkUnitNote" class="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{{ bulkUnitNote }}</p>

        <div class="min-w-0 overflow-x-auto">
          <table class="w-full min-w-[1650px] text-[13px]" @keydown.capture="onGridKeydown">
            <thead class="border-b border-line text-left text-[12px] text-ink-muted">
              <tr>
                <th class="py-2 pr-4">Stok</th>
                <th class="py-2 pr-4">
                  <div class="flex items-center gap-1.5">
                    Birim
                    <Select model-value="" @update:model-value="(v) => applyBulkUnit(String(v))">
                      <SelectTrigger class="h-6 w-[76px] px-1.5 text-[11px]" aria-label="Tüm satırların birimini değiştir" title="Tüm satırların birimini değiştir (temel miktar korunur)"><SelectValue placeholder="Tümü" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Adet">Adet</SelectItem>
                        <SelectItem value="Koli">Koli</SelectItem>
                        <SelectItem value="Palet">Palet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </th>
                <th class="py-2 pr-4 text-right">Miktar</th>
                <th class="py-2 pr-4 text-right">Birim Fiyat</th>
                <th class="py-2 pr-4 text-right">İsk 1 %</th>
                <th class="py-2 pr-4 text-right">İsk 2 %</th>
                <th class="py-2 pr-4 text-right">İsk 3 %</th>
                <th class="py-2 pr-4 text-right">İsk 4 %</th>
                <th class="py-2 pr-4 text-right">Net Birim Fiyat<div class="text-[10px] font-normal normal-case">KDV hariç / dahil</div></th>
                <th class="py-2 pr-4 text-right">KDV %</th>
                <th class="py-2 pr-4 text-right">Son Alış</th>
                <th class="py-2 pr-4">Depo / Teslim Tarihi</th>
                <th class="py-2 pr-4 text-right">Net</th>
                <th class="py-2" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, index) in lines" :key="`${line.productCode}-${index}`" class="border-b border-line/60">
                <td class="py-2 pr-4">
                  <div class="font-mono text-[12px]">{{ line.productCode }}</div>
                  <div class="truncate text-[12px] text-ink-muted">{{ line.productName }}</div>
                  <Badge v-if="line.fromCondition" variant="secondary" class="mt-1">Alış şartı</Badge>
                </td>
                <td class="py-2 pr-4">
                  <Select :model-value="line.unitPntr" @update:model-value="changeUnit(line, Number($event))">
                    <SelectTrigger class="h-8 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="u in line.units" :key="u.pntr" :value="u.pntr">{{ u.name }}</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td class="py-2 pr-4 text-right">
                  <Input
                    v-model.number="line.quantity" type="number" min="1" step="1" inputmode="numeric"
                    class="h-8 w-24 text-right font-mono" :class="caseBreak(line) ? 'border-amber-500' : ''"
                    @keydown="onQuantityKeydown" @change="normalizeQuantity(line, $event.target as HTMLInputElement)"
                  />
                  <p v-if="caseBreak(line)" class="mt-0.5 w-24 text-right text-[11px] leading-tight text-amber-700">Koli bozuluyor (koli içi {{ caseBreak(line) }})</p>
                </td>
                <td class="py-2 pr-4 text-right">
                  <Input
                    v-model.number="line.unitPrice" type="number" step="0.001" min="0" class="h-8 w-28 text-right font-mono"
                    @change="clampUnitPrice(line)"
                  />
                  <p v-if="line.maxUnitPrice !== null" class="mt-0.5 w-28 text-right text-[11px] leading-tight text-ink-muted">Şart üst sınırı: {{ formatMoney(line.maxUnitPrice) }}</p>
                </td>
                <td class="py-2 pr-4 text-right">
                  <Input
                    v-model.number="line.discount1" type="number" step="0.01" min="0" class="h-8 w-20 text-right font-mono"
                    @focus="clearIfZero" @blur="restoreZero(line, 'discount1', $event)"
                  />
                </td>
                <td class="py-2 pr-4 text-right">
                  <Input
                    v-model.number="line.discount2" type="number" step="0.01" min="0" class="h-8 w-20 text-right font-mono"
                    @focus="clearIfZero" @blur="restoreZero(line, 'discount2', $event)"
                  />
                </td>
                <td class="py-2 pr-4 text-right">
                  <Input
                    v-model.number="line.discount3" type="number" step="0.01" min="0" class="h-8 w-20 text-right font-mono"
                    @focus="clearIfZero" @blur="restoreZero(line, 'discount3', $event)"
                  />
                </td>
                <td class="py-2 pr-4 text-right">
                  <Input
                    v-model.number="line.discount4" type="number" step="0.01" min="0" class="h-8 w-20 text-right font-mono"
                    @focus="clearIfZero" @blur="restoreZero(line, 'discount4', $event)"
                  />
                </td>
                <td class="py-2 pr-4 text-right">
                  <Input
                    type="text" inputmode="decimal" class="mb-1 h-7 w-28 text-right font-mono" aria-label="KDV hariç net birim fiyat"
                    :model-value="formatUnitPrice(netUnitPrice(line))" @change="applyNetPrice(line, $event.target as HTMLInputElement, false)"
                  />
                  <Input
                    type="text" inputmode="decimal" class="h-7 w-28 text-right font-mono text-ink-muted" aria-label="KDV dahil net birim fiyat"
                    :model-value="formatUnitPrice(netUnitPriceWithTax(line))" @change="applyNetPrice(line, $event.target as HTMLInputElement, true)"
                  />
                </td>
                <td class="py-2 pr-4 text-right font-mono tabular-nums text-ink-muted">%{{ line.taxPercent }}</td>
                <td class="py-2 pr-4 text-right font-mono tabular-nums text-ink-muted">
                  {{ line.lastPurchasePrice === null ? "—" : formatMoney(line.lastPurchasePrice) }}
                </td>
                <td class="py-2 pr-4">
                  <Select v-model="line.depotNo">
                    <SelectTrigger class="mb-1 h-7 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="d in lookups?.depots ?? []" :key="d.no" :value="d.no">{{ d.name }}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input v-model="line.deliveryDate" type="date" class="h-7 w-36" aria-label="Teslim tarihi" />
                </td>
                <td class="py-2 pr-4 text-right font-mono tabular-nums">
                  {{ formatMoney(lineNet(line) + lineTax(line)) }}
                </td>
                <td class="whitespace-nowrap py-2 text-right">
                  <Button variant="ghost" size="sm" title="Alış faturaları ve satış hareketleri" aria-label="Stok geçmişi" @click="openHistory(line)">
                    <History class="size-4" />
                  </Button>
                  <Button variant="ghost" size="sm" @click="removeLine(index)">
                    <Trash2 class="size-4" />
                  </Button>
                </td>
              </tr>
              <tr v-if="lines.length === 0">
                <td colspan="14" class="py-6 text-center text-ink-400">Satır yok — yukarıdan stok arayıp ekleyin.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex flex-wrap justify-end gap-6 border-t border-line pt-3 text-[13px]">
          <div><span class="text-ink-muted">Brüt:</span> <span class="font-mono tabular-nums">{{ formatMoney(totals.gross) }}</span></div>
          <div><span class="text-ink-muted">İskonto:</span> <span class="font-mono tabular-nums">{{ formatMoney(totals.discount) }}</span></div>
          <div><span class="text-ink-muted">KDV:</span> <span class="font-mono tabular-nums">{{ formatMoney(totals.tax) }}</span></div>
          <div class="font-medium"><span class="text-ink-muted">Genel Toplam:</span> <span class="font-mono tabular-nums">{{ formatMoney(totals.net) }}</span></div>
        </div>
      </CardContent>
    </Card>

    <Dialog v-model:open="pickerOpen">
      <DialogContent class="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Stok Seç</DialogTitle>
          <DialogDescription>"{{ productSearch.trim() }}" aramasına uyan stoklar — siparişe eklenecekleri işaretleyin.</DialogDescription>
        </DialogHeader>
        <div class="max-h-[60vh] overflow-auto rounded border border-line">
          <p v-if="pickerLoading" class="p-6 text-center text-[13px] text-ink-muted">Yükleniyor…</p>
          <table v-else class="w-full text-[13px]">
            <thead class="sticky top-0 bg-surface-2">
              <tr class="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
                <th class="w-10 py-2 pl-3"><Checkbox :model-value="pickerAllSelected" aria-label="Tümünü seç" @update:model-value="togglePickerAll" /></th>
                <th class="py-2 pr-2">Stok Kodu</th>
                <th class="py-2 pr-2">Barkod</th>
                <th class="py-2 pr-2">Stok Adı</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in pickerItems" :key="item.code" class="cursor-pointer border-b border-line hover:bg-surface-2" @click="togglePicker(item.code, !pickerSelected.includes(item.code))">
                <td class="py-1.5 pl-3" @click.stop>
                  <Checkbox :model-value="pickerSelected.includes(item.code)" :aria-label="`${item.code} seç`" @update:model-value="(c) => togglePicker(item.code, c)" />
                </td>
                <td class="py-1.5 pr-2 font-mono text-[12px]">{{ item.code }}</td>
                <td class="py-1.5 pr-2 font-mono text-[12px] text-ink-muted">{{ item.masterBarcode || "—" }}</td>
                <td class="py-1.5 pr-2">{{ item.name }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <DialogFooter class="items-center sm:justify-between">
          <span class="text-[13px] text-ink-muted">{{ pickerSelected.length }} stok seçildi</span>
          <div class="flex gap-2">
            <Button variant="secondary" @click="pickerOpen = false">Vazgeç</Button>
            <Button :disabled="!pickerSelected.length || pickerAdding" @click="addPicked">{{ pickerAdding ? "Ekleniyor…" : "Seçilenleri Ekle" }}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog v-model:open="historyOpen">
      <DialogContent class="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Stok Geçmişi</DialogTitle>
          <DialogDescription>{{ historyTitle }} — KDV hariç.</DialogDescription>
        </DialogHeader>
        <Tabs v-model="historyTab">
          <TabsList class="mb-3">
            <TabsTrigger value="purchase">Alış Faturaları</TabsTrigger>
            <TabsTrigger value="sales">Satış Hareketleri</TabsTrigger>
          </TabsList>
          <TabsContent value="purchase">
        <div class="max-h-[60vh] overflow-auto rounded border border-line">
          <p v-if="historyLoading" class="p-6 text-center text-[13px] text-ink-muted">Yükleniyor…</p>
          <p v-else-if="!historyItems.length" class="p-6 text-center text-[13px] text-ink-muted">Son 5 yılda alış faturası yok.</p>
          <table v-else class="w-full text-[13px]">
            <thead class="sticky top-0 bg-surface-2">
              <tr class="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
                <th class="py-2 pl-3 pr-2">Tarih</th>
                <th class="py-2 pr-2">Fatura No</th>
                <th class="py-2 pr-2">Tedarikçi</th>
                <th class="py-2 pr-2 text-right">Miktar</th>
                <th class="py-2 pr-2 text-right">Birim Fiyat</th>
                <th class="py-2 pr-2 text-right">İsk 1 %</th>
                <th class="py-2 pr-2 text-right">İsk 2 %</th>
                <th class="py-2 pr-2 text-right">İsk 3 %</th>
                <th class="py-2 pr-2 text-right">İsk 4 %</th>
                <th class="py-2 pr-2 text-right">Net Birim</th>
                <th class="py-2 pr-3 text-right">Tutar</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in historyItems" :key="item.invoiceNo" class="border-b border-line">
                <td class="py-1.5 pl-3 pr-2 font-mono text-[12px]">{{ item.invoiceDate.split("-").reverse().join(".") }}</td>
                <td class="py-1.5 pr-2 font-mono text-[12px]">{{ item.invoiceNo }}</td>
                <td class="py-1.5 pr-2">{{ item.supplierTitle }}</td>
                <td class="py-1.5 pr-2 text-right font-mono tabular-nums">{{ item.quantity }}</td>
                <td class="py-1.5 pr-2 text-right font-mono tabular-nums">{{ formatMoney(item.unitPrice) }}</td>
                <td v-for="n in 4" :key="n" class="py-1.5 pr-2 text-right font-mono tabular-nums text-ink-muted">{{ item.discountPercents[n - 1] || "—" }}</td>
                <td class="py-1.5 pr-2 text-right font-mono tabular-nums">{{ formatMoney(item.netUnitPrice) }}</td>
                <td class="py-1.5 pr-3 text-right font-mono tabular-nums font-medium">{{ formatMoney(item.lineTotal) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
          </TabsContent>
          <TabsContent value="sales" class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex gap-1">
                <Button v-for="m in [3, 6, 12]" :key="m" size="sm" :variant="salesMonths === m ? 'default' : 'secondary'" @click="salesMonths = m">Son {{ m }} ay</Button>
              </div>
              <div class="flex gap-6 text-[13px]">
                <div><span class="text-ink-muted">Toplam satış:</span> <span class="font-mono tabular-nums">{{ salesView.total }}</span></div>
                <div><span class="text-ink-muted">Aylık ortalama:</span> <span class="font-mono tabular-nums">{{ salesView.monthly.toFixed(1).replace(".", ",") }}</span></div>
                <div><span class="text-ink-muted">Mevcut stok:</span> <span class="font-mono tabular-nums">{{ salesView.onHand }}</span></div>
                <div><span class="text-ink-muted">Satılabilir:</span> <span class="font-mono tabular-nums">{{ salesView.sellable }}</span></div>
              </div>
            </div>
            <div class="max-h-[50vh] overflow-auto rounded border border-line">
              <p v-if="!salesView.loaded" class="p-6 text-center text-[13px] text-ink-muted">Yükleniyor…</p>
              <p v-else-if="!salesView.items.length" class="p-6 text-center text-[13px] text-ink-muted">Seçilen dönemde satış yok.</p>
              <table v-else class="w-full text-[13px]">
                <thead class="sticky top-0 bg-surface-2">
                  <tr class="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
                    <th class="py-2 pl-3 pr-3">Tarih</th>
                    <th class="py-2 pr-3">Fatura No</th>
                    <th class="py-2 pr-3">Müşteri</th>
                    <th class="py-2 pr-3">Depo</th>
                    <th class="py-2 pr-3 text-right">Miktar</th>
                    <th class="py-2 pr-3 text-right">Birim Fiyat</th>
                    <th class="py-2 pr-3 text-right">İsk 1 %</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="m in salesView.items" :key="m.documentNo" class="border-b border-line">
                    <td class="py-1.5 pl-3 pr-3 font-mono text-[12px]">{{ m.date.split("-").reverse().join(".") }}</td>
                    <td class="py-1.5 pr-3 font-mono text-[12px]">{{ m.documentNo }}</td>
                    <td class="py-1.5 pr-3">{{ m.customerTitle }}</td>
                    <td class="py-1.5 pr-3">{{ m.depotName }}</td>
                    <td class="py-1.5 pr-3 text-right font-mono tabular-nums">{{ m.quantity }}</td>
                    <td class="py-1.5 pr-3 text-right font-mono tabular-nums">{{ formatMoney(m.unitPrice) }}</td>
                    <td class="py-1.5 pr-3 text-right font-mono tabular-nums text-ink-muted">{{ m.discountPercents[0] || "—" }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="secondary" @click="historyOpen = false">Kapat</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog v-model:open="stockListOpen">
      <DialogContent class="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Stok Listesi — {{ supplierTitle }}</DialogTitle>
          <DialogDescription>Tedarikçinin aktif stokları, satış miktarlarına göre. Siparişe eklenecekleri işaretleyin.</DialogDescription>
        </DialogHeader>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <Search class="size-4 text-ink-muted" />
            <Input v-model="stockListSearch" class="w-72" placeholder="Listede ara: kod, ad, barkod…" />
          </div>
          <div class="flex gap-1">
            <Button v-for="m in [3, 6, 12]" :key="m" size="sm" :variant="stockListMonths === m ? 'default' : 'secondary'" @click="stockListMonths = m">Son {{ m }} ay satış</Button>
          </div>
          <div class="flex items-center gap-1">
            <span class="mr-1 text-[12px] text-ink-muted">Birim:</span>
            <Button v-for="u in (['Adet', 'Koli', 'Palet'] as const)" :key="u" size="sm" :variant="stockListUnit === u ? 'default' : 'secondary'" @click="stockListUnit = u">{{ u }}</Button>
          </div>
        </div>
        <div class="max-h-[55vh] overflow-auto rounded border border-line">
          <p v-if="stockListLoading" class="p-6 text-center text-[13px] text-ink-muted">Yükleniyor…</p>
          <p v-else-if="!stockListRows.length" class="p-6 text-center text-[13px] text-ink-muted">Bu tedarikçinin aktif stoğu yok.</p>
          <table v-else class="w-full text-[13px]">
            <thead class="sticky top-0 bg-surface-2">
              <tr class="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
                <th class="w-10 py-2 pl-3"><Checkbox :model-value="stockListAllSelected" aria-label="Tümünü seç" @update:model-value="toggleStockListAll" /></th>
                <th class="py-2 pr-4">Stok Kodu</th>
                <th class="py-2 pr-4">Stok Adı</th>
                <th class="py-2 pr-4 text-center">Tip</th>
                <th class="py-2 pr-4">Birim</th>
                <th class="py-2 pr-4 text-right">Mevcut Stok</th>
                <th class="py-2 pr-4 text-right">Satılabilir</th>
                <th class="py-2 pr-4 text-right">Son {{ stockListMonths }} Ay Satış</th>
                <th class="py-2 pr-4 text-right">Aylık Ort.</th>
                <th class="py-2 pr-4 text-right">Stok Yeterliliği</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in stockListRows" :key="row.item.code" class="border-b border-line"
                :class="row.inOrder ? 'opacity-50' : 'cursor-pointer hover:bg-surface-2'"
                @click="!row.inOrder && toggleStockList(row.item.code, !stockListSelected.includes(row.item.code))"
              >
                <td class="py-1.5 pl-3" @click.stop>
                  <Checkbox :model-value="row.inOrder || stockListSelected.includes(row.item.code)" :disabled="row.inOrder" :aria-label="`${row.item.code} seç`" @update:model-value="(c) => toggleStockList(row.item.code, c)" />
                </td>
                <td class="py-1.5 pr-4 font-mono text-[12px]">{{ row.item.code }}</td>
                <td class="py-1.5 pr-4">{{ row.item.name }}<span v-if="row.inOrder" class="ml-2 text-[11px] text-ink-muted">(siparişte)</span></td>
                <td class="py-1.5 pr-4 text-center font-mono text-[12px]">{{ row.item.stockType ?? "—" }}</td>
                <td class="py-1.5 pr-4 text-[12px]">{{ stockUnitOf(row.item).name }}</td>
                <td class="py-1.5 pr-4 text-right font-mono tabular-nums">{{ uq(row.item, row.item.stockQuantity ?? row.item.sellableQuantity ?? 0) }}</td>
                <td class="py-1.5 pr-4 text-right font-mono tabular-nums">
                  <Popover :open="stockHoverCode === row.item.code">
                    <PopoverTrigger as-child>
                      <span
                        class="cursor-help underline decoration-dotted underline-offset-4"
                        @mouseenter="stockHoverCode = row.item.code" @mouseleave="stockHoverCode = null"
                      >{{ uq(row.item, sellableOf(row.item)) }}</span>
                    </PopoverTrigger>
                    <PopoverContent side="left" align="center" class="w-60 p-3 text-[12px]" @open-auto-focus.prevent>
                      <div class="mb-2 truncate font-medium" :title="row.item.name ?? ''">{{ row.item.code }} · {{ stockUnitOf(row.item).name }}</div>
                      <dl class="space-y-1">
                        <p v-if="!row.item.depotBalances?.length" class="text-ink-muted">Depo dökümü yok</p>
                        <div v-for="d in row.item.depotBalances ?? []" :key="d.depotNo" class="flex justify-between">
                          <dt class="text-ink-muted">{{ d.depotName }}</dt><dd class="font-mono tabular-nums">{{ uq(row.item, d.quantity) }}</dd>
                        </div>
                        <div class="flex justify-between border-t border-line pt-1">
                          <dt class="text-ink-muted">Rezerve stok</dt><dd class="font-mono tabular-nums">{{ uq(row.item, row.item.customerOrderQuantity ?? 0) }}</dd>
                        </div>
                        <div class="flex justify-between">
                          <dt class="text-ink-muted">Tedarik siparişi</dt><dd class="font-mono tabular-nums">{{ uq(row.item, row.item.incomingOrderQuantity ?? 0) }}</dd>
                        </div>
                      </dl>
                    </PopoverContent>
                  </Popover>
                </td>
                <td class="py-1.5 pr-4 text-right font-mono tabular-nums font-medium">{{ uq(row.item, row.sold) }}</td>
                <td class="py-1.5 pr-4 text-right font-mono tabular-nums text-ink-muted">{{ uq(row.item, row.sold / stockListMonths) }}</td>
                <td class="py-1.5 pr-4 text-right font-mono tabular-nums text-ink-muted">
                  {{ row.sold > 0 ? `${formatQuantity(Math.round(((row.item.stockQuantity ?? row.item.sellableQuantity ?? 0) / (row.sold / stockListMonths)) * 10) / 10)} ay` : "—" }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <DialogFooter class="items-center sm:justify-between">
          <span class="text-[13px] text-ink-muted">{{ stockListSelected.length }} stok seçildi · {{ stockListRows.length }} aktif stok</span>
          <div class="flex gap-2">
            <Button variant="secondary" @click="stockListOpen = false">Kapat</Button>
            <Button :disabled="!stockListSelected.length || stockListAdding" @click="addFromStockList">{{ stockListAdding ? "Ekleniyor…" : "Seçilenleri Ekle" }}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog v-model:open="pasteOpen">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Excel'den Yapıştır</DialogTitle>
          <DialogDescription>
            Sütunlar sırasıyla: <strong>Stok Kodu / Barkod / Multi Kod · Miktar · Birim · Birim Fiyat · İsk 1 · İsk 2 · İsk 3 · İsk 4</strong>.
            İlk satır başlıksa sütunlar başlık adından eşlenir (sıra serbest). Boş bıraktığınız hücre için stoğun satın alma şartındaki değer kalır; miktar boşsa 1.
            Hatalı satırlar eklenmez, uyarı verilir.
          </DialogDescription>
        </DialogHeader>
        <Textarea v-model="pasteText" rows="8" class="font-mono text-[12px]" placeholder="Stok Kodu&#9;Miktar&#9;Birim&#9;Birim Fiyat&#9;İsk 1&#9;İsk 2&#9;İsk 3&#9;İsk 4&#10;573251&#9;24&#9;Koli&#9;60,50&#9;5&#9;2&#9;0&#9;0" />
        <div v-if="pasteAdded || pasteIssues.length" class="space-y-2 text-[13px]">
          <p v-if="pasteAdded" class="text-emerald-700">{{ pasteAdded }} stok siparişe eklendi.</p>
          <ul v-if="pasteIssues.length" class="max-h-48 space-y-1 overflow-auto rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
            <li v-for="(issue, i) in pasteIssues" :key="i">
              <span class="font-mono">{{ issue.code }}</span> — {{ issue.text }}
            </li>
          </ul>
        </div>
        <DialogFooter>
          <Button variant="secondary" @click="pasteOpen = false">Kapat</Button>
          <Button :disabled="!pasteText.trim() || pasteBusy" @click="importPasted">{{ pasteBusy ? "Kontrol ediliyor…" : "Kontrol et ve ekle" }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
