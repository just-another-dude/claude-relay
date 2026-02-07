/**
 * Unit tests for the setup wizard validators and helpers
 *
 * Run with: node tests/test_setup.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

const {
    validatePhoneNumber,
    validateGroupId,
    validateAnthropicKey,
    validateOpenaiKey,
    validatePath,
    validateSessionName,
    validateNumberRange,
    parseEnvFile,
    buildEnvContent,
    maskSecret,
} = require(path.join(PROJECT_ROOT, 'src', 'setup.js'));

// ============================================================================
// TESTS: Phone Number Validation
// ============================================================================

console.log('=== Phone Number Validation Tests ===\n');

assert.strictEqual(validatePhoneNumber('1234567890'), true, 'valid phone number');
console.log('✓ validatePhoneNumber accepts valid number');

assert.strictEqual(validatePhoneNumber(''), true, 'empty phone is OK');
console.log('✓ validatePhoneNumber accepts empty (optional)');

assert.strictEqual(typeof validatePhoneNumber('abc'), 'string', 'rejects letters');
console.log('✓ validatePhoneNumber rejects letters');

assert.strictEqual(typeof validatePhoneNumber('+1234567890'), 'string', 'rejects plus sign');
console.log('✓ validatePhoneNumber rejects plus sign');

assert.strictEqual(typeof validatePhoneNumber('123 456 7890'), 'string', 'rejects spaces');
console.log('✓ validatePhoneNumber rejects spaces');

assert.strictEqual(typeof validatePhoneNumber('123456'), 'string', 'rejects too short');
console.log('✓ validatePhoneNumber rejects too short (6 digits)');

assert.strictEqual(typeof validatePhoneNumber('1234567890123456'), 'string', 'rejects too long');
console.log('✓ validatePhoneNumber rejects too long (16 digits)');

assert.strictEqual(validatePhoneNumber('1234567'), true, 'accepts minimum length (7)');
console.log('✓ validatePhoneNumber accepts minimum length (7 digits)');

assert.strictEqual(validatePhoneNumber('123456789012345'), true, 'accepts maximum length (15)');
console.log('✓ validatePhoneNumber accepts maximum length (15 digits)');

console.log('');

// ============================================================================
// TESTS: Group ID Validation
// ============================================================================

console.log('=== Group ID Validation Tests ===\n');

assert.strictEqual(validateGroupId('120363424984613855@g.us'), true, 'valid group ID');
console.log('✓ validateGroupId accepts valid ID');

assert.strictEqual(validateGroupId(''), true, 'empty group ID is OK');
console.log('✓ validateGroupId accepts empty (optional)');

assert.strictEqual(typeof validateGroupId('120363424984613855'), 'string', 'rejects missing @g.us');
console.log('✓ validateGroupId rejects missing @g.us suffix');

assert.strictEqual(typeof validateGroupId('120363424984613855@c.us'), 'string', 'rejects @c.us');
console.log('✓ validateGroupId rejects @c.us suffix');

console.log('');

// ============================================================================
// TESTS: Anthropic Key Validation
// ============================================================================

console.log('=== Anthropic Key Validation Tests ===\n');

assert.strictEqual(validateAnthropicKey('sk-ant-abc123def456'), true, 'valid key');
console.log('✓ validateAnthropicKey accepts valid key');

assert.strictEqual(validateAnthropicKey(''), true, 'empty key is OK');
console.log('✓ validateAnthropicKey accepts empty (optional)');

assert.strictEqual(typeof validateAnthropicKey('wrong-prefix-key'), 'string', 'rejects wrong prefix');
console.log('✓ validateAnthropicKey rejects wrong prefix');

assert.strictEqual(typeof validateAnthropicKey('sk-abc123'), 'string', 'rejects sk- without ant-');
console.log('✓ validateAnthropicKey rejects sk- without ant-');

console.log('');

// ============================================================================
// TESTS: OpenAI Key Validation
// ============================================================================

console.log('=== OpenAI Key Validation Tests ===\n');

assert.strictEqual(validateOpenaiKey('sk-abc123def456'), true, 'valid key');
console.log('✓ validateOpenaiKey accepts valid key');

assert.strictEqual(validateOpenaiKey(''), true, 'empty key is OK');
console.log('✓ validateOpenaiKey accepts empty (optional)');

assert.strictEqual(typeof validateOpenaiKey('wrong-prefix'), 'string', 'rejects wrong prefix');
console.log('✓ validateOpenaiKey rejects wrong prefix');

console.log('');

// ============================================================================
// TESTS: Path Validation
// ============================================================================

console.log('=== Path Validation Tests ===\n');

assert.strictEqual(validatePath('/home/user/project'), true, 'absolute path');
console.log('✓ validatePath accepts absolute path');

assert.strictEqual(validatePath('~/project'), true, 'tilde path');
console.log('✓ validatePath accepts tilde path');

assert.strictEqual(typeof validatePath('relative/path'), 'string', 'rejects relative');
console.log('✓ validatePath rejects relative path');

assert.strictEqual(typeof validatePath(''), 'string', 'rejects empty');
console.log('✓ validatePath rejects empty path');

console.log('');

// ============================================================================
// TESTS: Session Name Validation
// ============================================================================

console.log('=== Session Name Validation Tests ===\n');

assert.strictEqual(validateSessionName('claude-relay'), true, 'valid name with hyphens');
console.log('✓ validateSessionName accepts hyphens');

assert.strictEqual(validateSessionName('my_session_123'), true, 'valid name with underscores and numbers');
console.log('✓ validateSessionName accepts underscores and numbers');

assert.strictEqual(typeof validateSessionName('has spaces'), 'string', 'rejects spaces');
console.log('✓ validateSessionName rejects spaces');

assert.strictEqual(typeof validateSessionName('special!chars'), 'string', 'rejects special chars');
console.log('✓ validateSessionName rejects special characters');

assert.strictEqual(typeof validateSessionName(''), 'string', 'rejects empty');
console.log('✓ validateSessionName rejects empty');

console.log('');

// ============================================================================
// TESTS: Number Range Validation
// ============================================================================

console.log('=== Number Range Validation Tests ===\n');

const validate5to300 = validateNumberRange(5, 300);

assert.strictEqual(validate5to300(30), true, 'in range');
console.log('✓ validateNumberRange accepts value in range');

assert.strictEqual(validate5to300(5), true, 'at minimum');
console.log('✓ validateNumberRange accepts minimum boundary');

assert.strictEqual(validate5to300(300), true, 'at maximum');
console.log('✓ validateNumberRange accepts maximum boundary');

assert.strictEqual(typeof validate5to300(3), 'string', 'below min');
console.log('✓ validateNumberRange rejects below minimum');

assert.strictEqual(typeof validate5to300(500), 'string', 'above max');
console.log('✓ validateNumberRange rejects above maximum');

assert.strictEqual(typeof validate5to300('abc'), 'string', 'non-number');
console.log('✓ validateNumberRange rejects non-numeric input');

console.log('');

// ============================================================================
// TESTS: parseEnvFile
// ============================================================================

console.log('=== parseEnvFile Tests ===\n');

// Basic key-value
const basic = parseEnvFile('KEY=value\nOTHER=123');
assert.strictEqual(basic.KEY, 'value', 'parses basic key-value');
assert.strictEqual(basic.OTHER, '123', 'parses numeric value as string');
console.log('✓ parseEnvFile parses key-value pairs');

// Comments ignored
const withComments = parseEnvFile('# This is a comment\nKEY=value\n# Another comment');
assert.strictEqual(Object.keys(withComments).length, 1, 'comments not included');
assert.strictEqual(withComments.KEY, 'value', 'value still parsed');
console.log('✓ parseEnvFile ignores comments');

// Empty values
const empty = parseEnvFile('KEY=\nOTHER=value');
assert.strictEqual(empty.KEY, '', 'empty value preserved');
assert.strictEqual(empty.OTHER, 'value', 'non-empty value preserved');
console.log('✓ parseEnvFile handles empty values');

// Quoted values
const quoted = parseEnvFile('KEY="hello world"\nSINGLE=\'single quotes\'');
assert.strictEqual(quoted.KEY, 'hello world', 'double quotes stripped');
assert.strictEqual(quoted.SINGLE, 'single quotes', 'single quotes stripped');
console.log('✓ parseEnvFile handles quoted values');

// Inline comments
const inlineComments = parseEnvFile('KEY=value  # this is a comment');
assert.strictEqual(inlineComments.KEY, 'value', 'inline comment stripped');
console.log('✓ parseEnvFile strips inline comments');

// Empty lines
const emptyLines = parseEnvFile('\n\nKEY=value\n\n');
assert.strictEqual(Object.keys(emptyLines).length, 1, 'empty lines ignored');
console.log('✓ parseEnvFile ignores empty lines');

// Values with equals sign
const equalsInValue = parseEnvFile('KEY=abc=def');
assert.strictEqual(equalsInValue.KEY, 'abc=def', 'equals in value preserved');
console.log('✓ parseEnvFile preserves equals signs in values');

console.log('');

// ============================================================================
// TESTS: buildEnvContent
// ============================================================================

console.log('=== buildEnvContent Tests ===\n');

// Basic replacement
const template = '# Comment\nKEY=old\nOTHER=keep';
const built = buildEnvContent(template, { KEY: 'new' });
assert.ok(built.includes('KEY=new'), 'value replaced');
assert.ok(built.includes('OTHER=keep'), 'unmentioned key preserved');
assert.ok(built.includes('# Comment'), 'comment preserved');
console.log('✓ buildEnvContent replaces values and preserves comments');

// Preserves comment lines
const commentTemplate = '# Section header\n# Description\nKEY=value';
const commentBuilt = buildEnvContent(commentTemplate, { KEY: 'changed' });
assert.ok(commentBuilt.includes('# Section header'), 'header preserved');
assert.ok(commentBuilt.includes('# Description'), 'description preserved');
console.log('✓ buildEnvContent preserves all comment lines');

// Handles special characters in values
const specialBuilt = buildEnvContent('KEY=old', { KEY: 'value with spaces & special=chars' });
assert.ok(specialBuilt.includes('KEY=value with spaces & special=chars'), 'special chars preserved');
console.log('✓ buildEnvContent handles special characters in values');

// Empty replacement
const emptyBuilt = buildEnvContent('KEY=something', { KEY: '' });
assert.ok(emptyBuilt.includes('KEY='), 'empty value set');
assert.ok(!emptyBuilt.includes('KEY=something'), 'old value removed');
console.log('✓ buildEnvContent handles empty value replacement');

console.log('');

// ============================================================================
// TESTS: maskSecret
// ============================================================================

console.log('=== maskSecret Tests ===\n');

assert.strictEqual(maskSecret('sk-ant-abc123xyz789long'), 'sk-ant-...long', 'masks API key');
console.log('✓ maskSecret masks API key middle portion');

assert.strictEqual(maskSecret('short'), '****', 'short values fully masked');
console.log('✓ maskSecret fully masks short values');

assert.strictEqual(maskSecret(''), '(not set)', 'empty string shows not set');
console.log('✓ maskSecret shows (not set) for empty string');

assert.strictEqual(maskSecret(undefined), '(not set)', 'undefined shows not set');
console.log('✓ maskSecret shows (not set) for undefined');

console.log('');

// ============================================================================
// TESTS: Project Structure
// ============================================================================

console.log('=== Setup Project Structure Tests ===\n');

// setup.js exists and exports expected functions
const setup = require(path.join(PROJECT_ROOT, 'src', 'setup.js'));
const expectedExports = [
    'validatePhoneNumber', 'validateGroupId', 'validateAnthropicKey',
    'validateOpenaiKey', 'validatePath', 'validateSessionName',
    'validateNumberRange', 'parseEnvFile', 'buildEnvContent', 'maskSecret',
];
for (const fn of expectedExports) {
    assert.strictEqual(typeof setup[fn], 'function', `exports ${fn}`);
}
console.log('✓ setup.js exports all expected functions');

// .env.example contains all expected config keys
const envExample = fs.readFileSync(path.join(PROJECT_ROOT, '.env.example'), 'utf8');
const expectedKeys = [
    'ALLOWED_GROUP_ID', 'ALLOWED_NUMBER', 'ANTHROPIC_API_KEY',
    'CLAUDE_MODEL', 'TMUX_SESSION', 'CLAUDE_WORKSPACE', 'READ_TIMEOUT',
    'MAX_OUTPUT', 'TRANSCRIBER_PATH', 'TRANSCRIBER_ENGINE', 'OPENAI_API_KEY',
    'SUPERVISOR_ENABLED', 'SUPERVISOR_MODEL', 'AUDIT_LOG_ENABLED', 'AUDIT_LOG_PATH',
];
for (const key of expectedKeys) {
    assert.ok(envExample.includes(key), `.env.example contains ${key}`);
}
console.log('✓ .env.example contains all expected config keys');

console.log('');
console.log('=== All Setup Tests Passed ===\n');
