/**
 * Unit tests for WhatsApp relay security and message handling
 *
 * Run with: npm test
 */

const assert = require('assert');

// Mock CONFIG for testing
const CONFIG = {
    allowedGroupId: '',
    allowedNumber: '',
    maxResponseLength: 4000,
};

// ============================================================================
// parseCommand function (copied from whatsapp.js for testing)
// ============================================================================

function parseCommand(text) {
    const trimmed = text.trim();

    if (trimmed.startsWith('/cc ')) {
        return { type: 'claude-code', content: trimmed.slice(4) };
    }
    if (trimmed.startsWith('/ask ')) {
        return { type: 'api', content: trimmed.slice(5) };
    }
    if (trimmed.startsWith('/status')) {
        return { type: 'status', content: '' };
    }
    if (trimmed.startsWith('/stop')) {
        return { type: 'stop', content: '' };
    }
    if (trimmed.startsWith('/help')) {
        return { type: 'help', content: '' };
    }
    if (trimmed.startsWith('/groupid')) {
        return { type: 'groupid', content: '' };
    }
    if (trimmed === '1' || trimmed.toLowerCase() === 'yes' || trimmed.toLowerCase() === 'approve') {
        return { type: 'approve', content: 'yes' };
    }
    if (trimmed === '2' || trimmed.toLowerCase() === 'no' || trimmed.toLowerCase() === 'reject') {
        return { type: 'approve', content: 'no' };
    }
    if (trimmed.toLowerCase() === 'continue') {
        return { type: 'continue', content: '' };
    }

    return { type: 'claude-code', content: trimmed };
}

// ============================================================================
// isAuthorized function (copied from whatsapp.js for testing)
// ============================================================================

function isAuthorized(msg, config) {
    // Use msg.id.remote for chat ID - msg.from returns Linked ID (@lid) which is sender, not group
    const chatId = msg.id?.remote || msg.from;

    // If group ID is configured, use group mode
    if (config.allowedGroupId) {
        // Must be from the allowed group (use chatId, not msg.from)
        if (chatId !== config.allowedGroupId) {
            return false;
        }

        // Must be from the allowed number
        if (config.allowedNumber) {
            if (msg.fromMe) {
                return true;
            }

            const author = (msg.author || '').replace('@c.us', '').replace('@lid', '');

            // SECURITY: Reject if author is empty or missing
            if (!author) {
                return false;
            }

            // SECURITY: Use exact match to prevent partial number bypass
            const isAllowedSender = author === config.allowedNumber;
            if (!isAllowedSender) {
                return false;
            }
        }

        return true;
    }

    // No group configured - only allow direct "message yourself" chat
    if (!msg.fromMe) {
        return false;
    }

    if (chatId.includes('@g.us')) {
        return false;
    }

    return true;
}

// ============================================================================
// formatResponse function (copied from whatsapp.js for testing)
// ============================================================================

function formatResponse(text, maxLength = 4000) {
    if (!text) return '(empty response)';

    if (text.length > maxLength) {
        return text.slice(0, maxLength) + '\n\n... (truncated)';
    }
    return text;
}

// ============================================================================
// isBotResponse function for loop detection
// ============================================================================

function isBotResponse(body) {
    return body.startsWith('🤖') || body.startsWith('📊') ||
           body.startsWith('🛑') || body.startsWith('⚙️') ||
           body.startsWith('🤔') || body.startsWith('❌') ||
           body.startsWith('📍') || body.startsWith('✅') ||
           body.startsWith('(no visible response') ||
           body.includes('*Claude Relay Commands*');
}

// ============================================================================
// TESTS: Command Parsing
// ============================================================================

console.log('=== Command Parsing Tests ===\n');

// /cc command
assert.deepStrictEqual(
    parseCommand('/cc fix the bug'),
    { type: 'claude-code', content: 'fix the bug' },
    'parseCommand_withCcPrefix_returnsCludeCodeType'
);
console.log('✓ parseCommand_withCcPrefix_returnsClaudeCodeType');

// /ask command
assert.deepStrictEqual(
    parseCommand('/ask what is 2+2'),
    { type: 'api', content: 'what is 2+2' },
    'parseCommand_withAskPrefix_returnsApiType'
);
console.log('✓ parseCommand_withAskPrefix_returnsApiType');

