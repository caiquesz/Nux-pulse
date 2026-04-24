---
name: pulse-task-tracker
description: Automatically logs every action executed on Meta Ads or Google Ads platforms as a task in the NUX Pulse client project board. Use whenever the user invokes meta-ads-ratos, google-ads-ratos, or any skill that creates, pauses, duplicates, edits, or analyzes campaigns, ad sets, ads, creatives, keywords, negatives, or targeting — BEFORE returning the response, call the nux-pulse MCP `create_task` tool to record the action.
---

# Pulse Task Tracker

Sempre que uma ação for executada em plataforma de ads para um cliente NUX,
registre no Pulse imediatamente após a ação.

## Quando ativar

- Usuário invocou `meta-ads-ratos` ou `google-ads-ratos` e você executou QUALQUER
  das ações: pausar, ativar, criar, editar, duplicar, deletar, ajustar budget/bid,
  trocar UTM, adicionar keywords/negativas, análise de performance, etc.
- Usuário pediu explicitamente pra registrar ação no Pulse
- Usuário mencionou nome de cliente NUX conhecido: Segredos de Minas, Toque Mineiro,
  Forbli, Evler, Luana Corretora, Resende Decor

## O que fazer

1. **Identifique o slug do cliente** pela conta Meta/Google usada.
   Se não souber o slug, chame `list_connections(slug="<palpite>")` ou `list_clients()`
   via MCP nux-pulse pra descobrir.

2. **Após executar a ação**, chame `create_task` via MCP nux-pulse com:

   | Arg | Valor |
   |---|---|
   | `slug` | slug do cliente (ex.: "resende-decor") |
   | `title` | descrição curta em 1 linha (ex.: "Pausei campanha: BR Broad 2026") |
   | `description` | markdown com detalhes: **motivo**, IDs, antes/depois, números relevantes |
   | `platform` | "meta" ou "google" |
   | `task_type` | ver tabela abaixo |
   | `priority` | "baixa"/"media"/"alta"/"urgente" conforme impacto |
   | `status` | "done" se a ação foi concluída, "waiting" se deu erro |
   | `ai_context` | JSON com raw da ação: IDs, prev_value, new_value |

3. **Se der erro na plataforma**, ainda assim crie a task com `status="waiting"`
   e `priority="alta"` — o registro ajuda o dono da conta a retomar depois.

## Mapeamento ação → task_type

| Ação | task_type |
|---|---|
| Pausar/ativar campanha, adset, ad | `otimizacao` |
| Ajustar budget, bid, orçamento | `otimizacao` |
| Adicionar keywords, negativas | `otimizacao` |
| Criar nova campanha, adset, ad | `lancamento` |
| Duplicar campanha | `lancamento` |
| Editar criativo, trocar UTM, novo RSA | `criativo` |
| Analisar performance, extrair insights, revisar search terms | `analise` |
| Gerar/enviar relatório | `relatorio` |
| Outros | `outro` |

## Clientes NUX conhecidos (para referência rápida)

| Slug | Nome | Meta account | Google customer |
|---|---|---|---|
| `segredos-de-minas` | Segredos de Minas | act_2221699994983146 | — |
| `toque-mineiro` | Toque Mineiro | act_2497601340297080 | — |
| `forbli` | Forbli | act_1332996677949514 | 7447413166 |
| `evler` | Evler | act_620155076546064 | — |
| `luana-corretora` | Luana Corretora | act_1427593931447285 | — |
| `resende-decor` | Resende Decor | act_1183149460178185 | — |

(Lista pode estar desatualizada — use `list_clients()` do MCP pra conferir.)

## Exemplo de fluxo completo

Usuário: *"Pausa a campanha BR Broad do Segredos, o CPA tá 3x acima do target"*

1. Você chama Meta API via skill meta-ads-ratos → pausa
2. Você chama MCP nux-pulse → `create_task`:
   ```json
   {
     "slug": "segredos-de-minas",
     "title": "Pausei campanha: BR Broad 2026",
     "description": "**Motivo:** CPA 3x target (R$45 vs R$15)\n\n- campaign_id: 120210XXX\n- spend_7d: R$2.100\n- conv_7d: 12\n- CPA real: R$175",
     "platform": "meta",
     "task_type": "otimizacao",
     "priority": "alta",
     "status": "done",
     "ai_context": "{\"campaign_id\":\"120210XXX\",\"prev_status\":\"ACTIVE\",\"new_status\":\"PAUSED\"}"
   }
   ```
3. Responde ao usuário: *"Campanha pausada. Registrei no Pulse como task #N (link)."*
