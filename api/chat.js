import { orchestrateChat } from './_lib/orchestrator/chat-orchestrator.js';

export default async function handler(req, res) {
  try {
    const { message, threadId, chatType, userId } = req.body;

    const result = await orchestrateChat({
      message,
      threadId,
      chatType,
      userId,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      type: 'chat',
      reply: 'Terjadi error di server.',
    });
  }
}