// /status command
assert.deepStrictEqual(
    parseCommand('/status'),
    { type: 'status', content: '' },
    'parseCommand_withStatus_returnsStatusType'
);
console.log('✓ parseCommand_withStatus_returnsStatusType');

// /stop command
assert.deepStrictEqual(
    parseCommand('/stop'),
    { type: 'stop', content: '' },
    'parseCommand_withStop_returnsStopType'
);
console.log('✓ parseCommand_withStop_returnsStopType');

// /help command
assert.deepStrictEqual(
    parseCommand('/help'),
    { type: 'help', content: '' },
    'parseCommand_withHelp_returnsHelpType'
);
console.log('✓ parseCommand_withHelp_returnsHelpType');

// /groupid command
assert.deepStrictEqual(
    parseCommand('/groupid'),
    { type: 'groupid', content: '' },
    'parseCommand_withGroupid_returnsGroupidType'
);
console.log('✓ parseCommand_withGroupid_returnsGroupidType');

// Approval: "1"
assert.deepStrictEqual(
    parseCommand('1'),
    { type: 'approve', content: 'yes' },
    'parseCommand_with1_returnsApproveYes'
);
console.log('✓ parseCommand_with1_returnsApproveYes');

// Approval: "yes"
assert.deepStrictEqual(
    parseCommand('yes'),
    { type: 'approve', content: 'yes' },
    'parseCommand_withYes_returnsApproveYes'
);
console.log('✓ parseCommand_withYes_returnsApproveYes');

// Approval: "YES" (case insensitive)
assert.deepStrictEqual(
    parseCommand('YES'),
    { type: 'approve', content: 'yes' },
    'parseCommand_withUppercaseYes_returnsApproveYes'
);
console.log('✓ parseCommand_withUppercaseYes_returnsApproveYes');

// Rejection: "2"
assert.deepStrictEqual(
    parseCommand('2'),
    { type: 'approve', content: 'no' },
    'parseCommand_with2_returnsApproveNo'
);
console.log('✓ parseCommand_with2_returnsApproveNo');

// Rejection: "no"
assert.deepStrictEqual(
    parseCommand('no'),
    { type: 'approve', content: 'no' },
    'parseCommand_withNo_returnsApproveNo'
);
console.log('✓ parseCommand_withNo_returnsApproveNo');

// Continue command
assert.deepStrictEqual(
    parseCommand('continue'),
    { type: 'continue', content: '' },
    'parseCommand_withContinue_returnsContinueType'
);
console.log('✓ parseCommand_withContinue_returnsContinueType');

// Default: plain text becomes claude-code
assert.deepStrictEqual(
    parseCommand('fix the login bug'),
    { type: 'claude-code', content: 'fix the login bug' },
    'parseCommand_withPlainText_defaultsToClaudeCode'
);
console.log('✓ parseCommand_withPlainText_defaultsToClaudeCode');

// Whitespace handling
assert.deepStrictEqual(
    parseCommand('  /help  '),
    { type: 'help', content: '' },
    'parseCommand_withWhitespace_trimsInput'
);
console.log('✓ parseCommand_withWhitespace_trimsInput');

console.log('');

// ============================================================================
// TESTS: Authorization - Security Critical
// ============================================================================

console.log('=== Authorization Security Tests ===\n');

// --- Direct Message Mode (no group configured) ---

// SECURITY: Reject messages not from self in direct mode
assert.strictEqual(
    isAuthorized(
        { from: '123456@c.us', fromMe: false },
        { allowedGroupId: '', allowedNumber: '' }
    ),
    false,
    'isAuthorized_directMode_rejectsMessagesNotFromSelf'
);
console.log('✓ isAuthorized_directMode_rejectsMessagesNotFromSelf');

// SECURITY: Reject group messages when no group configured
assert.strictEqual(
    isAuthorized(
        { from: '123456789@g.us', fromMe: true },
        { allowedGroupId: '', allowedNumber: '' }
    ),
    false,
    'isAuthorized_directMode_rejectsGroupMessages'
);
console.log('✓ isAuthorized_directMode_rejectsGroupMessages');

// Allow messages from self in direct mode
assert.strictEqual(
    isAuthorized(
        { from: '123456@c.us', fromMe: true },
        { allowedGroupId: '', allowedNumber: '' }
    ),
    true,
    'isAuthorized_directMode_allowsMessagesFromSelf'
);
console.log('✓ isAuthorized_directMode_allowsMessagesFromSelf');

