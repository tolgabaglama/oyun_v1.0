# İZ (çalışma adı) — Proje Kılavuzu

Bu dosya deponun kökünde durur. Claude Code her oturumda bunu okur. Alınan tüm tasarım kararları buradadır; tartışılmadan değiştirilmez. Kararı değiştirmek istiyorsan önce Tolga ile konuş, sonra bu dosyayı güncelle.

Proje sahibi: Tolga. Mobil oyun geliştirme ve yayınlama tecrübesi yok, elektrik mühendisi, veri ve Excel ile rahat. Açıklamaları sade tut, teknik kararları gerekçesiyle anlat, tek seferde çok fazla dosya üretme.

## 1. Oyun nedir

Türkiye haritası üzerinde oynanan, tek oyunculu, rastgele üretilen kısa turlardan oluşan bir çıkarım bulmacası. Oyuncu bir devlet siber istihbarat görevlisidir. Sabit duran bir hedef kişinin şu anki konumunu, kurgusal devlet verilerini sorgulayarak bulur. Puan, kullanılan verinin azlığından gelir: elinde her şey varken en az veriyle ve en çok insan davranışı çıkarımıyla bulmak.

Hikaye yok, karakter yok, hareket eden hedef yok. Referans his: Wordle artı GeoGuessr artı Papers Please arayüz estetiği.

Amaç ikili: oyuncuya günlük hayatta ne kadar dijital iz bıraktığını fark ettirmek, ve günlük dava ile seri mekanizmasıyla düzenli oynatmak.

## 2. Kilitlenen kararlar

* Hedef sabittir. Tur içinde hareket etmez.
* Hikaye yok, sezon yok. Altyapı ileride el yazımı davalara izin verecek şekilde veri odaklı kurulur (aynı dava dosya formatı hem üreticiden hem elden gelebilir).
* Tempo: hamle ve veri maliyeti bütçesi. Gerçek zamanlı süre baskısı yok.
* Dikey ekran. Kurgu: memurun hizmet telefonundaki "Mobil Sorgu" uygulaması. Tüm oyun ekranları bu uygulamanın ekranlarıdır.
* Kesişimi oyuncu hesaplar (orta yol): her sorgu sonucu haritada bir katman olur, oyuncu katmanları açıp kapatır, elle dışlama bölgesi çizer, raptiye koyar, not yazar. Sistem kesişim hesaplamaz. Kalan aday sayısı sadece kolay modda görünür.
* Pilot şehir İstanbul, yaklaşık 1.500 gerçek nokta. Türkiye geneli 10.000 nokta ikinci aşama.
* Önce tarayıcı sürümü (reklamsız), sonra Capacitor ile Android ve Google Play (reklamlı).
* Gerçek kurum ve sistem adı kullanılmaz. KGYS, POLNET, MERNİS gibi gerçek isimler yerine kurgusal isimler: ŞEHİRGÖZ (kamera), SİCİLNET (kayıt), NÜFUSNET (nüfus). Logo taklidi yok.
* Gerçek marka adı kullanılmaz. Kategori adı kullanılır: "zincir market", "döviz bürosu", "eczane".
* Kameralar ve baz istasyonu hücreleri kurgusaldır, gerçek coğrafya üstüne kurallı üretilir. Gerçek kamera konumu asla toplanmaz, kullanılmaz.
* Tüm kişiler, işlemler, kayıtlar kurgusaldır. İsim havuzu sınırlı ve kurgusal ilçe sakinlerine ait gibi üretilir.
* Yapay bekleme süresi, enerji sistemi, tur ortasında reklam yok. Tutunma günlük dava, seri, par karşılaştırması ve rütbeden gelir.

## 3. Tur akışı

