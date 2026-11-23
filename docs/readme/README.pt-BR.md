**Languages:** [Русский](../../README.md) · [English](./README.en.md) · [简体中文](./README.zh-CN.md) · [Українська](./README.uk.md) · [Tiếng Việt](./README.vi.md) · [हिन्दी](./README.hi.md) · [日本語](./README.ja.md) · [Deutsch](./README.de.md) · [Français](./README.fr.md) · [עברית](./README.he.md) · [العربية](./README.ar.md) · [Español](./README.es.md) · **Português (BR)** · [한국어](./README.ko.md) · [Türkçe](./README.tr.md) · [Bahasa Indonesia](./README.id.md)

> 📖 **Aplicativo guia interativo (16 idiomas, layout PDF e histórico de versões):** `AllY-Guide.exe` · [../index.html?lang=pt-BR](../index.html?lang=pt-BR)

# AllY · Genie (v0.1)

Shell desktop local para Windows que reúne várias IAs em uma única janela com histórico de conversa compartilhado, memória local em disco, fila de tarefas e controle de limites.

*Aniversário do AllY · Genie: 23 de novembro de 2026. Licença: MIT.*

---

## O que é este aplicativo e qual problema ele resolve

No uso diário de IA, as tarefas acabam espalhadas por várias abas do navegador, terminais e chaves separadas. Quando um modelo atinge o limite de cinco horas, é preciso abrir outro e explicar todo o contexto do projeto do zero.

**AllY · Genie** resolve quatro problemas práticos:

- **Contexto unificado entre modelos.** O histórico da conversa e sua base de regras ficam salvos localmente em arquivos Markdown (`pamyat/`). Você pode trocar de motor, modelo ou nível de raciocínio direto no campo de entrada para o próximo modelo continuar do mesmo ponto.
- **Visibilidade de agentes CLI.** Em um terminal comum é difícil acompanhar cada passo do agente a tempo e intervir durante a execução. No AllY, à esquerda aparecem a esfera de estado e o fluxo de atividade ao vivo separados por uma linha vertical suave e redimensionável; à direita ficam a conversa e a fila de tarefas com ajuste em tempo real (`live-steer`), edição da fila e priorização de mensagens importantes.
- **Controle de limites e janela de contexto.** O widget **«Recursos»** mostra o motor principal, a ocupação do contexto (com limite de `350k`) e as cotas de 5 horas e semanais das assinaturas; a aba **«Assistentes»** reúne os saldos das demais conexões. As métricas são lidas localmente sem chamadas pagas em segundo plano.
- **Controle dos dados e conexões diretas.** Conversas, notas em `pamyat/`, habilidades `.claude/skills/` e configurações locais `.ally-data/` permanecem no seu computador. Você usa suas próprias assinaturas e chaves diretamente nos provedores escolhidos.

---

## Para quem este aplicativo foi feito

- **Desenvolvedores e vibe coders** que conduzem projetos via Claude Code, Codex, Antigravity ou DeepSeek e querem ver passos dos agentes, fila e consumo de contexto em uma só janela.
- **Autores, empreendedores e especialistas** que precisam de memória local unificada para seus projetos no próprio PC.
- **Usuários de Windows 10/11** que querem uma ferramenta local com layout ajustável às suas tarefas e voz direta nas próximas atualizações pelo feedback integrado.

---

## O que realmente funciona na versão 0.1

### 1. Conexões e modo «Auto»
Para começar basta conectar pelo menos uma opção. No modo **«Auto»**, o sistema escolhe automaticamente o executor disponível:

| Conexão | Como funciona | O que faz na v0.1 |
|---|---|---|
| **Claude Code** | CLI oficial com assinatura Anthropic Pro / Max | Tarefas complexas, código, textos, planejamento e compactação automática de contexto |
| **Codex** | CLI oficial com assinatura ChatGPT Plus / Pro | Trabalho em repositórios e ajustes durante a resposta (`live-steer`) |
| **Antigravity** | CLI oficial do Google AI | Análises com contexto grande (limite `350k`) e acompanhamento de cotas |
| **DeepSeek Harness** | Perfil headless local `dsh` via saldo DeepSeek | Executor reserva econômico e consulta de saldo na aba «Assistentes» |
| **Agregador API (OpenRouter)** | Qualquer gateway compatível com Anthropic via Base URL e chave | Acesso a modelos externos pelo processo local Claude Code CLI (sem assinatura Anthropic) |
| **Qoder CLI** | CLI local (detecção e login) | Detectado pelo assistente de conexão (com login pela janela); uso como motor principal no chat sai na próxima atualização |

