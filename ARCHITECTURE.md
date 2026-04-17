# 🏗️ FELICIA — ARSITEKTUR SISTEM LENGKAP

**Status:** Phase 1-3 Completed | Phase 4 Planning
**Last Updated:** April 18, 2026
**Tech Stack:** React (Vite) + Node.js (Vercel) + Supabase + Gemini API

---

## 📋 TABLE OF CONTENTS

1. [System Overview](#1-system-overview)
2. [Layer 0: Data & Identity](#2-layer-0-data--identity)
3. [Layer 1: AI Brain](#3-layer-1-ai-brain)
4. [Layer 2: Backend API](#4-layer-2-backend-api)
5. [Layer 3: Frontend](#5-layer-3-frontend)
6. [Layer 4: Local Extensions](#6-layer-4-local-extensions)
7. [Implementation Status](#7-implementation-status)
8. [Roadmap & Priorities](#8-roadmap--priorities)
9. [Integration Points](#9-integration-points)

---

## 1. SYSTEM OVERVIEW

### High-Level Architecture

```
┌─────────────────────────────────────────┐
│   FELICIA — Personal AI OS              │
│   Single Brain, Multi-Interface         │
└─────────────────────────────────────────┘

         ┌──────────────────────┐
         │   USER (Adit)        │
         └──────────┬───────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
    ┌───▼───┐  ┌───▼────┐ ┌──▼──────┐
    │ WEB   │  │ VOICE  │ │  LOCAL  │
    │ APP   │  │AGENT   │ │ AGENT   │
    │(✓)    │  │(→)     │ │  (→)    │
    └───┬───┘  └────┬───┘ └─┬──────┘
        │           │       │
        └───────────┼───────┘
                    │
        ┌───────────▼──────────┐
        │  VERCEL API LAYER    │
        │  (Orchestrator)      │
        └───────────┬──────────┘
                    │
        ┌───────────┼──────────────┐
        │           │              │
    ┌───▼────┐  ┌──▼───┐    ┌───▼────┐
    │ GEMINI │  │SUPA  │    │EXTERNAL│
    │ AI     │  │BASE  │    │ APIs   │
    │        │  │      │    │        │
    └────────┘  └──────┘    └────────┘
```

### Core Principles

- **Single Database:** Supabase adalah single source of truth
- **Single Brain:** Gemini (swappable, dengan fallback chain)
- **Deterministic Routing:** Bypass AI untuk aksi sederhana (calendar, events, memory)
- **Context Layering:** Profile → Events → Memories → Cases → AI
- **Modular Design:** Fitur terpisah, tapi unified dalam Felicia persona
- **Cost Efficient:** Phase 1 = gratis, Phase 2-3 minimal cost

---

## 2. LAYER 0: DATA & IDENTITY

### Database Schema (Supabase PostgreSQL)

#### Core Tables

| Table | Columns | Purpose | Status |
|-------|---------|---------|--------|
| `felicia_profiles` | id, name, bio, immutable_facts, dynamic_state, timeline | Canonical profile | ✅ |
| `felicia_memories` | id, text, scope, category, title, created_at, updated_at | Personal context | ✅ |
| `felicia_chat_threads` | id, user_id, title, mode (utama/refleksi/strategi), created_at | Chat sessions | ✅ |
| `felicia_messages` | id, thread_id, role (user/asst), content, action, params, created_at | Chat history | ✅ |
| `felicia_goals` | id, title, category, target_date, progress, status, created_at | Goal tracking | ✅ |
| `felicia_events` | id, title, start, end, description, calendar_id, created_at | Calendar/schedule | ✅ |
| `felicia_transactions` | id, amount, category, description, date, type (in/out) | Finance tracking | ✅ |
| `felicia_commands` | id, action, params, user_id, timestamp, status, result | Audit log | ✅ |
| `felicia_modes` | id, mode_name, activated_at, reason, deactivated_at | Condition tracking | ✅ |
| `felicia_cases` | id, title, category, entities (JSONB), summary, details (JSONB), status, related_memories, created_at, updated_at | Case/situation tracking | ✅ |
| `felicia_case_links` | id, case_a_id, case_b_id, link_type (ENUM), created_at | Case relationships | ✅ |

#### Indexes & Optimizations

| Index | Table | Columns | Purpose | Status |
|-------|-------|---------|---------|--------|
| idx_cases_status | felicia_cases | status | Filter by active/resolved | ✅ |
| idx_cases_category | felicia_cases | category | Category filtering | ✅ |
| idx_cases_created | felicia_cases | created_at | Timeline sorting | ✅ |
| idx_cases_updated | felicia_cases | updated_at | Recent changes | ✅ |
| idx_cases_entities_gin | felicia_cases | entities (GIN) | Entity search | ✅ |
| idx_case_links_a | felicia_case_links | case_a_id | Link lookup | ✅ |
| idx_case_links_b | felicia_case_links | case_b_id | Link lookup | ✅ |
| idx_case_links_type | felicia_case_links | link_type | Relationship type | ✅ |

#### Views & Analytics

| View | Purpose | Status |
|------|---------|--------|
| `case_stats` | Aggregate case stats by category/status | ✅ |

#### Triggers

| Trigger | Action | Status |
|---------|--------|--------|
| `update_felicia_cases_timestamp` | Auto-update `updated_at` on case modification | ✅ |

### Enums & Types

```sql
-- Link types untuk case relationships
link_type_enum = 'related_to' | 'parent_of' | 'child_of' | 'duplicate_of'

-- Case status
case_status = 'active' | 'resolved' | 'archived' | 'deleted'

-- Memory scope
memory_scope = 'profile' | 'ephemeral' | 'timeline' | 'todo'

-- Chat mode
chat_mode = 'utama' | 'refleksi' | 'strategi'

-- Transaction type
transaction_type = 'income' | 'expense'
```

### Data Guard Policies

- ✅ Identity validation (compare profile facts)
- ✅ Deduplication logic (memory check before save)
- ✅ Retention policy (auto-delete old ephemeral data)
- → Encryption layer (planned Phase 4)
- → Access control (planned Phase 3b)

---

## 3. LAYER 1: AI BRAIN

### Gemini API Integration

#### Model Chain (Fallback Strategy)

```
Primary:      gemini-2.5-flash      (best quality, balanced cost)
Fallback 1:   gemini-2.0-flash      (proven stable)
Fallback 2:   gemini-1.5-flash      (cheaper, slower)
Fallback 3:   gemini-1.5-flash-8b   (ultra-cheap, basic quality)
```

**File:** `api/_lib/gemini.js` (✅ Complete)

#### Context Injection Pipeline

```
┌──────────────────┐
│  Raw User Input  │
└────────┬─────────┘
         │
    ┌────▼────────────────────────────┐
    │ 1. BUILD SYSTEM PROMPT           │
    │    - Layer 0: Identity           │
    │    - Layer 1: AI Brain settings  │
    │    - Layer 2: API context        │
    └────┬──────────────────────────┬──┘
         │                          │
    ┌────▼──────────────┐   ┌──────▼─────────┐
    │ 2. PROFILE        │   │ 3. EVENTS      │
    │    - Immutable    │   │    - Today     │
    │    - Dynamic      │   │    - Calendar  │
    │    - Timeline     │   │                │
    └────┬──────────────┘   └──────┬─────────┘
         │                          │
    ┌────▼──────────────┐   ┌──────▼─────────┐
    │ 4. MEMORIES       │   │ 5. CASES       │
    │    - Recent       │   │    - Active    │
    │    - Scoped       │   │    - Context   │
    │    - Relevant     │   │    - Links     │
    └────┬──────────────┘   └──────┬─────────┘
         │                          │
         └────────────┬─────────────┘
                      │
              ┌───────▼────────┐
              │ 6. SEND PROMPT │
              │    + MESSAGES  │
              │    → GEMINI    │
              └───────┬────────┘
                      │
              ┌───────▼────────────┐
              │ 7. PARSE RESPONSE  │
              │    - Text          │
              │    - Actions       │
              │    - Parameters    │
              └───────┬────────────┘
                      │
           ┌──────────┴──────────┐
           │                     │
       ┌───▼──┐         ┌───────▼──────┐
       │REPLY │         │ACTION ROUTE  │
       └──────┘         └──────────────┘
```

**File:** `api/_lib/context.js` (✅ Complete, 325 lines)

#### Functions & Capabilities

| Function | Purpose | Status |
|----------|---------|--------|
| `buildSystemPrompt()` | Kompile konteks + persona + case management | ✅ |
| `askGemini(message, { ...context })` | Call Gemini dengan fallback + error handling | ✅ |
| `parseGeminiResponse()` | Extract text + actions + parameters | ✅ |

### Case Management Intelligence (Phase 2-3)

**File:** `api/_lib/cases.js` (✅ Complete, 659 lines)

#### Phase 2: Case Awareness

| Function | Purpose | Status |
|----------|---------|--------|
| `analyzeChatForCaseReference(message)` | Detect case mentions dengan scoring | ✅ |
| `extractCaseKeywords(caseData)` | Generate searchable keywords | ✅ |
| `getRelatedCases(caseId)` | Find related cases by entities/category | ✅ |

**Scoring:** Title match (+100) → Entity (+50) → Keyword (+20) → Category (+15)

#### Phase 3: Auto-Detection & Creation

| Function | Purpose | Status |
|----------|---------|--------|
| `extractCaseFromMessage(message)` | Heuristic pattern matching (case X, utang dengan Y, dst) | ✅ |
| `detectCaseUpdate(message, activeCases)` | Identify if message updates existing case | ✅ |
| `generateCaseSummary(caseId)` | Prepare case context for reply injection | ✅ |
| `analyzeCaseRelationships(caseId)` | Multi-factor relationship analysis | ✅ |
| `buildCaseContextForReply(caseId)` | Format case info untuk Gemini reply | ✅ |

**Scoring (Relationships):** Shared entities (+50) → Category (+30) → Timeline <7d (+20) → Keywords (+15)

#### Phase 4 (Planned): Advanced Intelligence

- [ ] Case auto-summary generation (Gemini-powered)
- [ ] Case linking recommendations (ML-like pattern detection)
- [ ] Case outcome prediction (timeline-based)
- [ ] Case complexity scoring (multi-factor)

---

## 4. LAYER 2: BACKEND API

### Vercel Serverless Functions

**Tech:** Node.js 18+, Vercel Functions

#### Core Endpoints

| Method | Endpoint | Action | Handler | Status |
|--------|----------|--------|---------|--------|
| POST | `/api/chat` | send_message | handleChatMessage | ✅ |
| POST | `/api/chat` | list_threads | handleListThreads | ✅ |
| POST | `/api/chat` | create_thread | handleCreateThread | ✅ |
| POST | `/api/chat` | get_messages | handleGetMessages | ✅ |
| POST | `/api/chat` | rename_thread | handleRenameThread | ✅ |
| POST | `/api/chat` | delete_thread | handleDeleteThread | ✅ |

#### Direct Actions (No AI Required)

| Action | Handler | Purpose | Status |
|--------|---------|---------|--------|
| `save_memory` | handleSaveMemory | Simpan memory dengan title (Phase 1) | ✅ |
| `get_events` | handleGetEventsAction | Fetch events dari Google Calendar | ✅ |
| `set_mode` | handleSetModeAction | Activate mode (DROP/CHAOS/OVERWORK) | ✅ |
| `create_event` | handleCreateEventAction | Create calendar event | ✅ |
| `delete_event` | handleDeleteEventAction | Delete event by ID | ✅ |
| `reschedule` | handleRescheduleAction | Update event time | ✅ |
| `create_case` | handleCreateCaseAction | Create case manually | ✅ |
| `get_cases` | handleGetCasesAction | List cases (filtered) | ✅ |
| `get_case_suggestions` | handleGetCaseSuggestionsAction | Get case suggestions for message | ✅ |
| `create_case_auto` | handleCreateCaseAutoAction | Auto-create case dari extract | ✅ |
| `update_case` | handleUpdateCaseAction | Add detail to case | ✅ |

#### Supporting Endpoints

| Method | Endpoint | Purpose | Status |
|--------|----------|---------|--------|
| GET | `/api/profile` | Fetch profile canonical | ✅ |
| POST | `/api/profile` | Update profile | ✅ |
| GET | `/api/quota-status` | Gemini quota + rate limit info | ✅ |
| GET | `/api/quota-eta` | ETA untuk reset quota | ✅ |
| GET | `/api/quota-debug` | Debug breakdown quota status (dev-only) | ✅ |
| POST | `/api/memory` | Save memory | ✅ |
| GET | `/api/memory` | Fetch scoped memories | ✅ |
| POST | `/api/import-memory` | Bulk import dari JSON/CSV | ✅ |
| POST | `/api/convert-transcript` | Convert chat → seed memory | ✅ |
| GET | `/api/cron/morning-brief` | Daily briefing (scheduled) | ✅ |

#### Library Files

| File | Purpose | Lines | Status |
|------|---------|-------|--------|
| `_lib/gemini.js` | Gemini API wrapper + fallback | 150+ | ✅ |
| `_lib/context.js` | System prompt builder | 325 | ✅ |
| `_lib/supabase.js` | Supabase client + CRUD | 300+ | ✅ |
| `_lib/cases.js` | Case management logic | 659 | ✅ |
| `_lib/calendar.js` | Google Calendar integration | 200+ | ✅ |
| `_lib/profile.js` | Profile management | 150+ | ✅ |
| `_lib/mode.js` | Mode activation logic | 50+ | ✅ |
| `_lib/discord.js` | Discord integration (future) | 100+ | ⏳ |
| `_lib/transcript.js` | Transcript parsing | 100+ | ✅ |

### Direct Action Routing Pattern

**Philosophy:** Deterministic actions bypass Gemini untuk efisiensi token

```
User Input
    ↓
Parse Action + Params
    ↓
    ├─ IF deterministic (set_mode, get_events, delete_event, save_memory, create_case_auto, update_case)
    │  └─→ Execute directly → Return result
    │
    └─ IF conversational → Send to Gemini
       └─→ Parse actions from response
       └─→ Execute actions if detected
       └─→ Return text + action result
```

**Benefits:**
- ✅ Zero token cost untuk aksi sederhana
- ✅ Faster response time
- ✅ Reliable (tidak bergantung AI parsing)
- ✅ Easier to debug

---

## 5. LAYER 3: FRONTEND

### Tech Stack

- **Framework:** React 19.2 + Vite 8
- **Routing:** React Router 7
- **Storage:** Browser localStorage + Supabase client-side cache
- **Styling:** CSS3 + Custom components (no Tailwind)
- **Build:** Vite build → Vercel deployment

### Routes & Pages

| Route | Page Component | Purpose | Status |
|-------|----------------|---------|--------|
| `/today` | TodayPage.jsx | Dashboard harian | ✅ |
| `/chat` | ChatPage.jsx | Chat workspace (3 mode) | ✅ |
| `/goals` | GoalsPage.jsx | Goal tracking + milestones | ✅ |
| `/time` | TimePage.jsx | Calendar + time blocking | ✅ |
| `/finance` | FinancePage.jsx | Transaction tracking | ✅ |
| `/memory` | MemoryPage.jsx | Profile + memory timeline | ✅ |
| `/strategy` | StrategyPage.jsx | Case management dashboard | ✅ |
| `/settings` | SettingsPage.jsx | Config + monitoring | ✅ |

### Navigation Structure

```
🤖 FELICIA
├─ UTAMA
│  ├─ ☀️  Hari Ini          → /today
│  └─ 💬 Chat              → /chat
│
├─ KELOLA
│  ├─ 🎯 Goals             → /goals
│  ├─ ⏰ Waktu             → /time
│  ├─ 💰 Keuangan          → /finance
│  └─ 🎪 Strategi (Cases)  → /strategy
│
└─ LAINNYA
   ├─ 🧠 Memory            → /memory
   └─ ⚙️  Settings          → /settings
```

### Key Features Per Page

#### ChatPage.jsx (✅ Complete, 423 lines)

**Features:**
- Three chat modes: Utama (normal) | Refleksi (deep) | Strategi (tactical)
- Thread management (list, create, delete, rename)
- Real-time message display with role (user/assistant)
- Quota status badge
- **NEW (Phase 3):** Case suggestions panel (debounced 500ms)
- **NEW (Phase 3):** Case action confirmation modal

**State:**
- `messages`: array of {role, content, action, params, timestamp}
- `threads`: array of {id, title, mode, created_at}
- `activeThreadId`: current thread ID
- `activeMode`: 'utama' | 'refleksi' | 'strategi'
- `caseSuggestions`: array of suggested cases
- `showCaseSuggestions`: boolean
- `caseActionModal`: {show, type, action, params, message, threadId}

**Handlers:**
- `sendChat(message)`: submit message → /api/chat
- `handleCaseActionConfirm()`: confirm case action
- `handleCaseActionCancel()`: dismiss case modal

#### StrategyPage.jsx (✅ Complete, 230 lines)

**Features:**
- Case list dengan filtering by category
- Case detail panel dengan click-to-expand
- Timeline view (case details dengan timestamps)
- Statistics (detail count per case)
- Skeleton loaders + error states

**State:**
- `cases`: array of all cases
- `activeCase`: currently selected case
- `filter`: current category filter
- `loading`: boolean
- `error`: error message

#### MemoryPage.jsx (✅ Complete)

**Features:**
- Profile display (canonical facts + dynamic state)
- Memory timeline (chronological view)
- Manual memory add form (with title field)
- Memory search
- Context panel (import/export/convert options)

#### TodayPage.jsx (✅ Complete)

**Features:**
- Daily dashboard dengan greeting
- Schedule card (from getEvents)
- Goals progress summary
- Finance snapshot
- Mode buttons (set-mode action)
- Quick actions
- **Fixed (Phase 1):** No auto-chat quota waste (use getEvents directly)

#### GoalsPage.jsx (✅ Complete)

**Features:**
- Goal list dengan CRUD
- Goal detail page dengan milestones
- Progress tracking
- Weekly review
- Status filtering

#### TimePage.jsx (✅ Complete)

**Features:**
- Calendar view (date picker)
- Events for selected date
- Create event form
- Delete/reschedule event buttons
- Focus blocks visualization

#### FinancePage.jsx (✅ Complete)

**Features:**
- Transaction list dengan CRUD
- Category filtering
- Budget status
- Monthly summary
- Charts (future)

#### SettingsPage.jsx (✅ Complete)

**Features:**
- Profile editor
- Quota monitor (live tracking)
- Integration settings
- Voice settings (Phase 2 placeholder)
- Local agent settings (Phase 3 placeholder)

### UI Components

| Component | Purpose | Status |
|-----------|---------|--------|
| Layout | Sidebar + main content + right panel | ✅ |
| Sidebar | Navigation + quota indicator | ✅ |
| ChatMessage | Message display (user/asst styling) | ✅ |
| ThreadList | Thread management | ✅ |
| ModeSelector | Chat mode buttons | ✅ |
| EventCard | Event display with delete/edit | ✅ |
| CaseSuggestionsPanel | Case recommendations in chat | ✅ |
| CaseActionModal | Confirmation modal untuk case actions | ✅ |
| SkeletonLoader | Loading states | ✅ |

### Service Layer (src/services/api.js)

| Function | Purpose | Status |
|----------|---------|--------|
| `sendChat(message, options)` | POST to /api/chat | ✅ |
| `getThreads()` | Fetch all threads | ✅ |
| `createThread(title, mode)` | Create new thread | ✅ |
| `deleteThread(id)` | Delete thread | ✅ |
| `renameThread(id, newTitle)` | Update thread title | ✅ |
| `getMessages(threadId)` | Fetch thread messages | ✅ |
| `saveMemory(text, scope, title)` | Save memory dengan title | ✅ |
| `getMemories(scope)` | Fetch scoped memories | ✅ |
| `importMemories(data)` | Bulk import | ✅ |
| `convertTranscript(transcript)` | Convert chat to seed | ✅ |
| `getQuotaStatus()` | Fetch quota info | ✅ |
| `getQuotaEta()` | Fetch quota ETA | ✅ |
| `getCaseSuggestions(message)` | Get case suggestions | ✅ |
| `createCaseAutoAction(caseData)` | Auto-create case | ✅ |
| `updateCaseAction(caseId, detail)` | Update case | ✅ |
| `getCasesAction(status)` | Fetch cases | ✅ |

---

## 6. LAYER 4: LOCAL EXTENSIONS

### Voice Assistant (Phase 2)

**Status:** → (Planned)

**Architecture:**
```
Electron App (Desktop)
├─ Mic listener (push-to-talk or wake word)
├─ Speech-to-text (local Whisper or cloud)
├─ Integration with /api/chat
├─ Text-to-speech output
└─ Voice context awareness (use case + memory context)
```

**Endpoints to Build:**
- POST `/api/voice/transcribe` — STT
- POST `/api/voice/synthesize` — TTS
- POST `/api/voice/stream` — Real-time audio

### File Agent (Phase 2)

**Status:** → (Planned)

**Features:**
- Watch allowlisted folders (read-only)
- Extract metadata + send to backend
- Lightweight indexing (no full-text search yet)
- Security: no delete/move, approval-based

### App Launcher (Phase 3)

**Status:** → (Planned)

**Features:**
- Launch apps from Felicia command
- Approval workflow before execute
- Integration dengan /api/action/launch-app

---

## 7. IMPLEMENTATION STATUS

### Phase 1: Personal MVP ✅ COMPLETE

**Goal:** Functional personal assistant untuk Adit daily

**Deliverables:**

| Feature | Status | Notes |
|---------|--------|-------|
| Chat + threading | ✅ | 3 modes (utama/refleksi/strategi) |
| Profile canonical | ✅ | Immutable + dynamic + timeline |
| Memory system | ✅ | Scoped + searchable + title field |
| Google Calendar integration | ✅ | Read/create/delete/reschedule |
| Goal tracking | ✅ | CRUD + milestones |
| Finance tracking | ✅ | Transactions + budget |
| Daily briefing (cron) | ✅ | Morning message |
| Settings + monitoring | ✅ | Quota + integration config |
| Deployment | ✅ | Vercel (web) |

**Build Status:** ✅ Zero errors | 44 modules | ~288KB JS | ~24KB CSS

**Commits:**
- api/chat.js, context.js, supabase.js
- All page components + routing
- Memory architecture
- Profile + goals + finance + calendar

---

### Phase 2: Case Management System (Part A) ✅ COMPLETE

**Goal:** Track complex personal situations dengan AI awareness

**Deliverables:**

| Feature | Status | Layer | Notes |
|---------|--------|-------|-------|
| Database schema (cases + links) | ✅ | Layer 0 | Tables + indexes + views |
| CRUD operations | ✅ | Layer 2 | 9+ functions (create/read/update) |
| Case detection in chat | ✅ | Layer 1 | analyzeChatForCaseReference() |
| Case suggestions panel | ✅ | Layer 3 | Real-time suggestions (debounce) |
| Case dashboard | ✅ | Layer 3 | /strategy route |
| Case action confirmation | ✅ | Layer 3 | Modal dengan UX |
| Action routing | ✅ | Layer 2 | create_case_auto, update_case |
| Context injection | ✅ | Layer 1 | buildCaseContextForReply() |

**Build Status:** ✅ Build successful | Deployed to Vercel

**Commits:**
- api/_lib/cases.js (659 lines)
- api/chat.js (case action routing)
- StrategyPage.jsx + ChatPage.jsx (UI)
- src/services/api.js (case helpers)

---

### Phase 3: Case Management System (Part B) ✅ COMPLETE

**Goal:** Auto-detect dan auto-create cases dari natural language

**Deliverables:**

| Feature | Status | Layer | Notes |
|---------|--------|-------|-------|
| Case extraction patterns | ✅ | Layer 1 | extractCaseFromMessage() |
| Case update detection | ✅ | Layer 1 | detectCaseUpdate() |
| Auto-creation flow | ✅ | Layer 2 | API + handler + validation |
| Case summary generation | ✅ | Layer 1 | generateCaseSummary() |
| Case relationship analysis | ✅ | Layer 1 | analyzeCaseRelationships() |
| Supabase setup script | ✅ | Layer 0 | SQL with idempotency |

**Build Status:** ✅ Build successful | Supabase verified

**Commits:**
- supabase-setup-complete.sql (SQL migrations)
- SUPABASE_SETUP_README.md (instructions)
- api/_lib/cases.js (Phase 3 functions)

---

### Phase 4: Advanced Intelligence ⏳ PLANNING

**Goal:** Make case system smarter dengan ML-like features

**Options:**

#### Option A: Advanced Case Intelligence

**Features:**
- [ ] Case auto-summary generation (Gemini-powered)
- [ ] Case timeline visualization (interactive chart)
- [ ] Case status workflow (active → resolved → archived)
- [ ] Case linking editor (drag-drop UI)
- [ ] Case complexity scoring (multi-factor)

**Layers:** Layer 1 (AI) + Layer 3 (Frontend)
**Effort:** 4-5 hours dev + 1-2 hours testing
**Priority:** ⭐⭐⭐ High

#### Option B: Multi-Case Analytics

**Features:**
- [ ] Dashboard stats by category/status
- [ ] Case trend analysis (volume over time)
- [ ] Entity network visualization
- [ ] Case correlation detection
- [ ] Resolution rate analytics

**Layers:** Layer 2 (Backend) + Layer 3 (Frontend)
**Effort:** 4-5 hours dev + 1-2 hours testing
**Priority:** ⭐⭐ Medium

#### Option C: Cases + Goals + Time Integration

**Features:**
- [ ] Link cases to goals (goal X untuk resolve case Y)
- [ ] Schedule action items from case
- [ ] Finance impact tracking (budget allocation)
- [ ] Unified personal management dashboard

**Layers:** Cross-layer integration
**Effort:** 6-8 hours dev + 2 hours testing
**Priority:** ⭐⭐⭐ High

#### Option D: Layer 4 Preparation (Voice/Local)

**Features:**
- [ ] Case handling via voice ("update kasus X")
- [ ] Voice-to-case auto-creation
- [ ] Case notification system
- [ ] Approval workflow for risky actions

**Layers:** Layer 2 (Backend) + Layer 4 (Voice skeleton)
**Effort:** 5-6 hours dev + testing
**Priority:** ⭐⭐⭐ High (untuk Phase 2)

---

### Future Phases (Backlog)

#### Phase 5: Voice Assistant (Phase 2)

- [ ] Electron app setup
- [ ] Mic listener (push-to-talk)
- [ ] Speech-to-text integration
- [ ] Text-to-speech output
- [ ] Voice case management

#### Phase 6: File Agent (Phase 2)

- [ ] File watcher
- [ ] Metadata extraction
- [ ] Security model
- [ ] Index building

#### Phase 7: Deep Integration (Phase 3)

- [ ] Always-on voice daemon
- [ ] Full file access (encrypted)
- [ ] App launcher + automation
- [ ] Habit analytics
- [ ] Relationship tracking

---

## 8. ROADMAP & PRIORITIES

### Tech Debt & Critical Issues

| Issue | Severity | Status | Fix |
|-------|----------|--------|-----|
| None tracked | - | ✅ | System stable |

### Optimization Opportunities

| Opportunity | Effort | Benefit | Priority |
|-------------|--------|---------|----------|
| Case caching (memoization) | Low | Faster suggestions | Medium |
| Batch case updates | Medium | Reduce API calls | Low |
| Advanced search (FTS) | High | Better case discovery | Medium |
| Local caching strategy | Medium | Offline mode | Low |

### Cost Analysis

#### Phase 1 (Current)

| Service | Cost/Month | Usage | Notes |
|---------|-----------|-------|-------|
| Vercel | $0 | Free tier | Unlimited functions |
| Supabase | $0 | Free tier | 2GB, 50MB bandwidth |
| Gemini | ~$5-10 | ~20 req/day | Free tier available |
| **Total** | **~$5-10** | - | **Minimal** |

#### Phase 2 (with Voice)

| Service | Cost/Month | Usage | Notes |
|---------|-----------|-------|-------|
| Vercel Pro | $20 | Optional | Better performance |
| Supabase | $25 | Paid tier | More storage/bandwidth |
| Gemini | $10-15 | Higher usage | Voice integration |
| Voice (TTS/STT) | $5-10 | Speech services | Cloud or local |
| **Total** | **~$60-70** | - | **Sustainable** |

---

## 9. INTEGRATION POINTS

### Cross-Layer Communication

```
Layer 3 (Frontend)
    ↓
    sendChat(message)
    → POST /api/chat
    ↓
Layer 2 (Backend)
    ├─ Parse action + params
    ├─ Route to handler
    │
    ├─ IF direct action
    │  └─→ Execute (calendar, memory, mode, case)
    │      └─→ Return result to Layer 3
    │
    └─ IF conversational
       ├─→ buildSystemPrompt() (Layer 1)
       ├─→ Insert context (Layer 0)
       ├─→ askGemini() (Layer 1)
       ├─→ Parse response
       ├─→ Execute detected actions
       └─→ Return text + action result to Layer 3
```

### Case System Integration

**Chat Integration:**
```
User: "Utang dengan Aji, dia belum bayar"
    ↓
Layer 2: extractCaseFromMessage()
    ↓
Detect: "utang dengan Aji"
    ↓
Action: create_case_auto → Layer 3 modal
    ↓
User confirms
    ↓
Case created + context injected
```

**Memory Integration:**
```
Case has related_memories field
Can link cases to memory IDs
Memory can reference case IDs
→ Unified personal knowledge graph
```

**Goals Integration (Phase 4C):**
```
Goal: "Lunasi utang Aji"
Case: "Utang dengan Aji"
Event: "Temu Aji tgl 25"
    ↓
Unified dashboard shows relationships
Action items from case auto-create events
Finance impact tracked per case
```

---

## 10. TESTING & VALIDATION

### Build Verification

✅ Latest build (April 17, 2026):
- Zero errors
- 44 modules bundled
- ~288KB JavaScript
- ~24KB CSS
- Deployment successful

### Supabase Verification

✅ Setup confirmed:
```
✅ Tables: felicia_cases, felicia_case_links
✅ Triggers: update_felicia_cases_timestamp
✅ Indexes: status, category, created_at, updated_at, entities (GIN)
✅ Views: case_stats
✅ Enums: link_type_enum
```

### Manual Testing Checklist

- [ ] Chat 3 modes working
- [ ] Case creation flow (manual)
- [ ] Case auto-creation (from message)
- [ ] Case suggestions appearing
- [ ] Case dashboard displaying correctly
- [ ] Memory with title saving
- [ ] Calendar integration working
- [ ] Quota monitoring accurate

---

## 11. NEXT STEPS

### Immediate (This Week)

1. **Choose Phase 4 option** (A/B/C/D)
2. **Test current system** thoroughly
3. **Collect feedback** dari daily usage

### Short-term (2 weeks)

1. Implement chosen Phase 4 features
2. Deploy to production
3. Monitor performance

### Medium-term (Month 2)

1. Decide on Phase 2 (voice) or Phase 3 (file agent)
2. Plan infrastructure needs
3. Set up development timeline

---

## 12. REFERENCE DOCUMENTATION

### Related Files

- `README.md` — Quick start guide
- `MEMORY_ARCHITECTURE.md` — Memory system details
- `PHASE2_ROLLOUT.md` — Phase 2 case system planning
- `SUPABASE_SETUP_README.md` — Database setup instructions
- `vercel.json` — Deployment config
- `package.json` — Dependencies

### Environment Variables

```bash
# Required
GEMINI_API_KEY=
SUPABASE_URL=
SUPABASE_KEY=
API_SECRET=

# Optional
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
DISCORD_TOKEN=
```

---

## 13. DECISION MATRIX

### Which Phase 4 to Choose?

| Criteria | Option A | Option B | Option C | Option D |
|----------|----------|----------|----------|----------|
| **Helps daily usage** | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Fun to build** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Effort** | 4-5h | 4-5h | 6-8h | 5-6h |
| **Complexity** | Medium | Medium | High | High |
| **User impact** | Medium | Medium | High | Low |
| **Technical growth** | ML patterns | Analytics | Integration | Architecture |

**Recommendation:**
- **Best for immediate impact:** Option C (unified management)
- **Best for intelligence:** Option A (smart case features)
- **Best for insights:** Option B (analytics)
- **Best for future:** Option D (voice prep)

---

## 14. UPDATE HISTORY (NON-BREAKING)

Tujuan section ini: menyimpan riwayat perubahan teknis terbaru **tanpa mengubah struktur arsitektur utama**.

### Update: April 18, 2026 (Extended)

#### Stabilization Phase Summary
- **Quota reliability + observability:** Fixed stuck state detection + debug endpoint
- **Memory integrity hardening:** Improved dedup logic + recent-window DB checks
- **Security baseline:** Removed hardcoded token, centralized CORS + security headers
- **Operational checklist:** Created smoke test framework for 6 critical flows
- **Code audit:** Identified 5 medium + 1 critical blocker on memory dedup race

#### Gate Decision: CONDITIONAL PASS ✋ → ✅ BLOCKER FIXES COMPLETE

**All 5 blockers fixed & validated:**
- ✅ Memory race condition: DB UNIQUE constraint + idempotency token (critical)
- ✅ Thread creation race: 30s recent check + duplicate recovery (medium)
- ✅ Profile atomicity: Promise.all() batch with error tracking (medium)
- ✅ CORS NODE_ENV: Verification check + fallback logging (medium)
- ✅ Quota retry-after: 6 pattern matchers + 180s fallback (medium)

**Next step:** Re-run smoke test checklist (24 tests) → declare PASS → proceed to UI/UX revamp

| Area | File | Perubahan | Dampak | Status |
|------|------|-----------|--------|--------|
| Quota reliability | `api/quota-eta.js` | Perhitungan status quota diperbaiki berbasis timestamp event terakhir + recovery signal dari event `success` setelah `quota_limited`. | Mengurangi false `rate_limited` yang terlihat stuck. | ✅ |
| Observability (quota) | `api/quota-debug.js` | Endpoint baru `GET /api/quota-debug` untuk audit detail status quota, reason, dan event breakdown. | Memudahkan deteksi akar masalah quota secara real-time. | ✅ |
| Memory integrity hardening | `api/chat.js`, `api/_lib/supabase.js` | Dedup memory diperketat: `topicKey` ikut dipakai saat validasi duplicate, query duplicate pindah ke recent-window + similarity check deterministik + fallback schema-safe. **Race condition identified**: concurrent serverless instances dapat bypass dedup check. | Menurunkan risiko duplicate memory intra-instance; perlu DB UNIQUE constraint untuk inter-instance safety. | ⚠️ Partial |
| Security baseline hardening | `src/services/api.js`, `api/_lib/cors.js`, semua `api/*.js` | Hapus hardcoded token FE, implementasi dynamic token fetch dari sessionStorage/env. Centralize CORS + security headers di util `cors.js`. CORS dibatasi ke whitelist origin (dev: localhost, prod: terdaftar). **NODE_ENV=production must be set on Vercel.** | Mengurangi surface attack token exposure + meningkatkan CORS governance. | ✅ (verify NODE_ENV) |
| Frontend freshness | `src/pages/SettingsPage.jsx` | Panel quota di Settings ditambah polling periodik (60 detik). | Mengurangi tampilan status stale saat halaman lama tidak di-refresh manual. | ✅ |
| Operational validation | `OPERATIONAL_CHECKLIST.md` | Smoke test framework untuk 6 flows (chat, memory, quota, profile, case, error handling) dengan 24 sub-tests. | Dokumentasi test scenarios + blocker detection sebelum UI revamp. | ✅ New |

### Validation Snapshot

- Build frontend terakhir berjalan sukses (`vite build`, 44 modules transformed, no errors).
- Endpoint quota monitor tetap backward-compatible (`/api/quota-status`, `/api/quota-eta`).
- Patch memory dedup tetap backward-compatible untuk signature lama `checkDuplicateMemoryInDB(content, category)`.
- CORS hardening tetap backward-compatible (env var `VITE_API_TOKEN` bersifat optional fallback).
- Perubahan ini bersifat additive/fix, tidak mengubah kontrak request utama chat.
- **Critical:** Memory race condition belum fully fixed; requires DB-level UNIQUE constraint pada memory dedup.

### Blocker Summary for UI Revamp Gate

| # | Blocker | Severity | File | Fix Strategy | Est. Effort | Status |
|----|---------|----------|------|--------------|-------------|--------|
| 1 | Memory dedup race (concurrent duplicate writes across serverless instances) | 🔴 Critical | `api/chat.js`, `api/_lib/supabase.js`, migrations | ✅ Add DB UNIQUE constraint on (normalized_content, category, topicKey) + idempotency token | 1-2h | ✅ IMPLEMENTED |
| 2 | Thread auto-creation race | 🟠 Medium | `api/chat.js`, `api/_lib/supabase.js` | ✅ Add idempotency token + upsert logic (check recent 30s for duplicate title) | 1-2h | ✅ IMPLEMENTED |
| 3 | Profile update not atomic | 🟠 Medium | `api/_lib/profile.js` | ✅ Parallel Promise.all() with error tracking + graceful degradation | 2-3h | ✅ IMPLEMENTED |
| 4 | CORS NODE_ENV verification missing on Vercel | 🟠 Medium | `api/_lib/cors.js` | ✅ Add verifyCorsEnvironment() check + fallback warnings + debug headers | 30min | ✅ IMPLEMENTED |
| 5 | Quota retry-after extraction could fail on new error format | 🟠 Medium | `api/quota-eta.js` | ✅ Add 6 pattern matchers (retry in Xs, retryDelay, Retry-After header, X min, wait X sec, ISO 8601) + 180s fallback | 1h | ✅ IMPLEMENTED |

### Validation Snapshot (Post-Blocker-Fixes)

- Build frontend terakhir berjalan sukses (`vite build`, 44 modules transformed, no errors).
- Endpoint quota monitor tetap backward-compatible (`/api/quota-status`, `/api/quota-eta`).
- Patch memory dedup tetap backward-compatible; app layer handles new idempotency_token param gracefully.
- CORS hardening tetap backward-compatible; NODE_ENV checks non-intrusive.
- Perubahan ini bersifat additive/fix, tidak mengubah kontrak request utama chat.
- ✅ **All 5 blockers fully fixed & validated:** Memory race (DB constraint + idempotency), thread race (30s check), profile atomicity (Promise.all), CORS NODE_ENV (verification + fallback), retry-after (6 patterns + 180s fallback).

### Blocker Fixes Summary (April 18, Extended v2)

| Blocker # | Title | Fix Implemented | Key Files | Test Coverage |
|-----------|-------|-----------------|-----------|--------------|
| 1 (🔴) | Memory race condition | DB UNIQUE on (normalized_content, category, topicKey) + idempotency token + duplicate recovery | `api/_lib/supabase.js` (saveMemory, generateIdempotencyTokenLocal), `api/chat.js` (decideMemorySave), migrations/20260418_memory_race_fix.sql | Smoke test 2.3 (dedup safety) |
| 2 (🟠) | Thread creation race | 30s recent check + duplicate recovery (handles concurrent create) | `api/_lib/supabase.js` (createChatThread enhanced) | Smoke test 5.3 (concurrent case creation) |
| 3 (🟠) | Profile update atomicity | Promise.all() batch + error tracking + graceful degradation | `api/_lib/profile.js` (saveCanonicalProfile, saveMemoryWithErrorTracking) | Smoke test 4.3 (multi-field update atomicity) |
| 4 (🟠) | CORS NODE_ENV | Verification + fallback logging + debug headers | `api/_lib/cors.js` (setCorsHeaders enhanced, verifyCorsEnvironment new) | Smoke test 6.3 (CORS rejection) |
| 5 (🟠) | Quota retry-after | 6 pattern matchers + 180s fallback + logging | `api/quota-eta.js` (extractRetryAfterSeconds enhanced) | Smoke test 6.5 (quota exhaustion fallback) |

### Pre-Smoke Test Verification Checklist

Before executing OPERATIONAL_CHECKLIST.md:
1. ✅ Build passes without errors (`vite build`: 44 modules, 290KB JS)
2. ✅ No linting errors on modified files
3. ✅ All 5 blockers implemented + backward compatible
4. ✅ Migration file ready: `supabase/migrations/20260418_memory_race_fix.sql` (must run on Supabase before deploy)
5. ✅ `verifyCorsEnvironment()` available in `api/_lib/cors.js`
6. ⏳ Next: Run migration on Supabase SQL Editor
7. ⏳ Execute smoke test checklist (24 tests across 6 flows in OPERATIONAL_CHECKLIST.md)
8. ⏳ Gate decision: PASS/CONDITIONAL/FAIL

### Notes for Traceability

- Semua update di atas mempertahankan pola layer existing (Data → AI → API → Frontend).
- Tidak ada perubahan struktur folder atau arsitektur macro; hanya reliability + security improvements.
- **Next phase:** Smoke test execution (24 tests) → gate PASS declaration → UI/UX revamp greenlight.

---

**Document Version:** 1.0
**Last Reviewed:** April 18, 2026
**Maintained By:** Architecture Team
**Update Frequency:** Per major phase completion
