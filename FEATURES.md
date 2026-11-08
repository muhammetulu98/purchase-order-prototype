# Yeni Satın Alma Siparişi — Özellikler ve Kurallar

Prototip: `/purchasing/orders/new`. Yalnız frontend, kurgu veri (`app/utils/prototypeApi.ts`).
Form: `app/components/ErpPurchaseOrderDocumentForm.vue` · sayfa: `app/pages/purchasing/orders/new.vue`.

Yeni bir kural eklendiğinde bu dosyaya da işlenir. `[VARSAYIM]` = teyit bekleyen kural.

---

## ⚠️ ÖNEMLİ KURAL — Birim fiyat üst sınırı

**Stoğun birim fiyatı, satın alma şartlarındaki birim fiyatın ÜSTÜNE ÇIKAMAZ. Altına inebilir.**

- Sınır, stok eklenirken satın alma şartından gelen birim fiyattır (`conditionUnitPrice`). Satırda "Şart üst sınırı: …" olarak görünür.
- Üstüne çıkılırsa fiyat kutudan çıkınca sınıra geri çekilir ve forma hata mesajı yazılır; Kaydet de engellenir.
- Alta inmek serbesttir (indirim yazılabilir).
- Birim değişince (Adet ↔ Koli ↔ Palet) sınır da aynı katsayıyla çevrilir.
- Satın alma şartı **olmayan** stokta sınır yoktur.
- Kayıtlı evrak açılınca şart yeniden çekilip sınır uygulanır.
- `[VARSAYIM]` Sınır yalnız **Birim Fiyat** kutusuna uygulanır; Net Birim Fiyat kutusu İsk 2'yi geri hesapladığı için birim fiyatın üstüne zaten çıkamaz.
- `[VARSAYIM]` Tedarikçi, depo veya proje sonradan değişirse mevcut satırların sınırı yeniden hesaplanmaz.

---

## 1. Evrak başlığı

- **Tedarikçi (cari):** kod/unvanla aranır (en az 2 karakter, yazarken açılır liste). Sonuç listesinde her satırda **il / ilçe ve bakiye** görünür; seçilince kod ve unvanın yanında da **il / ilçe ve "Bakiye: …"** yazar. Kaldırılıp yeniden seçilince bilgi sıfırlanır.
- **Adres:** carinin adreslerinden seçilir; cari seçilince ilki gelir.
- **Otomatik alanlar (ekranda yok):** evrak serisi, sıra no ve sipariş tarihi. Sistem kayıtta atar.
- **Depo:** üstten seçilir, tüm satırlara yazılır; satırda ayrıca değiştirilebilir.
- **Teslim tarihi:** üstten seçilir, tüm satırlara yazılır; satırda ayrıca değiştirilebilir. Geçmiş tarih kabul edilmez.
- **Proje:** yalnız **aktif** projeler listelenir (düzenlemede kayıtlı proje pasif olsa da görünür).
- **Açıklama:** tek alan.
- **Kaldırılan alanlar:** ödeme planı/vade, temsilci, sorumluluk merkezi, ikinci açıklama, sipariş tarihi, evrak serisi, sıra no (hiçbiri ekranda yok).
- **Kayıt yükü:** kaldırılan alanlar yeni evrakta boş/varsayılan gider; **kayıtlı evrak düzenlenirken eski değerleri korunur** (ödeme planı, temsilci, sorumluluk merkezi silinmez). Seri sabit "A", ikinci açıklama boş gider.

## 2. Satır ekleme (stok)