// --- Group Mode ---

// SECURITY: Reject messages from wrong group
assert.strictEqual(
    isAuthorized(
        { from: 'wronggroup@g.us', fromMe: true, author: '972542280711@c.us' },
        { allowedGroupId: 'correctgroup@g.us', allowedNumber: '972542280711' }
    ),
    false,
    'isAuthorized_groupMode_rejectsWrongGroup'
);
console.log('✓ isAuthorized_groupMode_rejectsWrongGroup');

// SECURITY: Reject messages from wrong sender in correct group
assert.strictEqual(
    isAuthorized(
        { from: 'mygroup@g.us', fromMe: false, author: 'attacker@c.us' },
        { allowedGroupId: 'mygroup@g.us', allowedNumber: '972542280711' }
    ),
    false,
    'isAuthorized_groupMode_rejectsWrongSenderInCorrectGroup'
);
console.log('✓ isAuthorized_groupMode_rejectsWrongSenderInCorrectGroup');

// SECURITY: Reject messages with empty author from non-self
assert.strictEqual(
    isAuthorized(
        { from: 'mygroup@g.us', fromMe: false, author: '' },
        { allowedGroupId: 'mygroup@g.us', allowedNumber: '972542280711' }
    ),
    false,
    'isAuthorized_groupMode_rejectsEmptyAuthorFromNonSelf'
);
console.log('✓ isAuthorized_groupMode_rejectsEmptyAuthorFromNonSelf');

// SECURITY: Reject messages with undefined author from non-self
assert.strictEqual(
    isAuthorized(
        { from: 'mygroup@g.us', fromMe: false, author: undefined },
        { allowedGroupId: 'mygroup@g.us', allowedNumber: '972542280711' }
    ),
    false,
    'isAuthorized_groupMode_rejectsUndefinedAuthorFromNonSelf'
);
console.log('✓ isAuthorized_groupMode_rejectsUndefinedAuthorFromNonSelf');

// Allow messages from self in correct group
assert.strictEqual(
    isAuthorized(
        { from: 'mygroup@g.us', fromMe: true, author: undefined },
        { allowedGroupId: 'mygroup@g.us', allowedNumber: '972542280711' }
    ),
    true,
    'isAuthorized_groupMode_allowsFromSelfInCorrectGroup'
);
console.log('✓ isAuthorized_groupMode_allowsFromSelfInCorrectGroup');

// Allow messages from correct sender in correct group
assert.strictEqual(
    isAuthorized(
        { from: 'mygroup@g.us', fromMe: false, author: '972542280711@c.us' },
        { allowedGroupId: 'mygroup@g.us', allowedNumber: '972542280711' }
    ),
    true,
    'isAuthorized_groupMode_allowsCorrectSenderInCorrectGroup'
);
console.log('✓ isAuthorized_groupMode_allowsCorrectSenderInCorrectGroup');

// Handle @lid suffix in author (WhatsApp internal format)
assert.strictEqual(
    isAuthorized(
        { from: 'mygroup@lid', fromMe: false, author: '972542280711@lid' },
        { allowedGroupId: 'mygroup@lid', allowedNumber: '972542280711' }
    ),
    true,
    'isAuthorized_groupMode_handlesLidSuffixInAuthor'
);
console.log('✓ isAuthorized_groupMode_handlesLidSuffixInAuthor');

// SECURITY: Group mode without ALLOWED_NUMBER allows anyone in group
assert.strictEqual(
    isAuthorized(
        { from: 'mygroup@g.us', fromMe: false, author: 'anyone@c.us' },
        { allowedGroupId: 'mygroup@g.us', allowedNumber: '' }
    ),
    true,
    'isAuthorized_groupModeNoNumber_allowsAnyoneInGroup'
);
console.log('✓ isAuthorized_groupModeNoNumber_allowsAnyoneInGroup (WARNING: insecure config)');

