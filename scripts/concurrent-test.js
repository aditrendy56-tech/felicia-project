import { executeAction } from '../api/_lib/actions/index.js';

const MOCK_MODE = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function nowISO() { return new Date().toISOString(); }


async function callOne(id, params, ctx) {
  try {
    const res = await executeAction('create_event', params, ctx);
    // normalize
    const reply = res?.reply || (res && res.reply) || (res && res.data && res.data.reply) || JSON.stringify(res);
    const execId = res?.data?.actionExecutionId || (res && res.actionExecutionId) || null;
    const reused = !!res?.data?.__reused;
    const executed = !!res?.data?.__executed;
    const processing = !!res?.data?.__processing;

    console.log(`[call ${id}] reply=${String(reply).slice(0,80)} execId=${execId} executed=${executed} reused=${reused} processing=${processing}`);
    return { id, reply, execId, executed, reused, processing };
  } catch (err) {
    console.error(`[call ${id}] error:`, err);
    return { id, error: String(err) };
  }
}

async function runBatch(batchLabel, concurrency = 8, params, ctx) {
  console.log(`\nStarting batch ${batchLabel} with ${concurrency} concurrent calls`);
  const calls = [];
  for (let i = 0; i < concurrency; i++) calls.push(callOne(`${batchLabel}-${i+1}`, params, ctx));
  const results = await Promise.all(calls);
  console.log(`Finished batch ${batchLabel}`);
  return results;
}

(async function main(){
  const params = {
    summary: 'Test Event - idempotency',
    startTime: new Date(Date.now() + 60*60*1000).toISOString(),
    endTime: new Date(Date.now() + 2*60*60*1000).toISOString(),
    description: 'Concurrent test event for executeActionSafely',
  };

  const ctx = {
    userId: 'test-user-1',
    threadId: '550e8400-e29b-41d4-a716-446655440000',
    chatType: 'test',
  };

  // If MOCK_MODE, attach in-memory mocks to ctx.__mocks so action code uses them
  if (MOCK_MODE) {
    const store = new Map(); // id -> record
    const keyMap = new Map(); // idempotencyKey -> id

    async function mockCreateOrGetActionExecution({ userId = null, actionName = null, params = null, source = 'chat', threadId = null, idempotencyKey = null, idempotencyWindowMinutes = 60 } = {}) {
      // check recent by idempotencyKey
      if (idempotencyKey && keyMap.has(idempotencyKey)) {
        const rid = keyMap.get(idempotencyKey);
        const rec = store.get(rid);
        if (rec) {
          const since = new Date(Date.now() - Math.max(1, Number(idempotencyWindowMinutes)) * 60 * 1000);
          if (new Date(rec.created_at) >= since) {
            return { ...rec };
          }
        }
      }

      const rec = {
        id: genId(),
        user_id: userId || null,
        action_name: actionName || null,
        params: params ? JSON.stringify(params) : null,
        source: source || null,
        thread_id: threadId || null,
        status: 'pending',
        attempt_count: 0,
        steps: JSON.stringify([]),
        idempotency_key: idempotencyKey || null,
        created_at: nowISO(),
        result: null,
      };
      store.set(rec.id, rec);
      if (idempotencyKey) keyMap.set(idempotencyKey, rec.id);
      return { ...rec };
    }

    async function mockUpdateActionExecutionState(id, { status = null, attemptCount = null, startedAt = null, finishedAt = null, result = null, errorMessage = null } = {}) {
      const rec = Array.from(store.values()).find(r => r.id === id);
      if (!rec) return false;
      // Protect success
      if (rec.status === 'success' && status) return false;
      if (status) rec.status = status;
      if (Number.isFinite(attemptCount)) rec.attempt_count = attemptCount;
      if (startedAt) rec.started_at = startedAt;
      if (finishedAt) rec.finished_at = finishedAt;
      if (result !== null && result !== undefined) rec.result = result;
      if (errorMessage) rec.error_message = errorMessage;
      store.set(rec.id, rec);
      return true;
    }

    async function mockSetActionExecutionStatusIfPending(id, { status = 'running', attemptCount = null, startedAt = null } = {}) {
      const rec = Array.from(store.values()).find(r => r.id === id);
      if (!rec) return null;
      if (rec.status !== 'pending') return null;
      rec.status = status;
      if (Number.isFinite(attemptCount)) rec.attempt_count = attemptCount;
      if (startedAt) rec.started_at = startedAt;
      store.set(rec.id, rec);
      return { ...rec };
    }

    async function mockCreateEvent(summary, startTime, endTime, description) {
      const wait = 100 + Math.floor(Math.random() * 200);
      await sleep(wait);
      return { id: genId(), summary };
    }

    ctx.__mocks = {
      createOrGetActionExecution: mockCreateOrGetActionExecution,
      updateActionExecutionState: mockUpdateActionExecutionState,
      setActionExecutionStatusIfPending: mockSetActionExecutionStatusIfPending,
      createEvent: mockCreateEvent,
    };
  }

  // First batch: concurrent triggers
  const batch1 = await runBatch('A', 8, params, ctx);

  // wait a bit
  await sleep(1500);

  // Second batch: after some time, should reuse stored result
  const batch2 = await runBatch('B', 6, params, ctx);

  const all = [...batch1, ...batch2];
  const execIdSet = new Set(all.filter(r => r && r.execId).map(r => r.execId));
  const executedCount = all.filter(r => r && r.executed).length;
  const reusedCount = all.filter(r => r && r.reused).length;
  const processingCount = all.filter(r => r && r.processing).length;

  console.log('\n==== SUMMARY ====');
  console.log('Total calls:', all.length);
  console.log('Unique actionExecutionIds:', execIdSet.size, Array.from(execIdSet));
  console.log('Executed (handler actually ran) count:', executedCount);
  console.log('Reused (served cached result) count:', reusedCount);
  console.log('Processing (returned processing message) count:', processingCount);

  console.log('\nDetailed results:');
  all.forEach(r => console.log(r));

  process.exit(0);
})();
