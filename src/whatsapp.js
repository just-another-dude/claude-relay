/**
 * Claude Relay - WhatsApp to Claude Bridge
 * 
 * Connects to WhatsApp Web and routes messages to Claude Code or Anthropic API
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

require('dotenv').config();

// ============================================================================
// Audit Logging
// ============================================================================

const AUDIT_LOG_PATH = process.env.AUDIT_LOG_PATH || path.join(__dirname, '..', 'logs', 'audit.log');
const AUDIT_LOG_ENABLED = process.env.AUDIT_LOG_ENABLED !== 'false'; // enabled by default

// Ensure log directory exists
if (AUDIT_LOG_ENABLED) {
    const logDir = path.dirname(AUDIT_LOG_PATH);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
    }
}

/**
 * Write an entry to the audit log
 * @param {string} event - Event type (AUTH_REJECT, AUTH_ACCEPT, CMD_RECEIVED, CMD_SUCCESS, CMD_ERROR)
 * @param {object} details - Event details
 */
function auditLog(event, details) {
    if (!AUDIT_LOG_ENABLED) return;

    const entry = {
        timestamp: new Date().toISOString(),
        event,
        ...details
    };

    const line = JSON.stringify(entry) + '\n';

    try {
        fs.appendFileSync(AUDIT_LOG_PATH, line, { mode: 0o600 });
    } catch (err) {
        console.error('Failed to write audit log:', err.message);
    }
}

/**
 * Sanitize sensitive data from log entries
 */
function sanitizeForLog(text, maxLength = 200) {
    if (!text) return '';
    // Truncate long content
    let sanitized = text.length > maxLength ? text.slice(0, maxLength) + '...[truncated]' : text;
    // Remove potential secrets (basic patterns)
    sanitized = sanitized.replace(/sk-ant-[a-zA-Z0-9-]+/g, '[API_KEY_REDACTED]');
    sanitized = sanitized.replace(/Bearer [a-zA-Z0-9-_.]+/g, '[TOKEN_REDACTED]');
    return sanitized;
}

// Configuration
const CONFIG = {
    // Allowed group ID - only messages from this group are processed
    // Set to empty string to allow direct messages to yourself instead
    allowedGroupId: process.env.ALLOWED_GROUP_ID || '',

    // Allowed sender number (in group mode) - only this number can trigger commands
    // Format: country code + number, no + or spaces (e.g., 972542280711)
    allowedNumber: process.env.ALLOWED_NUMBER || '',

    // Session directory for WhatsApp auth
    sessionDir: path.join(__dirname, '..', '.wwebjs_auth'),

    // Python bridge path
    bridgePath: path.join(__dirname, 'bridge.py'),

    // Max message length for responses
    maxResponseLength: 4000,

    // Timeout for Claude operations (ms)
    timeout: 300000, // 5 minutes
};

// Validate config
if (!CONFIG.allowedGroupId) {
    console.log('ℹ️  No group ID configured - will accept direct messages to yourself');
    console.log('   To use a group, set ALLOWED_GROUP_ID and ALLOWED_NUMBER in .env');
} else {
    console.log(`ℹ️  Group mode: ${CONFIG.allowedGroupId}`);
    if (CONFIG.allowedNumber) {
        console.log(`   Allowed sender: ${CONFIG.allowedNumber}`);
    } else {
        console.log('   ⚠️  No ALLOWED_NUMBER set - anyone in the group can send commands!');
    }
}

// Initialize WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: CONFIG.sessionDir
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// Track pending operations
const pendingOps = new Map();

// Track messages we've already processed to avoid loops
const processedMessages = new Set();

// Track messages we've sent as replies (to ignore them)
const sentReplies = new Set();

/**
 * Check if message is authorized
 * Mode 1: Direct messages to yourself (no group configured)
 * Mode 2: Specific group + specific sender number
 */
