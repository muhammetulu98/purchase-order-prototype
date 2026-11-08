<script setup lang="ts">
// Kesit 15 · ekran 06 — yeni satın alma sipariş evrakı. Legacy'nin "taslak / onaya gönder"
// ikilisi YOK: satın alma siparişini kaydeden kişi legacy'de zaten onaylayan sayılıyor
// (sip_cagrilabilir_fl = 1, sip_OnaylayanKulNo = kaydeden), sunucu bunu birebir yazıyor.
import { Save } from "lucide-vue-next";
import type { ErpPurchaseOrderSavePayload } from "~/composables/useErpPurchaseOrders";
import type { ErpSalesOrderLookups } from "~/composables/useErpSalesOrders";

definePageMeta({
  pageTitle: "Yeni Satın Alma Siparişi",
  erpPermission: "ERP.PurchaseOrder.Create",
});

const notifier = useNotifier();
const ordersApi = useErpPurchaseOrders();
const salesApi = useErpSalesOrders();

const lookups = ref<ErpSalesOrderLookups | null>(null);
const saving = ref(false);
const formRef = ref<{ submit: () => void } | null>(null);
// Sayfa keep-alive'da kalır: başarıdan sonra form yeniden kurulur (formKey) ki sonraki "Yeni"
// eski evrakı tekrar göndermesin. requestId kaybolan yanıttan sonraki tekrar tıklamayı korur.
const formKey = ref(0);
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
      title="Yeni Satın Alma Siparişi"
      description="Fiyat ve iskontolar açık satın alma şartından önerilir; kullanıcı ezebilir."
    >
      <template #actions>
        <Button :disabled="saving" @click="formRef?.submit()">
          <Save class="mr-2 size-4" />
          {{ saving ? "Kaydediliyor…" : "Kaydet" }}
        </Button>
      </template>
    </PageHeader>

    <ErpPurchaseOrderDocumentForm :key="formKey" ref="formRef" :lookups="lookups" :saving="saving" @submit="submit" />
  </div>
</template>
