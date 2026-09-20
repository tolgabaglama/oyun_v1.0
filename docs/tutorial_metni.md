# İZ, yeni oyuncu için kurallar

Bu dosya oyunun kurallarını anlatan metindir. Arayüz uygulaması Aşama 5'te yapılacak, burada
yalnızca metin durur. Metin oyuncuya doğrudan gösterilebilecek dildedir.

## Ne yapıyorsunuz

Bir devlet biriminde sorgu memurusunuz. Elinizde bir dosya var: bir kişinin adı, yaşı ve
hakkında yazılmış kısa bir not. Bu kişiye ulaşılmak isteniyor. Sizden istenen tek şey şu:
bu kişi şu anda nerede?

Kişi hakkında bir isnat yok. Neden arandığı size söylenmiyor, sizi de ilgilendirmiyor.
Göreviniz konumu bulmak.

Kişi hareket etmiyor. Bulunduğu yerde duruyor ve siz arayana kadar orada kalacak. Yani
acele etmenize gerek yok, süre tutulmuyor.

## Elinizdeki tek şey: geçmişi

Bu kişi son 14 günde yaşadı. Markete gitti, işe gitti, kartla ödeme yaptı, telefonu yanındaydı.
Bunların her biri bir yerde kayıt bıraktı. Sizin işiniz bu kayıtlara bakıp kişinin nerede
olduğunu çıkarmak.

Ekranın altında dört sekme var:

**DOSYA** Kişinin künyesi, hakkındaki not ve o ana kadar yaptığınız sorguların dökümü.
**SORGU** Sorgulayabileceğiniz veri kaynaklarının listesi.
**PANO** Sorgulardan dönen ham kayıtlar ve kendi notlarınız.
**HARİTA** Her sorgunun haritaya düşen izi.

## Puan: az veri kullanan kazanır

1.000 puanla başlarsınız. Her sorgu kendi bedelini bu puandan düşer. Kişiyi bulduğunuzda
elinizde kalan puan, o turun puanıdır.

Yani oyun "ne kadar çok veri toplarsam o kadar iyi" oyunu değil. Tam tersi. Her şeyi
sorgularsanız kişiyi kesin bulursunuz ama puanınız sıfıra yakın olur. İyi oyuncu, iki üç
kayda bakıp gerisini kafasından çıkaran oyuncudur.

Sorgu bedelleri dört kademeye ayrılır:

| Kademe | Ne tür veri | Bedel |
| --- | --- | --- |
| 1 | Açık ve idari kayıt: nüfus, araç tescili, abonelik | 30 puan |
| 2 | Hizmet kayıtları: İstanbulkart, kargo, eczane, köprü geçişi, kamera arşivi | 60 puan |
| 3 | Mahrem veri: baz istasyonu, banka hareketleri, ev interneti | 120 puan |
| 4 | Ağır döküm: 14 günlük tam baz kaydı, tam banka dökümü, ilçe geneli kamera taraması | 200 puan |

Kademe yükseldikçe veri hem pahalanır hem mahremleşir. Bu kasıtlı: ucuz veri az şey söyler,
pahalı veri çok şey söyler ve oyunun anlatmak istediği de tam olarak budur.

**Aynı sorguyu tekrar açmak bedava.** Bir sorgunun sonucuna sonra tekrar bakarsanız puan
düşmez. Ama sorgunun ayrıntısını değiştirirseniz, örneğin başka bir kameraya veya başka bir
güne bakarsanız, bu yeni bir sorgudur ve tam bedeli alınır.

## Zaman: her şey "şu ana" göre

Dosya ekranının üstünde şöyle bir satır durur: **ŞU AN: 14. gün, saat 18:23.**

14. gün bugündür, yani kişinin aranmakta olduğu an. 1. gün iki hafta öncesidir. Bütün kayıtlar
bu ana göre yazılır: "bugün 07:40", "dün 18:15", "6 gün önce 12:30".

Bu ayrım önemlidir. Kişinin 9. günde gittiği market size alışkanlığını söyler. Bugün öğleden
sonra bıraktığı kayıt ise doğrudan yerini söyleyebilir. Eski kayıt örüntü, yeni kayıt konumdur.

Nüfus kaydı ve araç tescili gibi kayıtların tarihi yoktur, onlarda "sabit" yazar.

## Haritayı siz okursunuz

Her sorgu sonucu haritaya bir katman olarak düşer. Katmanın biçimi veri türüne göre değişir:

- **Nokta** bir yerde bulunduğunu gösterir: ATM, eczane, market.
- **Baz hücresi** geniş bir alandır. Telefonun o çevrede olduğunu söyler, tam yerini değil.
- **Kamera konisi** kameranın baktığı yöndür. İçine giren biri kaydedilmiştir.
- **Güzergâh** iki nokta arasındaki hareketi gösterir: otobüs durakları, köprü geçişi, taksi.
- **Adres** bir mahalleyi veya bir binayı işaret eder.

**Sistem sizin yerinize kesişim hesaplamaz.** İki katmanın çakıştığı yeri kendiniz görürsünüz.
Bunun için katmanları tek tek açıp kapatabilir, haritaya raptiye koyabilir, elediğiniz bölgeleri
daire içine alabilir ve not defterine yazabilirsiniz. Bunların hiçbiri puandan düşmez.

Haritadaki her noktaya dokunursanız künyesi açılır: adı, ne olduğu, hangi ilçe ve mahallede
olduğu, o noktada kamera bulunup bulunmadığı.

## Tahmin: iki hakkınız var

Bir yerden emin olduğunuzda haritada o noktaya basılı tutun. Onay ekranı çıkar.