// SECURITY: Reject partial number matches to prevent bypass attacks
// e.g., ALLOWED_NUMBER=123 should NOT match attacker with number 1234567890
assert.strictEqual(
    isAuthorized(
        { from: 'mygroup@g.us', fromMe: false, author: '1234567890@c.us' },
        { allowedGroupId: 'mygroup@g.us', allowedNumber: '123' }
    ),
    false,
    'isAuthorized_groupMode_rejectsPartialNumberMatch'
);
console.log('✓ isAuthorized_groupMode_rejectsPartialNumberMatch (SECURITY: prevents bypass)');

// SECURITY: Also reject when allowed number is substring of attacker number
assert.strictEqual(
    isAuthorized(
        { from: 'mygroup@g.us', fromMe: false, author: '123@c.us' },
        { allowedGroupId: 'mygroup@g.us', allowedNumber: '1234567890' }
    ),
    false,
    'isAuthorized_groupMode_rejectsReversePartialMatch'
);
console.log('✓ isAuthorized_groupMode_rejectsReversePartialMatch (SECURITY: prevents bypass)');

// CRITICAL: Use msg.id.remote for group ID, not msg.from (which may be Linked ID)
// This test simulates WhatsApp's multi-device behavior where msg.from is @lid
assert.strictEqual(
    isAuthorized(
        {
            from: '81583004508236@lid',  // Linked ID (sender), NOT the group
            id: { remote: 'mygroup@g.us' },  // Actual group ID
            fromMe: false,
            author: '1234567890@c.us'
        },
        { allowedGroupId: 'mygroup@g.us', allowedNumber: '1234567890' }
    ),
    true,
    'isAuthorized_groupMode_usesIdRemoteNotFrom'
);
console.log('✓ isAuthorized_groupMode_usesIdRemoteNotFrom (CRITICAL: fixes WhatsApp multi-device)');

// Reject when id.remote is different group, even if msg.from matches (shouldn't happen but be safe)
assert.strictEqual(
    isAuthorized(
        {
            from: 'mygroup@g.us',  // Would match if we used msg.from
            id: { remote: 'othergroup@g.us' },  // Actual group ID is different
            fromMe: false,
            author: '1234567890@c.us'
        },
        { allowedGroupId: 'mygroup@g.us', allowedNumber: '1234567890' }
    ),
    false,
    'isAuthorized_groupMode_prefersIdRemoteOverFrom'
);
console.log('✓ isAuthorized_groupMode_prefersIdRemoteOverFrom (SECURITY: id.remote takes priority)');

console.log('');

// ============================================================================
// TESTS: Response Formatting
// ============================================================================

console.log('=== Response Formatting Tests ===\n');

// Empty response
assert.strictEqual(
    formatResponse(''),
    '(empty response)',
    'formatResponse_withEmptyString_returnsPlaceholder'
);
console.log('✓ formatResponse_withEmptyString_returnsPlaceholder');

// Null response
assert.strictEqual(
    formatResponse(null),
    '(empty response)',
    'formatResponse_withNull_returnsPlaceholder'
);
console.log('✓ formatResponse_withNull_returnsPlaceholder');

// Undefined response
assert.strictEqual(
    formatResponse(undefined),
    '(empty response)',
    'formatResponse_withUndefined_returnsPlaceholder'
);
console.log('✓ formatResponse_withUndefined_returnsPlaceholder');

// Normal response passes through
assert.strictEqual(
    formatResponse('Hello world'),
    'Hello world',
    'formatResponse_withNormalText_passesThrough'
);
console.log('✓ formatResponse_withNormalText_passesThrough');

// Long response gets truncated
const longText = 'a'.repeat(5000);
const truncated = formatResponse(longText, 4000);
assert.strictEqual(truncated.length, 4000 + '\n\n... (truncated)'.length,
    'formatResponse_withLongText_truncatesToMaxLength');
assert.ok(truncated.endsWith('... (truncated)'),
    'formatResponse_withLongText_addsTruncatedSuffix');
console.log('✓ formatResponse_withLongText_truncatesAndAddsSuffix');

console.log('');

// ============================================================================
// TESTS: Bot Response Detection (Loop Prevention)
// ============================================================================

console.log('=== Bot Response Detection Tests (Loop Prevention) ===\n');

// Detect emoji prefixes used by bot
assert.strictEqual(isBotResponse('🤖 Hello'), true, 'isBotResponse_robotEmoji');
console.log('✓ isBotResponse_detectsRobotEmoji');

