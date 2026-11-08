<script setup lang="ts">
// Kesit 15 · ekran 06 — yeni satın alma sipariş evrakı. Legacy'nin "taslak / onaya gönder"
// ikilisi YOK: satın alma siparişini kaydeden kişi legacy'de zaten onaylayan sayılıyor
// (sip_cagrilabilir_fl = 1, sip_OnaylayanKulNo = kaydeden), sunucu bunu birebir yazıyor.
import { Save } from "lucide-vue-next";
import type { ErpPurchaseOrder, ErpPurchaseOrderLine, ErpPurchaseOrderSavePayload } from "~/composables/useErpPurchaseOrders";
import type { ErpSalesOrderLookups } from "~/composables/useErpSalesOrders";

definePageMeta({
  pageTitle: "Yeni Satın Alma Siparişi",
  erpPermission: "ERP.PurchaseOrder.Create",
});

const notifier = useNotifier();
const route = useRoute();
const ordersApi = useErpPurchaseOrders();
const salesApi = useErpSalesOrders();

const lookups = ref<ErpSalesOrderLookups | null>(null);
const saving = ref(false);
const formRef = ref<{ submit: () => void } | null>(null);
// Sayfa keep-alive'da kalır: başarıdan sonra form yeniden kurulur (formKey) ki sonraki "Yeni"
// eski evrakı tekrar göndermesin. requestId kaybolan yanıttan sonraki tekrar tıklamayı korur.
const formKey = ref(0);

// Düzenleme modu: listeden gelinen `?series=…&number=…` ile mevcut sipariş yüklenir; form düzenleme modunda açılır.
// Çoğaltma modu: `?copySeries=…&copyNumber=…` ile sipariş yüklenir ama YENİ sipariş olarak açılır (numara, teslim alma
// bilgisi ve satır kimlikleri temizlenir; teslim tarihi bugünden varsayılana döner).
// Sayfa keep-alive'da kalır: sorgu değişince (ya da yeni siparişe dönülünce) yeniden yüklenir/sıfırlanır.
const detail = ref<{ header: ErpPurchaseOrder | null; lines: ErpPurchaseOrderLine[] } | null>(null);
const loadingEdit = ref(false);
const editError = ref("");
const queryText = (key: string) => (typeof route.query[key] === "string" ? (route.query[key] as string) : "");
const editSeries = computed(() => queryText("series"));
const editNumber = computed(() => Number(route.query.number) || 0);
const copySeries = computed(() => queryText("copySeries"));
const copyNumber = computed(() => Number(route.query.copyNumber) || 0);
const isEditing = computed(() => Boolean(editSeries.value && editNumber.value));
const isCopying = computed(() => !isEditing.value && Boolean(copySeries.value && copyNumber.value));
const sourceLabel = computed(() => (isEditing.value ? `${editSeries.value}-${editNumber.value}` : `${copySeries.value}-${copyNumber.value}`));
watch([editSeries, editNumber, copySeries, copyNumber], async () => {
  detail.value = null;
  editError.value = "";
  formKey.value++;
  if (!isEditing.value && !isCopying.value) return;
  loadingEdit.value = true;
  try {
    const result = await ordersApi.get(isEditing.value ? editSeries.value : copySeries.value, isEditing.value ? editNumber.value : copyNumber.value, true);
    if (!result.header) throw new Error("not found");
    detail.value = isEditing.value ? result : {
      header: { ...result.header, orderNumber: null, orderDate: null, deliveryDate: null, documentNo: null },
      lines: result.lines.map((line) => ({
        ...line, id: null as unknown as string, lineGuid: "", deliveredQuantity: 0, open: true,
        deliveryDate: null, version: null as unknown as string,
      })),
    };
  } catch {
    editError.value = `${sourceLabel.value} numaralı sipariş yüklenemedi.`;
  } finally {
    loadingEdit.value = false;
  }
}, { immediate: true });
let requestId = crypto.randomUUID();

onMounted(async () => {
  try {
    lookups.value = await salesApi.lookups();
  } catch {
    lookups.value = null;
  }
});

const submit = async (payload: ErpPurchaseOrderSavePayload) => {
  saving.value = true;
  try {
    const saved = await ordersApi.save({ ...payload, requestId });
    requestId = crypto.randomUUID();
    formKey.value++;
    if (isCopying.value) {
      notifier.success(`Sipariş oluşturuldu (${sourceLabel.value} kopyası): ${saved.orderSeries}-${saved.orderNumber}`);
      await navigateTo("/purchasing/orders");
      return;
    }
    if (isEditing.value) {
      notifier.success(`Sipariş güncellendi: ${saved.orderSeries}-${saved.orderNumber}`);
      // PROTOTİP: mock kayıt saklamaz; listeye dönülür.
      await navigateTo("/purchasing/orders");
      return;
    }
    notifier.success(`Sipariş kaydedildi: ${saved.orderSeries}-${saved.orderNumber}`);
    // PROTOTİP: evrak detay sayfası yok; form sıfırlanır, kayıt bildirimi yeterli.
  } catch (err) {
    notifier.error(err instanceof Error ? err.message : "Sipariş kaydedilemedi.");
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <div>
    <PageHeader
      :title="isEditing ? 'Satın Alma Siparişini Düzenle' : isCopying ? 'Siparişi Çoğalt' : 'Yeni Satın Alma Siparişi'"
      description="Fiyat ve iskontolar açık satın alma şartından önerilir; kullanıcı ezebilir."
    >
      <template #actions>
        <Button variant="secondary" as-child>
          <NuxtLink to="/purchasing/orders">Siparişlere dön</NuxtLink>
        </Button>
        <Button :disabled="saving" @click="formRef?.submit()">
          <Save class="mr-2 size-4" />
          {{ saving ? "Kaydediliyor…" : "Kaydet" }}
        </Button>
      </template>
    </PageHeader>

    <div v-if="isEditing" class="mb-4 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900" role="status">
      <strong>Sipariş düzenleniyor:</strong> <span class="font-mono">{{ editSeries }}-{{ editNumber }}</span>
      — değişiklikler kaydedilince mevcut sipariş güncellenir, yeni sipariş oluşmaz.
    </div>
    <div v-if="isCopying" class="mb-4 rounded border border-sky-300 bg-sky-50 px-4 py-3 text-[13px] text-sky-900" role="status">
      <strong>Sipariş çoğaltılıyor:</strong> <span class="font-mono">{{ sourceLabel }}</span>
      — tedarikçi ve satırlar kopyalandı; kaydedince <strong>yeni bir sipariş</strong> oluşur, kaynak sipariş değişmez.
    </div>
    <p v-if="editError" class="mb-4 text-[13px] text-red-700">{{ editError }}</p>
    <p v-if="loadingEdit" class="p-6 text-center text-[13px] text-ink-muted">Sipariş yükleniyor…</p>
    <ErpPurchaseOrderDocumentForm v-else-if="(!isEditing && !isCopying) || detail" :key="formKey" ref="formRef" :detail="detail" :copy="isCopying" :lookups="lookups" :saving="saving" @submit="submit" />
  </div>
</template>
