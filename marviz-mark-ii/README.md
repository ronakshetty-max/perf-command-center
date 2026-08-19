# Marviz2

Web-native voice ad analytics agent: browser mic → WebSocket → FastAPI → Gemini STT →
Claude tool-calling loop over Google Ads + Meta Ads → live JSON push back to the dashboard.

Successor to `~/marviz` (native CLI + wake-word). This build is the web/multi-viewer
architecture from the "Marviz Setup & Deployment Blueprint" doc; `~/marviz` is left as-is.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in what's missing — see .env.example for a checklist
```

## Run

```bash
source .venv/bin/activate
uvicorn app:app --reload --port 8000
```

Open http://localhost:8000/ for the dev harness (text input works with just
`ANTHROPIC_API_KEY` set; the mic button additionally needs `GEMINI_API_KEY`).

`GET /health` reports whether required config is present and lists any missing vars.

## Architecture

- `config.py` — loads `~/.claude/.env` then `./.env` (project overrides), validates
  everything at once via `load_settings()`.
- `tools/{google_ads,meta_ads,aggregation}.py` — platform SDK wrappers + spend/CPC/
  CTR/ROAS math. Ported unchanged from `~/marviz`.
- `agent/confirmation.py` — `ConfirmationManager`/`PendingAction` state machine for
  write actions (pause/enable/update budget). **Invariant: only orchestrator code
  (the WebSocket handler in `app.py`) may call `.confirm()`/`.cancel()` — never a
  tool handler.** See `tests/test_confirmation.py` and
  `tests/test_tool_dispatch.py::test_confirm_and_execute_still_requires_orchestrator_confirmation`
  for regression coverage of this.
- `agent/tool_dispatch.py` — routes Claude tool calls to the SDK wrappers and the
  confirmation manager. Tracks `last_dashboard_payload`, the most recent
  metrics/action result — this replaces the old file-based dashboard store from
  `~/marviz` (unsafe with concurrent viewers writing one file).
- `agent/claude_agent.py` — `MarvizAgent`, the manual Claude tool-calling loop.
  Synchronous (blocking) client, called through a threadpool by the async
  WebSocket handler.
- `app.py` — FastAPI app. One `MarvizSession` (its own `ToolDispatcher` +
  `MarvizAgent` + confirmation state) per accepted WebSocket connection, so
  concurrent viewers on the shared ad accounts can't see or confirm each other's
  in-flight write actions. `Settings` (credentials) load once at startup and are
  shared read-only across sessions.
- `stt/gemini_client.py` — Gemini audio transcription (`google-genai` SDK), in place of
  the earlier OpenAI Whisper integration. Uses `GEMINI_API_KEY` (an AI Studio key),
  kept separate from `GOOGLE_API_KEY` (used for Sheets/etc.) which is not valid for
  the Gemini API.
- `static/marvizClient.js` + `static/index.html` — the blueprint's browser voice
  controller, plus a minimal dev-testing page (mic button + text input). This is
  **not** the production dashboard — that's a separate WIP project that will embed
  this agent; see the WebSocket contract below for what it needs to speak.

## WebSocket contract — `/ws/marviz`

**Client → server**, one of:
- Binary WebM audio blob (from `MediaRecorder`) — transcribed via Gemini.
- Text frame `{"type": "text", "text": "..."}` — bypasses STT. Dev/testing escape
  hatch; also usable by any dashboard integration that already has typed input.

**Server → client**, JSON:
```json
{
  "transcript": "what's my ROAS on google this week",
  "text_response": "Your Google Ads ROAS this week is 3.8x on $1,420 spend.",
  "dashboard_payload": {
    "type": "metrics",
    "date_range": "last_7d",
    "by_platform": {"google": {"spend": 1420.5, "roas": 3.8, "...": "..."}},
    "combined": {"...": "..."}
  },
  "audio_base64": null
}
```
`dashboard_payload` is `null` when the turn didn't touch metrics/actions (e.g. small talk).
`dashboard_payload.type` is `"metrics"` (from `get_metrics`/`get_aggregate_summary`) or
`"action"` (from a completed `confirm_and_execute_action`).

`audio_base64` is always `null` in this build — there's no backend TTS integration.
The dev harness speaks `text_response` client-side via the browser's built-in
`speechSynthesis` API; wire the same thing into the real dashboard, or add a TTS
provider here later if you want higher-quality voice output.

## Write actions

Disabled by default (`WRITE_ACTIONS_ENABLED=false`). The agent can propose pausing/
enabling a campaign or changing its budget, but execution requires the user to say/type
an affirmative reply first — the WebSocket handler checks this on every incoming message
against `ConfirmationManager` before letting `confirm_and_execute_action` succeed. Don't
flip this to `true` except against a low-stakes test campaign you've set up yourself.

## Tests

```bash
source .venv/bin/activate
pytest
```

`test_aggregation.py` and `test_confirmation.py` are ported unchanged from `~/marviz`.
`test_tool_dispatch.py` is new: covers per-session isolation (two `ToolDispatcher`
instances never share pending-action or dashboard-payload state) and the
`last_dashboard_payload` behavior that replaced the file store.

## Known gaps / next steps

- Credentials: see `.env.example` for exactly what's missing vs. already available.
- No auth on `/ws/marviz` yet — anyone who can reach the deployed URL can query/act on
  the shared ad accounts. Add an auth layer (matching whatever the production dashboard
  uses) before exposing this beyond localhost/an internal network.
- `META_ACCESS_TOKEN` fallback to `META_API_TOKEN` (generic, unscoped) is scaffolding
  only — get a real Marketing-API-scoped token (ideally a System User token) before
  trusting read data or attempting write actions in production.
- No TTS backend — see "WebSocket contract" above.
