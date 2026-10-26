# Ajudante do Jogo da Memória (cartinha.net)

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
