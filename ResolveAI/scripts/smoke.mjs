// Local integration smoke test. Requires running server + Postgres, no AI key needed.
// Execute from the repository root: node scripts/smoke.mjs
const base = process.env.SMOKE_API_URL || 'http://localhost:4000/api/v1';
let tests = 0;
async function call(path, { method='GET', token, body }={}) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
function expect(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS ${++tests}: ${message}`);
}
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const password = 'TestingOnlyPassword123!';
try {
  let result = await call('/health');
  expect(result.status===200 && result.data.ok, 'server health');
  result = await call('/tickets');
  expect(result.status===401, 'tickets require a token');
  const a = await call('/auth/register', { method:'POST', body:{ name:'Demo Customer A', email:`a-${stamp}@example.test`, password } });
  expect(a.status===201 && a.data.token, 'customer A registration');
  const b = await call('/auth/register', { method:'POST', body:{ name:'Demo Customer B', email:`b-${stamp}@example.test`, password } });
  expect(b.status===201 && b.data.token, 'customer B registration');
  result = await call('/tickets', { method:'POST', token:a.data.token, body:{title:'Duplicate payment on order',description:'I was charged twice for my order. Please help investigate.'} });
  expect(result.status===201 && result.data.id, 'customer A creates a ticket');
  const id=result.data.id;
  result = await call(`/tickets/${id}`, { token:a.data.token });
  expect(result.status===200, 'customer A reads own ticket');
  result = await call(`/tickets/${id}`, { token:b.data.token });
  expect(result.status===403, 'customer B cannot read A ticket');
  result = await call(`/tickets/${id}/messages`, { method:'POST', token:b.data.token, body:{body:'Unauthorized'} });
  expect(result.status===403, 'customer B cannot message A ticket');
  result = await call(`/tickets/${id}/messages`, { method:'POST', token:a.data.token, body:{body:'Can you please confirm the next steps?'} });
  expect(result.status===201, 'customer A creates a ticket message');
  result = await call(`/tickets/${id}/analyze`, { method:'POST', token:a.data.token });
  expect(result.status===403, 'customer cannot invoke privileged AI analysis');
  result = await call(`/tickets/${id}/status`, { method:'PATCH', token:a.data.token, body:{status:'RESOLVED'} });
  expect(result.status===403, 'customer cannot change status');
  result = await call('/tickets', { token:b.data.token });
  expect(result.status===200 && result.data.total===0, 'customer B list is scoped');
  console.log(`\n${tests} integration smoke checks passed.`);
} catch (error) { console.error(error); process.exitCode=1; }
