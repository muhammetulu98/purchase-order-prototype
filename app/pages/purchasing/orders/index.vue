<script setup lang="ts">
// Satın alma siparişleri listesi: "Bekliyor" (hiç teslim alınmamış), "Kısmi Teslim Alınan" ve "Teslim Alınan" sekmeleri.
// Sağ üstteki buton yeni sipariş ekranına götürür.
import { ChevronDown, ChevronRight, Copy, Pencil, Plus, Search } from "lucide-vue-next";
import type { ErpPurchaseOrder, ErpPurchaseOrderLine } from "~/composables/useErpPurchaseOrders";
import { formatDate } from "~/utils/dates";
import { formatMoney, formatQuantity } from "~/utils/money";
import { discountPercentsOf } from "~/composables/useErpSalesOrders";
import { buttonVariants } from "@/components/ui/button";

definePageMeta({
  pageTitle: "Satın Alma Siparişleri",
  erpPermission: "ERP.PurchaseOrder.Read",
});

type OrderStatus = "pending" | "partial" | "received";
const TABS: { value: OrderStatus; label: string; empty: string }[] = [
  { value: "pending", label: "Bekliyor", empty: "Bekleyen sipariş yok." },
  { value: "partial", label: "Kısmi Teslim Alınan", empty: "Kısmi teslim alınan sipariş yok." },
  { value: "received", label: "Teslim Alınan", empty: "Teslim alınan sipariş yok." },
];

// Sütunlar: Evrak · Tarih · Teslim · Tedarikçi · Temsilci · Ham Tutar · İskonto · Net Tutar · Satır (Açık/Kapalı) · Açıklama
const COLUMNS = [
  { label: "Evrak", align: "" }, { label: "Tarih", align: "" }, { label: "Teslim", align: "" }, { label: "Tedarikçi", align: "" },
  { label: "Temsilci", align: "" }, { label: "Ham Tutar", align: "text-right" }, { label: "İskonto", align: "text-right" },
  { label: "Net Tutar", align: "text-right" }, { label: "Satır (Açık/Kapalı)", align: "text-center" }, { label: "Açıklama", align: "" },
];

const ordersApi = useErpPurchaseOrders();
const salesApi = useErpSalesOrders();
const depots = ref<{ no: number; name: string }[]>([]);
const depotName = (no: number | null | undefined) => depots.value.find((d) => d.no === no)?.name ?? (no == null ? "—" : String(no));
const orders = ref<ErpPurchaseOrder[]>([]);
const loading = ref(true);
const loadError = ref("");
const search = ref("");
// Filtreler: sipariş tarihi aralığı (yyyy-mm-dd, boş = sınırsız) ve tedarikçi (yazılan metin kod ya da unvanda geçmeli; boşsa süzme yok).
const tab = ref<OrderStatus>("pending");
const dateFrom = ref("");
const dateTo = ref("");
const supplierText = ref("");
const ALL = "ALL";
const depotFilter = ref(ALL); // depo no (metin) ya da ALL
const repFilter = ref(ALL); // temsilci adı ya da ALL
// Temsilci sayısı az olduğundan listeden seçilir; seçenekler yüklenen siparişlerdeki temsilcilerdir.
const repOptions = computed(() => [...new Set(orders.value.map((o) => o.salespersonName).filter((n): n is string => Boolean(n)))].sort((a, b) => a.localeCompare(b, "tr")));
const filtersActive = computed(() => Boolean(search.value.trim() || dateFrom.value || dateTo.value || supplierText.value.trim() || depotFilter.value !== ALL || repFilter.value !== ALL));
const clearFilters = () => { search.value = ""; dateFrom.value = ""; dateTo.value = ""; supplierText.value = ""; depotFilter.value = ALL; repFilter.value = ALL; };

onMounted(async () => {
  salesApi.lookups().then((l) => { depots.value = l.depots; }).catch(() => undefined);
  try {
    orders.value = (await ordersApi.list({ page: 1, pageSize: 200 })).items;
  } catch {
    loadError.value = "Siparişler yüklenemedi.";
  } finally {
    loading.value = false;
  }
});

