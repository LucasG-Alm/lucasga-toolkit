import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressoFerros } from '../electron/ferros.mjs';

test('linha de progresso do Python vira dado; o resto é ignorado (R-FER-UI-006)', () => {
  assert.deepEqual(progressoFerros('@@FERROS_PROGRESSO@@{"fase": "lendo", "i": 3, "n": 10}\n'), { fase: 'lendo', i: 3, n: 10 });
  assert.equal(progressoFerros('qualquer log\n'), null);
  assert.equal(progressoFerros('@@FERROS_PROGRESSO@@{quebrado\n'), null);
});
