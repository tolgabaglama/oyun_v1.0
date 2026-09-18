# Lisanslar ve Atıflar

Bu dosya projede kullanılan her dış kaynağın lisansını ve zorunlu atıf metnini tutar. Yeni bir kaynak eklendiğinde buraya da satır eklenir. Son güncelleme: 19 Eylül 2026.

## Veri

| Kaynak | Kullanım | Lisans | Atıf metni |
| --- | --- | --- | --- |
| OpenStreetMap (Overpass API ile) | POI noktaları (market, eczane, ATM, döviz, benzinlik, kargo, cami, kahvehane, spor salonu, otopark), okullar, meydanlar, trafik ışıkları, ana yollar, ilçe ve mahalle sınırları. data/raw altındaki osm_* dosyaları | ODbL 1.0 | © OpenStreetMap katkıcıları |
| İBB Açık Veri Portalı, Raylı Sistem İstasyon Noktaları Verisi | Mevcut raylı sistem istasyonları. data/raw/ibb_rayli_sistem_istasyonlari.geojson | İBB Açık Veri Lisansı | Kaynak: İstanbul Büyükşehir Belediyesi Açık Veri Portalı |
| İBB Açık Veri Portalı, İSPARK Otopark Bilgileri | İSPARK otopark noktaları. data/raw/ibb_ispark_otoparklari.csv | İBB Açık Veri Lisansı | Kaynak: İstanbul Büyükşehir Belediyesi Açık Veri Portalı |
| İBB Açık Veri Portalı, İETT GTFS Verisi (stops) | Otobüs durakları. data/raw/ibb_iett_gtfs_stops.csv | İBB Açık Veri Lisansı | Kaynak: İstanbul Büyükşehir Belediyesi Açık Veri Portalı |

Lisans metinleri:
* ODbL 1.0: https://opendatacommons.org/licenses/odbl/1-0/
* İBB Açık Veri Lisansı: https://data.ibb.gov.tr/license (kopyalama, uyarlama, ticari kullanım serbest; kaynağın gösterilmesi ve mümkünse lisansa bağlantı zorunlu).

ODbL gereği: OSM'den türetilen veriler (data/raw ve data/processed altındaki OSM kökenli dosyalar) dağıtılırsa aynı lisansla paylaşılır ve OpenStreetMap atfı korunur. Oyun içinde harita ve veri katmanlarının göründüğü her ekranda atıf yazısı bulunur.

### Türetilmiş ve kurgusal veriler (data/processed)

| Dosya | Türetildiği kaynak | Not |
| --- | --- | --- |
| poi_istanbul.geojson | OSM ve İBB İSPARK | Süzülmüş ve seyreltilmiş, ODbL ve İBB atıfları geçerli |
| istasyonlar_istanbul.geojson, duraklar_istanbul.geojson | İBB | Seyreltilmiş, İBB atfı geçerli |
| ilceler_istanbul.geojson, mahalleler_istanbul.geojson | OSM idari sınırları | Sadeleştirilmiş, ODbL geçerli |
| kameralar_istanbul.geojson, kamera_konileri_istanbul.geojson | OSM yol, okul, meydan ve İBB durak verisinden kurallı üretildi | Kurgusal. Gerçek kamera konumu içermez ve hiçbir gerçek kamera verisi kullanılmadı |
| baz_hucreleri_istanbul.geojson, baz_istasyonlari_istanbul.geojson | OSM ve İBB nokta yoğunluğundan üretildi | Kurgusal. Gerçek operatör verisi içermez |

## Harita altlığı

| Kaynak | Kullanım | Lisans | Atıf metni |
| --- | --- | --- | --- |
| OpenFreeMap (positron stili) | Tarayıcı prototipinde harita karoları | Karolar: OSM verisi, ODbL. Stil: BSD 3 (CARTO positron temelli) | © OpenFreeMap, © OpenMapTiles, © OpenStreetMap katkıcıları |

Not: Protomaps PMTiles çevrimdışı kesitine geçildiğinde bu tabloya eklenir.

## Yazılım kütüphaneleri

Oyunla birlikte dağıtılanlar:

| Kütüphane | Lisans | Kullanım |
| --- | --- | --- |
| MapLibre GL JS | BSD 3 | Harita görüntüleme |

Yalnızca geliştirme ve veri üretiminde kullanılanlar (oyuna dahil edilmez):

| Kütüphane | Lisans | Kullanım |
| --- | --- | --- |
| Vite | MIT | Geliştirme sunucusu ve paketleme |
| TypeScript | Apache 2.0 | Tip denetimi |
| osmtogeojson | MIT | Overpass sınır verisini GeoJSON çokgene çevirme |
| d3-delaunay | ISC | Baz hücreleri için Voronoi |
| polygon-clipping | MIT | Baz hücrelerini il sınırına kırpma |

## Henüz kullanılmayan, planlanan kaynaklar

Protomaps PMTiles, Google Fonts, Lucide ikonlar, Freesound ve Pixabay sesleri. Kullanıma girdiklerinde lisans ve atıf satırları eklenir.
