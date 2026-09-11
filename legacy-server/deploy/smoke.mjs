import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const base = 'http://134.175.148.243';
const file = 'output/deploy-private/smoke-state.json';
const phase = process.argv[2] || 'prepare';
let state;
async function request(path, body, token = '') {
  const response = await fetch(base + '/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, Origin: base },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, data: await response.json() };
}
async function action(body, token = state.owner) {
  const snapshot = await request('trips/' + state.id, null, token);
  return request('trips/' + state.id, { revision: snapshot.data.revision, ...body }, token);
}
if (phase === 'prepare') {
  const created = await request('create', { name: '公网部署验收-' + Date.now(), nickname: '部署测试甲', start: '2026-10-01T08:00', end: '2026-10-05T18:00' });
  assert.equal(created.status, 200);
  state = { id: created.data.trip.id, name: created.data.trip.name, owner: created.data.token, invite: created.data.trip.invite };
  writeFileSync(file, JSON.stringify(state));
  const joined = await request('join', { invite: state.invite, nickname: '部署测试乙' });
  assert.equal(joined.status, 200);
  state.guest = joined.data.token;
  state.shared = created.data.trip.items.find(i => !i.owner && i.key).id;
  state.private = created.data.trip.items.find(i => i.owner).id;
  assert.equal((await action({ action: 'toggle', id: state.private }, state.guest)).status, 403);
  assert.equal((await action({ action: 'toggle', id: state.shared }, state.guest)).status, 200);
  assert.equal((await action({ action: 'toggle', id: state.private })).status, 200);
  const snapshot = (await request('trips/' + state.id, null, state.owner)).data;
  assert.equal(snapshot.items.find(i => i.id === state.shared).by, '部署测试乙');
  assert.equal((await request('trips/' + state.id, null, state.guest)).data.items.some(i => i.id === state.private), false);
  assert.equal((await action({ action: 'category', name: '公网测试分类', scope: '公共' })).status, 200);
  assert.equal((await action({ action: 'event', title: '测试完整时段', date: '2026-10-02', period: '上午', startTime: '09:00', endTime: '11:30' })).status, 200);
  assert.equal((await action({ action: 'prepareDeletion' }, state.guest)).status, 403);
  const first = await action({ action: 'prepareDeletion' });
  assert.equal(first.status, 200);
  assert.equal((await request('trips/' + state.id, null, state.owner)).status, 200);
  assert.equal((await action({ action: 'deleteTrip', challenge: first.data.challenge, confirmName: 'wrong' })).status, 400);
  writeFileSync(file, JSON.stringify(state));
  console.log('PASS: public API, two members, shared sync, private isolation, category, time range, deletion safeguards. Ready for restart check.');
} else {
  state = JSON.parse(readFileSync(file, 'utf8'));
  const snapshot = await request('trips/' + state.id, null, state.owner);
  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.data.items.find(i => i.id === state.shared).done, true);
  assert.equal(snapshot.data.items.find(i => i.id === state.private).done, true);
  assert.equal(snapshot.data.events[0].endTime, '11:30');
  assert.ok(snapshot.data.categories.some(c => c.name === '公网测试分类'));
  console.log('PASS: stored checklist, itinerary and category survived restart.');
  if (phase === 'cleanup') {
    const confirmation = await action({ action: 'prepareDeletion' });
    assert.equal((await action({ action: 'deleteTrip', challenge: confirmation.data.challenge, confirmName: state.name })).status, 200);
    assert.equal((await request('trips/' + state.id, null, state.owner)).status, 403);
    assert.equal((await request('join', { invite: state.invite, nickname: 'invalid' })).status, 404);
    console.log('PASS: two-step deletion removed only the isolated test trip and invalidated its invitation.');
  }
}
