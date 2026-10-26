(() => {
  const CHAVE = 'anotador-memoria';
  const LARG = 24, ALT = 36, DESLOC = 5;
  const LIMIAR_VERSO = 28;
  const LIMIAR_IGUAL = 30;
  const INTERVALO_AUTO = 550;
  const URL_MANIFESTO = 'https://raw.githubusercontent.com/SkymerLight/Jogo-da-memoria/main/extensao/manifest.json';
  const URL_REPO = 'https://github.com/SkymerLight/Jogo-da-memoria';
  const CORES = ['#3cff8f', '#ffd23c', '#3cc8ff', '#ff5ca8', '#b77bff', '#ff8a3c', '#7dffea', '#ff4d4d', '#a8ff3c', '#ffffff'];

  const $ = (s) => document.querySelector(s);
  const tela = $('#tela');
  const ctx = tela.getContext('2d', { willReadFrequently: true });

  let estado = carregar();
  let imagem = null;
  let marcando = false;
  let inicio = null;
  let selecaoTemp = null;
  let auto = false;
  let timerAuto = null;
  let capturando = false;
  let pendentes = {};
  let falhas = 0;

  function carregar() {
    try {
      const e = JSON.parse(localStorage.getItem(CHAVE));
      if (e) return e;
    } catch (e) {}
    return { grade: '5x4', modo: 'auto', area: null, celulas: null, tamanho: null, verso: null, cartas: {}, feitos: [] };
  }

  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) { status('Não consegui salvar (armazenamento cheio?)'); }
  }

  function dims() {
    const [c, l] = estado.grade.split('x').map(Number);
    return { colunas: c, linhas: l, total: c * l };
  }

  function status(t) { $('#status').textContent = t; }

  function aviso(html) {
    const a = $('#aviso');
    a.hidden = !html;
    a.innerHTML = html || '';
  }

  function modoAuto() {
    return estado.modo !== 'manual';
  }

  function temTabuleiro() {
    return modoAuto() ? Boolean(estado.celulas) : Boolean(estado.area);
  }

  function aplicarDeteccao() {
    const det = detectarTabuleiro(imagem);
    if (!det) {
      return Boolean(estado.celulas && estado.tamanho && estado.tamanho.w === imagem.width && estado.tamanho.h === imagem.height);
    }
    const grade = `${det.colunas}x${det.linhas}`;
    if (grade !== estado.grade) {
      estado.grade = grade;
      estado.cartas = {};
      estado.feitos = [];
      estado.verso = null;
      pendentes = {};
      render();
    }
    estado.celulas = det.celulas;
    estado.tamanho = { w: imagem.width, h: imagem.height };
    $('#selGrade').value = estado.grade;
    return true;
  }

  function retanguloCelula(i) {
    if (modoAuto() && estado.celulas) {
      const c = estado.celulas[i];
      const mx = c.w * 0.06, my = c.h * 0.05;
      return { x: c.x + mx, y: c.y + my, w: c.w - 2 * mx, h: c.h - 2 * my };
    }
    const { colunas, linhas } = dims();
    const a = estado.area;
    const w = a.w / colunas, h = a.h / linhas;
    const col = i % colunas, lin = Math.floor(i / colunas);
    const mx = w * 0.1, my = h * 0.08;
    return { x: a.x + col * w + mx, y: a.y + lin * h + my, w: w - 2 * mx, h: h - 2 * my };
  }

  function assinatura(r) {
    const c = document.createElement('canvas');
    c.width = LARG; c.height = ALT;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(imagem, r.x, r.y, r.w, r.h, 0, 0, LARG, ALT);
    const d = cx.getImageData(0, 0, LARG, ALT).data;
    const v = [];
    for (let i = 0; i < d.length; i += 4) v.push(d[i], d[i + 1], d[i + 2]);
    return v;
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
            const i = (y * LARG + x) * 3;
            const j = ((y + dy) * LARG + (x + dx)) * 3;
            s += Math.abs(a[i] - b[j]) + Math.abs(a[i + 1] - b[j + 1]) + Math.abs(a[i + 2] - b[j + 2]);
            n += 3;
          }
        }
        melhor = Math.min(melhor, s / n);
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

  function recorte(r) {
    const c = document.createElement('canvas');
    const escala = Math.min(1, 140 / r.w);
    c.width = Math.round(r.w * escala);
    c.height = Math.round(r.h * escala);
    c.getContext('2d').drawImage(imagem, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  }

  function processar(exigirConfirmacao) {
    if (!imagem || !temTabuleiro()) return;
    if (!modoAuto() && estado.tamanho && (estado.tamanho.w !== imagem.width || estado.tamanho.h !== imagem.height)) {
      aviso('O tamanho da janela mudou desde a marcação. Abra "Configurar tabuleiro" e marque de novo.');
      return;
    }
    const { total } = dims();
    const assinaturas = [];
    for (let i = 0; i < total; i++) assinaturas.push(assinatura(retanguloCelula(i)));
    if (!estado.verso) estado.verso = mediana(assinaturas);
    let novas = 0;
    let alterou = false;
    const viradas = [];
    const proximosPendentes = {};
    assinaturas.forEach((a, i) => {
      if (distancia(a, estado.verso) <= LIMIAR_VERSO) return;
      viradas.push(i + 1);
      const atual = estado.cartas[i];
      if (atual && atual.firme && semelhanca(atual.sig, a) <= LIMIAR_IGUAL) return;
      const confirmada = !exigirConfirmacao || Boolean(pendentes[i] && semelhanca(pendentes[i], a) <= LIMIAR_IGUAL / 2);
      proximosPendentes[i] = a;
      if (atual && !confirmada) return;
      estado.cartas[i] = { sig: a, img: recorte(retanguloCelula(i)), firme: confirmada };
      alterou = true;
      if (!atual) novas++;
    });
    pendentes = proximosPendentes;
    if (alterou) {
      salvar();
      render();
    }
    if (!exigirConfirmacao || novas) {
      status(viradas.length
        ? `Viradas agora: ${viradas.join(', ')} · ${novas} nova(s) anotada(s).`
        : 'Nenhuma carta virada encontrada.');
    }
  }

  function grupos() {
    const idx = Object.keys(estado.cartas).map(Number).sort((a, b) => a - b);
    const lista = [];
    const usado = new Set();
    idx.forEach((i) => {
      if (usado.has(i)) return;
      const g = [i];
      usado.add(i);
      idx.forEach((j) => {
        if (usado.has(j)) return;
        if (semelhanca(estado.cartas[i].sig, estado.cartas[j].sig) <= LIMIAR_IGUAL) { g.push(j); usado.add(j); }
      });
      lista.push(g);
    });
    return lista;
  }

  function render() {
    const { colunas, total } = dims();
    const tab = $('#tabuleiro');
    tab.style.gridTemplateColumns = `repeat(${colunas}, 1fr)`;
    tab.innerHTML = '';
    const gs = grupos();
    const pares = gs.filter((g) => g.length >= 2);
    const corDe = {};
    pares.forEach((g, n) => g.forEach((i) => { corDe[i] = { cor: CORES[n % CORES.length], n: n + 1 }; }));
    const feitos = new Set(estado.feitos);

    for (let i = 0; i < total; i++) {
      const cel = document.createElement('div');
      cel.className = 'cel';
      const c = estado.cartas[i];
      if (c) {
        const img = document.createElement('img');
        img.src = c.img;
        cel.appendChild(img);
        const x = document.createElement('button');
        x.className = 'x';
        x.textContent = '×';
        x.title = 'Apagar anotação desta posição';
        x.onclick = () => { delete estado.cartas[i]; estado.feitos = estado.feitos.filter((f) => f !== i); salvar(); render(); };
        cel.appendChild(x);
        if (corDe[i]) {
          cel.style.borderColor = corDe[i].cor;
          cel.style.boxShadow = feitos.has(i) ? 'none' : `0 0 10px ${corDe[i].cor}`;
          const g = document.createElement('span');
          g.className = 'grupo';
          g.style.color = corDe[i].cor;
          g.textContent = `P${corDe[i].n}`;
          cel.appendChild(g);
        }
        if (feitos.has(i)) cel.classList.add('feito');
      } else {
        cel.append('?');
      }
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = i + 1;
      cel.appendChild(num);
      tab.appendChild(cel);
    }

    const box = $('#pares');
    box.innerHTML = '';
    const vistas = Object.keys(estado.cartas).length;
    const abertos = pares.filter((g) => !g.every((i) => feitos.has(i)));
    const info = document.createElement('div');
    info.className = 'dica';
    info.textContent = `${vistas}/${total} posições vistas · ${abertos.length} par(es) para pegar`;
    box.appendChild(info);
    pares.forEach((g, n) => {
      const feito = g.every((i) => feitos.has(i));
      const linha = document.createElement('div');
      linha.className = 'par' + (feito ? ' feito' : '');
      const t = document.createElement('b');
      t.style.color = CORES[n % CORES.length];
      t.textContent = `P${n + 1}: ${g.map((i) => i + 1).join(' + ')}`;
      const b = document.createElement('button');
      b.textContent = feito ? 'Desfazer' : 'Já peguei';
      b.onclick = () => {
        estado.feitos = feito ? estado.feitos.filter((f) => !g.includes(f)) : [...new Set([...estado.feitos, ...g])];
        salvar();
        render();
      };
      linha.append(t, b);
      box.appendChild(linha);
    });
  }

  function desenhar() {
    if (!imagem) return;
    $('#vazio').hidden = true;
    tela.width = imagem.width;
    tela.height = imagem.height;
    ctx.drawImage(imagem, 0, 0);
    const esp = Math.max(2, imagem.width / 300);
    ctx.lineWidth = esp;
    if (selecaoTemp || !modoAuto()) {
      const a = selecaoTemp || estado.area;
      if (!a) return;
      ctx.strokeStyle = '#ff7a1a';
      ctx.strokeRect(a.x, a.y, a.w, a.h);
      if (selecaoTemp) return;
    }
    if (!temTabuleiro()) return;
    const { total } = dims();
    ctx.strokeStyle = 'rgba(60,255,143,.8)';
    ctx.font = `${Math.round(esp * 7)}px system-ui`;
    ctx.fillStyle = '#fff';
    for (let i = 0; i < total; i++) {
      const r = retanguloCelula(i);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillText(String(i + 1), r.x + esp * 2, r.y + esp * 8);
    }
  }

  async function abaAtiva(windowId) {
    const [aba] = await chrome.tabs.query(windowId ? { active: true, windowId } : { active: true, currentWindow: true });
    return aba;
  }

  async function capturar(automatico, windowId) {
    if (capturando) return;
    capturando = true;
    try {
      const aba = await abaAtiva(windowId);
      if (automatico && !(aba && aba.url && aba.url.startsWith('https://cartinha.net/memoria'))) return;
      const url = await chrome.tabs.captureVisibleTab(aba ? aba.windowId : undefined, { format: 'png' });
      const blob = await (await fetch(url)).blob();
      imagem = await createImageBitmap(blob);
      if (modoAuto() && !marcando && !aplicarDeteccao()) {
        if (!automatico) {
          $('#config').open = true;
          desenhar();
          status('Não achei o tabuleiro nessa captura. Deixe as cartas inteiras visíveis ou use "Marcar manualmente".');
        }
        return;
      }
      if (!automatico || $('#config').open) desenhar();
      if (!temTabuleiro()) {
        $('#config').open = true;
        desenhar();
        iniciarMarcacao('Arraste um retângulo envolvendo todas as cartas do tabuleiro, na imagem abaixo.');
        return;
      }
      processar(automatico);
      falhas = 0;
    } catch (e) {
      falhas++;
      if (automatico && falhas < 5) return;
      if (automatico) alternarAuto(false);
      status(`Não consegui capturar a aba: ${e && e.message ? e.message : e}`);
    } finally {
      capturando = false;
    }
  }

  function alternarAuto(ligar) {
    auto = ligar;
    clearInterval(timerAuto);
    pendentes = {};
    if (auto) timerAuto = setInterval(() => capturar(true), INTERVALO_AUTO);
    $('#btnAuto').textContent = auto ? 'Auto: on' : 'Auto: off';
    $('#btnAuto').classList.toggle('ativo', auto);
  }

  function iniciarMarcacao(msg) {
    marcando = true;
    $('#btnMarcar').classList.add('ativo');
    status(msg);
  }

  function pontoNaImagem(e) {
    const r = tela.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (tela.width / r.width), y: (e.clientY - r.top) * (tela.height / r.height) };
  }

  tela.addEventListener('mousedown', (e) => {
    if (!marcando) return;
    inicio = pontoNaImagem(e);
    selecaoTemp = { x: inicio.x, y: inicio.y, w: 0, h: 0 };
  });
  window.addEventListener('mousemove', (e) => {
    if (!marcando || !inicio) return;
    const p = pontoNaImagem(e);
    selecaoTemp = { x: Math.min(inicio.x, p.x), y: Math.min(inicio.y, p.y), w: Math.abs(p.x - inicio.x), h: Math.abs(p.y - inicio.y) };
    desenhar();
  });
  window.addEventListener('mouseup', () => {
    if (!marcando || !inicio) return;
    inicio = null;
    if (selecaoTemp.w > 20 && selecaoTemp.h > 20) {
      estado.area = selecaoTemp;
      estado.modo = 'manual';
      estado.celulas = null;
      atualizarModo();
      estado.tamanho = { w: imagem.width, h: imagem.height };
      estado.verso = null;
      estado.cartas = {};
      estado.feitos = [];
      marcando = false;
      $('#btnMarcar').classList.remove('ativo');
      selecaoTemp = null;
      aviso('');
      salvar();
      desenhar();
      processar(false);
      render();
    } else {
      selecaoTemp = null;
      desenhar();
    }
  });

  $('#btnCapturar').onclick = () => capturar(false);
  $('#btnAuto').onclick = () => alternarAuto(!auto);

  $('#btnMarcar').onclick = async () => {
    if (!imagem) await capturar(false);
    if (!imagem) return;
    desenhar();
    iniciarMarcacao('Arraste um retângulo da borda de fora da primeira carta até a borda de fora da última.');
  };

  function atualizarModo() {
    $('#btnDetectar').classList.toggle('ativo', modoAuto());
    $('#btnDetectar').textContent = modoAuto() ? 'Detecção automática: on' : 'Detecção automática: off';
    $('#selGrade').disabled = modoAuto();
  }

  $('#btnDetectar').onclick = async () => {
    estado.modo = 'auto';
    estado.celulas = null;
    marcando = false;
    $('#btnMarcar').classList.remove('ativo');
    atualizarModo();
    salvar();
    if (!imagem) {
      await capturar(false);
      return;
    }
    if (aplicarDeteccao()) {
      salvar();
      desenhar();
      status(`Tabuleiro ${estado.grade.replace('x', ' × ')} encontrado.`);
    } else {
      status('Não achei o tabuleiro. Capture de novo com as cartas inteiras visíveis.');
    }
  };

  $('#selGrade').value = estado.grade;
  $('#selGrade').onchange = (e) => {
    if (modoAuto()) return;
    estado.grade = e.target.value;
    estado.cartas = {};
    estado.feitos = [];
    estado.verso = null;
    salvar();
    render();
    desenhar();
    processar(false);
  };

  $('#btnLimpar').onclick = () => {
    if (!confirm('Apagar as anotações e começar uma rodada nova? (a marcação do tabuleiro é mantida)')) return;
    estado.cartas = {};
    estado.feitos = [];
    pendentes = {};
    salvar();
    render();
    status('Rodada limpa.');
  };

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.tipo === 'capturar') capturar(false, msg.windowId);
  });

  function versaoMaior(a, b) {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    }
    return false;
  }

  async function verificarAtualizacao() {
    const atual = chrome.runtime.getManifest().version;
    $('#versao').textContent = 'v' + atual;
    try {
      const r = await fetch(URL_MANIFESTO + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const remoto = (await r.json()).version;
      if (versaoMaior(remoto, atual)) {
        aviso(`Nova versão ${remoto} disponível. <a href="${URL_REPO}" target="_blank">Baixar no GitHub</a> e depois clicar em "Recarregar" em chrome://extensions.`);
      }
    } catch (e) {}
  }

  atualizarModo();
  render();
  verificarAtualizacao();
})();