1. Dosya açılır: hedefin adı, yaşı, kısa ihbar notu. Bilgi eksik ve bazen yanlış.
2. Oyuncu Sorgu sekmesinden sensör seçer, sorgu yapar. Her sorgunun veri maliyeti tavan puandan düşer.
3. Sonuç, Pano ve Harita katmanı olarak gelir. Oyuncu katmanları birleştirir, dışlar, düşünür.
4. Oyuncu haritaya uzun basarak tahmin yapar. Doğru sayılma yarıçapı 150 metre.
5. Doğruysa kalan puan alınır. Yanlışsa 250 puan ceza, tur devam eder. İkinci yanlışta tur kapanır.
6. Tur sonu ekranı: "Bu kişi 14 günde N kayıt bıraktı. Sen K tanesiyle buldun." Kaynağa göre dağılım, par karşılaştırması, rütbe ilerlemesi.

## 4. Puanlama

* Tavan 1.000 puan.
* Her sorgu kendi maliyetini düşer (bkz. sensör kataloğu).
* Yanlış tahmin 250 puan ceza. İkinci yanlış turu bitirir.
* Par: oracle her dava için en verimli çözüm yolunun toplam maliyetini hesaplar. Bu davanın par değeridir ve tur sonunda gösterilir.
* Par üst sınırı 800'dür. Bunun üstünde par gerektiren dosya oynanabilir olmaktan çıkar ve üretimde reddedilir.
* Par 500'ün üstündeyse hedef az iz bırakmış demektir. Dosya "NİTELİKLİ HEDEF" olarak işaretlenir ve bu, oyuncuya dosya açılırken gösterilir.
* Zorluk kademeleri: Kolay (aday sayısı görünür), Standart (görünmez), Uzman (Kademe 4 sensörler kapalı).
* Günlük dava: herkes aynı seed ile aynı davayı oynar. Deterministik seed zorunludur.

## 5. Sensör kataloğu

Her sensör bir veri tanımıdır, kodda özel durum olmaz. Yeni sensör eklemek yeni bir veri girişi olmalıdır. Alanlar: id, ad, kademe, maliyet, mekânsal ayak izi tipi (nokta, koni, hücre, adres, güzergâh), döndürdüğü alanlar, gürültü kuralları, dar ve geniş sorgu varyantları.

Kademe 1, açık ve idari kayıt, maliyet 30
* Nüfus ve adres kaydı: kayıtlı ilçe ve mahalle. Gürültü: eski kayıt, kişi orada oturmuyor.
* Araç tescili: araç var mı, plaka, kayıtlı ilçe.
* Elektrik ve su aboneliği: adına kayıtlı adres. Gürültü: kiracı, abonelik başkasında.
* Sosyal medya açık paylaşımı: son paylaşımın kabaca konumu. Nadir.

Kademe 2, hizmet kayıtları, maliyet 60
* İstanbulkart hareketi: son 7 günün biniş durakları ve saatleri. En zengin davranış sensörü.
* HGS geçişi: köprü ve otoyol geçişleri, yön ve saat. Yakayı kesinleştirir.
* İSPARK ve otopark: park noktası ve süre.
* Kargo teslimatı: son teslimat adresi. Gürültü: iş yerine teslimat.
* Eczane reçete karşılama: eczane noktası ve tarih.
* Kamera arşivi, tekil: seçilen kameranın seçilen saat aralığı. Ayak izi koni. Sonuç: eşleşme var veya yok, varsa yön.
* Spor salonu turnike kaydı: üyelik turnikesinden 14 günlük giriş ve çıkış saatleri. Yalnızca spor salonu noktalarında vardır.

Kademe 3, mahrem veri, maliyet 120
* Baz istasyonu, son kayıt: telefonun en son göründüğü hücre.
* ATM çekimleri: son 14 gün, nokta ve saat.
* POS harcamaları: iş yeri kategorisi ve nokta, son 14 gün.
* Döviz bürosu işlemi: nokta, tutar aralığı, tarih.
* Taksi ödemesi: kartla ödenen taksi yolculuğu. Ayak izi güzergâh. Kayıt yolculuğun iki ucunu taşır, hangisinin varış olduğu yazmaz. Oracle için daraltıcıdır, konumlayıcı değildir.
* Ev interneti IP: abonelik adresi, son bağlantı saati.
* Özel kamera talebi, son 24 saat: seçilen bir noktanın kendi kamerasından saha ekibi kayıt ister. Ayak izi nokta. Sonuç: eşleşme var veya yok, saat, giriş veya çıkış yönü.

