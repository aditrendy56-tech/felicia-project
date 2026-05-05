import { orchestrateChat } from '../../lib/orchestrator/chat-orchestrator.js';

export default async function handler(req, res) {
  try {
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
