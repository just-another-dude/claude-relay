/**
 * Interactive setup wizard for Claude Relay
 *
 * Guides users through configuration with validation and sensible defaults.
 * Run standalone: npm run setup
 * Called by: install.sh (on first install)
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Validation Functions (exported for testing)
// ============================================================================

function validatePhoneNumber(value) {
    if (!value) return true; // empty is OK
    if (!/^\d+$/.test(value)) return 'Phone number must contain only digits (no + or spaces)';
    if (value.length < 7) return 'Phone number too short (minimum 7 digits)';
    if (value.length > 15) return 'Phone number too long (maximum 15 digits)';
    return true;
}

function validateGroupId(value) {
    if (!value) return true; // empty is OK
    if (!value.endsWith('@g.us')) return 'Group ID must end with @g.us';
    return true;
}

function validateAnthropicKey(value) {
    if (!value) return true; // empty is OK
    if (!value.startsWith('sk-ant-')) return 'Anthropic API key should start with sk-ant-';
    return true;
}

function validateOpenaiKey(value) {
    if (!value) return true; // empty is OK
    if (!value.startsWith('sk-')) return 'OpenAI API key should start with sk-';
    return true;
}

function validatePath(value) {
    if (!value) return 'Path cannot be empty';
    if (!value.startsWith('/') && !value.startsWith('~')) return 'Path must be absolute (start with / or ~)';
    return true;
}

function validateSessionName(value) {
    if (!value) return 'Session name cannot be empty';
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) return 'Session name can only contain letters, numbers, hyphens, and underscores';
    return true;
}

function validateNumberRange(min, max) {
    return function (value) {
        const num = Number(value);
        if (isNaN(num)) return `Must be a number between ${min} and ${max}`;
        if (num < min || num > max) return `Must be between ${min} and ${max}`;
        return true;
    };
}

// ============================================================================
// .env File Helpers (exported for testing)
// ============================================================================

function parseEnvFile(content) {
    const result = {};
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        // Strip surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        // Strip inline comments (only for unquoted values)
        const commentIndex = value.indexOf('  #');
        if (commentIndex !== -1) {
            value = value.slice(0, commentIndex).trim();
        }
        result[key] = value;
    }
    return result;
}

function buildEnvContent(templateContent, values) {
    const lines = templateContent.split('\n');
    const result = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            result.push(line);
            continue;
        }
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) {
            result.push(line);
            continue;
        }
        const key = trimmed.slice(0, eqIndex).trim();
        if (key in values) {
            result.push(`${key}=${values[key]}`);
        } else {
            result.push(line);
        }
    }
    return result.join('\n');
}

function maskSecret(value) {
    if (!value || value.length < 8) return value ? '****' : '(not set)';
    return value.slice(0, 7) + '...' + value.slice(-4);
}

// ============================================================================
// Prompt Definitions
// ============================================================================

function getAuthPrompts(defaults) {
    return [
        {
            type: 'list',
            name: 'authMode',
            message: 'Authorization mode:',
            choices: [
                { name: 'Group mode (recommended) — control from a WhatsApp group', value: 'group' },
                { name: 'Self-chat mode — control by messaging yourself', value: 'self' },
            ],
            default: defaults.ALLOWED_GROUP_ID ? 'group' : 'self',
        },
        {
            type: 'input',
            name: 'ALLOWED_GROUP_ID',
            message: 'WhatsApp Group ID (send /groupid in the group to find it):',
            default: defaults.ALLOWED_GROUP_ID || '',
            validate: validateGroupId,
            when: (answers) => answers.authMode === 'group',
        },
        {
            type: 'input',
            name: 'ALLOWED_NUMBER',
            message: 'Your phone number (digits only, e.g. 1234567890):',
            default: defaults.ALLOWED_NUMBER || '',
            validate: validatePhoneNumber,
            when: (answers) => answers.authMode === 'group',
        },
    ];
}

function getApiPrompts(defaults) {
    return [
        {
            type: 'password',
            name: 'ANTHROPIC_API_KEY',
            message: 'Anthropic API key (for /ask and supervisor mode, Enter to skip):',
            default: defaults.ANTHROPIC_API_KEY || '',
            validate: validateAnthropicKey,
            mask: '*',
        },
    ];
}

function getClaudeCodePrompts(defaults) {
    return [
        {
            type: 'input',
            name: 'CLAUDE_MODEL',
            message: 'Claude model:',
            default: defaults.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
        },
        {
            type: 'input',
            name: 'TMUX_SESSION',
            message: 'tmux session name:',
            default: defaults.TMUX_SESSION || 'claude-relay',
            validate: validateSessionName,
        },
        {
            type: 'input',
            name: 'CLAUDE_WORKSPACE',
            message: 'Claude workspace path:',
            default: defaults.CLAUDE_WORKSPACE || '~/claude-workspace',
            validate: validatePath,
        },
        {
            type: 'number',
            name: 'READ_TIMEOUT',
            message: 'Read timeout (seconds):',
            default: Number(defaults.READ_TIMEOUT) || 30,
            validate: validateNumberRange(5, 300),
        },
        {
            type: 'number',
            name: 'MAX_OUTPUT',
            message: 'Max output characters:',
            default: Number(defaults.MAX_OUTPUT) || 3000,
            validate: validateNumberRange(500, 50000),
        },
    ];
}

function getVoicePrompts(defaults) {
    return [
        {
            type: 'list',
            name: 'TRANSCRIBER_ENGINE',
            message: 'Voice transcription engine:',
            choices: [
                { name: 'google (free)', value: 'google' },
                { name: 'openai (Whisper API, requires API key)', value: 'openai' },
            ],
            default: defaults.TRANSCRIBER_ENGINE || 'google',
        },
        {
            type: 'input',
            name: 'TRANSCRIBER_PATH',
            message: 'Audio transcriber path:',
            default: defaults.TRANSCRIBER_PATH || '~/git/audio-transcriber',
            validate: validatePath,
        },
        {
            type: 'password',
            name: 'OPENAI_API_KEY',
            message: 'OpenAI API key:',
            default: defaults.OPENAI_API_KEY || '',
            validate: validateOpenaiKey,
            mask: '*',
            when: (answers) => answers.TRANSCRIBER_ENGINE === 'openai',
        },
    ];
}

function getSupervisorPrompts(defaults, hasApiKey) {
    return [
        {
            type: 'confirm',
            name: 'SUPERVISOR_ENABLED',
            message: 'Enable supervisor mode (AI summarizes output for mobile)?',
            default: hasApiKey ? (defaults.SUPERVISOR_ENABLED !== 'false') : false,
        },
        {
            type: 'list',
            name: 'SUPERVISOR_MODEL',
            message: 'Supervisor model:',
            choices: [
                { name: 'claude-opus-4-6 (best quality)', value: 'claude-opus-4-6' },
                { name: 'claude-sonnet-4-20250514 (faster/cheaper)', value: 'claude-sonnet-4-20250514' },
            ],
            default: defaults.SUPERVISOR_MODEL || 'claude-opus-4-6',
            when: (answers) => answers.SUPERVISOR_ENABLED,
        },
    ];
}

function getAuditPrompts(defaults) {
    return [
        {
            type: 'confirm',
            name: 'AUDIT_LOG_ENABLED',
            message: 'Enable audit logging?',
            default: defaults.AUDIT_LOG_ENABLED !== 'false',
        },
        {
            type: 'input',
            name: 'AUDIT_LOG_PATH',
            message: 'Audit log path:',
            default: defaults.AUDIT_LOG_PATH || './logs/audit.log',
            when: (answers) => answers.AUDIT_LOG_ENABLED,
        },
    ];
}

// ============================================================================
// Main Wizard Flow
// ============================================================================

async function main() {
    // Check for interactive terminal
    if (!process.stdin.isTTY) {
        console.error('Non-interactive terminal detected.');
        console.error('Edit .env manually: nano .env');
        process.exit(1);
    }

    // Load inquirer
    let inquirer;
    try {
        inquirer = require('inquirer');
    } catch (e) {
        console.error('inquirer not installed. Run: npm install');
        process.exit(1);
    }

    const envPath = path.join(__dirname, '..', '.env');
    const examplePath = path.join(__dirname, '..', '.env.example');

    // Load existing config as defaults
    let templateContent = '';
    let defaults = {};
    if (fs.existsSync(envPath)) {
        templateContent = fs.readFileSync(envPath, 'utf8');
        defaults = parseEnvFile(templateContent);
    } else if (fs.existsSync(examplePath)) {
        templateContent = fs.readFileSync(examplePath, 'utf8');
        defaults = parseEnvFile(templateContent);
    }

    // If no template at all, use .env.example content as fallback
    if (!templateContent && fs.existsSync(examplePath)) {
        templateContent = fs.readFileSync(examplePath, 'utf8');
    }

    console.log();
    console.log('╔══════════════════════════════════════╗');
    console.log('║       Claude Relay Setup Wizard      ║');
    console.log('╚══════════════════════════════════════╝');
    console.log();

    try {
        // Quick vs Full setup
        const { setupMode } = await inquirer.prompt([
            {
                type: 'list',
                name: 'setupMode',
                message: 'Setup mode:',
                choices: [
                    { name: 'Quick setup — authorization + API key only', value: 'quick' },
                    { name: 'Full setup — all configuration options', value: 'full' },
                ],
            },
        ]);

        const answers = {};

        // Authorization (always)
        console.log('\n── Authorization ──\n');
        const authAnswers = await inquirer.prompt(getAuthPrompts(defaults));
        Object.assign(answers, authAnswers);

        // API key (always)
        console.log('\n── API Key ──\n');
        const apiAnswers = await inquirer.prompt(getApiPrompts(defaults));
        Object.assign(answers, apiAnswers);

        if (setupMode === 'full') {
            // Claude Code settings
            console.log('\n── Claude Code Settings ──\n');
            const ccAnswers = await inquirer.prompt(getClaudeCodePrompts(defaults));
            Object.assign(answers, ccAnswers);

            // Voice
            console.log('\n── Voice Transcription ──\n');
            const voiceAnswers = await inquirer.prompt(getVoicePrompts(defaults));
            Object.assign(answers, voiceAnswers);

            // Supervisor
            console.log('\n── Supervisor Mode ──\n');
            const hasApiKey = !!(answers.ANTHROPIC_API_KEY);
            const supervisorAnswers = await inquirer.prompt(getSupervisorPrompts(defaults, hasApiKey));
            Object.assign(answers, supervisorAnswers);

            // Audit
            console.log('\n── Audit Logging ──\n');
            const auditAnswers = await inquirer.prompt(getAuditPrompts(defaults));
            Object.assign(answers, auditAnswers);
        } else {
            // Quick setup: enable supervisor if API key provided
            if (answers.ANTHROPIC_API_KEY) {
                answers.SUPERVISOR_ENABLED = true;
            }
        }

        // Build values for .env
        const envValues = {};

        // Authorization
        if (answers.authMode === 'group') {
            envValues.ALLOWED_GROUP_ID = answers.ALLOWED_GROUP_ID || '';
            envValues.ALLOWED_NUMBER = answers.ALLOWED_NUMBER || '';
        } else {
            envValues.ALLOWED_GROUP_ID = '';
            envValues.ALLOWED_NUMBER = '';
        }

        // API
        if (answers.ANTHROPIC_API_KEY !== undefined) {
            envValues.ANTHROPIC_API_KEY = answers.ANTHROPIC_API_KEY;
        }

        // Claude Code (full only)
        if (answers.CLAUDE_MODEL !== undefined) envValues.CLAUDE_MODEL = answers.CLAUDE_MODEL;
        if (answers.TMUX_SESSION !== undefined) envValues.TMUX_SESSION = answers.TMUX_SESSION;
        if (answers.CLAUDE_WORKSPACE !== undefined) envValues.CLAUDE_WORKSPACE = answers.CLAUDE_WORKSPACE;
        if (answers.READ_TIMEOUT !== undefined) envValues.READ_TIMEOUT = String(answers.READ_TIMEOUT);
        if (answers.MAX_OUTPUT !== undefined) envValues.MAX_OUTPUT = String(answers.MAX_OUTPUT);

        // Voice (full only)
        if (answers.TRANSCRIBER_ENGINE !== undefined) envValues.TRANSCRIBER_ENGINE = answers.TRANSCRIBER_ENGINE;
        if (answers.TRANSCRIBER_PATH !== undefined) envValues.TRANSCRIBER_PATH = answers.TRANSCRIBER_PATH;
        if (answers.OPENAI_API_KEY !== undefined) envValues.OPENAI_API_KEY = answers.OPENAI_API_KEY;

        // Supervisor
        if (answers.SUPERVISOR_ENABLED !== undefined) {
            envValues.SUPERVISOR_ENABLED = String(answers.SUPERVISOR_ENABLED);
        }
        if (answers.SUPERVISOR_MODEL !== undefined) envValues.SUPERVISOR_MODEL = answers.SUPERVISOR_MODEL;

        // Audit (full only)
        if (answers.AUDIT_LOG_ENABLED !== undefined) {
            envValues.AUDIT_LOG_ENABLED = String(answers.AUDIT_LOG_ENABLED);
        }
        if (answers.AUDIT_LOG_PATH !== undefined) envValues.AUDIT_LOG_PATH = answers.AUDIT_LOG_PATH;

        // Display summary
        console.log('\n── Configuration Summary ──\n');
        for (const [key, value] of Object.entries(envValues)) {
            const display = key.toLowerCase().includes('key') ? maskSecret(value) : (value || '(not set)');
            console.log(`  ${key}=${display}`);
        }
        console.log();

        // Confirm save
        const { confirmSave } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmSave',
                message: 'Save configuration to .env?',
                default: true,
            },
        ]);

        if (!confirmSave) {
            console.log('\nSetup cancelled. No changes were made.');
            return;
        }

        // Write .env
        if (!templateContent) {
            // No template exists — generate minimal content
            const lines = [];
            for (const [key, value] of Object.entries(envValues)) {
                lines.push(`${key}=${value}`);
            }
            templateContent = lines.join('\n') + '\n';
            fs.writeFileSync(envPath, templateContent, { mode: 0o600 });
        } else {
            const newContent = buildEnvContent(templateContent, envValues);
            fs.writeFileSync(envPath, newContent, { mode: 0o600 });
        }

        console.log('\nConfiguration saved to .env');
        console.log('Run "npm run setup" anytime to reconfigure.');
        console.log();

    } catch (err) {
        if (err.isTtyError) {
            console.error('\nCannot render prompts in this terminal.');
            console.error('Edit .env manually: nano .env');
        } else {
            // Ctrl+C or other interruption
            console.log('\n\nSetup cancelled.');
        }
        process.exit(1);
    }
}

// ============================================================================
// Exports & Entry Point
// ============================================================================

module.exports = {
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
};

if (require.main === module) {
    main();
}
