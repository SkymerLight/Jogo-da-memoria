# Ajudante do Jogo da Memória (cartinha.net)

## Extensão com painel lateral (`extensao/`)

Painel lateral do próprio Chrome (fica ao lado da página, fora do site). Não injeta nada no site e não lê o código dele: só captura a imagem da aba visível, como um print.

Instalação:
1. Baixe o repositório (Code → Download ZIP) e extraia, ou use `git clone`.
2. Abra `chrome://extensions`, ative o **Modo do desenvolvedor** e clique em **Carregar sem compactação**.
3. Escolha a pasta `extensao`.
4. Fixe o ícone da extensão na barra e clique nele com o jogo aberto: o painel lateral abre.

Uso:
- **Capturar** (ou `Alt+Shift+K`, que dá para trocar em `chrome://extensions/shortcuts`): tira uma captura da aba e anota as cartas viradas.
- **Auto**: captura sozinho duas vezes por segundo enquanto a aba ativa for `cartinha.net/memoria`. A carta é anotada na primeira captura em que aparece; capturas seguintes só trocam a imagem por uma mais nítida.
- A permissão "ler e alterar dados em todos os sites" é exigida pelo Chrome para capturar a aba visível. A extensão não tem nenhum script de conteúdo: só tira a captura.
- Na primeira captura, arraste um retângulo em volta de todas as cartas. Se mudar o tamanho da janela ou o zoom, remarque em "Configurar tabuleiro".

Atualização: o painel avisa quando há versão nova no GitHub (requer repositório público). Para atualizar, baixe os arquivos novos por cima da pasta (ou `git pull`) e clique em **Recarregar** na extensão em `chrome://extensions`. Para publicar uma versão nova, aumente `version` no `extensao/manifest.json`.

## Anotador por print (`anotador.html`)

Página separada que não interage com o site: você cola prints da tela e ela organiza as cartas.

1. Abra o `anotador.html` no navegador (duplo clique no arquivo).
2. Tire um print da tela inteira (`PrtSc`) e aperte `Ctrl+V` na página.
3. Na primeira vez, arraste um retângulo envolvendo todas as cartas do tabuleiro. A marcação fica salva.
4. A cada jogada, tire outro print e cole. As cartas viradas são recortadas e guardadas na posição certa, e os pares iguais ficam destacados com a mesma cor (P1, P2...).
5. Use "Já peguei" para marcar um par concluído e "Nova rodada" para limpar.

Dica: use sempre print da tela inteira (ou sempre o mesmo recorte), com a janela no mesmo lugar e o mesmo zoom, para as posições baterem.

## Userscript (`jogo-da-memoria.user.js`)

Userscript que anota as cartas que você vira em https://cartinha.net/memoria e mostra um painel com a posição de cada uma.

- Painel flutuante (arrastável) com a grade espelhada do tabuleiro
- Pares conhecidos destacados em verde
- Nome da carta aparece por cima das cartas viradas para baixo que você já viu (botão "Nomes")
- As anotações ficam salvas por rodada (00:00, 08:00, 14:00, 20:00) e sobrevivem a recarregar a página

## Instalação

1. Instale a extensão [Tampermonkey](https://www.tampermonkey.net/) no Chrome.
2. Em `chrome://extensions`, ative o **Modo do desenvolvedor** (necessário para userscripts no Chrome recente) e, nos detalhes do Tampermonkey, ative **Permitir scripts do usuário**.
3. Abra este link: https://raw.githubusercontent.com/SkymerLight/Jogo-da-memoria/main/jogo-da-memoria.user.js
4. Clique em **Instalar**.

## Atualização automática

O Tampermonkey verifica o `@updateURL` periodicamente. Para publicar uma atualização, aumente o `@version` no cabeçalho do script e faça push para a branch `main`.
Para forçar a checagem: Tampermonkey → Painel → Utilitários → "Verificar atualizações de scripts".
