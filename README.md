# 🚀 Retail Analytics AI Platform

> **Nota:** Este é um projeto anonimizado de um sistema real desenvolvido em produção. Nomes de tabelas, banco de dados e referências da empresa foram substituídos por equivalentes genéricos.

---

## 📋 Sobre o Projeto

Plataforma de **Business Intelligence conversacional** construída para o time de crescimento de uma varejista de médio-grande porte. O objetivo é transformar dados do data warehouse em **insights estratégicos acionáveis**, via linguagem natural — sem necessidade de SQL ou BI tradicional.

O sistema combina um **agente SQL com ReAct loop** (LangGraph) com um **dashboard de métricas em tempo real**, tudo integrado ao Databricks SQL Warehouse.

---

## 🏗️ Arquitetura

```
┌──────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)                   │
│  Chat Interface │ Metrics Dashboard │ Executive Reports          │
└──────────────────────────┬───────────────────────────────────────┘
                           │ REST + SSE (Streaming)
┌──────────────────────────▼───────────────────────────────────────┐
│                     Backend (FastAPI + Python)                   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   LangGraph Agent Graph                  │    │
│  │                                                          │    │
│  │  [Intent Classifier] → [SQL Agent / Report Agent]       │    │
│  │         ↓                     ↓                          │    │
│  │  [Response Formatter]  [Databricks Repository]           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  PostgreSQL (Auth) │ Redis (Cache + Checkpoint) │ MongoDB (Audit)│
└──────────────────────────┬───────────────────────────────────────┘
                           │ ODBC
┌──────────────────────────▼───────────────────────────────────────┐
│              Databricks SQL Warehouse (Data Layer)               │
│   customer_lifecycle_history │ ecommerce_orders │ store_sales    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Stack Tecnológico

### Backend
| Tecnologia | Uso |
|---|---|
| **FastAPI** | REST API + SSE streaming |
| **LangGraph** | Orquestração do agente ReAct multi-step |
| **AWS Bedrock (Claude Sonnet)** | LLM principal para raciocínio e geração de SQL |
| **Google Gemini** | LLM alternativo / fallback |
| **Databricks SQL** | Data warehouse — queries analíticas em larga escala |
| **PostgreSQL + pgvector** | Autenticação + busca vetorial de documentos |
| **Redis** | Rate limiting, cache de queries, checkpointing do grafo |
| **MongoDB** | Audit logging de todas as interações |
| **Pydantic v2** | Validação de schemas e configuração |

### Frontend
| Tecnologia | Uso |
|---|---|
| **React 18 + TypeScript** | Interface principal |
| **Vite** | Build tool e dev server |
| **Tailwind CSS** | Estilização |
| **Recharts** | Visualizações de métricas |
| **SSE (EventSource)** | Streaming de respostas do agente em tempo real |

---

## ✨ Funcionalidades Principais

### 🤖 Agente SQL Conversacional (ReAct Loop)
- Interpreta perguntas em linguagem natural e gera SQL otimizado para Databricks
- Loop de raciocínio multi-step: **pensa → age → observa → responde**
- Validação de segurança: bloqueia comandos destrutivos (DELETE, DROP, ALTER)
- Histórico de conversas persistido com busca semântica

### 📊 Dashboard de Métricas em Tempo Real
- **Base Ativa Target**: clientes Premium, Alto e Médio Potencial com comparação MoM/YoY
- **Taxa de Churn**: análise por cluster com early warning system
- **LTV Médio**: lifetime value por segmento com tendências
- **Omnichannel**: correlação de comportamento omni vs. single-channel
- **Heatmap Geográfico**: distribuição de clientes por estado/região (loja física + e-commerce)

### 📋 Relatórios Executivos Automatizados
- Geração de apresentações executivas completas via IA
- Análise de cohort de novos clientes
- Deep-dive por cluster, canal e região
- Projeção linear shift-left para fim de mês

### 🔐 Autenticação & Segurança
- JWT com refresh token rotation
- Rate limiting por IP via Redis
- Middleware de logging de todas as requisições

---

## 🚀 Como Rodar Localmente

### Pré-requisitos
- Python 3.11+
- Node.js 18+
- Docker + Docker Compose
- Conta Databricks com SQL Warehouse configurado

### 1. Backend

```bash
cd backend
cp .env.example .env
# Preencha o .env com suas credenciais
pip install -r requirements.txt
uvicorn main:app --reload
```

### 2. Infraestrutura (PostgreSQL + Redis + MongoDB)

```bash
cd infra
docker-compose up -d
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Acesse: `http://localhost:5173`

---

## 📐 Decisões de Design Relevantes

### Por que LangGraph em vez de chain simples?
O agente precisa de **múltiplos passos de raciocínio** antes de responder: classificar intenção → decidir se é SQL ou relatório → executar query → validar resultado → formatar resposta. O grafo direcional do LangGraph torna esse fluxo explícito, testável e fácil de depurar.

### Por que Shift-Left nos cálculos?
Todos os cálculos de variação percentual, projeções lineares e agregações são feitos **dentro do SQL**, não em Python ou JavaScript. Isso garante consistência com dashboards de BI externos e elimina divergências por arredondamento do LLM.

### Safety Gate no Databricks
Antes de qualquer query ser executada, um validador regex bloqueia comandos destrutivos. O sistema é **read-only por design**.

### Cache de Queries com TTL
Queries de métricas são cacheadas no Redis por 1 hora, evitando sobrecarga no warehouse e reduzindo latência para o usuário final.

---

## 📁 Estrutura do Projeto

```
├── backend/
│   ├── app/
│   │   ├── api/endpoints/        # auth, chat, metrics, report
│   │   ├── core/                 # config, security, logging
│   │   ├── db/
│   │   │   └── repositories/     # DatabricksRepository (toda a camada SQL)
│   │   ├── graph/
│   │   │   ├── nodes/agents/     # sql_agent, intent_classifier, report_agent
│   │   │   └── graph_definition.py
│   │   └── services/             # lógica de negócio, chat history, relatórios
│   └── main.py
├── frontend/
│   ├── components/               # UI components
│   ├── services/                 # API clients
│   └── App.tsx
└── infra/
    └── docker-compose.yml
```

---

## 👤 Autor

**Arthur Correia** — [LinkedIn](https://linkedin.com/in/seu-perfil) · [GitHub](https://github.com/seu-usuario)

> *Projeto desenvolvido no contexto de uma iniciativa de crescimento de CRM, com foco em democratizar o acesso a dados analíticos para times de negócio.*
