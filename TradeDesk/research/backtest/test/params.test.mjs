/**
 * test/params.test.mjs — the harness refuses to run on unfrozen params.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PARAMS } from '../../../pipeline/lib/cmo/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('params.json matches the frozen hash and version', () => {
  const frozen = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'frozen-params.json'), 'utf8'));
  const actual = crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(HERE, '..', '..', '..', 'pipeline', 'lib', 'cmo', 'params.json')))
    .digest('hex');
  assert.equal(PARAMS.params_version, frozen.params_version);
  assert.equal(actual, frozen.sha256);
  assert.equal(PARAMS.params_version, 'cmo-rev4-wo01');
});