### 2. Espaço de trabalho e interface
- **Tela inicial:** à esquerda fica **«Conversa»** com esfera limpa sem texto, fluxo de passos e divisória fluida; à direita ficam **«Recursos» / «Assistentes»** (topo) e **«Notebook»** (abaixo), com altura livremente ajustável.
- **Barra superior (da direita para a esquerda):** relógio à direita, painel largo de **feedback (inseto)**, **pincel** (mover e redimensionar blocos, restaurar layout), **temas** (**Grafite** por padrão, além de Turquesa, Meia-noite, Escuro e Claro), **ícone de livro** (guia e versões dentro do app) e **raio** (assistente em 3 passos com **«Modo leitura»** amplo).
- **Armazenamento local:** `pamyat/` (memória Markdown local), `.claude/skills/` (habilidades locais), `.ally-data/` (chaves e layout da janela, excluída do Git).

## Instalação e execução (Windows 10/11)

**Antes de instalar, confirme que estes itens já estão instalados e no `PATH`:**
1. **Node.js 24+** (com suporte ao módulo integrado `node:sqlite`)
2. **Python 3**
3. **Git**
4. Acesso à internet na primeira compilação (`npm ci` e download do Electron) e pelo menos um motor de IA ou chave configurada.

Escolha qualquer um dos três métodos abaixo:

### Método 1 — arquivo ZIP e executável `.exe`
1. Baixe o ZIP do repositório e extraia em um caminho curto sem acentos ou caracteres cirílicos, como `C:\AllY`.
2. Dê duplo clique em **`AllY.exe`** — na primeira execução ele verifica `node` 24+, `python` e `git`, instala dependências, baixa o Electron, gera **`programma\Dzhinni.exe`**, cria o atalho **`AllY`** na área de trabalho e abre a janela.
  *Se o Windows SmartScreen avisar sobre um `.exe` novo sem assinatura, clique em **Mais informações → Executar assim mesmo** (o código-fonte está aberto em `docs/launchers/`, ou execute `.\ustanovka.ps1` diretamente).*
3. Depois, abra o aplicativo dando duplo clique em **`AllY.exe`**, no atalho **`AllY`** da área de trabalho ou diretamente em **`programma\Dzhinni.exe`**. Para abrir o guia e o histórico de versões em uma janela própria de aplicativo, execute **`AllY-Guide.exe`**.
4. Na primeira abertura aparece o assistente em 3 etapas — conecte sua IA e envie a primeira mensagem.

### Método 2 — comandos no terminal (PowerShell / cmd)
Abra o PowerShell e execute em sequência:

```powershell
git clone https://github.com/AyarZero/ally-dzhinni.git C:\AllY
cd C:\AllY
.\AllY.exe
```

Para checar depois se a compilação está pronta:

```powershell
.\AllY.exe -Proverka
```

Iniciar pelo terminal:

```powershell
.\AllY.exe
```

### Método 3 — prompt pronto para sua IA local
Se você já usa Claude Code, Codex, Antigravity ou outro assistente no PC, copie todo este texto e envie para ele:

```text
Instale e prepare para execução o aplicativo desktop local AllY · Genie (v0.1) neste PC Windows a partir do repositório https://github.com/AyarZero/ally-dzhinni:
1. Verifique no terminal se `git`, `python` (Python 3) e `node` estão disponíveis (é necessário Node.js 24+ com o teste `node -e "require('node:sqlite')"` funcionando). Se faltar algo ou o Node for anterior ao 24, me avise e ajude a instalar antes de compilar.
2. Clone o repositório em um caminho curto sem espaços ou caracteres cirílicos, por exemplo `C:\AllY`, e entre nessa pasta.
3. Execute a instalação: `powershell -NoProfile -ExecutionPolicy Bypass -File .\ustanovka.ps1` e aguarde gerar `programma\Dzhinni.exe`.
4. Verifique a compilação com `powershell -NoProfile -ExecutionPolicy Bypass -File .\ustanovka.ps1 -Proverka`.
5. Veja quais motores CLI (Claude Code, Codex, Antigravity, DeepSeek Harness, Qoder) ou chaves OpenRouter já existem no sistema e resuma o que está pronto.
6. Inicie `programma\Dzhinni.exe` (ou `.\AllY.exe`) e me avise que já posso abrir a janela do AllY e começar.
```