function isAuthorized(msg) {
    const msgInfo = {
        from: msg.from,
        author: msg.author || null,
        fromMe: msg.fromMe,
        type: msg.type,
        hasMedia: msg.hasMedia
    };

    // If group ID is configured, use group mode
    if (CONFIG.allowedGroupId) {
        // Must be from the allowed group
        if (msg.from !== CONFIG.allowedGroupId) {
            console.log(`🚫 Ignored (wrong group): ${msg.from}`);
            auditLog('AUTH_REJECT', { reason: 'wrong_group', ...msgInfo });
            return false;
        }

        // Must be from the allowed number
        if (CONFIG.allowedNumber) {
            // In groups, author contains the sender. But for your own messages,
            // author might be undefined and fromMe is true
            if (msg.fromMe) {
                // Message is from yourself - allowed
                return true;
            }

            // Check author field for other senders
            const author = (msg.author || '').replace('@c.us', '').replace('@lid', '');

            // SECURITY: Reject if author is empty or missing
            if (!author) {
                console.log(`🚫 Ignored (empty author in group)`);
                auditLog('AUTH_REJECT', { reason: 'empty_author', ...msgInfo });
                return false;
            }

            // SECURITY: Use exact match to prevent partial number bypass
            // e.g., ALLOWED_NUMBER=123 should NOT match 1234567890
            const isAllowedSender = author === CONFIG.allowedNumber;
            if (!isAllowedSender) {
                console.log(`🚫 Ignored (wrong sender in group): ${author}`);
                auditLog('AUTH_REJECT', { reason: 'wrong_sender', sender: author, ...msgInfo });
                return false;
            }
        }

        return true;
    }

    // No group configured - only allow direct "message yourself" chat
    if (!msg.fromMe) {
        console.log(`🚫 Ignored (not from self): ${msg.from}`);
        auditLog('AUTH_REJECT', { reason: 'not_from_self', ...msgInfo });
        return false;
    }

    if (msg.from.includes('@g.us')) {
        console.log(`🚫 Ignored (group, but no group configured): ${msg.from}`);
        return false;
    }

    return true;
}

/**
 * Call Python bridge with command
 */
async function callBridge(command, args = {}) {
    return new Promise((resolve, reject) => {
        const input = JSON.stringify({ command, ...args });
        
        const proc = spawn('python3', [CONFIG.bridgePath], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let stdout = '';
        let stderr = '';
        
        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        proc.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(stderr || `Bridge exited with code ${code}`));
            } else {
                try {
                    resolve(JSON.parse(stdout));
                } catch (e) {
                    resolve({ response: stdout.trim() });
                }
            }
        });
        
        proc.on('error', (err) => {
            reject(err);
        });
        
        // Set timeout
        const timer = setTimeout(() => {
            proc.kill();
            reject(new Error('Operation timed out'));
        }, CONFIG.timeout);
        
        proc.on('close', () => clearTimeout(timer));
        
        // Send input
        proc.stdin.write(input);
        proc.stdin.end();
    });
}

/**
 * Parse command from message
 */
