# NUX Pulse — MCP Server

O backend expõe um servidor **MCP (Model Context Protocol)** em `/mcp` que
permite Claude.ai, Claude Desktop, Cursor e outros clientes MCP usarem o
Pulse como ferramenta nativa.

## Endpoint

```
https://nux-pulse-production.up.railway.app/mcp/
```

Transport: HTTP streamable (protocolo MCP padrão).

## Autenticação

Mesmo `X-API-Key` do resto da API (ou `Authorization: Bearer <key>` —
ambos aceitos). O valor está em `$env:CLAUDE_PULSE_API_KEY` (Windows) ou
`$CLAUDE_PULSE_API_KEY` (bash/zsh).

## Tools expostas

| Tool | Descrição |
|---|---|
| `list_clients()` | Lista clientes + slugs + budgets |
| `list_connections(slug)` | Conexões Meta/Google do cliente |
| `create_task(slug, title, description?, status?, priority?, platform?, task_type?, ai_context?, due_at_iso?)` | Cria task no Planejamento. `ai_scheduled=true` automático. |
| `list_tasks(slug, status?, limit?)` | Lista tarefas recentes |
| `update_task_status(task_id, status)` | Move task entre colunas |
| `get_meta_overview(slug, days?)` | KPIs consolidados Meta dos últimos N dias |
| `list_meta_campaigns(slug, days?, top?)` | Top campanhas por gasto |

## Conectar no Claude Desktop

1. Abra **Configurações → Desenvolvedor → Editar Config** (ou edite
   `~/AppData/Roaming/Claude/claude_desktop_config.json` no Windows).

2. Adicione o servidor:

```json
{
  "mcpServers": {
    "nux-pulse": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://nux-pulse-production.up.railway.app/mcp/",
        "--header",
        "X-API-Key:${NUX_PULSE_API_KEY}"
      ],
      "env": {
        "NUX_PULSE_API_KEY": "<cole-aqui-o-valor-de-CLAUDE_PULSE_API_KEY>"
      }
    }
  }
}
```

3. **Reinicie o Claude Desktop**.

4. Abra um chat — deve aparecer o ícone de ferramentas com "nux-pulse"
   disponível. Teste pedindo *"use nux-pulse para listar os clientes"*.

## Conectar no Claude.ai (web)

Claude.ai suporta MCP via **Settings → Integrations → Add custom server**.
Configure:

- **Server URL:** `https://nux-pulse-production.up.railway.app/mcp/`
- **Authentication:** Custom header → `X-API-Key: <valor>`

Depois, nas conversas, ative a integração "nux-pulse" e invoque as tools
normalmente.

## Uso típico junto com skills de ads

Quando a skill `meta-ads-ratos` ou `google-ads-ratos` for invocada, o
Claude deve:

1. Executar a ação na plataforma (pausar campanha, criar ad, etc)
2. **Chamar `create_task`** do MCP nux-pulse imediatamente após,
   com `title` descrevendo a ação, `description` com antes/depois/motivos,
   e `ai_context` com IDs + JSON do raw change.

Isso cria rastro completo no Planejamento do cliente.

## Troubleshooting

- **401 ao conectar**: cheque se `X-API-Key` header está sendo enviado e
  bate com `API_SECRET_KEY` do Railway.
- **Tool não aparece no Claude Desktop**: verifique logs do Claude Desktop
  (Developer tools) e do próprio Pulse API em Railway.
- **Timeout**: o MCP streamable-http tem keepalive — se sua rede fecha
  long-polling, pode dar drops. Alternativa: usar SSE transport (não
  implementado aqui por enquanto).
