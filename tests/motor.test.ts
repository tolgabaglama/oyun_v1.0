import { describe, it, expect, beforeAll } from "vitest";
import { veriYukleNode, katalogYukleNode } from "../src/engine/data-node.ts";
import { davaUret, UretimReddi, bagVar } from "../src/engine/generator.ts";
import { davaKur, parHesapla, kisitHesapla, kisitlariUygula, tekNoktaMi, dogrulayiciHesapla, OracleReddi, DOGRU_YARICAP_M } from "../src/engine/oracle.ts";
import { davaDogrula, zamanDakika, type Dava, type SensorKatalogu, type Zorluk } from "../src/engine/schema.ts";
import type { Veri } from "../src/engine/data.ts";
import { sorgula, kullanilabilirSensorler, SorguHatasi } from "../src/engine/query.ts";
import { turBaslat, sorguYap, tahminYap, turOzeti, TAVAN_PUAN, YANLIS_CEZASI } from "../src/engine/scoring.ts";
import { mesafeM } from "../src/engine/geo.ts";

let veri: Veri;
let katalog: SensorKatalogu;
/** Kabul edilmiş örnek davalar, testler arasında paylaşılır. */
const ornekler: Dava[] = [];

beforeAll(() => {
  veri = veriYukleNode();
  katalog = katalogYukleNode();
  const zorluklar: Zorluk[] = ["kolay", "standart", "uzman"];
  for (let seed = 1; ornekler.length < 30 && seed < 400; seed++) {
    try {
      ornekler.push(davaKur(seed, zorluklar[seed % 3], veri, katalog));
    } catch (e) {
      if (!(e instanceof UretimReddi || e instanceof OracleReddi)) throw e;
    }
  }
  expect(ornekler.length).toBe(30);
});