// Accordion: satıra tıklayınca altında sipariş detayı (satırlar) açılır; aynı anda tek sipariş açık kalır. Satırlar ilk açılışta çekilir, sonra saklanır.
// Tutarların yanında TL simgesi.
const SYMBOLS: Record<string, string> = { TRY: "₺", USD: "$", EUR: "€" };
const moneyOf = (o: { currencyCode?: string | null }, value: number | null | undefined) => (value == null ? "—" : `${formatMoney(value)} ${SYMBOLS[o.currencyCode ?? "TRY"] ?? o.currencyCode}`);
const isForeign = (o: { currencyCode?: string | null }) => Boolean(o.currencyCode && o.currencyCode !== "TRY");
const orderKey = (o: ErpPurchaseOrder) => `${o.orderSeries}-${o.orderNumber}`;
const expandedKey = ref<string | null>(null);
const detailLines = ref<Record<string, ErpPurchaseOrderLine[]>>({});
const detailLoading = ref(false);
const detailError = ref("");
const toggleOrder = async (o: ErpPurchaseOrder) => {
  const key = orderKey(o);
  if (expandedKey.value === key) { expandedKey.value = null; return; }
  expandedKey.value = key;
  detailError.value = "";
  if (detailLines.value[key] || o.orderSeries == null || o.orderNumber == null) return;
  detailLoading.value = true;
  try {
    detailLines.value[key] = (await ordersApi.get(o.orderSeries, o.orderNumber, true)).lines;
  } catch {
    detailError.value = "Sipariş detayı yüklenemedi.";
  } finally {
    detailLoading.value = false;
  }
};
// lineTotal iskonto öncesi brüttür; discountN iskonto tutarlarıdır → KDV hariç net tutar.
const lineNetOf = (l: ErpPurchaseOrderLine) =>
  (l.lineTotal ?? 0) - [l.discount1, l.discount2, l.discount3, l.discount4, l.discount5, l.discount6].reduce<number>((sum, d) => sum + (d ?? 0), 0);
const remainingOf = (l: ErpPurchaseOrderLine) => Math.max(0, (l.quantity ?? 0) - l.deliveredQuantity);

// Durum miktardan çıkar (teslim 0 → Bekliyor, tamamı → Teslim Alınan, arası → Kısmi); miktar yoksa satır sayılarından.
const statusOf = (o: ErpPurchaseOrder): OrderStatus => {
  if (o.orderedQuantity != null && o.deliveredQuantity != null) {
    if (o.deliveredQuantity <= 0) return "pending";
    return o.deliveredQuantity >= o.orderedQuantity ? "received" : "partial";
  }
  if (o.openLineCount === 0) return "received";
  return o.closedLineCount === 0 ? "pending" : "partial";
};
const percentOf = (o: ErpPurchaseOrder) =>
  o.orderedQuantity ? Math.round(((o.deliveredQuantity ?? 0) / o.orderedQuantity) * 100) : 0;

const matchesFilters = (o: ErpPurchaseOrder) => {
  const term = search.value.trim().toLocaleLowerCase("tr");
  const day = o.orderDate?.slice(0, 10) ?? "";
  const supplierTerm = supplierText.value.trim().toLocaleLowerCase("tr");
  return (!term || [`${o.orderSeries}-${o.orderNumber}`, o.supplierTitle, o.supplierCode].some((v) => v?.toLocaleLowerCase("tr").includes(term)))
    && (!dateFrom.value || day >= dateFrom.value)
    && (!dateTo.value || day <= dateTo.value)
    && (!supplierTerm || [o.supplierTitle, o.supplierCode].some((v) => v?.toLocaleLowerCase("tr").includes(supplierTerm)))
    && (depotFilter.value === ALL || Boolean(o.depotNos?.includes(Number(depotFilter.value))))
    && (repFilter.value === ALL || o.salespersonName === repFilter.value);
};
const rows = (status: OrderStatus) => orders.value.filter((o) => statusOf(o) === status && matchesFilters(o));
// Sekme sayıları da filtrelere göre değişir.
const countOf = (status: OrderStatus) => rows(status).length;
</script>

