# İZ (çalışma adı)

Türkiye haritası üzerinde oynanan, tek oyunculu bir çıkarım bulmacası. Oyuncu bir siber
istihbarat görevlisi rolünde, kurgusal devlet verilerini sorgulayarak sabit duran bir hedefin
şu anki konumunu bulur. Puan, kullanılan verinin azlığından gelir.

**Oyna:** https://tolgabaglama.github.io/oyun_v1.0/

Geliştirme aşamasındadır, görsel cila henüz yapılmamıştır.

## Kurgusallık

Tüm kişiler, kurumlar, kameralar, baz istasyonları ve kayıtlar kurgusaldır. Gerçek kurum,
sistem veya marka adı kullanılmaz. Gerçek kamera konumu toplanmaz ve kullanılmaz.
Harita altlığı ve nokta verisi açık kaynaklıdır, ayrıntılar `LICENSES.md` içindedir.

## Geliştirme

```bash
npm install
npm run dev     # geliştirme sunucusu
npm test        # motor testleri
npm run build   # üretim derlemesi
```

Komut satırı araçları:

```bash
npm run case -- --seed 123 --zorluk standart   # tek dava üret ve yazdır
npm run batch -- 300                           # toplu üretim raporu
```

Proje kararları ve aşama planı `CLAUDE.md` dosyasındadır.
