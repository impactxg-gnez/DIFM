import assert from 'node:assert/strict';
import { calculateDIFMPrice } from '../lib/difm/calculateDIFMPrice';
import { loadDIFMTierConfig } from '../lib/difm/configLoader';

const config = loadDIFMTierConfig();

function expectSuccess(input: { number_of_plugs?: unknown; tier?: unknown }) {
  const result = calculateDIFMPrice(input, config);
  assert.equal(result.success, true);
  if (!result.success) throw new Error(`Expected success: ${JSON.stringify(result)}`);
  return result;
}

function expectError(input: { number_of_plugs?: unknown; tier?: unknown }, expected: string) {
  const result = calculateDIFMPrice(input, config);
  assert.equal(result.success, false);
  if (result.success) throw new Error(`Expected error: ${JSON.stringify(result)}`);
  assert.equal(result.error, expected);
}

function run() {
  // Boundary + basic correctness
  let result = expectSuccess({ number_of_plugs: 1, tier: 'BASIC' });
  assert.equal(result.data.total_price, 100);
  assert.equal(result.data.extra_plugs, 0);

  result = expectSuccess({ number_of_plugs: 2, tier: 'BASIC' });
  assert.equal(result.data.total_price, 100);
  assert.equal(result.data.extra_plugs, 0);

  result = expectSuccess({ number_of_plugs: 3, tier: 'BASIC' });
  assert.equal(result.data.total_price, 120);
  assert.equal(result.data.extra_plugs, 1);

  // Cap behavior
  result = expectSuccess({ number_of_plugs: 20, tier: 'STANDARD' });
  assert.equal(result.data.total_price, 300);
  assert.equal(result.data.cap_applied, true);

  // Large input
  result = expectSuccess({ number_of_plugs: 1000, tier: 'STANDARD' });
  assert.equal(result.data.total_price, 300);
  assert.equal(result.data.cap_applied, true);

  // Edge case zero
  result = expectSuccess({ number_of_plugs: 0, tier: 'BASIC' });
  assert.equal(result.data.total_price, 0);
  assert.equal(result.data.extra_plugs, 0);

  // Strict validation
  expectError({ number_of_plugs: -1, tier: 'BASIC' }, 'Invalid plug count');
  expectError({ number_of_plugs: 2.5, tier: 'BASIC' }, 'Invalid plug count');
  expectError({ number_of_plugs: '5abc', tier: 'BASIC' }, 'Invalid plug count');
  expectError({ tier: 'BASIC' }, 'number_of_plugs required');
  expectError({ number_of_plugs: 5, tier: 'GOLD' }, 'Invalid tier');

  // Tier normalization
  result = expectSuccess({ number_of_plugs: 5, tier: 'basic' });
  assert.equal(result.data.total_price, 160);

  // Determinism
  const stableInput = { number_of_plugs: 5, tier: 'STANDARD' as const };
  const first = calculateDIFMPrice(stableInput, config);
  for (let i = 0; i < 9; i++) {
    const next = calculateDIFMPrice(stableInput, config);
    assert.deepEqual(next, first);
  }

  console.log('SUCCESS: DIFM pricing tests passed.');
}

run();

