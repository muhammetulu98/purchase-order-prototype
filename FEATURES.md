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

## 0. Sipariş listesi (`/purchasing/orders`)

- Açılış sayfasıdır (`/` buraya yönlenir). **Sağ üstteki "Yeni Satın Alma Siparişi"** butonu yeni sipariş ekranına (`/purchasing/orders/new`) götürür; o ekranda **"Siparişlere dön"** butonu geri getirir.
- **Üç sekme**, başlıkta adet yazar: **Bekliyor** (hiç teslim alınmamış), **Kısmi Teslim Alınan** (bir kısmı teslim alınmış, kalan var) ve **Teslim Alınan** (tamamı teslim alınmış). Durum **miktardan** çıkar: teslim alınan = 0 → Bekliyor; ≥ sipariş miktarı → Teslim Alınan; arası → Kısmi. Miktar alanları yoksa satır sayılarından (açık/kapalı satır) çıkarılır.
- **Sütunlar (her üç sekmede aynı):** Evrak (seri-sıra) · Tarih · Teslim · Tedarikçi (üstte kod, altında unvan) · Temsilci · Ham Tutar · İskonto · Net Tutar · Satır (Açık/Kapalı) · Açıklama. Tutar sütunları sağa yaslı, Net Tutar kalın; boş temsilci ve açıklama "—".
- **Satır (Açık/Kapalı):** kapalı satır yoksa yalnız açık satır sayısı ("3"), varsa "açık / kapalı" ("4 / 2"); teslim alınan siparişte "0 / 3".
- **TL simgesi:** listedeki ve detaydaki tüm tutarların (Ham Tutar, İskonto, Net Tutar, Birim Fiyat, Tutar) yanında "₺" yazar. `[VARSAYIM]` Sipariş formundaki tutarlara henüz eklenmedi.
- **Tutarlar:** Ham Tutar − İskonto = KDV hariç; **Net Tutar KDV dahildir** (ekran görüntüsündeki ilişki: 86.750,40 − 15.615,07 → 85.362,39 ≈ ×1,20).
- **Sipariş detayı (accordion):** satıra tıklayınca altında detay açılır (tekrar tıklayınca kapanır, aynı anda tek sipariş açık kalır; soldaki ok durumu gösterir). Detay: # · Stok Kodu · Stok Adı · Birim · **Depo (satırın deposu)** · Sipariş · Teslim Alınan · Kalan (açıksa kalın) · Birim Fiyat · İsk 1/2/3/4 · KDV % · Tutar (KDV hariç) · Teslim Tarihi · Durum (Açık / Kısmi / Teslim alındı). Satırlar ilk açılışta çekilir, sonra saklanır.
- **Siparişi çoğalt:** açılan detayda "Siparişi düzenle"nin yanındaki butondur. Yeni sipariş ekranını **kopya olarak** açar: üstte mavi bilgi bandı ("Sipariş çoğaltılıyor: SA06-17000 — kaydedince yeni bir sipariş oluşur, kaynak sipariş değişmez"), başlık "Siparişi Çoğalt". Tedarikçi, adres, depo, açıklama ve satırlar (miktar, birim, fiyat, iskonto) kopyalanır; sipariş numarası, sipariş tarihi, teslim alınan miktarlar ve satır kimlikleri **kopyalanmaz** (tümü yeni), **teslim tarihi bugünden varsayılana (bugün + 3 gün) döner**. Düzenlemeden farkı: tedarikçi değiştirilebilir. Kaydedince "Sipariş oluşturuldu (… kopyası)" bildirimi çıkar ve listeye dönülür.
- `[VARSAYIM]` Kopyalanan fiyat bugünkü satın alma şartının üst sınırını aşıyorsa kayıt engellenir ve uyarı verir (şart değişmiş olabilir).
- **Filtreler (tablonun üstünde):** **Ara** (evrak no, tedarikçi unvanı/kodu), **Tarih aralığı** (sipariş tarihine göre başlangıç ve bitiş, ikisi de dahil, biri boşsa sınırsız), **Temsilci** (listedeki temsilcilerden seçilir, varsayılan "Tüm temsilciler"), **Depo** (liste: Tüm depolar / İkitelli / Plaza / Mağaza; siparişin **herhangi bir satırı** seçilen depodaysa sipariş görünür), **Tedarikçi** (yazılan metin tedarikçi kodu ya da unvanında geçen siparişleri getirir; boşken süzme yoktur, açılır liste yoktur). Filtreler birlikte uygulanır, üç sekmeye de geçerlidir ve **sekme başlığındaki adetler de filtreye göre değişir**. Herhangi bir filtre doluysa "Filtreleri temizle" butonu çıkar.
- `[VARSAYIM]` Miktarlar temel birim (adet) cinsindendir. Satıra tıklayınca evrak detayı henüz yok (prototip).
- `[VARSAYIM]` Liste tek çağrıda en fazla 200 sipariş getirir, sayfalama yok. Mock veri kurgudur (24 sipariş: 8 Bekliyor, 8 Kısmi, 8 Teslim Alınan); yeni kaydedilen sipariş listede görünmez.