Kademe 4, ağır döküm, maliyet 200
* 14 günlük tam baz dökümü.
* Tam banka dökümü.
* Kamera geniş tarama: bir ilçenin tüm kameralarında eşleşme.
* Özel kamera talebi, 14 gün: aynı nokta, tüm pencere.

Aynı sensörün dar sorgusu ucuz, geniş sorgusu pahalıdır (örnek: "son kayıt" 120, "14 gün" 200).

Özel kamera talebinin kapsama ve saklama kuralları sensör tanımında veri olarak durur, kodda özel durum yazılmaz:
* Kamera varlığı noktanın kategorisine bağlıdır. Zincir market, eczane, spor salonu, cami ve benzinlikte her zaman vardır. Küçük dükkân, kahvehane, ATM, döviz ve kargo şubesinde yüzde 60. Karar nokta başına bir kez verilir ve dava boyunca değişmez.
* Otopark ve duraklar için özel talep kabul edilmez, onlar ŞEHİRGÖZ kapsamındadır.
* Saklama süresi nokta başına 7 ile 30 gün arasıdır. Süresi geçen kayıt silinmiş döner, konum bilgisi vermez.
* Yüzde 15 ihtimalle görüntü bulanıktır: eşleşme görünür ama kesin saat yerine saat dilimi verilir, yön bilinmez.

Özel kamera talebi oracle için doğrulayıcıdır, konumlayıcı değildir: oyuncu hangi noktayı soracağını bilmez. Aday kümesi başka sensörlerle daraldıktan sonra kalan adaylara tek tek sorulur; par hesabında maliyeti kalan aday sayısı eksi bir sorgu sayılır. Eşleşme yalnızca son 6 saat içindeyse şu anki konumu kanıtlar.

## 6. Hedefin hayat modeli (üretici)

Üretici her tur şunları seçer ve tutarlı bir 14 günlük geçmiş üretir:
* Ev, iş, üçüncü nokta (akraba evi, spor salonu, kahvehane, cami). Hepsi gerçek POI noktalarından.
* Ulaşım modu: araç, toplu taşıma, karışık, taksi. HGS, İstanbulkart, İSPARK kayıtlarını belirler.
* Taksi kullanan hedefin aracı yoktur ve İstanbulkart kullanmaz: HGS, İSPARK ve biniş kaydı bırakmaz. Tek ulaşım izi taksi ödemesidir, o da kartla ödendiğinde oluşur. Bu yüzden taksi modunda ödeme disiplini ağırlıklı olarak karttır, aksi halde hedefin hiç ulaşım izi kalmazdı.
* Ödeme disiplini: hep kart, hep nakit, döviz sonrası nakde geçiş.
* Spor salonu üyeliği: hedeflerin yaklaşık üçte biri üyedir. Üye olanın üçüncü noktası spor salonu olur ve turnike kaydı bırakır.
* İş çevresi: hafta içi öğle aralarında iş noktasının yaklaşık 300 metre yakınındaki bir yere gidilir (market, kahvehane, eczane, kargo şubesi, döviz bürosu). Ödeme disiplinine uyar: kart disiplininde POS kaydı, nakit disiplininde önce çevredeki ATM'den çekim sonra nakit ödeme. Nakit ödeme banka kaydı bırakmaz ama özel kamera kapsamına girer. Bu davranış iş yerinin kendisini değil çevresini işaretler; oyuncu ve oracle "bu civarda çalışıyor" çıkarımını yapıp çevredeki noktalara doğrulama sorgusu gönderir.
* Telefon disiplini: hep açık, geceleri kapalı, son 3 gün kapalı.
* Baz kaydının geçerlilik kuralı: cihaz şu anda açıksa son sinyal hedefin bulunduğu hücreye aittir ve konum kanıtıdır, komşu hücre gürültüsü bu kayda uygulanmaz. Cihaz kapalıysa son sinyal kapanma anına aittir, konum kanıtı sayılmaz. Her iki durumda da kaydın üstünde cihazın açık mı kapalı mı olduğu ve kapalıysa kaç gündür sinyal alınmadığı yazar. Oyuncu verinin ne zaman geçerli olduğunu bilmeden adil karar veremez.
* Şu anki konum: kolayda ev, ortada iş veya üçüncü nokta, zorda rutin dışı bir yer.