describe("determinizm", () => {
  it("aynı seed aynı davayı üretir", () => {
    const a = davaUret(123, "standart", veri, katalog);
    const b = davaUret(123, "standart", veri, katalog);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("aynı seed aynı par yolunu verir", () => {
    const a = davaKur(1, "kolay", veri, katalog);
    const b = davaKur(1, "kolay", veri, katalog);
    expect(a.par).toEqual(b.par);
  });

  it("farklı seed farklı dava üretir", () => {
    const a = davaUret(1, "standart", veri, katalog);
    const b = davaUret(2, "standart", veri, katalog);
    expect(a.gercek.ev.poi_id === b.gercek.ev.poi_id && a.gercek.is.poi_id === b.gercek.is.poi_id).toBe(false);
  });

  it("farklı zorluk farklı dava üretir", () => {
    const a = davaUret(5, "kolay", veri, katalog);
    const b = davaUret(5, "uzman", veri, katalog);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

describe("şema", () => {
  it("üretilen davalar şema denetiminden geçer", () => {
    for (const d of ornekler) expect(davaDogrula(d, katalog)).toEqual([]);
  });

  it("her kayıt ya bir olaya bağlıdır ya gürültü etiketlidir", () => {
    for (const d of ornekler) {
      const olayIdler = new Set(d.olaylar.map((o) => o.id));
      for (const k of d.kayitlar) {
        const bagli = k.olay_id !== null;
        const gurultulu = k.gurultu !== null;
        expect(bagli !== gurultulu).toBe(true);
        if (bagli) expect(olayIdler.has(k.olay_id!)).toBe(true);
        if (gurultulu) expect(katalog.gurultu_tipleri[k.gurultu!]).toBeDefined();
      }
    }
  });

  it("her kayıt katalogdaki bir sensöre aittir ve alanları eksiksizdir", () => {
    const sensorler = new Map(katalog.sensorler.map((s) => [s.id, s]));
    for (const d of ornekler) {
      for (const k of d.kayitlar) {
        const s = sensorler.get(k.sensor_id);
        expect(s).toBeDefined();
        for (const alan of s!.alanlar) expect(Object.hasOwn(k.alanlar, alan)).toBe(true);
      }
    }
  });

  it("olay ve kayıt zamanları 14 günlük pencere içindedir ve şu anı aşmaz", () => {
    for (const d of ornekler) {
      const suAn = zamanDakika(d.gercek.su_anki_zaman);
      for (const o of d.olaylar) {
        expect(o.zaman.gun).toBeGreaterThanOrEqual(1);
        expect(zamanDakika(o.zaman)).toBeLessThanOrEqual(suAn);
        if (o.bitis) expect(zamanDakika(o.bitis)).toBeLessThanOrEqual(suAn);
      }
      for (const k of d.kayitlar) {
        expect(k.zaman.gun).toBeGreaterThanOrEqual(1);
        expect(k.zaman.gun).toBeLessThanOrEqual(14);
      }
    }
  });
});

describe("gerçekle tutarlılık", () => {
  it("gürültü dışı hiçbir kayıt gizli gerçekle çelişmez", () => {
    for (const d of ornekler) {
      const olaylar = new Map(d.olaylar.map((o) => [o.id, o]));
      for (const k of d.kayitlar) {
        if (k.gurultu !== null) continue;
        const o = olaylar.get(k.olay_id!)!;
        // Kaydın işaret ettiği POI, türediği olayın yeriyle veya yolculuğun uçlarıyla aynı olmalı.
        // Taksi gibi iki uçlu olaylarda hangi ucun varış olduğu kayda yazılmaz, ikisi de geçerlidir.
        if (k.geometri?.tip === "poi") {
          const beklenen = o.yolculuk
            ? [o.yolculuk.nereden_poi_id, o.yolculuk.nereye_poi_id]
            : [o.yer_poi_id];
          expect(beklenen).toContain(k.geometri.id);
        }
        // Telefon gerektiren sensörler yalnızca telefon açıkken kayıt bırakır.
        const s = katalog.sensorler.find((x) => x.id === k.sensor_id)!;
        if (s.telefon_gerekir) expect(o.telefon_acik).toBe(true);
        if (s.odeme_gerekir) expect(o.odeme).toBe(s.odeme_gerekir);
      }
    }
  });

  it("taksi kaydının iki ucu da hedefin gerçek yerlerinden biridir", () => {
    for (const d of ornekler) {
      const olaylar = new Map(d.olaylar.map((o) => [o.id, o]));
      for (const k of d.kayitlar.filter((x) => x.sensor_id === "taksi" && x.gurultu === null)) {
        const o = olaylar.get(k.olay_id!)!;
        const uclar = [String(k.alanlar.uc_poi_1), String(k.alanlar.uc_poi_2)].sort();
        const gercek = [o.yolculuk!.nereden_poi_id, o.yolculuk!.nereye_poi_id].sort();
        expect(uclar).toEqual(gercek);
      }
    }
  });

  it("nakit disiplininde POS kaydı oluşmaz", () => {
    for (const d of ornekler) {
      if (d.gercek.odeme !== "hep_nakit") continue;
      expect(d.kayitlar.filter((k) => k.sensor_id === "pos")).toHaveLength(0);
    }
  });

  it("spor salonu üyeliği olmayan hedefte turnike kaydı oluşmaz", () => {
    for (const d of ornekler) {
      if (d.gercek.spor_salonu_uyesi) continue;
      const turnike = d.kayitlar.filter((k) => k.sensor_id === "spor_turnike");
      for (const k of turnike) {
        const poi = veri.poiMap.get(String(k.alanlar.poi_id))!;
        expect(poi.kategori).toBe("spor_salonu");
      }
    }
  });

  it("özel kamera kaydı yalnızca kapsamdaki kategorilerde oluşur", () => {
    const sensor = katalog.sensorler.find((s) => s.id === "ozel_kamera_genis")!;
    for (const d of ornekler) {
      for (const k of d.kayitlar.filter((x) => x.sensor_id === sensor.id)) {
        const poi = veri.poiMap.get(String(k.alanlar.poi_id))!;
        expect(sensor.kapsama!.oranlar[poi.kategori] ?? sensor.kapsama!.varsayilan).toBeGreaterThan(0);
      }
    }
  });

  it("saklama süresi dolmuş kamera kaydı konum bilgisi vermez", () => {
    for (const d of ornekler) {
      for (const k of d.kayitlar.filter((x) => x.gurultu === "saklama_suresi_doldu")) {
        expect(k.alanlar.eslesme).toBe("silinmiş");
        expect(k.geometri).toBeNull();
      }
    }
  });

  it("şu anki konumun geçmiş kayıtlarda en az bir bağı vardır", () => {
    for (const d of ornekler) expect(bagVar(d, veri)).toBe(true);
  });

  it("şu anki konum hedefin bilinen yerlerinden biridir", () => {
    for (const d of ornekler) {
      const roller = { ev: d.gercek.ev, is: d.gercek.is, ucuncu: d.gercek.ucuncu };
      const rol = d.gercek.su_anki_konum.rol;
      if (rol === "rutin_disi") expect(d.zorluk).toBe("uzman");
      else expect(d.gercek.su_anki_konum.poi_id).toBe(roller[rol as keyof typeof roller].poi_id);
    }
  });
});

describe("oracle", () => {
  it("par yolunu uygulayınca tek adaya iner", () => {
    for (const d of ornekler) {
      const sensorler = d.par.yol.map((adim) => katalog.sensorler.find((x) => x.id === adim.sensor_id)!);
      const kisitlar = sensorler
        .filter((s) => s.sert_kisit!.tip !== "dogrulayici")
        .map((s) => kisitHesapla(d, veri, s, true)!);
      expect(kisitlar.every(Boolean)).toBe(true);
      // Çevre çıkarımı kullanıldıysa par adımı bunu parametresinde taşır.
      const cevre = Number(d.par.yol.find((a) => a.parametreler?.cevre_m)?.parametreler?.cevre_m ?? 0);
      const adaylar = kisitlariUygula(veri, kisitlar, cevre);
      expect(adaylar.has(d.gercek.su_anki_konum.poi_id)).toBe(true);
      const dogrulayici = sensorler.filter((s) => s.sert_kisit!.tip === "dogrulayici");
      if (!dogrulayici.length) {
        expect(cevre).toBe(0);
        expect(tekNoktaMi(veri, adaylar)).toBe(true);
      } else {
        // Doğrulayıcı adımlar kalan adayları tek tek eler; kısıtlar sonrası aday sayısı sınırlı olmalı.
        expect(adaylar.size).toBeLessThanOrEqual(10);
        const d2 = dogrulayiciHesapla(d, veri, dogrulayici[0])!;
        expect(d2.gercekte_eslesme).toBe(true);
        expect(d.par.yol.filter((a) => a.sensor_id === dogrulayici[0].id).length).toBe(Math.max(1, adaylar.size - 1));
      }
    }
  });

  it("par yolunun son adımında kalan aday 1'dir ve maliyetler toplamı par değeridir", () => {
    for (const d of ornekler) {
      expect(d.par.yol.at(-1)!.kalan_aday).toBe(1);
      expect(d.par.yol.reduce((s, a) => s + a.maliyet, 0)).toBe(d.par.deger);
    }
  });

  it("kabul edilen davada par tek sorgudan büyüktür", () => {
    for (const d of ornekler) {
      expect(d.par.yol.length).toBeGreaterThanOrEqual(2);
      const enPahali = Math.max(...d.par.yol.map((a) => a.maliyet));
      expect(d.par.deger).toBeGreaterThan(enPahali);
    }
  });

  it("doğrulayıcı sensör tek başına kısıt üretmez", () => {
    for (const d of ornekler.slice(0, 10)) {
      for (const s of katalog.sensorler.filter((x) => x.sert_kisit?.tip === "dogrulayici")) {
        expect(kisitHesapla(d, veri, s, true)).toBeNull();
      }
    }
  });

  it("par yolunda en az bir konumlayıcı kısıt vardır", () => {
    const konumlayici = new Set(["hucre", "yaricap", "yaka"]);
    for (const d of ornekler) {
      const tipler = d.par.yol.map((a) => katalog.sensorler.find((x) => x.id === a.sensor_id)!.sert_kisit!.tip);
      expect(tipler.some((t) => konumlayici.has(t))).toBe(true);
    }
  });

  it("par yolundaki her sensör o zorlukta kullanılabilir", () => {
    for (const d of ornekler) {
      const acik = new Set(kullanilabilirSensorler(katalog, d.zorluk).map((s) => s.id));
      for (const adim of d.par.yol) expect(acik.has(adim.sensor_id)).toBe(true);
    }
  });

  it("hiçbir konumlayıcı kısıt gerçek konumu dışlamaz", () => {
    for (const d of ornekler) {
      for (const s of katalog.sensorler) {
        const k = kisitHesapla(d, veri, s, true);
        if (k?.konumlayici) expect(k.adaylar.has(d.gercek.su_anki_konum.poi_id)).toBe(true);
      }
    }
  });

  it("tek sorguyla çözülen dava reddedilir", () => {
    // Yapay dava: baz hücresinde tek POI kalacak biçimde kısıtı daraltamayız,
    // bu yüzden oracle'ın tek_sorgu kontrolünü doğrudan çağırarak sınarız.
    const d = ornekler[0];
    const sahte: Dava = structuredClone(d);
    // Tüm daraltıcı kayıtları tek bir POI'ye indirgersek, o sensör tek başına çözer.
    const hedef = sahte.gercek.su_anki_konum.poi_id;
    sahte.kayitlar = sahte.kayitlar.filter((k) => k.sensor_id === "eczane");
    for (const k of sahte.kayitlar) { k.gurultu = null; k.olay_id = sahte.olaylar[0].id; k.geometri = { tip: "poi", id: hedef }; k.alanlar.poi_id = hedef; }
    if (sahte.kayitlar.length) {
      expect(() => parHesapla(sahte, veri, katalog)).toThrow(OracleReddi);
    }
  });
});

describe("sorgu motoru", () => {
  it("oyuncuya gizli alanları sızdırmaz", () => {
    const d = ornekler[0];
    for (const s of kullanilabilirSensorler(katalog, d.zorluk)) {
      if (s.parametreler.length) continue;
      const r = sorgula(d, veri, katalog, s.id);
      for (const k of r.kayitlar) {
        expect(Object.hasOwn(k, "olay_id")).toBe(false);
        expect(Object.hasOwn(k, "gurultu")).toBe(false);
      }
    }
  });

  it("uzman zorlukta kademe 4 sensörler kapalıdır", () => {
    const uzman = ornekler.find((d) => d.zorluk === "uzman")!;
    for (const s of katalog.sensorler.filter((x) => x.kademe === 4)) {
      expect(() => sorgula(uzman, veri, katalog, s.id, { ilce: "Fatih" })).toThrow(SorguHatasi);
    }
  });

  it("zorunlu parametre eksikse hata verir", () => {
    expect(() => sorgula(ornekler[0], veri, katalog, "kamera_tekil")).toThrow(SorguHatasi);
  });

  it("her sensör geçerli GeoJSON katmanı döndürür", () => {
    const gecerli = new Set(["Point", "LineString", "Polygon", "MultiPolygon"]);
    for (const d of ornekler.slice(0, 5)) {
      for (const s of kullanilabilirSensorler(katalog, d.zorluk)) {
        if (s.parametreler.length) continue;
        const r = sorgula(d, veri, katalog, s.id);
        expect(r.katman.type).toBe("FeatureCollection");
        for (const f of r.katman.features) {
          expect(gecerli.has(f.geometry.type)).toBe(true);
          expect(Array.isArray(f.geometry.coordinates)).toBe(true);
        }
      }
    }
  });
});

describe("puanlama", () => {
  it("par yolu oynandığında puan tavandan par kadar düşer", () => {
    const d = ornekler[0];
    let durum = turBaslat(d);
    for (const adim of d.par.yol) durum = sorguYap(durum, veri, katalog, adim.sensor_id, adim.parametreler ?? {}).durum;
    expect(durum.puan).toBe(TAVAN_PUAN - d.par.deger);
  });

  it("aynı sorgunun tekrarı ücretsizdir", () => {
    const d = ornekler[0];
    let durum = turBaslat(d);
    durum = sorguYap(durum, veri, katalog, "nufus_kaydi").durum;
    const once = durum.puan;
    durum = sorguYap(durum, veri, katalog, "nufus_kaydi").durum;
    expect(durum.puan).toBe(once);
  });

  it("150 metre içi doğru, dışı yanlıştır", () => {
    const d = ornekler[0];
    const g = d.gercek.su_anki_konum.konum;
    const yakin = tahminYap(turBaslat(d), [g[0], g[1] + 0.0009]);
    expect(yakin.tahmin.mesafe_m).toBeLessThanOrEqual(DOGRU_YARICAP_M);
    expect(yakin.tahmin.dogru).toBe(true);
    const uzak = tahminYap(turBaslat(d), [g[0], g[1] + 0.01]);
    expect(uzak.tahmin.dogru).toBe(false);
    expect(mesafeM(uzak.tahmin.konum, g)).toBeGreaterThan(DOGRU_YARICAP_M);
  });

  it("yanlış tahmin 250 ceza, ikinci yanlış turu bitirir", () => {
    const d = ornekler[0];
    const g = d.gercek.su_anki_konum.konum;
    let durum = turBaslat(d);
    durum = tahminYap(durum, [g[0] + 0.02, g[1]]).durum;
    expect(durum.puan).toBe(TAVAN_PUAN - YANLIS_CEZASI);
    expect(durum.sonuc).toBe("devam");
    durum = tahminYap(durum, [g[0] + 0.03, g[1]]).durum;
    expect(durum.sonuc).toBe("kaybetti");
    expect(() => tahminYap(durum, g)).toThrow();
  });

  it("tur sonu özeti kayıt sayılarını doğru raporlar", () => {
    const d = ornekler[0];
    let durum = turBaslat(d);
    for (const adim of d.par.yol) durum = sorguYap(durum, veri, katalog, adim.sensor_id, adim.parametreler ?? {}).durum;
    const g = d.gercek.su_anki_konum.konum;
    durum = tahminYap(durum, g).durum;
    const ozet = turOzeti(durum, katalog);
    expect(ozet.sonuc).toBe("dogru");
    expect(ozet.toplam_kayit).toBe(d.kayitlar.length);
    expect(ozet.kullanilan_kayit).toBeGreaterThan(0);
    expect(ozet.kullanilan_kayit).toBeLessThanOrEqual(ozet.toplam_kayit);
    expect(ozet.kaynaga_gore.reduce((s, x) => s + x.toplam, 0)).toBe(d.kayitlar.length);
    expect(ozet.cumle).toContain(String(d.ozet.toplam_kayit));
  });
});
