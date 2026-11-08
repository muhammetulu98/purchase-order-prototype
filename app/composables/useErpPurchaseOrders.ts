// Kesit 4 · ekran 17 — Satın Alma Siparişleri Yönetimi → /api/erp/purchase-orders.
// Okuma vw_ErpPurchaseOrder(Line)'dan. Satır güncelleme xmin version'lı: 409'da satır
// tazelenir, kullanıcının girdileri korunur (şablon §5). Silme = kapatma dönüşümü:
// sunucu miktar+tutarları sıfırlar, nedeni 900 yazar — satır yok olmaz, kapalılara düşer.
import { errorMessage, errorStatus } from "../utils/apiEnvelope";

// ── Tipler ────────────────────────────────────────────────────────────────────────────

export interface ErpPurchaseOrder {
  orderSeries: string | null;
  orderNumber: number | null;
  orderDate: string | null;
  deliveryDate: string | null;
  supplierCode: string | null;
  supplierTitle: string | null;
  representativeName: string | null;
  salespersonName: string | null;
  grossTotal: number | null;
  discountTotal: number | null;
  netTotal: number | null;
  projectCode: string | null;
  openLineCount: number;
  closedLineCount: number;
  note1: string | null;
  note2: string | null;
  note9: string | null;
  // Kesit 15 · ekran 06 — evrak formunun düzenlediği başlık alanları.
  addressNo: number | null;
  addressTitle: string | null;
  paymentPlanNo: number | null;
  paymentPlanName: string | null;
  representativeCode: string | null;
  costCenterCode: string | null;
  documentNo: string | null;
}

export interface ErpPurchaseOrderLine {
  id: string;
  lineGuid: string;
  orderSeries: string | null;
  orderNumber: number | null;
  lineNo: number | null;
  productCode: string | null;
  productName: string | null;
  unitPntr: number | null;
  unitName: string | null;
  quantity: number | null;
  deliveredQuantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
  discount1: number | null;
  discount2: number | null;
  discount3: number | null;
  discount4: number | null;
  discount5: number | null;
  discount6: number | null;
  taxPntr: number | null;
  taxPercent: number;
  taxAmount: number | null;
  deliveryDate: string | null;
  note1: string | null;
  note2: string | null;
  projectCode: string | null;
  priceListNo: number | null;
  open: boolean;
  closeReasonCode: string | null;
  closeReasonName: string | null;
  listPrice: number | null;
  hasActiveInsert: boolean;
  createdByName: string | null;
  mainGroupName: string | null;
  productManagerName: string | null;
  discontinued: boolean;
  createdAt: string | null;
  version: string;
  // Kesit 15 · ekran 06 — depo ve birim tablosu (birim değişince fiyat katsayıyla çevrilir).
  depotNo: number | null;
  depotName: string | null;
  unitName1: string | null;
  unitName2: string | null;
  unitName3: string | null;
  unitName4: string | null;
  unitCoefficient2: number | null;
  unitCoefficient3: number | null;
  unitCoefficient4: number | null;
}

export interface ErpCloseReason {
  code: string;
  name: string | null;
}

/** Kesit 15 · ekran 06 — evrak formunun kaydettiği yük. */
export interface ErpPurchaseOrderSavePayload {
  orderSeries: string;
  orderNumber: number | null;
  supplierCode: string;
  addressNo: number;
  paymentPlanNo: number;
  representativeCode: string | null;
  projectCode: string | null;
  costCenterCode: string | null;
  deliveryDate: string | null;
  notes: (string | null)[] | null;
  lines: ErpPurchaseOrderLineInput[];
  version: string | null;
  /** Yeni evrakta tekrar gönderim anahtarı; yalnız başarıdan sonra yenilenir. */
  requestId?: string;
}

export interface ErpPurchaseOrderLineInput {
  id: string | null;
  productCode: string;
  unitPntr: number;
  quantity: number;
  unitPrice: number;
  discountPercents: number[] | null;
  depotNo: number;
  deliveryDate: string | null;
  note1: string | null;
  note2: string | null;
}

export interface ErpPurchaseOrderSaved {
  orderSeries: string;
  orderNumber: number;
}

/** Ürün seçilince formun doldurduğu alanlar (satın alma şartı + son alış + liste fiyatı). */
export interface ErpPurchaseOrderProductDefaults {
  productCode: string;
  productName: string | null;
  unitPntr: number;
  unitName1: string | null;
  unitName2: string | null;
  unitName3: string | null;
  unitName4: string | null;
  unitCoefficient2: number | null;
  unitCoefficient3: number | null;
  unitCoefficient4: number | null;
  taxPntr: number;
  taxPercent: number;
  conditionUnitPrice: number | null;
  conditionDiscountPercents: number[];
  lastPurchasePrice: number | null;
  listPrice: number | null;
}