Adalet kuralı: şu anki konumun geçmiş izlerde en az bir bağı olmalıdır. Rutin çalıştırılır, her hareket sensörlere olasılıkla düşer, gürültü eklenir (aynı isimli ikinci kişi, komşu hücreye sıçrayan baz kaydı, sahte adres).

Oracle: sadece sızdırılan verilerle hedef tek noktaya indirilebiliyor mu, en ucuz yol nedir? Çözülemeyen dava atılır ve yeniden üretilir. Tek sorguda biten dava atılır. En ucuz yolun maliyeti par olur. Oracle için birim testleri zorunludur.

Tutarlılık kuralı: üretilen dosyada hiçbir konumlayıcı sert kısıt gizli gerçekle çelişmemelidir. Çelişen dosya oyuncuyu kesin bir veriyle yanlış bölgeye götürür ve üretim aşamasında reddedilir. Bu denetim her dosyada çalışır ve testle doğrulanır.

## 7. Veri kaynakları

* OpenStreetMap (Overpass API): market, eczane, ATM, döviz, benzinlik, kargo şubesi, cami, kahvehane, spor salonu, otopark. Lisans ODbL, atıf zorunlu. Overpass sorguları Claude Code tarafından doğrudan çalıştırılabilir; sonuçlar data/raw altına GeoJSON olarak kaydedilir ve depoya girer, böylece tekrar indirmek gerekmez.
* İBB Açık Veri Portalı (data.ibb.gov.tr): İETT durakları (GTFS stops), raylı sistem istasyonları, İSPARK. Portaldan indirme manuel gerekirse Tolga yapar ve data/raw altına koyar. Lisans: İBB Açık Veri Lisansı, atıf zorunlu.
* İlçe ve mahalle sınırları: OpenStreetMap idari sınırları (ilçe seviye 6, mahalle seviye 8). İBB portalında sınır çokgeni bulunmadığı için 19 Eylül 2026'da Tolga'nın onayıyla OSM seçildi.
* Harita karoları: Protomaps PMTiles İstanbul kesiti, çevrimdışı, anahtarsız. Tarayıcı prototipinde OpenFreeMap da kullanılabilir.
* Kurgusal kameralar: kavşak, meydan, durak ve okul girişlerine kurallı yerleşim, yaklaşık 400 adet, görüş konisi yol yönünden hesaplanır.
* Kurgusal baz hücreleri: yoğunluğa göre Voronoi, yaklaşık 60 hücre. Hücreler bilinçli olarak geniştir: baz kaydı tek başına konum vermemeli, yalnızca aday kümesini daraltmalıdır. Hedef, yoğun ilçelerde hücre başına 30 ile 50 nokta.
* Fontlar Google Fonts, ikonlar Lucide, sesler Freesound ve Pixabay (CC0 veya atıflı).
* Her kaynağın lisansı LICENSES.md içinde tutulur. Bu dosya ilk günden başlar.

## 8. Teknoloji

* Vite + TypeScript, çerçeve yok veya en hafif çözüm. Sonradan Capacitor ile Android'e sarılacağı unutulmaz.
* Harita: MapLibre GL JS.
* Üretici ve oracle saf TypeScript modülleri, DOM'a bağımsız, Node'da test edilebilir. Vitest ile test.
* Deterministik seeded RNG (günlük dava için).
* Dava dosya formatı JSON şema ile tanımlanır. Üretici ve ileride el yazımı davalar aynı şemayı kullanır.
* Durum yerelde tutulur (localStorage), sunucu yok. Sıralama tablosu ikinci aşama.
* Dikey ekran, 390 x 844 hedef çözünürlük, masaüstünde telefon çerçevesi içinde gösterilir.