function parseCommand(text) {
    const trimmed = text.trim();
    
    // Command prefixes
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
    if (trimmed.startsWith('/cd ')) {
        return { type: 'cd', content: trimmed.slice(4).trim() };
    }
    if (trimmed === '/cd') {
        return { type: 'cd', content: '' };
    }
    if (trimmed.startsWith('/pwd')) {
        return { type: 'pwd', content: '' };
    }
    if (trimmed.startsWith('/sessions')) {
        return { type: 'sessions', content: '' };
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
    
    // Default: treat as Claude Code command if no prefix
    return { type: 'claude-code', content: trimmed };
}

/**
 * Format response for WhatsApp (truncate if needed)
 */
function formatResponse(text) {
    if (!text) return '(empty response)';
    
    if (text.length > CONFIG.maxResponseLength) {
        return text.slice(0, CONFIG.maxResponseLength) + '\n\n... (truncated)';
    }
    return text;
}

/**
 * Handle voice message - download, transcribe, and return text
 */
async function handleVoiceMessage(msg) {
    try {
        // Download the media
        const media = await msg.downloadMedia();
        if (!media) {
            return { success: false, error: 'Failed to download voice message' };
        }

        // Save to temp file with restrictive permissions
        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, `voice_${Date.now()}_${Math.random().toString(36).slice(2)}.ogg`);

        // Write base64 data to file with mode 0600 (owner read/write only)
        const buffer = Buffer.from(media.data, 'base64');
        fs.writeFileSync(tempFile, buffer, { mode: 0o600 });

        console.log(`   📁 Saved voice message to ${tempFile}`);

        // Transcribe
        const result = await callBridge('transcribe', { audio_path: tempFile });

        // Clean up temp file
        try {
            fs.unlinkSync(tempFile);
        } catch (e) {
            console.log(`   ⚠️ Failed to clean up temp file: ${e.message}`);
        }

        if (result.error) {
            return { success: false, error: result.error };
        }

        return { success: true, text: result.response };

    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get help text
 */
function getHelp() {
    return `🤖 *Claude Relay Commands*

*Claude Code (in tmux session):*
/cc <prompt> - Send to Claude Code
continue - Continue current task
1 or yes - Approve pending action
2 or no - Reject pending action

*Direct API:*
/ask <question> - Quick question

*Voice Messages:*
🎤 Send a voice note → transcribed & sent to Claude Code

*Navigation:*
/cd <project> - Switch to project (creates or resumes session)
/pwd - Show current session info
/sessions - List all active sessions

*System:*
/status - Session status
/stop - Stop current operation
/help - This message

*Shortcuts:*
Just type without prefix → Claude Code
"approve" / "reject" → Quick responses`;
}

// === WhatsApp Event Handlers ===

client.on('qr', (qr) => {
    console.log('\n📱 Scan this QR code with WhatsApp:\n');
    qrcode.generate(qr, { small: true });
    console.log('\nWaiting for authentication...\n');
});

client.on('authenticated', () => {
    console.log('✅ WhatsApp authenticated');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
});

client.on('ready', () => {
    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('  🚀 Claude Relay is ready!');
    console.log('═══════════════════════════════════════');
    console.log('');
    if (CONFIG.allowedGroupId) {
        console.log('Mode: Group');
        console.log(`  Group ID: ${CONFIG.allowedGroupId}`);
        console.log(`  Sender: ${CONFIG.allowedNumber || '(anyone)'}`);
    } else {
        console.log('Mode: Direct messages to yourself');
    }
    console.log('');
    console.log('Send /help to get started');
    console.log('');
});

client.on('disconnected', (reason) => {
    console.log('⚠️  WhatsApp disconnected:', reason);
    console.log('   Attempting to reconnect...');
});

client.on('message_create', async (msg) => {
    // Skip if we've already processed this message (prevents loops from our own replies)
    if (processedMessages.has(msg.id._serialized)) {
        return;
    }
    processedMessages.add(msg.id._serialized);

    // Skip if this is a message we sent as a reply
    if (sentReplies.has(msg.id._serialized)) {
        return;
    }

    // Limit set sizes to prevent memory leak
    if (processedMessages.size > 1000) {
        const oldest = processedMessages.values().next().value;
        processedMessages.delete(oldest);
    }
    if (sentReplies.size > 1000) {
        const oldest = sentReplies.values().next().value;
        sentReplies.delete(oldest);
    }

    // Check authorization (must be from self, optionally in specific group)
    if (!isAuthorized(msg)) {
        return;
    }

    // Handle voice messages
    if (msg.hasMedia && (msg.type === 'ptt' || msg.type === 'audio')) {
        console.log(`\n🎤 Voice message from ${msg.from}`);

        const voiceLogInfo = {
            from: msg.from,
            author: msg.author || null,
            fromMe: msg.fromMe,
            commandType: 'voice'
        };
        auditLog('VOICE_RECEIVED', voiceLogInfo);

        const transcribePending = await msg.reply('🎤 Transcribing voice message...');
        if (transcribePending?.id?._serialized) sentReplies.add(transcribePending.id._serialized);

        const voiceResult = await handleVoiceMessage(msg);

        if (!voiceResult.success) {
            const errMsg = await msg.reply(`❌ Transcription failed: ${voiceResult.error}`);
            if (errMsg?.id?._serialized) sentReplies.add(errMsg.id._serialized);
            auditLog('VOICE_ERROR', { ...voiceLogInfo, error: voiceResult.error });
            return;
        }

        const transcribedText = voiceResult.text;
        console.log(`   📝 Transcribed: "${transcribedText.slice(0, 100)}${transcribedText.length > 100 ? '...' : ''}"`);

        auditLog('VOICE_TRANSCRIBED', {
            ...voiceLogInfo,
            transcribedContent: sanitizeForLog(transcribedText)
        });

        // Send transcription confirmation
        const confirmMsg = await msg.reply(`📝 *Transcribed:* ${transcribedText}\n\n⚙️ Sending to Claude Code...`);
        if (confirmMsg?.id?._serialized) sentReplies.add(confirmMsg.id._serialized);

        // Send to Claude Code
        try {
            const ccResult = await callBridge('claude-code', { prompt: transcribedText });
            const response = ccResult.response;

            const sentMsg = await msg.reply(formatResponse(response));
            if (sentMsg?.id?._serialized) sentReplies.add(sentMsg.id._serialized);
            console.log('   ✅ Response sent');

            auditLog('VOICE_SUCCESS', {
                ...voiceLogInfo,
                responseLength: response ? response.length : 0
            });
        } catch (error) {
            console.error('   ❌ Error:', error.message);
            const errMsg = await msg.reply(`❌ Error: ${error.message}`);
            if (errMsg?.id?._serialized) sentReplies.add(errMsg.id._serialized);

            auditLog('VOICE_CMD_ERROR', { ...voiceLogInfo, error: error.message });
        }

        return;
    }

    // Skip messages that are bot responses (check for common response patterns)
    const body = msg.body;
    if (body.startsWith('🤖') || body.startsWith('📊') ||
        body.startsWith('🛑') || body.startsWith('⚙️') ||
        body.startsWith('🤔') || body.startsWith('❌') ||
        body.startsWith('📍') || body.startsWith('✅') ||
        body.startsWith('(no visible response') ||
        body.includes('*Claude Relay Commands*')) {
        console.log('⏭️  Skipped bot response');
        return;
    }

    // Skip if this is a reply to another message (quoted message)
    if (msg.hasQuotedMsg) {
        console.log('⏭️  Skipped quoted reply');
        return;
    }
    
    const text = msg.body;
    console.log(`\n📨 Message from ${msg.from}:`);
    console.log(`   "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`);

    // Parse command
    const cmd = parseCommand(text);
    console.log(`   Command type: ${cmd.type}`);

    // Audit log: command received
    const cmdLogInfo = {
        from: msg.from,
        author: msg.author || null,
        fromMe: msg.fromMe,
        commandType: cmd.type,
        content: sanitizeForLog(cmd.content)
    };
    auditLog('CMD_RECEIVED', cmdLogInfo);

    try {
        let response;
        
        switch (cmd.type) {
            case 'help':
                response = getHelp();
                break;

            case 'groupid':
                response = `📍 *Chat ID:* ${msg.from}`;
                break;

            case 'status':
                const status = await callBridge('status');
                response = `📊 *Status*\n\n${status.response || JSON.stringify(status, null, 2)}`;
                break;
                
            case 'stop':
                const stopResult = await callBridge('stop');
                response = `🛑 ${stopResult.response || 'Stop signal sent'}`;
                break;
                
            case 'api':
                const apiPending = await msg.reply('🤔 Thinking...');
                if (apiPending?.id?._serialized) sentReplies.add(apiPending.id._serialized);
                const apiResult = await callBridge('api', { prompt: cmd.content });
                response = apiResult.response;
                break;

            case 'claude-code':
                const ccPending = await msg.reply('⚙️ Sending to Claude Code...');
                if (ccPending?.id?._serialized) sentReplies.add(ccPending.id._serialized);
                const ccResult = await callBridge('claude-code', { prompt: cmd.content });
                response = ccResult.response;
                break;
                
            case 'approve':
                const approveResult = await callBridge('approve', { value: cmd.content });
                response = approveResult.response;
                break;
                
            case 'continue':
                const contResult = await callBridge('continue');
                response = contResult.response;
                break;

            case 'cd':
                if (!cmd.content) {
                    response = '❌ Usage: /cd <path>\nExample: /cd ~/git/my-project';
                } else {
                    const cdResult = await callBridge('cd', { path: cmd.content });
                    response = cdResult.response;
                }
                break;

            case 'pwd':
                const pwdResult = await callBridge('pwd');
                response = pwdResult.response;
                break;

            case 'sessions':
                const sessionsResult = await callBridge('sessions');
                response = sessionsResult.response;
                break;

            default:
                response = '❓ Unknown command. Send /help for usage.';
        }
        
        // Send response and track it to avoid loops
        const sentMsg = await msg.reply(formatResponse(response));
        if (sentMsg?.id?._serialized) {
            sentReplies.add(sentMsg.id._serialized);
        }
        console.log('   ✅ Response sent');

        // Audit log: command succeeded
        auditLog('CMD_SUCCESS', {
            ...cmdLogInfo,
            responseLength: response ? response.length : 0
        });

    } catch (error) {
        console.error('   ❌ Error:', error.message);
        const errMsg = await msg.reply(`❌ Error: ${error.message}`);
        if (errMsg?.id?._serialized) {
            sentReplies.add(errMsg.id._serialized);
        }

        // Audit log: command failed
        auditLog('CMD_ERROR', {
            ...cmdLogInfo,
            error: error.message
        });
    }
});

// === Startup ===

console.log('');
console.log('═══════════════════════════════════════');
console.log('  Claude Relay - WhatsApp → Claude');
console.log('═══════════════════════════════════════');
console.log('');
console.log('Initializing WhatsApp connection...');
if (AUDIT_LOG_ENABLED) {
    console.log(`Audit logging enabled: ${AUDIT_LOG_PATH}`);
}

auditLog('SERVICE_START', {
    version: require('../package.json').version,
    nodeVersion: process.version,
    platform: process.platform,
    groupMode: !!CONFIG.allowedGroupId,
    auditLogPath: AUDIT_LOG_PATH
});

client.initialize().catch(err => {
    console.error('Failed to initialize:', err);
    auditLog('SERVICE_ERROR', { error: err.message });
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    auditLog('SERVICE_STOP', { reason: 'SIGINT' });
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    await client.destroy();
    process.exit(0);
});
