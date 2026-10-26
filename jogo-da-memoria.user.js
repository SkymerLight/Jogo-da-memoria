// ==UserScript==
// @name         Cartinha - Ajudante do Jogo da Memória
// @namespace    https://github.com/SkymerLight/Jogo-da-memoria
// @version      1.0.0
// @description  Guarda as cartas que você já virou e mostra um painel de referência
// @author       SkymerLight
// @match        https://cartinha.net/*
// @icon         https://cartinha.net/favicon.svg
// @updateURL    https://raw.githubusercontent.com/SkymerLight/Jogo-da-memoria/main/jogo-da-memoria.user.js
// @downloadURL  https://raw.githubusercontent.com/SkymerLight/Jogo-da-memoria/main/jogo-da-memoria.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const PREFIXO = 'jdm-ajudante:';
  const HORARIOS = [0, 8, 14, 20];

  function chaveRodada() {
    const agora = new Date();
    const h = agora.getHours();
    let inicio = HORARIOS.filter((x) => x <= h).pop();
    const d = new Date(agora);
    if (inicio === undefined) {
      inicio = HORARIOS[HORARIOS.length - 1];
      d.setDate(d.getDate() - 1);
    }
    const data = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return `${PREFIXO}${data}-${String(inicio).padStart(2, '0')}`;
  }

  function carregar() {
    try {
      return JSON.parse(localStorage.getItem(chaveRodada())) || {};
    } catch (e) {
      return {};
    }
  }

  function salvar(dados) {
    try {
      localStorage.setItem(chaveRodada(), JSON.stringify(dados));
      Object.keys(localStorage)
        .filter((k) => k.startsWith(PREFIXO) && k !== chaveRodada() && k !== PREFIXO + 'ui')
        .forEach((k) => localStorage.removeItem(k));
    } catch (e) {}
  }

  function carregarUi() {
    try {
      return JSON.parse(localStorage.getItem(PREFIXO + 'ui')) || {};
    } catch (e) {
      return {};
    }
  }

  function salvarUi(ui) {
    try {
      localStorage.setItem(PREFIXO + 'ui', JSON.stringify(ui));
    } catch (e) {}
  }

  let vistas = carregar();
  let ui = Object.assign({ minimizado: false, etiquetas: true }, carregarUi());
  let grade = null;
  let observador = null;
  let painel = null;

  const CSS = `
    #jdm-painel {
      position: fixed; top: 80px; right: 16px; z-index: 99999;
      width: 300px; background: #120a1c; color: #f3e9ff;
      border: 1px solid #ff7a1a; border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0,0,0,.6), 0 0 18px rgba(255,122,26,.25);
      font-family: inherit; font-size: 12px; user-select: none;
    }
    #jdm-painel .jdm-topo {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 10px; cursor: move; border-bottom: 1px solid #3a2550;
    }
    #jdm-painel .jdm-titulo { flex: 1; font-weight: 700; color: #ffb36b; }
    #jdm-painel button.jdm-btn {
      background: #2a1a3d; color: #f3e9ff; border: 1px solid #4b3166;
      border-radius: 6px; padding: 2px 7px; cursor: pointer; font-size: 11px;
    }
    #jdm-painel button.jdm-btn:hover { border-color: #ff7a1a; }
    #jdm-painel .jdm-corpo { padding: 10px; }
    #jdm-painel.jdm-min .jdm-corpo { display: none; }
    #jdm-painel .jdm-grade { display: grid; gap: 5px; }
    #jdm-painel .jdm-cel {
      position: relative; aspect-ratio: 223 / 348; border-radius: 5px;
      background: #24163a; border: 1px solid #3a2550; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
      color: #6d5689; font-weight: 700;
    }
    #jdm-painel .jdm-cel img { width: 100%; height: 100%; object-fit: cover; display: block; }
    #jdm-painel .jdm-cel .jdm-num {
      position: absolute; top: 2px; left: 3px; font-size: 9px; color: #fff;
      text-shadow: 0 0 3px #000, 0 0 3px #000;
    }
    #jdm-painel .jdm-cel.jdm-par { opacity: .3; }
    #jdm-painel .jdm-cel.jdm-conhecido { border: 2px solid #3cff8f; box-shadow: 0 0 8px #3cff8f; }
    #jdm-painel .jdm-lista { margin-top: 10px; max-height: 160px; overflow: auto; }
    #jdm-painel .jdm-item { display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px dashed #3a2550; }
    #jdm-painel .jdm-item.jdm-ok { color: #3cff8f; font-weight: 700; }
    #jdm-painel .jdm-item.jdm-feito { color: #6d5689; text-decoration: line-through; }
    #jdm-painel .jdm-dica { margin-top: 8px; color: #b9a3d4; font-size: 11px; }
    .jdm-etiqueta {
      position: absolute; left: 4px; right: 4px; bottom: 4px; z-index: 5;
      background: rgba(18,10,28,.85); color: #ffb36b; border: 1px solid #ff7a1a;
      border-radius: 5px; font-size: 10px; font-weight: 700; padding: 2px 4px;
      text-align: center; pointer-events: none; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    .jdm-etiqueta.jdm-ok { color: #3cff8f; border-color: #3cff8f; }
    .memoria__carta.jdm-rel { position: relative; }
  `;

  function injetarCss() {
    if (document.getElementById('jdm-css')) return;
    const s = document.createElement('style');
    s.id = 'jdm-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function lerCarta(botao) {
    const frente = botao.querySelector('.memoria__face--frente .mini');
    if (!frente) return null;
    const img = frente.querySelector('img');
    const obra = frente.querySelector('.mini__obra-ico');
    const nome = frente.getAttribute('aria-label') || botao.getAttribute('aria-label') || '?';
    return {
      nome,
      img: img ? img.src : '',
      obra: obra ? obra.textContent.trim() : '',
      id: img ? img.src : nome,
    };
  }

  function cartas() {
    return grade ? [...grade.querySelectorAll('.memoria__carta')] : [];
  }

  function varrer() {
    let mudou = false;
    cartas().forEach((botao, i) => {
      const info = lerCarta(botao);
      const par = botao.classList.contains('is-par');
      if (info) {
        const atual = vistas[i];
        if (!atual || atual.id !== info.id || atual.par !== par) {
          vistas[i] = Object.assign({}, info, { par });
          mudou = true;
        }
      } else if (vistas[i] && vistas[i].par !== par && par) {
        vistas[i].par = true;
        mudou = true;
      }
    });
    if (mudou) salvar(vistas);
    render();
  }

  function grupos() {
    const g = {};
    Object.entries(vistas).forEach(([i, c]) => {
      (g[c.id] = g[c.id] || { carta: c, posicoes: [] }).posicoes.push(Number(i));
    });
    return g;
  }

  function render() {
    if (!painel) return;
    const total = cartas().length || 20;
    const colunas = grade ? getComputedStyle(grade).gridTemplateColumns.split(' ').filter(Boolean).length || 5 : 5;
    const g = grupos();
    const conhecidos = new Set();
    Object.values(g).forEach((x) => {
      if (x.posicoes.length >= 2 && !x.carta.par) x.posicoes.forEach((p) => conhecidos.add(p));
    });

    const gradeEl = painel.querySelector('.jdm-grade');
    gradeEl.style.gridTemplateColumns = `repeat(${colunas}, 1fr)`;
    gradeEl.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const c = vistas[i];
      const cel = document.createElement('div');
      cel.className = 'jdm-cel';
      if (c) {
        if (c.par) cel.classList.add('jdm-par');
        if (conhecidos.has(i)) cel.classList.add('jdm-conhecido');
        cel.title = `${i + 1}: ${c.nome}${c.obra ? ' (' + c.obra + ')' : ''}`;
        const img = document.createElement('img');
        img.src = c.img;
        img.alt = c.nome;
        cel.appendChild(img);
      } else {
        cel.textContent = '?';
      }
      const num = document.createElement('span');
      num.className = 'jdm-num';
      num.textContent = i + 1;
      cel.appendChild(num);
      gradeEl.appendChild(cel);
    }

    const lista = painel.querySelector('.jdm-lista');
    lista.innerHTML = '';
    Object.values(g)
      .sort((a, b) => (a.carta.par - b.carta.par) || (b.posicoes.length - a.posicoes.length))
      .forEach((x) => {
        const item = document.createElement('div');
        item.className = 'jdm-item';
        if (x.carta.par) item.classList.add('jdm-feito');
        else if (x.posicoes.length >= 2) item.classList.add('jdm-ok');
        const nome = document.createElement('span');
        nome.textContent = x.carta.nome;
        const pos = document.createElement('span');
        pos.textContent = x.posicoes.map((p) => p + 1).join(' + ');
        item.append(nome, pos);
        lista.appendChild(item);
      });
    if (!lista.children.length) lista.innerHTML = '<div class="jdm-dica">Vire cartas para começar a anotar.</div>';

    const pares = Object.values(g).filter((x) => x.posicoes.length >= 2 && !x.carta.par).length;
    painel.querySelector('.jdm-info').textContent =
      `${Object.keys(vistas).length}/${total} vistas · ${pares} par(es) conhecido(s)`;

    renderEtiquetas(conhecidos);
  }

  function renderEtiquetas(conhecidos) {
    cartas().forEach((botao, i) => {
      let et = botao.querySelector('.jdm-etiqueta');
      const c = vistas[i];
      const mostrar = ui.etiquetas && c && !c.par && !botao.classList.contains('is-virada');
      if (!mostrar) {
        if (et) et.remove();
        return;
      }
      if (!botao.classList.contains('jdm-rel')) botao.classList.add('jdm-rel');
      if (!et) {
        et = document.createElement('span');
        et.className = 'jdm-etiqueta';
        botao.appendChild(et);
      }
      if (et.textContent !== c.nome) et.textContent = c.nome;
      if (et.classList.contains('jdm-ok') !== conhecidos.has(i)) et.classList.toggle('jdm-ok');
    });
  }

  function criarPainel() {
    if (painel && document.body.contains(painel)) return;
    painel = document.createElement('div');
    painel.id = 'jdm-painel';
    if (ui.minimizado) painel.classList.add('jdm-min');
    if (ui.x != null && ui.y != null) {
      painel.style.left = ui.x + 'px';
      painel.style.top = ui.y + 'px';
      painel.style.right = 'auto';
    }
    painel.innerHTML = `
      <div class="jdm-topo">
        <span class="jdm-titulo">🎃 Memória</span>
        <button class="jdm-btn" data-acao="etiquetas" title="Mostrar nomes sobre as cartas"></button>
        <button class="jdm-btn" data-acao="limpar" title="Apagar anotações desta rodada">Limpar</button>
        <button class="jdm-btn" data-acao="min" title="Minimizar">—</button>
      </div>
      <div class="jdm-corpo">
        <div class="jdm-grade"></div>
        <div class="jdm-dica jdm-info"></div>
        <div class="jdm-lista"></div>
      </div>`;
    document.body.appendChild(painel);
    atualizarBotoes();

    painel.addEventListener('click', (e) => {
      const acao = e.target.closest('[data-acao]')?.dataset.acao;
      if (acao === 'min') {
        ui.minimizado = !ui.minimizado;
        painel.classList.toggle('jdm-min', ui.minimizado);
      } else if (acao === 'limpar') {
        vistas = {};
        salvar(vistas);
        varrer();
      } else if (acao === 'etiquetas') {
        ui.etiquetas = !ui.etiquetas;
        render();
      }
      atualizarBotoes();
      salvarUi(ui);
    });

    arrastavel(painel, painel.querySelector('.jdm-topo'));
  }

  function atualizarBotoes() {
    painel.querySelector('[data-acao="etiquetas"]').textContent = ui.etiquetas ? 'Nomes: on' : 'Nomes: off';
    painel.querySelector('[data-acao="min"]').textContent = ui.minimizado ? '+' : '—';
  }

  function arrastavel(el, alca) {
    let ox = 0, oy = 0, arrastando = false;
    alca.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      arrastando = true;
      const r = el.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!arrastando) return;
      const x = Math.max(0, Math.min(window.innerWidth - 60, e.clientX - ox));
      const y = Math.max(0, Math.min(window.innerHeight - 30, e.clientY - oy));
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.right = 'auto';
      ui.x = x;
      ui.y = y;
    });
    document.addEventListener('mouseup', () => {
      if (arrastando) salvarUi(ui);
      arrastando = false;
    });
  }

  function removerPainel() {
    if (painel) painel.remove();
    painel = null;
  }

  let agendado = false;
  function agendarVarredura() {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => {
      agendado = false;
      varrer();
    });
  }

  function verificarPagina() {
    const novaGrade = document.querySelector('.memoria__grade');
    if (!novaGrade) {
      if (observador) observador.disconnect();
      observador = null;
      grade = null;
      removerPainel();
      return;
    }
    if (novaGrade !== grade) {
      grade = novaGrade;
      vistas = carregar();
      if (observador) observador.disconnect();
      observador = new MutationObserver((muts) => {
        const proprias = (m) =>
          m.target.closest?.('.jdm-etiqueta') ||
          (m.type === 'childList' && [...m.addedNodes, ...m.removedNodes].every((n) => n.classList?.contains('jdm-etiqueta'))) ||
          (m.type === 'attributes' && m.attributeName === 'class' && m.oldValue != null &&
            m.oldValue.replace(/\s*jdm-rel/g, '') === m.target.className.replace(/\s*jdm-rel/g, ''));
        if (muts.every(proprias)) return;
        agendarVarredura();
      });
      observador.observe(grade, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'aria-label'] });
    }
    injetarCss();
    criarPainel();
    varrer();
  }

  new MutationObserver(() => {
    const g = document.querySelector('.memoria__grade');
    if (g !== grade || (g && (!painel || !document.body.contains(painel)))) verificarPagina();
  }).observe(document.body, { childList: true, subtree: true });

  verificarPagina();
})();