---

## ⚠️ Para birimi ve kur (döviz siparişi)

**Eski sistem (timonerp-master `FormSatinalmaSiparis`) kaynağı:** formda para birimi seçimi **yoktur**; kayıtta döviz cinsi sabit TL'dir (`sip_doviz_cinsi = 0`, kur = TL kuru). Başlıkta yalnız bilgi amaçlı `sip_alt_doviz_kuru` (oturumun alternatif dövizinin o günkü kuru, `fn_KurBul`) yazılır. Excel'den yapıştırmadaki "Döviz Cinsi (TL-USD-EUR)" sütunu satıra okunur ama **hiçbir hesaba/kayda girmez** (yarım kalmış). Bu prototipteki döviz sipariş özelliği **yeni bir özelliktir** ve aşağıdaki varsayımlara dayanır.

- **Başlıkta** "Para Birimi" (TL / USD / EUR; varsayılan TL) ve USD/EUR seçilince **"Kur (1 USD = ? ₺)"** alanı çıkar. Kur günün kuruyla önerilir (mock: USD 43,25 · EUR 47,10; gerçekte `fn_KurBul`/TCMB), değiştirilebilir. Kur > 0 olmalıdır.
- **Tek para birimi, tek kur** (tüm satırlar aynı). Satırdaki birim fiyat, iskonto sonrası net birim fiyat ve toplamlar **seçili para biriminde** hesaplanır ("Birim Fiyat ($)" başlığı, tutarlarda sembol). Döviz siparişte altta ayrıca **TL karşılığı** (Genel Toplam × kur) yazar.
- **Para birimi değişince** kilitli olmayan satırların fiyatı **TL değeri korunarak** çevrilir (ör. 100 ₺ → USD'ye geçince 100 ÷ kur). Yalnız **kur** değişirse fiyatlar dokunulmaz (TL değeri değişir).
- **Yeni eklenen satır:** satın alma şartı fiyatı TL olduğundan para birimine ÷ kur ile çevrilerek gelir.
- **⚠️ Birim fiyat üst sınırı kuralı döviz için de geçerlidir:** şart fiyatı TL'dir; sınır = **şart TL fiyatı ÷ kur** (satırda "Şart üst sınırı: 2,35 $", 4 ondalığa kadar). Kontrol seçili para biriminde yapılır; Excel'den yapıştırmada da aynı.
- **Kayıt yükü:** `currencyCode` ve `exchangeRate` (mock; Mikro karşılığı `sip_doviz_cinsi`, `sip_doviz_kuru`) başlıkla gider; satır fiyatları para birimindedir.
- **Düzenlemede para birimi ve kur kilitlidir** (kayıttan sonra değişmez; teslim alınmış satırlar olabileceğinden). **Çoğaltmada** para birimi kopyalanır, **kur bugünün kuruna güncellenir**, fiyatlar para biriminde kalır.
- **Listede** döviz siparişin tutarları o para birimiyle yazar; Net Tutar altında "kur 43,25 · ≈ TL karşılığı" görünür. Mock'ta her 5 siparişten biri USD'dir.
- `[VARSAYIM]` Satın alma şartları **her zaman TL**'dir (dövizli şart yok). `[VARSAYIM]` Kur tek ve başlıktadır (satır başına kur yok). `[VARSAYIM]` Fiyat **dövizle** girilir ve dövizle tutulur (TL'ye çevrilip kaydedilmez). **Üçü de teyit gerektirir.**
- `[VARSAYIM]` Excel'den yapıştırmadaki "Döviz Cinsi" sütunu bu prototipte yok; yapıştırılan fiyat seçili para birimindedir.

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
- **Modal stok bilgileri:** her stok satırında **Fiziksel Stok** (depolardaki toplam), **depo bazlı miktarlar** (İkitelli, Plaza… — sütunlar listedeki stokların depo dökümünden çıkar), **Alınan Sipariş** (müşterilerden alınan açık sipariş, rezerve), **Verilen Sipariş** (tedarikçilere verilen açık siparişin toplamı) ve **Açıkta Bekleyen** (verilen siparişin henüz teslim alınmamış kısmı, doluysa kalın) görünür. **Açıkta bekleyen sipariş detayı (modal):** "Stok Seç" modalındaki iki sütun artık **Bekleyen Satış Siparişi** (müşterilerden alınıp henüz sevk edilmemiş, rezerve) ve **Bekleyen Satın Alma Siparişi** (tedarikçilere verilip henüz teslim alınmamış) miktarıdır; "Verilen Sipariş / Açıkta Bekleyen" ayrımı kaldırıldı. Miktara tıklayınca büyük bir modal açılır: başlıkta stok kodu ve adı, iki sekme (**Bekleyen Satış Siparişleri** / **Bekleyen Satın Alma Siparişleri**, adetleri başlıkta), birim düğmeleri (Adet / Koli / Palet, listedeki seçimle ortak). **Yalnız açıkta bekleyen (kalanı olan) evraklar listelenir; tamamı sevk edilmiş / teslim alınmış evrak gösterilmez ve teslim alınan/sevk edilen sütunu yoktur** (gereksiz veri yığılmasın diye). **Depo filtresi:** modalın üstünde Birim düğmelerinin yanında "Depo" seçimi (Tüm depolar / İkitelli / Plaza / Mağaza) vardır; seçilen depoya verilen / depodan sevk edilecek evraklar kalır, özet kutuları, sekme adetleri ve tablo buna göre değişir. Modal her açılışta "Tüm depolar"a döner. Üstte özet: Açık evrak · Sevk/Teslim bekleyen miktar · Bekleyen tutar (KDV hariç). Tablo: Evrak · Tarih · Müşteri/Tedarikçi · Depo · Temsilci/Sipariş Veren · Sipariş (evrakın toplamı) · **Bekleyen** (kalan) · Birim Fiyat · İsk 1/2/3/4 · Bekleyen Tutar (KDV hariç, yalnız kalan miktar üzerinden) · Teslim Tarihi. Birim fiyat seçili birim başınadır. Detay ilk açılışta çekilir, sonra saklanır. Gerçek API'de `stock-orders/{kod}` ucu bu alanları döndürmelidir (kalan = sipariş − teslim/sevk edilen).
- **Seçilen birimle ekleme:** modalda Koli (ya da Palet) seçiliyken "Seçilenleri Ekle" denirse satırlar **o birimle** eklenir (miktar 1, fiyat ve şart üst sınırı birime göre çevrilir); stokta o birim tanımlı değilse Adet ile eklenir. Aynısı "Stok listesi" penceresinden eklemede de geçerlidir. Enter ile tek stok direkt ekleme etkilenmez (stoğun varsayılan birimi). **Birim:** modalda "Birim" sütunu vardır; miktarlar Adet / Koli / Palet düğmeleriyle seçilen birimle gösterilir (stok listesiyle aynı seçim, stokta o birim tanımlı değilse satır Adet'e düşer ve sütun "Adet" yazar). `[VARSAYIM]` "Fiziksel durum" fiziksel stok miktarı olarak yorumlandı; "Verilen" ve "Açıkta bekleyen" ayrımı toplam / teslim alınmamış kısım olarak alındı. Gerçek API'de `purchaseOrderedQuantity` (verilen toplam) alanı gerekir.
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

## 3.0 Düzenleme kuralları (kapatma / silme / kilit) — Mikro Fly mantığı

Yalnız **kayıtlı siparişi düzenlerken** geçerlidir (yeni ve çoğaltılan siparişte tüm satırlar serbesttir).

- **Silme çalışmaz:** kayıtlı satırın çöp kutusu pasiftir ("Kayıtlı satır silinemez, kapatılabilir"). Yalnız ekranda yeni eklenip henüz kaydedilmemiş satır silinebilir. **"Tümünü temizle"** de yalnız bu kaydedilmemiş satırları siler. Düzenlemede silinecek kaydedilmemiş satır yoksa buton **saydam (pasif)** görünür.
- **Kapatma çalışır:**
  - Satırdaki **kilit simgesi** o satırı, araç çubuğundaki **"Siparişi kapat"** tüm açık satırları kapatır.
  - Açılan pencerede **kapatma nedeni seçilir** (zorunlu): Tedarikçi temin edemiyor · Fiyat anlaşmazlığı · Mükerrer sipariş · Vazgeçildi. Pencerede kapatılacak satırlar ve kalan miktarları listelenir.
  - Kapatma **anında uygulanır** (Kaydet gerekmez) ve geri alınamaz; teslim alınmamış kalan miktar artık beklenmez. Kapalı satırda kapat butonu görünmez; açık satır kalmayınca "Siparişi kapat" pasif olur.
  - **Teslim alınmış satır da kapatılabilir** (kalan miktarı bırakılır).
- **Teslim alınmış (teslim miktarı > 0) ya da kapalı satıra müdahale edilemez:** miktar, birim, fiyat, iskonto, depo ve teslim tarihi kilitlidir (hücreler soluk ve tıklanamaz), satırda 🔒 "Teslim alınan: N" ya da "Kapalı satır" rozeti görünür. Satır yalnız kapatılabilir.
- **Toplu işlemler kilitli satırı atlar:** üstteki Depo / Teslim Tarihi, Toplu iskonto, toplu birim. Kaydetme doğrulamaları (miktar, fiyat üst sınırı, iskonto, geçmiş teslim tarihi) da kilitli satırlara uygulanmaz; bu sayede eski tarihli teslim alınmış siparişin kalan satırı kaydedilebilir.
- `[VARSAYIM]` Bu kuralları Mikro/legacy dokümanından değil, Mikro'nun bilinen davranışından (teslim alınan satır silinmez ve değişmez, yalnız kapatılır) çıkardım; repoda ve makinede kural dokümanı bulunamadı. **Teyit gerekir.**
- `[VARSAYIM]` Kapatma nedenleri örnek listedir; gerçek neden listesi API'den (`close-reasons`) gelir.
- `[VARSAYIM]` Satır kapatılınca siparişin açık satırı kalmazsa listede "Teslim Alınan" sekmesine geçer; mock bunu saklamadığı için listede görünmez.

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
- Sipariş listesi ucunun `depotNos` (siparişin satır depoları) alanını da döndürmesi (depo filtresi için).
- Sipariş listesi ucunun `orderedQuantity` ve `deliveredQuantity` (toplam sipariş / teslim alınan miktar) alanlarını döndürmesi.
- Para birimi / kur: günlük kur ucu (`/exchange-rates`, `fn_KurBul` karşılığı) ve kayıtta `sip_doviz_cinsi` / `sip_doviz_kuru` eşlemesi; kurun tek mi satır başına mı olduğu ve satın alma şartlarının dövizli olup olmadığı kararı.
- Projelerde aktiflik alanının gerçek API'deki adı (`active` varsayıldı).