/** Stoğun geçmiş alış faturası satırı (son 5 yıl). */
export interface ErpPurchaseInvoiceHistoryItem {
  invoiceDate: string;
  invoiceNo: string;
  supplierCode: string;
  supplierTitle: string;
  quantity: number;
  unitPrice: number;
  discountPercents: number[];
  /** İskontolar düşülmüş, KDV hariç birim fiyat. */
  netUnitPrice: number;
  /** KDV hariç satır tutarı. */
  lineTotal: number;
}

/** Stoğun faturalanmış satış hareketi (tüm müşteriler, KDV hariç). */
export interface ErpStockSalesMovement {
  date: string;
  documentNo: string;
  customerTitle: string;
  quantity: number;
  unitPrice: number;
  discountPercents: number[];
  depotName: string;
}

export interface ErpStockSalesHistory {
  onHandQuantity: number;
  sellableQuantity: number;
  /** Son 12 ay, yeniden eskiye. */
  items: ErpStockSalesMovement[];
}

export interface ErpPurchaseOrderPage {
  items: ErpPurchaseOrder[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface ErpPurchaseOrderLinePayload {
  quantity: number;
  unitPrice: number;
  discountPercents: number[] | null;
  deliveryDate: string | null;
  note1: string | null;
  note2: string | null;
  version: string;
}

/** Onaylı silme nedeni — "ERP'DE SİLİNDİ". İş kararı kapatmalarından (001–018) ayrışır. */
export const DELETED_REASON_CODE = "900";

export class ErpPurchaseOrderActionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ErpPurchaseOrderActionError";
  }
}

// ── Hata yardımcıları ────────────────────────────────────────────────────────────────

// ── İstemci ──────────────────────────────────────────────────────────────────────────

export const useErpPurchaseOrders = () => {
  const api = useApi();
  const base = "/api/erp/purchase-orders";

  const list = (query: { search?: string; page?: number; pageSize?: number } = {}) =>
    api.request<ErpPurchaseOrderPage>(base, {
      query: Object.fromEntries(
        Object.entries(query).filter(([, value]) => value !== undefined && value !== ""),
      ),
    });

  const get = (series: string, number: number, includeClosed = false) =>
    api.request<{ header: ErpPurchaseOrder | null; lines: ErpPurchaseOrderLine[] }>(
      `${base}/${encodeURIComponent(series)}/${number}`,
      includeClosed ? { query: { includeClosed: "true" } } : {},
    );

  const closeReasons = () => api.request<ErpCloseReason[]>(`${base}/close-reasons`);

  const act = async <T = boolean>(
    path: string,
    options: { method: "POST" | "PUT"; body: Record<string, unknown> },
    fallback: string,
  ): Promise<T> => {
    try {
      return await api.request<T>(`${base}/${path}`, { ...options, silentError: true });
    } catch (err) {
      throw new ErpPurchaseOrderActionError(errorMessage(err, fallback), errorStatus(err));
    }
  };

  const updateLine = (id: string, payload: ErpPurchaseOrderLinePayload) =>
    act(`lines/${id}`, { method: "PUT", body: { ...payload } }, "Satır güncellenemedi.");

  const closeLines = (ids: string[], reasonCode: string) =>
    act("lines/close", { method: "POST", body: { ids, reasonCode } }, "Satırlar kapatılamadı.");

  const deleteLines = (ids: string[]) =>
    act("lines/delete", { method: "POST", body: { ids } }, "Satırlar silinemedi.");

  const copyRemainder = (id: string, version: string) =>
    act<string>(`lines/${id}/copy-remainder?version=${encodeURIComponent(version)}`,
      { method: "POST", body: {} }, "Kalan kopyalanamadı.");

  const updateNotes = (series: string, number: number, notes: (string | null)[]) =>
    act(`${encodeURIComponent(series)}/${number}/notes`,
      { method: "PUT", body: { notes } }, "Açıklamalar kaydedilemedi.");

  const save = (payload: ErpPurchaseOrderSavePayload) =>
    act<ErpPurchaseOrderSaved>("", { method: "POST", body: { ...payload } }, "Sipariş kaydedilemedi.");

  const productDefaults = (
    productCode: string,
    query: { supplierCode?: string; depotNo?: number; projectCode?: string } = {},
  ) =>
    api.request<ErpPurchaseOrderProductDefaults>(
      `${base}/product-defaults/${encodeURIComponent(productCode)}`,
      {
        query: Object.fromEntries(
          Object.entries(query).filter(([, value]) => value !== undefined && value !== ""),
        ),
      },
    );

  const invoiceHistory = (productCode: string) =>
    api.request<ErpPurchaseInvoiceHistoryItem[]>(`${base}/invoice-history/${encodeURIComponent(productCode)}`);

  const salesHistory = (productCode: string) =>
    api.request<ErpStockSalesHistory>(`${base}/sales-history/${encodeURIComponent(productCode)}`);

  return {
    list, get, closeReasons, updateLine, closeLines, deleteLines, copyRemainder, updateNotes,
    save, productDefaults, invoiceHistory, salesHistory,
  };
};
