# nux-pulse-integration

Plugin Claude Code que conecta o Claude ao backend do NUX Pulse via MCP e
instrui o modelo a registrar automaticamente toda ação executada em Meta Ads
e Google Ads como task no Planejamento do cliente correspondente.

## O que inclui

- **MCP server `nux-pulse`** (`.mcp.json`) — 7 tools expostas:
  `list_clients`, `list_connections`, `create_task`, `list_tasks`,
  `update_task_status`, `get_meta_overview`, `list_meta_campaigns`.
- **Skill `pulse-task-tracker`** — model-invoked, dispara quando Claude
  executa ação em ads. Garante `create_task` automático após a ação.

## Instalação (por PC)

**Requisito único:** ter a variável de ambiente `CLAUDE_PULSE_API_KEY`
definida (o plugin lê ela no `.mcp.json` pra autenticar no Pulse).

### Windows (PowerShell, user-level permanente)

```powershell
[Environment]::SetEnvironmentVariable("CLAUDE_PULSE_API_KEY", "<cole_a_key>", "User")
```

Fecha e abre o terminal. Depois:

```powershell
claude plugins marketplace add https://github.com/caiquesz/Nux-pulse.git
claude plugins install nux-pulse-integration
```

### macOS / Linux

```bash
echo 'export CLAUDE_PULSE_API_KEY="<cole_a_key>"' >> ~/.zshrc  # ou .bashrc
source ~/.zshrc

claude plugins marketplace add https://github.com/caiquesz/Nux-pulse.git
claude plugins install nux-pulse-integration
```

## Validar que funcionou

Em qualquer sessão Claude Code / Claude Desktop / Cowork (com plugin
support), abra um chat e peça:

> *"Use nux-pulse para listar os clientes Pulse"*

Deve retornar a lista de 6 clientes. Se der erro de auth, cheque o valor
de `$env:CLAUDE_PULSE_API_KEY` (Windows) ou `$CLAUDE_PULSE_API_KEY` (bash).

## Atualizações

```bash
claude plugins update nux-pulse-integration
```

## Desinstalar

```bash
claude plugins uninstall nux-pulse-integration
```

## Referências

- Servidor MCP rodando em: https://nux-pulse-production.up.railway.app/mcp/
- Docs do MCP do Pulse: [MCP.md](../MCP.md)
- Instruções integração ads → Pulse: [CLAUDE.md](../CLAUDE.md)
