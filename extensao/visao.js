const Visao = (() => {
  const LARG = 24, ALT = 36, DESLOC = 5;

  function assinatura(imagem, r) {
    const c = document.createElement('canvas');
    c.width = LARG;
    c.height = ALT;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(imagem, r.x, r.y, r.w, r.h, 0, 0, LARG, ALT);
    const d = cx.getImageData(0, 0, LARG, ALT).data;
    const cor = [];
    const lum = [];
    for (let i = 0; i < d.length; i += 4) {
      cor.push(d[i], d[i + 1], d[i + 2]);
      lum.push(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
    }
    const media = lum.reduce((s, v) => s + v, 0) / lum.length;
    const desvio = Math.sqrt(lum.reduce((s, v) => s + (v - media) ** 2, 0) / lum.length) || 1;
    const cinza = lum.map((v) => Math.round(((v - media) / desvio) * 40));
    return { cor, cinza };
  }

  function distancia(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
    return s / a.length;
  }

  function semelhanca(a, b) {
    let melhor = Infinity;
    for (let dy = -DESLOC; dy <= DESLOC; dy++) {
      for (let dx = -DESLOC; dx <= DESLOC; dx++) {
        let s = 0, n = 0;
        for (let y = DESLOC; y < ALT - DESLOC; y++) {
          for (let x = DESLOC; x < LARG - DESLOC; x++) {
            s += Math.abs(a[y * LARG + x] - b[(y + dy) * LARG + (x + dx)]);
            n++;
          }
        }
        if (s / n < melhor) melhor = s / n;
      }
    }
    return melhor;
  }

  function mediana(vetores) {
    const n = vetores[0].length;
    const m = new Array(n);
    for (let i = 0; i < n; i++) {
      const col = vetores.map((v) => v[i]).sort((x, y) => x - y);
      m[i] = col[Math.floor(col.length / 2)];
    }
    return m;
  }

  function recorte(imagem, r) {
    const c = document.createElement('canvas');
    const escala = Math.min(1, 140 / r.w);
    c.width = Math.round(r.w * escala);
    c.height = Math.round(r.h * escala);
    c.getContext('2d').drawImage(imagem, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  }

  function celulaInterna(c) {
    const mx = c.w * 0.12, my = c.h * 0.09;
    return { x: c.x + mx, y: c.y + my, w: c.w - 2 * mx, h: c.h - 2 * my };
  }

  return { assinatura, distancia, semelhanca, mediana, recorte, celulaInterna };
})();