- Arama kutusuna kod/ad yazılıp **Enter**; yazarken açılır liste çıkmaz.
- Kod, barkod veya multi kod **tam eşleşip tek stok** bulunursa satıra direkt eklenir.
- Aksi halde (ad araması, birden fazla sonuç) **çoklu seçim modalı** açılır: onay kutuları, "Tümünü seç", sütunlar Stok Kodu / Barkod / Stok Adı, alt çubukta "N stok seçildi" ve **Seçilenleri Ekle**.
- **"Yalnız bu tedarikçinin ürünleri"** onay kutusu (varsayılan **işaretli**): stok aramasını seçili tedarikçinin ürünleriyle sınırlar. Tedarikçi seçilmemişse pasif ve süzme uygulanmaz; işareti kaldırınca tüm stoklar aranır.
- **"Toplu iskonto"** butonu (Tümünü temizle'nin solunda): açılan pencerede İsk 1–4 kutuları; **dolu bırakılan iskonto tüm satırlara yazılır, boş bırakılana dokunulmaz**, 0 yazmak o iskontoyu sıfırlar. %0–99 dışı kabul edilmez. Satır yokken pasif. Sonrasında satırda elle değiştirilebilir; net birim fiyat yeniden hesaplanır.
- **"Tümünü temizle"** butonu: formdaki tüm satırları siler (onay sorar). Satır yoksa pasif.
- Bulunamazsa form hata satırına "… ile eşleşen stok yok." yazar.
- Eklenen satır: miktar 1, fiyat ve iskontolar satın alma şartından (şart yoksa liste fiyatı, iskonto 0), KDV stok kartından, depo ve teslim tarihi üstteki değerlerden gelir.

## 3. Satır alanları

**Sütun sırası:** Stok · Birim · Miktar · Birim Fiyat · İsk 1–4 · Net Birim Fiyat (KDV hariç/dahil) · KDV % · Son Alış · Depo / Teslim Tarihi · Net · işlem butonları (stok geçmişi, sil). Hücre arası boşluk geniş tutulur, tablo yatay kaydırılır.

- **Miktar:** yalnız tam sayı (virgül/nokta yazılamaz, en az 1).
- **Koli parçalanması:** miktar koli içi adede tam bölünmüyorsa kutu turuncu olur, "Koli bozuluyor (koli içi N)" yazar. Uyarıdır, kaydı engellemez.
- **Birim:** satırdan seçilir (Adet / Koli / Palet); değişince fiyat ve şart üst sınırı katsayıyla çevrilir.
- **Toplu birim:** "Birim" sütun başlığındaki "Tümü" seçiminden Adet / Koli / Palet seçilince tüm satırların birimi değişir. **Miktar sayısı korunur** (120 adet → 120 koli, tek satırdaki birim değişimiyle aynı); fiyat ve şart üst sınırı katsayıyla çevrilir. Seçilen birimi tanımlı olmayan satır **değişmez**, tablonun üstünde hangi satırların değişmediği yazar. Koli parçalanma uyarısı yeni birime göre yeniden hesaplanır.
- **Birim fiyat:** düzenlenebilir (KDV hariç, iskonto öncesi), üst sınır kuralına tabi (yukarıya bak).
- **İskonto 1–4:** düzenlenebilir. Değeri **0 ise kutuya tıklayınca içi otomatik boşalır** (kullanıcı 0'ı silmekle uğraşmaz); boş bırakıp çıkılırsa 0'a döner.
- **Net birim fiyat (KDV hariç / dahil):** alt alta iki kutu; iskontolar sonrası fiyat. Yazılınca **İsk 2 geri hesaplanır** (İsk 1/3/4 sabit; birim fiyatı aşamaz).
- **KDV %:** salt okunur, net birim fiyatın yanında.
- **Son alış:** bilgi amaçlı, Depo sütununun solunda.
- **Net:** satırın KDV dahil toplamı; formun altındaki Brüt / İskonto / KDV / Genel Toplam bu satırlardan hesaplanır.
- **Şart rozeti:** fiyatı satın alma şartından gelen satırda "Alış şartı" etiketi görünür.
- **Depo / Teslim tarihi:** tek sütunda alt alta.
- **Kaldırılan sütunlar:** Liste (liste fiyatı), Son 3 Ay Satış (satış bilgisi artık yalnız stok geçmişi modalında).

## 3.1 Klavye ile gezinme

- Satır tablosunda **ok tuşları** Excel gibi gezer: ↑ ↓ aynı sütunda önceki/sonraki satıra, ← → yan kutuya.
- Hücrede alt alta iki kutu varsa (Net Birim Fiyat KDV hariç/dahil, Depo/Teslim Tarihi) ↑ ↓ önce hücre içinde gezer.
- Metin kutusunda ← → yalnız imleç kenardaysa geçer; tarih kutusunda ← → tarih alanları arasında gezer, ↑ ↓ hücre değiştirir.
- Sayı kutularında ↑ ↓ değeri artırıp azaltmaz, satır değiştirir.
- Seçim kutusunda (Depo, Birim) ↑ ↓ satır değiştirir; Enter/Boşluk listeyi açar.

## 4. Üst bilgi kutuları

- **Miktar özeti:** stok arama kutusunun sağında Adet / Koli / Palet toplamı; tıklayınca satır dökümü açılır. Miktar temel birime (adet) çevrilip koli ve palete bölünür; hangi birimle girilirse aynı sonuç. Satır yokken görünmez.
- **Depo ve Teslim Tarihi (üst):** değişince tüm satırlar güncellenir; satırda elle yapılan değişiklik üstteki sonraki değişiklikle ezilir.

## 4.0 Excel'den yapıştır

- Stok arama satırındaki **"Excel'den yapıştır"** butonu (tedarikçi seçilmeden pasif). Pencereye Excel'den kopyalanan satırlar yapıştırılır.
- **Sütunlar (sırayla):** Stok Kodu / Barkod / Multi Kod · Miktar · Birim · Birim Fiyat · İsk 1 · İsk 2 · İsk 3 · İsk 4.
- **Başlık satırı** varsa sütunlar başlık adından eşlenir (sıra serbest, "Stok Kodu", "Miktar", "Birim", "Birim Fiyat", "İsk 1"… ); yoksa yukarıdaki sıra varsayılır.
- **Boş hücre:** miktar boşsa 1; birim boşsa stoğun varsayılan birimi; fiyat ve iskonto boşsa **stoğun satın alma şartından gelen değer** kalır. Dolu hücre (iskontoda 0 dahil) şart değerinin üstüne yazılır.
- **Birim:** stokta tanımlı birim adı (Adet / Koli / Palet); girilen fiyat **o birim başınadır** (KDV hariç).
- **Eklenmeyen (uyarı verilen) satırlar:**
  - Stok kartı bizde yoksa: "Stok kartı bulunamadı."
  - Stok seçilen tedarikçiye ait değilse: "seçilen tedarikçiye ait değil".
  - Birim stokta tanımlı değilse.
  - **Birim fiyat satın alma şartı üst sınırını aşıyorsa** (⚠️ önemli kural).
  - Miktar tam sayı değil / sıfır / negatif; iskonto %0–99 dışı; fiyat geçersiz.
  - Stok siparişte zaten varsa (atlanır).
- Geçerli satırlar eklenir; sonuçta "N stok siparişe eklendi" ve uyarı listesi gösterilir. Uyarı yoksa pencere kapanır. Koli parçalanma uyarısı satırda ayrıca görünür.
- `[VARSAYIM]` Hatalı satır hiç eklenmez (uyarıyla birlikte eklenmez). Kod başına iki arama yapılır; gerçek API'de toplu doğrulama ucu daha iyi olur.

## 4.0.1 Excel indir

- Stok arama satırındaki **"Excel indir"** butonu (satır yokken pasif). **Prototipte yalnız butondur, işlevi yoktur**; dosyanın üretilmesi API/backend tarafında yapılacak.
- `[VARSAYIM]` İndirilecek dosyanın sütunları, "Excel'den yapıştır" ile aynı sırada olmalı (Stok Kodu · Miktar · Birim · Birim Fiyat · İsk 1–4) ki dosya düzenlenip geri yapıştırılabilsin.

## 4.1 Stok listesi (kısa rapor)

- Stok arama satırındaki **"Stok listesi"** butonu (tedarikçi seçilmeden pasif): seçili tedarikçinin **aktif stoklarını** (üretimden kalkmamış ve pasif olmayan) listeler.
- Sütunlar: Stok Kodu · Stok Adı · Tip (H/D) · Mevcut Stok · Satılabilir · **Son 3 / 6 / 12 ay satış** (seçilebilir) · Aylık ortalama · Stok yeterliliği (mevcut ÷ aylık ortalama, ay cinsinden). **Satışı çok olandan aza** sıralıdır.
- **Satılabilir** miktarın üstüne gelince açılır küçük pencere (**H ve D stokların hepsinde**): **depo bazlı miktarlar (İkitelli, Plaza), Rezerve stok (açık müşteri siparişi), Tedarik siparişi (açık satın alma siparişi, bekleyen giriş)**. D (drop) stok depoya alınmış olabileceği için onda da gösterilir; kartta satılabilir değeri yoksa **mevcut stok − rezerve** olarak hesaplanır.
- **Birim:** listede "Birim" sütunu vardır; tüm miktarlar (mevcut, satılabilir, satış, aylık ortalama, açılan pencere) **temel birim adet** üzerinden seçilen birimle gösterilir. Üstten Adet / Koli / Palet seçilir (varsayılan Adet). Stokta seçilen birim tanımlı değilse o satır Adet'e düşer ve Birim sütunu "Adet" yazar. Stok yeterliliği birimden bağımsızdır.
- Listede arama kutusu vardır (kod, ad, barkod).
- Onay kutularıyla **çoklu seçilip siparişe eklenebilir** ("Seçilenleri Ekle"); zaten siparişte olan stok soluk görünür ve seçilemez.
- `[VARSAYIM]` Satış = faturalanan satışlar, tüm müşteriler (stok geçmişi modalıyla aynı veri). Ürün başına ayrı satış çağrısı yapılır; gerçek API'de toplu uç gerekir (en fazla 200 stok).

## 5. Stok geçmişi (satırdaki saat butonu)

- Satır sonundaki **saat butonu** "Stok Geçmişi" modalını açar.
- **Alış Faturaları** sekmesi: son 5 yıl; tarih, fatura no, tedarikçi, miktar, birim fiyat, iskontolar, net birim, tutar.
- **Satış Hareketleri** sekmesi: son 3 / 6 / 12 ay; özet (toplam, aylık ortalama, mevcut stok, satılabilir) ve fatura listesi.
- `[VARSAYIM]` Satış = faturalanan satışlar, tüm müşteriler. Sipariş/irsaliye dahil değil.
- API uçları henüz yok; mock'ta kurgu veri: `/purchase-orders/invoice-history/{kod}`, `/purchase-orders/sales-history/{kod}`.

## 6. Bekleyen / ertelenen

- Gerçek API'de seri kuralı (kullanıcı/şubeye göre seri); şimdilik sabit "A".
- Tedarikçi ürün süzmesi için ürün listesi ucunun `supplierCode` parametresini desteklemesi gerekir (mock'ta şartı olan stoklar tedarikçiye bağlı).
- Stok listesi için tedarikçi bazlı toplu satış ucu (stok başına satış çağrısı yerine tek çağrı).
- Excel'den yapıştır için toplu stok doğrulama ucu (kod başına iki arama yerine tek çağrı).
- Stok listesinde ürün kartından koli içi / palet içi adet, depo dökümü, rezerve ve tedarik siparişi alanlarının liste ucundan dolu gelmesi.
- Projelerde aktiflik alanının gerçek API'deki adı (`active` varsayıldı).
