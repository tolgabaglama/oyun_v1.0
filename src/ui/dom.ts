// Küçük DOM yardımcıları. Çerçeve kullanılmaz; ekranlar bu iki fonksiyonla kurulur.

type Ozellikler = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;
type Cocuk = Node | string | null | undefined | false;

/** Etiket, öznitelikler ve çocuklarla öge kurar. "on" ile başlayan öznitelikler olay dinleyicisidir. */
export function el<K extends keyof HTMLElementTagNameMap>(etiket: K, ozellikler: Ozellikler = {}, ...cocuklar: Cocuk[]): HTMLElementTagNameMap[K] {
  const d = document.createElement(etiket);
  for (const [ad, deger] of Object.entries(ozellikler)) {
    if (deger === undefined || deger === false) continue;
    if (ad.startsWith("on") && typeof deger === "function") d.addEventListener(ad.slice(2), deger as EventListener);
    else if (ad === "sinif") d.className = String(deger);
    else if (deger === true) d.setAttribute(ad, "");
    else d.setAttribute(ad, String(deger));
  }
  for (const c of cocuklar) {
    if (c === null || c === undefined || c === false) continue;
    d.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return d;
}

export function temizle(kok: HTMLElement, ...cocuklar: Cocuk[]): void {
  kok.replaceChildren();
  for (const c of cocuklar) if (c) kok.append(typeof c === "string" ? document.createTextNode(c) : c);
}
