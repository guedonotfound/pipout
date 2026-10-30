# Pipout

> A Picture-in-Picture button on every video, for Chromium browsers.

Extensão para navegadores baseados em Chromium (Helium, Chrome, Brave, Edge, Vivaldi) que mostra
um botão de **Picture-in-Picture** na borda direita de qualquer vídeo ao passar o mouse, como no
Opera. Opcionalmente, coloca o vídeo em PiP sozinho quando você troca de aba.

## Recursos

- **Botão em qualquer vídeo**: aparece ao passar o mouse, na borda direita (com um respiro de 10 px),
  a 35% da altura contando de baixo, fora do caminho dos controles do player.
- **Um clique entra, outro sai** do PiP. O clique não chega ao site, então o vídeo não pausa.
- **Funciona onde o site tenta impedir**, como vídeos com `disablePictureInPicture`, players com
  camadas por cima do vídeo, iframes e shadow DOM aberto.
- **Ignora miniaturas** (vídeos menores que 200 × 110 px).
- **PiP automático ao trocar de aba** (desligado por padrão), que fecha sozinho quando você volta.
- **Liga/desliga geral e por site**, pelo ícone da extensão.

## Instalação

1. Baixe o repositório (**Code → Download ZIP**) e extraia para um lugar fixo. O navegador carrega a
   extensão direto dessa pasta, então não apague nem mova depois.
2. Abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta.
4. Se usar vários perfis, repita em cada um.

## PiP automático: como funciona

Por segurança, o navegador só deixa uma página abrir o PiP logo depois de uma interação sua com ela.
Por isso, a opção funciona quando você troca de aba poucos segundos depois de interagir com a página
(ex.: clicar no vídeo, dar play, avançar). Se você deixou o vídeo tocando sem mexer na página por um
tempo, o navegador pode bloquear.

A extensão também se registra no recurso de PiP automático do próprio navegador (Media Session),
que não tem essa limitação nos navegadores que o suportam. Ele pode depender da configuração
**Picture-in-picture automático** em `chrome://settings/content/autoPictureInPicture`.

## Limitações conhecidas

- Vídeos dentro de shadow DOM fechado não são detectados.
- Sites que desenham o vídeo em `<canvas>` (sem `<video>`) não têm botão.
- Em vídeos em tela cheia em que o próprio `<video>` é o elemento de tela cheia, o botão não aparece
  (o navegador não permite sobrepor nada a ele).

## Licença

[MIT](LICENSE)
