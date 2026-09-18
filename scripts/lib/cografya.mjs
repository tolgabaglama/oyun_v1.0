// Betiklerin ortak coğrafya yardımcıları: mesafe, çokgen içi testi, sadeleştirme,
// yakın nokta birleştirme, ilçelere dengeli kota ve yayılmış seçim.
// Saf fonksiyonlardır, rastgelelik gereken yerlere çağıran betik kendi tohumlu üreticisini verir.

// ---- Yardımcılar -------------------------------------------------------------

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function karistir(dizi, rastgele) {
  const d = dizi.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rastgele() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// İstanbul enleminde yaklaşık metre dönüşümü.
export const M_PER_DEG_LAT = 111_320;
export const M_PER_DEG_LON = 111_320 * Math.cos((41.0 * Math.PI) / 180);
export function mesafeM(a, b) {
  const dx = (a[0] - b[0]) * M_PER_DEG_LON;
  const dy = (a[1] - b[1]) * M_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}


// ---- Nokta çokgen içinde mi (ışın yöntemi) ------------------------------------

export function halkaIcinde(nokta, halka) {
  const [x, y] = nokta;
  let icinde = false;
  for (let i = 0, j = halka.length - 1; i < halka.length; j = i++) {
    const [xi, yi] = halka[i];
    const [xj, yj] = halka[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) icinde = !icinde;
  }
  return icinde;
}

export function cokgenIcinde(nokta, cokgen) {
  if (!halkaIcinde(nokta, cokgen[0])) return false;
  for (let i = 1; i < cokgen.length; i++) if (halkaIcinde(nokta, cokgen[i])) return false;
  return true;
}

export function bbox(geom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const gez = (k) => { for (const [x, y] of k) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } };
  const cokgenler = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const c of cokgenler) for (const halka of c) gez(halka);
  return [minX, minY, maxX, maxY];
}

export function bolgeHazirla(fc) {
  return fc.features.map((f) => ({
    ad: f.properties.ad,
    geom: f.geometry,
    kutu: bbox(f.geometry),
    cokgenler: f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates,
  }));
}

export function bolgeBul(nokta, bolgeler) {
  const [x, y] = nokta;
  for (const b of bolgeler) {
    const [a, c, d, e] = b.kutu;
    if (x < a || x > d || y < c || y > e) continue;
    for (const cg of b.cokgenler) if (cokgenIcinde(nokta, cg)) return b.ad;
  }
  return null;
}

// ---- Çokgen sadeleştirme (Douglas Peucker), harita için ------------------------