<template>
  <div>
    <PageHeader title="Satın Alma Siparişleri" description="Bekleyen, kısmi teslim alınan ve teslim alınan siparişler.">
      <template #actions>
        <NuxtLink to="/purchasing/orders/new" :class="[buttonVariants(), 'shrink-0 flex-nowrap px-5']">
          <Plus class="size-4" />
          Yeni Satın Alma Siparişi
        </NuxtLink>
      </template>
    </PageHeader>

    <div class="mb-4 flex flex-wrap items-end gap-3">
      <div class="space-y-1">
        <Label for="f-search" class="text-[12px]">Ara</Label>
        <div class="flex items-center gap-2">
          <Search class="size-4 text-ink-muted" />
          <Input id="f-search" v-model="search" class="w-64" placeholder="Evrak no, tedarikçi…" />
        </div>
      </div>
      <div class="space-y-1">
        <Label for="f-from" class="text-[12px]">Tarih (başlangıç)</Label>
        <Input id="f-from" v-model="dateFrom" type="date" class="w-40" :max="dateTo || undefined" />
      </div>
      <div class="space-y-1">
        <Label for="f-to" class="text-[12px]">Tarih (bitiş)</Label>
        <Input id="f-to" v-model="dateTo" type="date" class="w-40" :min="dateFrom || undefined" />
      </div>
      <div class="space-y-1">
        <Label for="f-supplier" class="text-[12px]">Tedarikçi</Label>
        <Input id="f-supplier" v-model="supplierText" class="w-72" placeholder="Tedarikçi unvanı veya kodu yazın…" />
      </div>
      <div class="space-y-1">
        <Label for="f-depot" class="text-[12px]">Depo</Label>
        <Select v-model="depotFilter">
          <SelectTrigger id="f-depot" class="w-48"><SelectValue placeholder="Tüm depolar" /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL">Tüm depolar</SelectItem>
            <SelectItem v-for="d in depots" :key="d.no" :value="String(d.no)">{{ d.name }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="space-y-1">
        <Label for="f-rep" class="text-[12px]">Temsilci</Label>
        <Select v-model="repFilter">
          <SelectTrigger id="f-rep" class="w-48"><SelectValue placeholder="Tüm temsilciler" /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL">Tüm temsilciler</SelectItem>
            <SelectItem v-for="name in repOptions" :key="name" :value="name">{{ name }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button v-if="filtersActive" variant="secondary" @click="clearFilters">Filtreleri temizle</Button>
    </div>

    <p v-if="loadError" class="mb-3 text-[13px] text-red-700">{{ loadError }}</p>

    <Tabs v-model="tab">
      <TabsList class="mb-3">
        <TabsTrigger v-for="t in TABS" :key="t.value" :value="t.value">{{ t.label }} ({{ countOf(t.value) }})</TabsTrigger>
      </TabsList>

      <TabsContent v-for="t in TABS" :key="t.value" :value="t.value">
        <Card>
          <CardContent class="p-0">
            <p v-if="loading" class="p-6 text-center text-[13px] text-ink-muted">Yükleniyor…</p>
            <p v-else-if="!rows(t.value).length" class="p-6 text-center text-[13px] text-ink-muted">
              {{ filtersActive ? "Filtrelere uyan sipariş yok." : t.empty }}
            </p>
            <Table v-else>
              <TableHeader>
                <TableRow class="bg-surface-2">
                  <TableHead class="w-8" />
                  <TableHead v-for="h in COLUMNS" :key="h.label" :class="['text-[11px] uppercase tracking-wide', h.align]">{{ h.label }}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <template v-for="o in rows(t.value)" :key="orderKey(o)">
                  <TableRow class="cursor-pointer" :class="expandedKey === orderKey(o) ? 'bg-surface-2' : ''" :aria-expanded="expandedKey === orderKey(o)" @click="toggleOrder(o)">
                    <TableCell class="w-8 pr-0 text-ink-muted">
                      <component :is="expandedKey === orderKey(o) ? ChevronDown : ChevronRight" class="size-4" />
                    </TableCell>
                    <TableCell class="whitespace-nowrap font-mono text-[13px]">{{ o.orderSeries }}-{{ o.orderNumber }}</TableCell>
                    <TableCell class="whitespace-nowrap font-mono text-[13px]">{{ formatDate(o.orderDate) }}</TableCell>
                    <TableCell class="whitespace-nowrap font-mono text-[13px]">{{ formatDate(o.deliveryDate) }}</TableCell>
                    <TableCell>
                      <div class="font-mono text-[13px]">{{ o.supplierCode }}</div>
                      <div class="text-[12px] uppercase text-ink-muted">{{ o.supplierTitle }}</div>
                    </TableCell>
                    <TableCell class="whitespace-nowrap text-[13px] uppercase">{{ o.salespersonName ?? "—" }}</TableCell>
                    <TableCell class="text-right font-mono tabular-nums">{{ moneyOf(o, o.grossTotal) }}</TableCell>
                    <TableCell class="text-right font-mono tabular-nums">{{ moneyOf(o, o.discountTotal) }}</TableCell>
                    <TableCell class="text-right font-mono font-semibold tabular-nums">{{ moneyOf(o, o.netTotal) }}
                      <div v-if="isForeign(o)" class="text-[11px] font-normal text-ink-muted">kur {{ o.exchangeRate }} · ≈ {{ formatMoney((o.netTotal ?? 0) * (o.exchangeRate ?? 1)) }} ₺</div></TableCell>
                    <TableCell class="whitespace-nowrap text-center font-mono tabular-nums">
                      {{ o.openLineCount }}<span v-if="o.closedLineCount" class="text-ink-muted"> / {{ o.closedLineCount }}</span>
                    </TableCell>
                    <TableCell class="text-[13px]">{{ o.note1 || "—" }}</TableCell>
                  </TableRow>
                  <TableRow v-if="expandedKey === orderKey(o)" class="bg-surface-2 hover:bg-surface-2">
                    <TableCell :colspan="COLUMNS.length + 1" class="px-6 py-4">
                      <p v-if="detailLoading && !detailLines[orderKey(o)]" class="text-[13px] text-ink-muted">Yükleniyor…</p>
                      <p v-else-if="detailError" class="text-[13px] text-red-700">{{ detailError }}</p>
                      <div v-else>
                        <div class="mb-3 flex justify-end gap-2">
                          <NuxtLink :to="{ path: '/purchasing/orders/new', query: { copySeries: o.orderSeries, copyNumber: o.orderNumber } }" :class="[buttonVariants({ variant: 'secondary', size: 'sm' }), 'shrink-0']">
                            <Copy class="size-3.5" />
                            Siparişi çoğalt
                          </NuxtLink>
                          <NuxtLink :to="{ path: '/purchasing/orders/new', query: { series: o.orderSeries, number: o.orderNumber } }" :class="[buttonVariants({ variant: 'secondary', size: 'sm' }), 'shrink-0']">
                            <Pencil class="size-3.5" />
                            Siparişi düzenle
                          </NuxtLink>
                        </div>
                      <div class="overflow-x-auto rounded border border-line bg-surface">
                        <table class="w-full min-w-[1250px] text-[13px]">
                          <thead>
                            <tr class="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
                              <th class="py-2 pl-3 pr-4">#</th>
                              <th class="py-2 pr-4">Stok Kodu</th>
                              <th class="py-2 pr-4">Stok Adı</th>
                              <th class="py-2 pr-4">Birim</th>
                              <th class="py-2 pr-4">Depo</th>
                              <th class="py-2 pr-4 text-right">Sipariş</th>
                              <th class="py-2 pr-4 text-right">Teslim Alınan</th>
                              <th class="py-2 pr-4 text-right">Kalan</th>
                              <th class="py-2 pr-4 text-right">Birim Fiyat</th>
                              <th class="py-2 pr-4 text-right">İsk 1 / 2 / 3 / 4 %</th>
                              <th class="py-2 pr-4 text-right">KDV %</th>
                              <th class="py-2 pr-4 text-right">Tutar (KDV hariç)</th>
                              <th class="py-2 pr-4">Teslim Tarihi</th>
                              <th class="py-2 pr-3">Durum</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="l in detailLines[orderKey(o)] ?? []" :key="l.id" class="border-b border-line last:border-0">
                              <td class="py-1.5 pl-3 pr-4 font-mono text-[12px] text-ink-muted">{{ l.lineNo }}</td>
                              <td class="py-1.5 pr-4 font-mono text-[12px]">{{ l.productCode }}</td>
                              <td class="py-1.5 pr-4">{{ l.productName }}</td>
                              <td class="py-1.5 pr-4">{{ l.unitName }}</td>
                              <td class="py-1.5 pr-4 whitespace-nowrap">{{ depotName(l.depotNo) }}</td>
                              <td class="py-1.5 pr-4 text-right font-mono tabular-nums">{{ formatQuantity(l.quantity) }}</td>
                              <td class="py-1.5 pr-4 text-right font-mono tabular-nums">{{ formatQuantity(l.deliveredQuantity) }}</td>
                              <td class="py-1.5 pr-4 text-right font-mono tabular-nums" :class="remainingOf(l) ? 'font-semibold' : 'text-ink-muted'">{{ formatQuantity(remainingOf(l)) }}</td>
                              <td class="py-1.5 pr-4 text-right font-mono tabular-nums">{{ moneyOf(o, l.unitPrice) }}</td>
                              <td class="py-1.5 pr-4 text-right font-mono tabular-nums text-ink-muted">{{ discountPercentsOf(l).slice(0, 4).join(" / ") }}</td>
                              <td class="py-1.5 pr-4 text-right font-mono tabular-nums">%{{ l.taxPercent }}</td>
                              <td class="py-1.5 pr-4 text-right font-mono tabular-nums">{{ moneyOf(o, lineNetOf(l)) }}</td>
                              <td class="py-1.5 pr-4 whitespace-nowrap font-mono text-[12px]">{{ formatDate(l.deliveryDate) }}</td>
                              <td class="py-1.5 pr-3 text-[12px]">{{ l.open ? (l.deliveredQuantity > 0 ? "Kısmi" : "Açık") : "Teslim alındı" }}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      </div>
                    </TableCell>
                  </TableRow>
                </template>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  </div>
</template>
