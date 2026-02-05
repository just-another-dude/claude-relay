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

require('dotenv').config();

// Configuration
const CONFIG = {
    // Whitelist your phone number (with country code, no + or spaces)
    // e.g., "1234567890" for +1 234 567 890
    allowedNumbers: process.env.ALLOWED_NUMBERS?.split(',') || [],
    
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
if (CONFIG.allowedNumbers.length === 0) {
    console.error('⚠️  No allowed numbers configured!');
    console.error('   Set ALLOWED_NUMBERS in .env file');
    console.error('   Example: ALLOWED_NUMBERS=1234567890,0987654321');
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

/**
 * Check if sender is authorized
 */
function isAuthorized(msg) {
    // Extract phone number from WhatsApp ID (format: number@c.us)
    const senderId = msg.from.replace('@c.us', '');
    
    if (CONFIG.allowedNumbers.length === 0) {
        console.log(`⚠️  No whitelist configured, allowing: ${senderId}`);
        return true;
    }
    
    const allowed = CONFIG.allowedNumbers.some(num => 
        senderId.includes(num) || num.includes(senderId)
    );
    
    if (!allowed) {
        console.log(`🚫 Unauthorized: ${senderId}`);
    }
    
    return allowed;
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
 * Get help text
 */
function getHelp() {
    return `🤖 *Claude Relay Commands*

*Claude Code (in tmux session):*
/cc <prompt> - Send to Claude Code
continue - Continue current task
1 or yes - Approve pending action
2 or no - Reject pending action

*Direct API (Opus 4.5):*
/ask <question> - Quick question

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
    console.log('Allowed numbers:', CONFIG.allowedNumbers.length > 0 
        ? CONFIG.allowedNumbers.join(', ') 
        : '(none - all allowed)');
    console.log('');
    console.log('Send /help to your WhatsApp to get started');
    console.log('');
});

client.on('disconnected', (reason) => {
    console.log('⚠️  WhatsApp disconnected:', reason);
    console.log('   Attempting to reconnect...');
});

client.on('message', async (msg) => {
    // Ignore group messages, only handle direct messages
    if (msg.from.includes('@g.us')) return;
    
    // Ignore messages from self
    if (msg.fromMe) return;
    
    // Check authorization
    if (!isAuthorized(msg)) {
        return;
    }
    
    const text = msg.body;
    console.log(`\n📨 Message from ${msg.from}:`);
    console.log(`   "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`);
    
    // Parse command
    const cmd = parseCommand(text);
    console.log(`   Command type: ${cmd.type}`);
    
    try {
        let response;
        
        switch (cmd.type) {
            case 'help':
                response = getHelp();
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
                await msg.reply('🤔 Thinking...');
                const apiResult = await callBridge('api', { prompt: cmd.content });
                response = apiResult.response;
                break;
                
            case 'claude-code':
                await msg.reply('⚙️ Sending to Claude Code...');
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
                
            default:
                response = '❓ Unknown command. Send /help for usage.';
        }
        
        // Send response
        await msg.reply(formatResponse(response));
        console.log('   ✅ Response sent');
        
    } catch (error) {
        console.error('   ❌ Error:', error.message);
        await msg.reply(`❌ Error: ${error.message}`);
    }
});

// === Startup ===

console.log('');
console.log('═══════════════════════════════════════');
console.log('  Claude Relay - WhatsApp → Claude');
console.log('═══════════════════════════════════════');
console.log('');
console.log('Initializing WhatsApp connection...');

client.initialize().catch(err => {
    console.error('Failed to initialize:', err);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    await client.destroy();
    process.exit(0);
});