function dikUzaklik(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const px = a[0] + t * dx, py = a[1] + t * dy;
  return Math.hypot(p[0] - px, p[1] - py);
}
function dp(noktalar, tol) {
  if (noktalar.length <= 2) return noktalar;
  let maxD = 0, idx = 0;
  for (let i = 1; i < noktalar.length - 1; i++) {
    const d = dikUzaklik(noktalar[i], noktalar[0], noktalar[noktalar.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > tol) return [...dp(noktalar.slice(0, idx + 1), tol).slice(0, -1), ...dp(noktalar.slice(idx), tol)];
  return [noktalar[0], noktalar[noktalar.length - 1]];
}
export function sadelestir(fc, tol) {
  return {
    ...fc,
    features: fc.features.map((f) => {
      const g = f.geometry;
      const halkaSadele = (h) => { const s = dp(h, tol); return s.length >= 4 ? s : h; };
      const geometry = g.type === "Polygon"
        ? { type: "Polygon", coordinates: g.coordinates.map(halkaSadele) }
        : { type: "MultiPolygon", coordinates: g.coordinates.map((c) => c.map(halkaSadele)) };
      return { type: "Feature", geometry, properties: f.properties };
    }),
  };
}

// ---- Aynı kategoride yakın noktaları birleştir --------------------------------

export function yakinlariBirlestir(noktalar, mesafe) {
  // Adı olanlar önce gelir, böylece birleşmede adlı nokta hayatta kalır.
  const sirali = noktalar.slice().sort((a, b) => (b.ad ? 1 : 0) - (a.ad ? 1 : 0));
  const hucre = mesafe / M_PER_DEG_LAT;
  const izgara = new Map();
  const anahtar = (k) => `${Math.floor(k[0] / hucre)}:${Math.floor(k[1] / hucre)}`;
  const kalan = [];
  for (const n of sirali) {
    const [cx, cy] = [Math.floor(n.k[0] / hucre), Math.floor(n.k[1] / hucre)];
    let yakinVar = false;
    dis: for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const komsular = izgara.get(`${cx + dx}:${cy + dy}`);
      if (!komsular) continue;
      for (const m of komsular) if (mesafeM(n.k, m.k) < mesafe) { yakinVar = true; break dis; }
    }
    if (yakinVar) continue;
    const a = anahtar(n.k);
    if (!izgara.has(a)) izgara.set(a, []);
    izgara.get(a).push(n);
    kalan.push(n);
  }
  return kalan;
}

// ---- İlçelere dengeli dağıt ve yayılmış seç ----------------------------------

export function ilceKotalari(gruplar, toplamKota, ilceAdlari, esitPayOrani = 0.4) {
  const N = [...gruplar.values()].reduce((s, g) => s + g.length, 0);
  const n = ilceAdlari.length;
  // Ham pay: eşit kısım + yoğunluk kısmı. Mevcut sayıyla sınırlanır.
  const ham = ilceAdlari.map((ad) => {
    const mevcut = gruplar.get(ad)?.length ?? 0;
    const pay = toplamKota * (esitPayOrani / n + (1 - esitPayOrani) * (mevcut / N));
    return { ad, mevcut, pay: Math.min(pay, mevcut) };
  });
  // Sınırdan artan kotayı, hâlâ yeri olan ilçelere yoğunlukla orantılı dağıt (birkaç tur).
  for (let tur = 0; tur < 5; tur++) {
    const dagitilan = ham.reduce((s, h) => s + h.pay, 0);
    let artan = toplamKota - dagitilan;
    if (artan < 0.5) break;
    const yeriOlan = ham.filter((h) => h.pay < h.mevcut);
    const agirlik = yeriOlan.reduce((s, h) => s + h.mevcut, 0);
    if (!agirlik) break;
    for (const h of yeriOlan) h.pay = Math.min(h.mevcut, h.pay + (artan * h.mevcut) / agirlik);
  }
  // En büyük kalan yöntemiyle tam sayıya yuvarla.
  const taban = ham.map((h) => ({ ...h, tam: Math.floor(h.pay), kalan: h.pay - Math.floor(h.pay) }));
  let eksik = toplamKota - taban.reduce((s, h) => s + h.tam, 0);
  taban.sort((a, b) => b.kalan - a.kalan);
  for (const h of taban) { if (eksik <= 0) break; if (h.tam < h.mevcut) { h.tam++; eksik--; } }
  return new Map(taban.map((h) => [h.ad, h.tam]));
}

export function yayilmisSec(adaylar, kota, ilceAlanM2, rastgele) {
  if (kota >= adaylar.length) return adaylar;
  // Hedef aralık: ilçe alanı kotaya bölünür, karekökünün yarısı asgari mesafe olur.
  const asgari = 0.5 * Math.sqrt(ilceAlanM2 / kota);
  const sira = karistir(adaylar, rastgele).sort((a, b) => (b.ad ? 1 : 0) - (a.ad ? 1 : 0));
  const secilen = [];
  const artan = [];
  for (const a of sira) {
    if (secilen.length >= kota) break;
    if (secilen.every((s) => mesafeM(s.k, a.k) >= asgari)) secilen.push(a); else artan.push(a);
  }
  for (const a of artan) { if (secilen.length >= kota) break; secilen.push(a); }
  return secilen;
}

export function cokgenAlanM2(cokgenler) {
  let alan = 0;
  for (const c of cokgenler) {
    const h = c[0];
    let s = 0;
    for (let i = 0, j = h.length - 1; i < h.length; j = i++) s += (h[j][0] * M_PER_DEG_LON) * (h[i][1] * M_PER_DEG_LAT) - (h[i][0] * M_PER_DEG_LON) * (h[j][1] * M_PER_DEG_LAT);
    alan += Math.abs(s) / 2;
  }
  return alan;
}