*Observação: executores CLI conectados operam diretamente nos arquivos da pasta aberta sem pedir confirmação a cada leitura ou edição — mantenha projetos importantes sob controle do Git.*

---

## Feedback e participação no projeto

À direita do cabeçalho (à esquerda do relógio) fica o botão com o **ícone de inseto — «Feedback»**. Por ele você pode direto da interface:

- relatar erro, problema visual ou falha de inicialização;
- anexar até **3 arquivos** de evidência: logs `.txt` / `.md` (até `2 MB`), imagens `.png` / `.jpg` / `.jpeg` / `.webp` / `.gif` (até `10 MB`) ou vídeos curtos `.mp4` / `.webm` / `.mov` (até `25 MB`, total até `30 MB`);
- sugerir um novo módulo, habilidade ou caso de uso.

São enviados **apenas o texto do formulário e os arquivos escolhidos** — conversas, notas pessoais e chaves continuam locais. As respostas dos desenvolvedores voltam direto para o chat do aplicativo. O projeto é aberto sob licença MIT: você pode criar suas próprias habilidades em `.claude/skills/` e contribuir com o núcleo.

---

## Problemas conhecidos e limitações da v0.1 em andamento

Registramos com transparência o que ainda tem limitações ou está em ajuste:

1. **Dependências instaladas previamente:** a instalação da `v0.1` exige `Node.js 24+`, `Python 3` e `Git` já presentes no sistema — um instalador `.exe` único sem preparação manual ainda está em desenvolvimento.
2. **Entrada e saída de voz ocultas na versão cliente v0.1:** os botões de microfone e voz foram ocultados temporariamente enquanto ajustamos o reconhecimento local (`GigaAM`) e seu instalador.
3. **O Diário («Conversa honesta») está oculto na versão v0.1:** o suporte a todos os motores está sendo finalizado e a aba será aberta em uma próxima atualização.
4. **Encerramento gradual do bridge ao fechar a janela:** ao fechar a janela, o servidor bridge local pode aguardar o tempo de inatividade (até ~9 minutos) para encerrar caso outra instância seja reaberta logo em seguida.
5. **Qoder em integração:** o assistente identifica o CLI local e o status de login, mas o uso como motor principal no chat ficará liberado na próxima versão.
6. **Atualização gradual do servidor para anexos grandes:** se ao enviar imagem ou vídeo o servidor de feedback recusar o envio antes de concluir sua atualização, você pode enviar na hora apenas como texto sem perder o rascunho.
7. **Plataforma:** testado e compilado apenas para **Windows 10/11**.

---

## Roadmap e prazos estimados

Os prazos são estimativos — as entregas próximas seguem por semanas e as mais distantes em faixas mais amplas, ajustadas conforme o feedback real dos usuários:

| Prazo estimado | O que está previsto |
|---|---|
| **Fim de novembro — início de dezembro de 2026** *(1–2 semanas)* | Correções com base nos primeiros relatos no app, suporte completo no servidor para envio de fotos e vídeos no feedback, encerramento imediato do bridge ao fechar a janela |
| **Segunda metade de dezembro de 2026** | Rastreador integrado **«Tarefas e Projetos»** (foco do dia, quadro, calendário, cartões) e aba **«Diário»** funcionando com qualquer motor escolhido |
| **Janeiro de 2027** | Retorno do **modo de voz local** (ditado offline sem nuvem + respostas faladas) e instalador simplificado sem preparo manual de `Node.js` e `Git` |
| **Fevereiro — março de 2027** | Seção **«Aprendizagem»** (biblioteca de aulas dentro da janela e curso introdutório gratuito sobre AllY e preparo de releases), construtor de widgets personalizados e módulos de revisão/conteúdo |
| **Abril — maio de 2027** | **Grafo de conhecimento** interativo do espaço de trabalho, painel **«Saúde do projeto»** (cobertura de vínculos e notas desatualizadas) e Qoder completo como assistente de leitura de código |
| **Junho — julho de 2027** | Beta do **cliente Android** conectado por canal seguro ao PC de casa sem segunda base de dados + adaptação desktop para macOS e Linux |
| **Agosto de 2027 em diante** | Lançamento estável `v1.0`, catálogo comunitário de habilidades e sincronização do espaço de trabalho entre múltiplos dispositivos |