## 9. Depo yapısı

```
/CLAUDE.md
/LICENSES.md
/data/raw/            OSM ve İBB ham dosyaları
/data/processed/      süzülmüş POI, kamera, hücre dosyaları
/scripts/             veri süzme ve üretim betikleri
/src/engine/          üretici, oracle, sensör kataloğu, puanlama
/src/app/             motor ile arayüz arasındaki ince katman (oturum, görünüm tipleri, yerel depolama)
/src/ui/              ekranlar, katman yönetimi, harita
/src/data/            sensör tanımları, isim havuzu
/tests/
```

## 10. Aşamalar

1. Veri boru hattı: Overpass ile İstanbul POI çekimi, süzme, 1.500 nokta, kurgusal kamera ve hücre üretimi, haritada nokta bulutu olarak görünmesi.
2. Motor: sensör kataloğu, hayat modeli, üretici, oracle, puanlama, birim testleri. Arayüz yok, konsoldan dava üret ve doğrula.
3. Ham arayüz: dört sekme (Dosya, Sorgu, Pano, Yönlendir yerine Tahmin), katmanlı harita, tahmin, tur sonu ekranı. Görsel cila yok.
4. Kalibrasyon: Tolga 50 tur oynar, maliyetler ve zorluk ayarlanır.
5. Cila: kamu yazılımı estetiği, ses, günlük dava, seri, rütbe, farkındalık ekranı. Öğretici ekranı Aşama 3'te eklendi, metni docs/tutorial_metni.md dosyasından okur ve tek kaynak orasıdır.
6. Tarayıcıda yayın (GitHub Pages veya Cloudflare Pages).
7. Capacitor, AdMob (tur arası ve ödüllü reklam), gizlilik politikası, Play kapalı test (12 kullanıcı, 14 gün), üretim.

Her aşama bitmeden bir sonrakine geçilmez. Her aşama sonunda Tolga'nın tarayıcıda görüp deneyebileceği bir şey olmalıdır.

## 11. Stil ve iletişim kuralları

* Arayüz dili Türkçe. Metinlerde ve yorumlarda tire işareti (kısa, uzun veya çift) kullanılmaz; virgül, nokta veya cümle yeniden yazılır.
* Terminoloji: oyuncunun gördüğü metinlerde bir tur "dosya"dır, numarası "dosya numarası"dır. Aranan kişi "hedef" veya "ilgi konusu şahıs" diye anılır. Suç, suçlu, sanık, şüpheli, ihbar gibi kelimeler kullanılmaz: bu kişi hakkında bir suçlama yoktur, devlet herhangi bir sebeple ulaşmak istemektedir. Kod içi isimler (dava, davaUret) değişmez, yalnızca görünen metinler bu kurala uyar.
* Arayüz estetiği: 2010'lar Türk kamu yazılımı hissi. Gri paneller, seri numaraları, "Sorgula" butonları, yükleniyor çubuğu. Bu his bilinçlidir, modern ve renkli tasarım yapılmaz.
* Kamera kareleri gerçek fotoğraf değildir. Stilize kare: siluet, araç şekli ve rengi, plaka bloğu, yön oku, zaman damgası, kamera kodu.
* Her oturum başında bu dosya ve son commit mesajları okunur, ne yapılacağı Tolga'ya bir paragrafla özetlenir, sonra başlanır.
* Küçük ve sık commit. Her commit mesajı Türkçe ve tek cümle.
* Bir karar bu dosyayla çelişiyorsa durup Tolga'ya sorulur.

## 12. İlk oturum talimatı

İlk oturumda yalnızca Aşama 1'in ilk yarısı yapılır: depo iskeleti, Vite kurulumu, MapLibre ile İstanbul haritasının telefon çerçevesinde açılması, LICENSES.md, ve Overpass'tan tek bir kategori (eczaneler) çekilip haritada gösterilmesi. Bu çalışınca durulur ve Tolga'ya gösterilir. Gerisi sonraki oturumlarda.