- **150 metre** yarıçap içindeyseniz doğru sayılır ve kalan puanınızı alırsınız.
- Yanlışsa **250 puan** ceza alırsınız ve tur devam eder.
- **İkinci yanlışta** tur kapanır, puanınız sıfırdır.

Yani acele bir tahmin, iki sorgudan pahalıdır. Emin değilseniz bir sorgu daha yapmak genelde
daha ucuzdur.

## Par: en verimli çözüm

Her dosyanın bir **par** değeri vardır. Par, o dosyayı kesin kanıtlarla çözmenin en ucuz
yoludur. Tur sonunda par ile sizin harcamanız karşılaştırılır.

Par yalnızca kesin kanıtları sayar. Davranış çıkarımını saymaz. Bu yüzden par'ın altına
inebilirsiniz: kişinin her sabah aynı duraktan bindiğini fark ederseniz, sistemin kanıt saydığı
pahalı sorguyu yapmadan doğru yeri bulabilirsiniz. Par'ı geçmek oyunun asıl ustalığıdır.

## Zorluk

**Kolay** Kalan aday sayısı ekranda görünür. Kişi evindedir.
**Standart** Aday sayısı görünmez. Kişi işinde veya sık gittiği üçüncü bir yerdedir.
**Uzman** Kademe 4 sorguları kapalıdır. Kişi rutini dışında bir yerdedir.

## Dosya numarası

Her dosyanın bir numarası vardır ve aynı numara her zaman aynı dosyayı verir. Numarayı
kopyalayıp bir arkadaşınıza yollarsanız o da tam olarak aynı kişiyi, aynı kayıtlarla arar.
Kimin daha az veriyle bulduğunu karşılaştırabilirsiniz.

## Son bir şey

Bu oyundaki kişiler, kurumlar, kameralar ve kayıtların tamamı kurgusaldır. Gerçek bir kurum
adı, gerçek bir marka adı veya gerçek bir kamera konumu kullanılmaz.

Ama mekanizma kurgusal değildir. Bir insanın iki haftada kaç yerde iz bıraktığını, tur sonunda
göreceksiniz.

---

# Kafa karıştırıcı bulduğum kurallar

Aşağıdakiler oyunu yazarken veya anlatırken takıldığım noktalar. Aşama 4 kalibrasyonunda
bakılması gereken yerler bunlar.

**1. "Boş sonuç da bilgidir" kuralı sezgiye aykırı.** Bir sorgu kayıt döndürmediğinde de tam
bedel alınıyor. Mantığı doğru (kişinin o kaydı bırakmadığını öğrenmek bir bilgidir) ama oyuncu
ilk defa karşılaştığında kandırılmış hissediyor. Arayüzde bunun özellikle vurgulanması gerekir.

**2. Par'ın ne olduğu tek cümleyle anlaşılmıyor.** "Kesin kanıtlarla en ucuz çözüm" tanımı
soyut. Oyuncu tur sonunda par yolunu görüyor ama neden o yolun seçildiğini anlamıyor. Öneri:
tur sonunda par yolunun her adımının yanına "bu sorgu aday sayısını 1.500'den 53'e indiriyordu"
gibi bir cümle konması. Kısmen var, açıklaması yok.

**3. Dar ve geniş varyant ayrımı listede kayboluyor.** "Baz istasyonu son kayıt" 120 puan,
"14 günlük tam baz dökümü" 200 puan. İkisi ayrı satırda duruyor ve yeni oyuncu bunların aynı
kaynağın iki farklı derinliği olduğunu fark etmiyor. Öneri: bu ikisinin tek satırda, iki
düğmeli gösterilmesi.

**4. Tekrar sorgu ücretsizliği ile parametre değişikliği arasındaki fark.** Aynı kameraya aynı
gün için ikinci kez bakmak bedava, ama günü değiştirmek 60 puan. Kural tutarlı ama oyuncu
"kamera sorgusunu zaten almıştım" diye düşünüp beklemediği bir ücret görüyor. Şu an pencerede
canlı gösteriliyor, yine de ilk turda şaşırtıyor.

**5. Kolay moddaki aday sayacı ne olduğunu söylemiyor.** Üst şeritte "ADAY 53" yazıyor. Bunun
"yaptığınız sorguların kesin kanıtlarına göre kalan nokta sayısı" olduğu hiçbir yerde
yazmıyor. Oyuncu bunu "53 kişi var" sanabilir.

**6. Şu anki zamanın 14. gün olması ile kayıtların 14 güne yayılması karışıyor.** Hem pencere
14 gün, hem bugün 14. gün. Kayıt "14. gün 08:00" derken bu sabahı kastediyor ama oyuncu iki
hafta önceyi anlayabiliyor. Göreli zaman gösterimi bunu büyük ölçüde çözdü, yine de iki
sayının aynı olması talihsiz.

**7. Yanlış tahmin cezasının büyüklüğü ilk turda anlaşılmıyor.** 250 puan, iki kademe 3
sorgusuna bedel. Oyuncu ilk turunda genelde erken tahmin ediyor ve turun yarısını kaybediyor.
Tahmin onay ekranında ceza yazıyor ama "bu iki sorgu demek" karşılaştırması yok.

**8. Üçüncü nokta kavramının adı yok.** Oyuncu "ev" ve "iş" dışında bir yerin de rutin olduğunu
ancak kayıtlara bakarak anlıyor. Zorluk açıklamasında "sık gittiği üçüncü bir yer" deniyor ama
bu oyun içinde hiçbir yerde tanımlanmıyor.
