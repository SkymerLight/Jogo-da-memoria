(() => {
  const CHAVE = 'anotador-memoria';
  const VERSAO_ESTADO = 2;
  const LIMIAR_VERSO = 28;
  const LIMIAR_GRUPO_VERSO = 6;
  const LIMIAR_IGUAL = 21;
  const INTERVALO_AUTO = 550;
  const HORARIOS = [0, 8, 14, 20];
  const MAX_HISTORICO = 300;
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
  let abertasAgora = [];
  let falhas = 0;

  function estadoNovo() {
    return {
      versao: VERSAO_ESTADO, grade: '5x4', modo: 'auto', area: null, celulas: null, tamanho: null,
      verso: null, cartas: {}, feitos: [], rodada: chaveRodada(), historico: [],
    };
  }

  function carregar() {
    let e = null;
    try { e = JSON.parse(localStorage.getItem(CHAVE)); } catch (err) {}
    if (!e) return estadoNovo();
    if (e.versao !== VERSAO_ESTADO) {
      e = Object.assign(estadoNovo(), {
        grade: e.grade || '5x4', modo: e.modo || 'auto', area: e.area || null,
        celulas: e.celulas || null, tamanho: e.tamanho || null,
      });
    }
    e.historico = e.historico || [];
    return e;
  }

  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) { status('Não consegui salvar (armazenamento cheio?)'); }
  }

  function chaveRodada(agora = new Date()) {
    const h = agora.getHours();
    let inicioRodada = HORARIOS.filter((x) => x <= h).pop();
    const d = new Date(agora);
    if (inicioRodada === undefined) {
      inicioRodada = HORARIOS[HORARIOS.length - 1];
      d.setDate(d.getDate() - 1);
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(inicioRodada).padStart(2, '0')}h`;
  }

  function limparRodada() {
    estado.cartas = {};
    estado.feitos = [];
    estado.verso = null;
    estado.revelada = false;
    estado.rodada = chaveRodada();
    pendentes = {};
    abertasAgora = [];
  }

  function conferirRodada() {
    if (estado.rodada === chaveRodada()) return;
    limparRodada();
    salvar();
    render();
    status('Rodada nova: anotações anteriores apagadas (o histórico continua).');
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
      limparRodada();
      render();
    }
    estado.celulas = det.celulas;
    estado.tamanho = { w: imagem.width, h: imagem.height };
    $('#selGrade').value = estado.grade;
    return true;
  }

  function retanguloCelula(i) {
    if (modoAuto() && estado.celulas) return Visao.celulaInterna(estado.celulas[i]);
    const { colunas, linhas } = dims();
    const a = estado.area;
    const w = a.w / colunas, h = a.h / linhas;
    const col = i % colunas, lin = Math.floor(i / colunas);
    const mx = w * 0.1, my = h * 0.08;
    return { x: a.x + col * w + mx, y: a.y + lin * h + my, w: w - 2 * mx, h: h - 2 * my };
  }

  function aprenderVerso(assinaturas) {
    let melhor = [];
    assinaturas.forEach((a) => {
      const perto = assinaturas.filter((b) => Visao.distancia(a.cor, b.cor) <= LIMIAR_GRUPO_VERSO);
      if (perto.length > melhor.length) melhor = perto;
    });
    if (melhor.length >= 3) estado.verso = Visao.mediana(melhor.map((a) => a.cor));
  }

  function parear(cinzas, indices) {
    const distancias = [];
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        distancias.push([Visao.semelhanca(cinzas[indices[a]], cinzas[indices[b]]), indices[a], indices[b]]);
      }
    }
    distancias.sort((x, y) => x[0] - y[0]);
    const usado = new Set();
    const pares = [];
    distancias.forEach(([d, a, b]) => {
      if (d > LIMIAR_IGUAL || usado.has(a) || usado.has(b)) return;
      usado.add(a);
      usado.add(b);
      pares.push(a < b ? [a, b] : [b, a]);
    });
    return pares;
  }

  function registrarRevelacao(assinaturas) {
    const { total } = dims();
    const indices = [...Array(total).keys()];
    const pares = parear(assinaturas.map((a) => a.cinza), indices);
    if (pares.length < Math.floor(total / 2) - 1) return false;
    const registro = { rodada: estado.rodada, grade: estado.grade, pares: pares.sort((x, y) => x[0] - y[0]) };
    const i = estado.historico.findIndex((h) => h.rodada === registro.rodada && h.grade === registro.grade);
    if (i >= 0) estado.historico[i] = registro;
    else estado.historico.push(registro);
    if (estado.historico.length > MAX_HISTORICO) estado.historico.splice(0, estado.historico.length - MAX_HISTORICO);
    return true;
  }

  function processar(exigirConfirmacao) {
    if (!imagem || !temTabuleiro()) return;
    if (!modoAuto() && estado.tamanho && (estado.tamanho.w !== imagem.width || estado.tamanho.h !== imagem.height)) {
      aviso('O tamanho da janela mudou desde a marcação. Abra "Configurar tabuleiro" e marque de novo.');
      return;
    }
    conferirRodada();
    const { total } = dims();
    const assinaturas = [];
    for (let i = 0; i < total; i++) assinaturas.push(Visao.assinatura(imagem, retanguloCelula(i)));
    aprenderVerso(assinaturas);

    let novas = 0;
    let alterou = false;
    const viradas = [];
    const proximosPendentes = {};
    assinaturas.forEach((a, i) => {
      if (estado.verso && Visao.distancia(a.cor, estado.verso) <= LIMIAR_VERSO) return;
      viradas.push(i);
      const atual = estado.cartas[i];
      if (atual && atual.firme && Visao.semelhanca(atual.cinza, a.cinza) <= LIMIAR_IGUAL) return;
      const confirmada = !exigirConfirmacao || Boolean(pendentes[i] && Visao.semelhanca(pendentes[i], a.cinza) <= LIMIAR_IGUAL / 2);
      proximosPendentes[i] = a.cinza;
      if (atual && !confirmada) return;
      estado.cartas[i] = { cinza: a.cinza, img: Visao.recorte(imagem, retanguloCelula(i)), firme: confirmada };
      alterou = true;
      if (!atual) novas++;
    });
    pendentes = proximosPendentes;

    const revelado = viradas.length >= total * 0.9;
    let revelacaoSalva = false;
    if (revelado) {
      revelacaoSalva = registrarRevelacao(assinaturas);
      if (revelacaoSalva) estado.revelada = true;
      alterou = alterou || revelacaoSalva;
    } else {
      const agora = new Set(viradas);
      grupos().forEach((g) => {
        if (g.length >= 2 && g.every((i) => agora.has(i)) && !g.every((i) => estado.feitos.includes(i))) {
          estado.feitos = [...new Set([...estado.feitos, ...g])];
          alterou = true;
        }
      });
    }
    const feitos = new Set(estado.feitos);
    const novasAbertas = revelado ? [] : viradas.filter((i) => !feitos.has(i));
    const mudouAbertas = novasAbertas.join() !== abertasAgora.join();
    abertasAgora = novasAbertas;

    if (alterou) salvar();
    if (alterou || mudouAbertas) render();
    if (!exigirConfirmacao || novas || revelacaoSalva) {
      if (revelacaoSalva) status(`Tabuleiro completo registrado no histórico (${estado.historico.length} rodada(s)).`);
      else status(viradas.length
        ? `Viradas agora: ${viradas.map((i) => i + 1).join(', ')} · ${novas} nova(s) anotada(s).`
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
        if (Visao.semelhanca(estado.cartas[i].cinza, estado.cartas[j].cinza) <= LIMIAR_IGUAL) { g.push(j); usado.add(j); }
      });
      lista.push(g);
    });
    return lista;
  }

  function historicoAtual() {
    return estado.historico.filter((h) => h.grade === estado.grade);
  }

  function contagemParceiros(hist, total) {
    const cont = Array.from({ length: total }, () => new Array(total).fill(0));
    hist.forEach((h) => h.pares.forEach(([a, b]) => {
      if (a < total && b < total) {
        cont[a][b]++;
        cont[b][a]++;
      }
    }));
    return cont;
  }

  function sugerir(gs) {
    const { total } = dims();
    const feitos = new Set(estado.feitos);
    const hist = historicoAtual();
    const cont = contagemParceiros(hist, total);
    const prob = (i, j) => (cont[i][j] + 1) / (hist.length + total - 1);
    const desconhecidas = [...Array(total).keys()].filter((i) => !estado.cartas[i]);
    const grupoDe = {};
    gs.forEach((g) => g.forEach((i) => { grupoDe[i] = g; }));
    const solteiras = gs.filter((g) => g.length === 1 && !feitos.has(g[0])).map((g) => g[0]);
    const paresConhecidos = gs.filter((g) => g.length >= 2 && !g.every((i) => feitos.has(i)));
    const pct = (p) => `${Math.round(p * 100)}%`;
    if (estado.revelada) return { celulas: [], texto: 'Rodada encerrada: tabuleiro completo salvo no histórico.' };

    const melhorDesconhecida = (pontuar, excluir) => {
      const cands = desconhecidas.filter((u) => u !== excluir);
      if (!cands.length) return null;
      return cands.reduce((m, u) => (pontuar(u) > pontuar(m) ? u : m), cands[0]);
    };

    if (abertasAgora.length === 1) {
      const i = abertasAgora[0];
      const outro = (grupoDe[i] || []).find((j) => j !== i);
      if (outro !== undefined) return { celulas: [outro], texto: `É par! Abra a ${outro + 1}.` };
      const u = melhorDesconhecida((x) => prob(i, x), i);
      if (u === null) return null;
      const extra = hist.length ? ` · foi par da ${i + 1} em ${cont[i][u]} de ${hist.length} rodada(s)` : '';
      return { celulas: [u], texto: `O par da ${i + 1} ainda não apareceu. Tente a ${u + 1}${extra}.` };
    }
    if (paresConhecidos.length) {
      const g = paresConhecidos[0];
      return { celulas: g.slice(0, 2), texto: `Par conhecido: abra a ${g[0] + 1} e a ${g[1] + 1}.` };
    }
    const u = melhorDesconhecida((x) => solteiras.reduce((s, k) => s + prob(k, x), 0));
    if (u === null) return null;
    const chance = solteiras.length ? solteiras.reduce((s, k) => s + prob(k, u), 0) : 0;
    const extra = hist.length && solteiras.length ? ` · chance de casar com uma já vista ≈ ${pct(Math.min(1, chance))}` : '';
    return { celulas: [u], texto: `Abra a ${u + 1}${extra}.` };
  }

  function analisarPadrao() {
    const { total, colunas } = dims();
    const hist = historicoAtual();
    const box = $('#padroesConteudo');
    box.innerHTML = '';
    const linha = (texto, classe) => {
      const d = document.createElement('div');
      d.className = classe || 'dica';
      d.textContent = texto;
      box.appendChild(d);
    };
    linha(`Rodadas completas registradas (${estado.grade.replace('x', ' × ')}): ${hist.length}`, 'destaque');
    if (hist.length < 2) {
      linha('O registro acontece sozinho quando o jogo revela todas as cartas no fim da rodada. Com 2 ou mais rodadas dá para comparar.');
      return;
    }
    const base = 1 / (total - 1);
    let repetidos = 0, comparados = 0;
    for (let k = 1; k < hist.length; k++) {
      const anteriores = new Set(hist[k - 1].pares.map((p) => p.join('-')));
      hist[k].pares.forEach((p) => {
        comparados++;
        if (anteriores.has(p.join('-'))) repetidos++;
      });
    }
    const taxa = comparados ? repetidos / comparados : 0;
    linha(`Pares na mesma posição da rodada anterior: ${Math.round(taxa * 100)}% (se fosse aleatório: ~${Math.round(base * 100)}%)`);

    const desloc = {};
    let totalPares = 0;
    hist.forEach((h) => h.pares.forEach(([a, b]) => {
      const dl = Math.floor(b / colunas) - Math.floor(a / colunas);
      const dc = (b % colunas) - (a % colunas);
      const k = `${dl},${dc}`;
      desloc[k] = (desloc[k] || 0) + 1;
      totalPares++;
    }));
    const topo = Object.entries(desloc).sort((x, y) => y[1] - x[1]).slice(0, 3);
    linha('Distância mais comum entre as duas cartas de um par:');
    topo.forEach(([k, n]) => {
      const [dl, dc] = k.split(',').map(Number);
      const partes = [];
      if (dl) partes.push(`${dl} linha(s) abaixo`);
      if (dc) partes.push(`${Math.abs(dc)} coluna(s) à ${dc > 0 ? 'direita' : 'esquerda'}`);
      linha(`• ${partes.join(' e ') || 'mesma posição'}: ${Math.round((n / totalPares) * 100)}%`);
    });

    const cont = contagemParceiros(hist, total);
    const fixos = [];
    for (let a = 0; a < total; a++) for (let b = a + 1; b < total; b++) if (cont[a][b] >= 2) fixos.push([a, b, cont[a][b]]);
    fixos.sort((x, y) => y[2] - x[2]);
    if (fixos.length) linha(`Posições que já formaram par mais de uma vez: ${fixos.slice(0, 5).map(([a, b, n]) => `${a + 1}+${b + 1} (${n}×)`).join(', ')}`);

    const conclusao = hist.length < 4
      ? 'Ainda são poucas rodadas para concluir alguma coisa.'
      : taxa > base * 3
        ? 'Parece haver padrão: os pares se repetem bem mais do que o acaso explicaria.'
        : 'Até agora parece embaralhamento aleatório: as sugestões pelo histórico ajudam pouco.';
    linha(conclusao, 'destaque');
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
    const sugestao = sugerir(gs);
    const sugeridas = new Set(sugestao ? sugestao.celulas : []);
    const abertas = new Set(abertasAgora);

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
      if (sugeridas.has(i)) cel.classList.add('sugerida');
      if (abertas.has(i)) cel.classList.add('aberta');
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = i + 1;
      cel.appendChild(num);
      tab.appendChild(cel);
    }

    const sug = $('#sugestao');
    sug.hidden = !sugestao;
    sug.textContent = sugestao ? `💡 ${sugestao.texto}` : '';

    const box = $('#pares');
    box.innerHTML = '';
    const vistas = Object.keys(estado.cartas).length;
    const abertos = pares.filter((g) => !g.every((i) => feitos.has(i)));
    const info = document.createElement('div');
    info.className = 'dica';
    info.textContent = `${vistas}/${total} posições vistas · ${abertos.length} par(es) para pegar · rodada ${estado.rodada}`;
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

    analisarPadrao();
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
      limparRodada();
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
    limparRodada();
    salvar();
    render();
    desenhar();
    processar(false);
  };

  $('#btnLimpar').onclick = () => {
    if (!confirm('Apagar as anotações e começar uma rodada nova? (a marcação do tabuleiro e o histórico são mantidos)')) return;
    limparRodada();
    salvar();
    render();
    status('Rodada limpa.');
  };

  $('#btnLimparHistorico').onclick = () => {
    if (!confirm('Apagar todo o histórico de rodadas?')) return;
    estado.historico = [];
    salvar();
    render();
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
  conferirRodada();
  render();
  verificarAtualizacao();
})();