assert.strictEqual(isBotResponse('📊 Status'), true, 'isBotResponse_chartEmoji');
console.log('✓ isBotResponse_detectsChartEmoji');

assert.strictEqual(isBotResponse('🛑 Stopped'), true, 'isBotResponse_stopEmoji');
console.log('✓ isBotResponse_detectsStopEmoji');

assert.strictEqual(isBotResponse('⚙️ Sending'), true, 'isBotResponse_gearEmoji');
console.log('✓ isBotResponse_detectsGearEmoji');

assert.strictEqual(isBotResponse('🤔 Thinking'), true, 'isBotResponse_thinkingEmoji');
console.log('✓ isBotResponse_detectsThinkingEmoji');

assert.strictEqual(isBotResponse('❌ Error'), true, 'isBotResponse_errorEmoji');
console.log('✓ isBotResponse_detectsErrorEmoji');

assert.strictEqual(isBotResponse('📍 Chat ID'), true, 'isBotResponse_pinEmoji');
console.log('✓ isBotResponse_detectsPinEmoji');

assert.strictEqual(isBotResponse('✅ Done'), true, 'isBotResponse_checkEmoji');
console.log('✓ isBotResponse_detectsCheckEmoji');

assert.strictEqual(isBotResponse('(no visible response - check /status)'), true,
    'isBotResponse_noVisibleResponse');
console.log('✓ isBotResponse_detectsNoVisibleResponse');

assert.strictEqual(isBotResponse('🤖 *Claude Relay Commands*\n/help'), true,
    'isBotResponse_helpMessage');
console.log('✓ isBotResponse_detectsHelpMessage');

// Should NOT detect user messages
assert.strictEqual(isBotResponse('fix the bug'), false, 'isBotResponse_userMessage');
console.log('✓ isBotResponse_doesNotDetectUserMessage');

assert.strictEqual(isBotResponse('/help'), false, 'isBotResponse_userCommand');
console.log('✓ isBotResponse_doesNotDetectUserCommand');

assert.strictEqual(isBotResponse('what time is it'), false, 'isBotResponse_userQuestion');
console.log('✓ isBotResponse_doesNotDetectUserQuestion');

console.log('');

// ============================================================================
// TESTS: Edge Cases and Security Boundaries
// ============================================================================

console.log('=== Edge Cases and Security Boundaries ===\n');

// Command injection attempts in prompt
const maliciousPrompt = '/cc $(rm -rf /)';
const parsed = parseCommand(maliciousPrompt);
assert.strictEqual(parsed.type, 'claude-code', 'parseCommand_maliciousInput_stillParsesAsClaudeCode');
assert.strictEqual(parsed.content, '$(rm -rf /)', 'parseCommand_maliciousInput_contentPassedAsIs');
console.log('✓ parseCommand_handlesCommandInjectionAttempt (content passed to Claude, not shell)');

// Very long input
const veryLongInput = 'a'.repeat(10000);
const longParsed = parseCommand(veryLongInput);
assert.strictEqual(longParsed.type, 'claude-code', 'parseCommand_veryLongInput_parsesCorrectly');
assert.strictEqual(longParsed.content.length, 10000, 'parseCommand_veryLongInput_preservesLength');
console.log('✓ parseCommand_handlesVeryLongInput');

// Unicode in commands
const unicodeCmd = '/cc 修复错误 🐛';
const unicodeParsed = parseCommand(unicodeCmd);
assert.strictEqual(unicodeParsed.content, '修复错误 🐛', 'parseCommand_unicode_preservesContent');
console.log('✓ parseCommand_handlesUnicodeContent');

// Newlines in input
const multiline = '/cc line1\nline2\nline3';
const multilineParsed = parseCommand(multiline);
assert.strictEqual(multilineParsed.content, 'line1\nline2\nline3', 'parseCommand_multiline_preservesNewlines');
console.log('✓ parseCommand_handlesMultilineContent');

// Empty group ID with group message should reject
assert.strictEqual(
    isAuthorized(
        { from: 'somegroup@g.us', fromMe: true },
        { allowedGroupId: '', allowedNumber: '' }
    ),
    false,
    'isAuthorized_emptyGroupConfig_rejectsGroupMessages'
);
console.log('✓ isAuthorized_emptyGroupConfig_rejectsGroupMessages');

console.log('');
console.log('=== All Tests Passed ===\n');
