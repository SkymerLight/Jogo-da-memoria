const detectarTabuleiro = (() => {
  const LARGURA_ANALISE = 1400;
  const PROPORCAO_CARTA = 223 / 348;

  function componentes(mascara, W, H) {
    const rotulos = new Int32Array(W * H);
    const pai = [0];
    const raiz = (a) => {
      while (pai[a] !== a) {
        pai[a] = pai[pai[a]];
        a = pai[a];
      }
      return a;
    };
    const unir = (a, b) => {
      a = raiz(a);
      b = raiz(b);
      if (a !== b) pai[Math.max(a, b)] = Math.min(a, b);
      return Math.min(a, b);
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!mascara[i]) continue;
        let r = 0;
        const vizinhos = [
          x > 0 ? rotulos[i - 1] : 0,
          y > 0 ? rotulos[i - W] : 0,
          x > 0 && y > 0 ? rotulos[i - W - 1] : 0,
          x < W - 1 && y > 0 ? rotulos[i - W + 1] : 0,
        ];
        vizinhos.forEach((v) => {
          if (!v) return;
          r = r ? unir(r, v) : v;
        });
        if (!r) {
          pai.push(pai.length);
          r = pai.length - 1;
        }
        rotulos[i] = r;
      }
    }
    const caixas = new Map();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const r0 = rotulos[y * W + x];
        if (!r0) continue;
        const r = raiz(r0);
        let c = caixas.get(r);
        if (!c) caixas.set(r, (c = { x0: x, y0: y, x1: x, y1: y }));
        if (x < c.x0) c.x0 = x;
        if (x > c.x1) c.x1 = x;
        if (y < c.y0) c.y0 = y;
        if (y > c.y1) c.y1 = y;
      }
    }
    return [...caixas.values()].map((c) => ({ x: c.x0, y: c.y0, w: c.x1 - c.x0 + 1, h: c.y1 - c.y0 + 1 }));
  }

  function agrupar(valores, tolerancia) {
    const ordenados = [...valores].sort((a, b) => a - b);
    const grupos = [];
    ordenados.forEach((v) => {
      const g = grupos[grupos.length - 1];
      if (g && v - g[g.length - 1] <= tolerancia) g.push(v);
      else grupos.push([v]);
    });
    return grupos.map((g) => g.reduce((s, v) => s + v, 0) / g.length);
  }

  function mediana(v) {
    const o = [...v].sort((a, b) => a - b);
    return o[Math.floor(o.length / 2)];
  }

  function tentar(mascara, W, H) {
    const candidatas = componentes(mascara, W, H).filter((c) => {
      const prop = c.w / c.h;
      return c.h >= H * 0.06 && c.h <= H * 0.45 && prop >= PROPORCAO_CARTA * 0.85 && prop <= PROPORCAO_CARTA * 1.18;
    });
    let melhor = [];
    candidatas.forEach((c) => {
      const iguais = candidatas.filter((o) => Math.abs(o.w - c.w) <= c.w * 0.06 && Math.abs(o.h - c.h) <= c.h * 0.06);
      if (iguais.length > melhor.length || (iguais.length === melhor.length && c.w * c.h > melhor[0].w * melhor[0].h)) melhor = iguais;
    });
    if (melhor.length < 6) return null;
    const w = mediana(melhor.map((c) => c.w));
    const h = mediana(melhor.map((c) => c.h));
    const xs = agrupar(melhor.map((c) => c.x + c.w / 2), w * 0.4);
    const ys = agrupar(melhor.map((c) => c.y + c.h / 2), h * 0.4);
    if (xs.length < 2 || ys.length < 2 || xs.length * ys.length > 60) return null;
    if (melhor.length < xs.length * ys.length * 0.6) return null;
    return { xs, ys, w, h, encontradas: melhor.length };
  }

  return function (imagem) {
    const esc = Math.min(1, LARGURA_ANALISE / imagem.width);
    const W = Math.round(imagem.width * esc), H = Math.round(imagem.height * esc);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(imagem, 0, 0, W, H);
    const d = cx.getImageData(0, 0, W, H).data;
    const lum = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) lum[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    const grad = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        grad[i] = Math.max(Math.abs(lum[i + 1] - lum[i - 1]), Math.abs(lum[i + W] - lum[i - W]));
      }
    }

    let melhor = null;
    [10, 16, 24, 34].forEach((limiar) => {
      const mascara = new Uint8Array(W * H);
      for (let i = 0; i < grad.length; i++) mascara[i] = grad[i] > limiar ? 1 : 0;
      const r = tentar(mascara, W, H);
      if (!r) return;
      const cobertura = r.encontradas / (r.xs.length * r.ys.length);
      const nota = cobertura * 1000 + r.encontradas + r.h / 1000;
      if (!melhor || nota > melhor.nota) melhor = Object.assign(r, { nota });
    });
    if (!melhor) return null;

    const celulas = [];
    melhor.ys.forEach((cy) => {
      melhor.xs.forEach((cxv) => {
        celulas.push({
          x: (cxv - melhor.w / 2) / esc,
          y: (cy - melhor.h / 2) / esc,
          w: melhor.w / esc,
          h: melhor.h / esc,
        });
      });
    });
    return { colunas: melhor.xs.length, linhas: melhor.ys.length, celulas, encontradas: melhor.encontradas };
  };
})();
