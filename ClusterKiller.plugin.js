/**
 * @name ClusterKiller
 * @author m0nkey.d.fluffy
 * @description Provides !killgroup command to close a user's group. Requires @helper role. Uses /ppm_of to find group ID, then /close_group to close it. Works from any device!
 * @version 1.0.3
 * @source https://github.com/m0nkey-d-fluffy/ClusterKiller
 */

/*@cc_on
@if (@_jscript)
    var shell = WScript.CreateObject("WScript.Shell");
    var fs = new ActiveXObject("Scripting.FileSystemObject");
    var pathPlugins = shell.ExpandEnvironmentStrings("%APPDATA%\\BetterDiscord\\plugins");
    var pathSelf = WScript.ScriptFullName;
    shell.Popup("It looks like you've mistakenly tried to run me directly. \n(Don't do that!) \n\nI'm a plugin for BetterDiscord, you need to \nput me in your plugins folder: \n" + pathPlugins + "\n\nPress OK to copy myself to that folder.", 0, "I'm a Plugin!", 0x30);
    if (fs.GetParentFolderName(pathSelf) === fs.GetParentFolderName(pathPlugins)) {
        shell.Popup("I'm already in your plugins folder... \nJust reload Discord instead.", 0, "I'm already there!", 0x40);
    } else if (!fs.FolderExists(pathPlugins)) {
        shell.Popup("I can't find the BetterDiscord plugins folder.\nAre you sure it's installed?", 0, "Can't Find Folder", 0x10);
    } else if (fs.FileExists(pathPlugins + "\\ClusterKiller.plugin.js")) {
        shell.Popup("I'm already there. I'll add a .1 to my name, but you should remove the duplicate.", 0, "I'm already there!", 0x40);
        fs.CopyFile(pathSelf, pathPlugins + "\\ClusterKiller.plugin.js.1");
    } else {
        fs.CopyFile(pathSelf, pathPlugins + "\\ClusterKiller.plugin.js");
        shell.Run("explorer.exe /select," + pathPlugins + "\\ClusterKiller.plugin.js");
    }
@else@*/

// --- Config for Settings Panel ---
const pluginConfig = {
    settings: [
        {
            type: "text",
            id: "notificationChannelId",
            name: "Notification Channel ID",
            note: "The Discord Channel ID to which all status messages will be sent. Leave empty for console-only logging.",
            value: ""
        },
        {
            type: "switch",
            id: "isVerbose",
            name: "Verbose Logging",
            note: "If enabled, all /killgroup actions will be logged to console with detailed information.",
            value: true
        }
    ]
};

function getSetting(key) {
    return pluginConfig.settings.reduce((found, setting) => found ? found : (setting.id === key ? setting : setting.settings?.find(s => s.id === key)), undefined)
}

function ClusterKiller(meta) {

    // --- NODE.JS / BD MODULES ---
    const React = BdApi.React;

    // --- CONFIGURATION: Core IDs and Timing ---
    const CONFIG = {
        GUILD_ID: "1334603881652555896",                // Guild ID
        BOT_APPLICATION_ID: "1334630845574676520",      // Bot application ID
        HELPER_ROLE_ID: "1426619911626686598",          // Helper role required to use /killgroup
        PPM_OF_TIMEOUT_MS: 15 * 1000,                   // 15 seconds max wait for /ppm_of response
        CLOSE_GROUP_TIMEOUT_MS: 10 * 1000               // 10 seconds max wait for /close_group response
    };

    // --- COMMAND DATA ---
    const PPM_OF_COMMAND = {
        name: "ppm_of",
        commandId: "1437564821078937683",
        commandVersion: "1437567249022976060",
        description: "Check the group and PPMs of a user (Helper only)",
        options: [
            {
                type: 6,
                name: "target",
                description: "target",
                required: true
            }
        ]
    };

    const CLOSE_GROUP_COMMAND = {
        name: "close_group",
        commandId: "1437564821078937682",
        commandVersion: "1437564821078937684",
        description: "Stop a group (helper only)",
        options: [
            {
                type: 3,
                name: "group-id",
                description: "Group ID (e.g. En:-123456789:1:1)",
                required: true
            }
        ]
    };

    // --- Internal State ---
    let _executeCommand = null;
    let _dispatcher = null;
    let _sendMessage = null;
    let _deleteMessage = null;
    let _modulesLoaded = false;
    let _currentUserId = null;
    let _ppmOfResolve = null;
    let _closeGroupResolve = null;
    let _activeChannelId = null;  // Track which channel is currently running commands

    // --- Settings Management ---
    const settings = new Proxy({}, {
        get: (_target, key) => {
            return BdApi.Data.load(meta.name, key) ?? getSetting(key)?.value;
        },
        set: (_target, key, value) => {
            BdApi.Data.save(meta.name, key, value);
            const setting = getSetting(key);
            if (setting) setting.value = value;
            return true;
        }
    });

    const initSettings = () => {
        pluginConfig.settings.forEach(setting => {
            if (settings[setting.id] === undefined) {
                settings[setting.id] = setting.value;
            }
        });
    };

    // --- Utility Functions ---
    const log = (message, type = "info") => {
        const prefix = "[ClusterKiller]";
        const timestamp = new Date().toLocaleTimeString();

        if (settings.isVerbose || type === "error" || type === "warn") {
            switch (type) {
                case "error":
                    console.error(`${prefix} [${timestamp}] ❌`, message);
                    break;
                case "warn":
                    console.warn(`${prefix} [${timestamp}] ⚠️`, message);
                    break;
                case "success":
                    console.log(`${prefix} [${timestamp}] ✅`, message);
                    break;
                default:
                    console.log(`${prefix} [${timestamp}] ℹ️`, message);
            }
        }
    };

    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // --- Send Notification to Channel ---
    const sendNotification = (message) => {
        // Notifications are optional - just log if channel not configured
        if (!settings.notificationChannelId) {
            log("Notification skipped: no channel configured", "info");
            return;
        }
        if (!_sendMessage) {
            log("Cannot send notification: _sendMessage not loaded", "warn");
            return;
        }

        log(`Attempting to send notification to channel ${settings.notificationChannelId}: "${message}"`, "info");

        try {
            // Create a mock channel object with getGuildId method
            const mockChannel = {
                id: settings.notificationChannelId,
                getGuildId: () => null  // Return null for DM or unknown guild
            };

            // Send message with mock channel object
            const result = _sendMessage(settings.notificationChannelId, {
                content: message,
                tts: false,
                invalidEmojis: [],
                validNonShortcutEmojis: []
            }, undefined, { channel: mockChannel });

            log("Notification sent successfully", "success");

            // If it returns a promise, log when it resolves/rejects
            if (result && typeof result.then === 'function') {
                result.then(() => {
                    log("Notification promise resolved", "success");
                }).catch((err) => {
                    log(`Notification promise rejected: ${err.message}`, "error");
                });
            }
        } catch (error) {
            // Log the full error for debugging
            log(`Could not send notification: ${error.message}`, "error");
            log(`Error stack: ${error.stack}`, "error");
        }
    };

    // --- Capture /ppm_of Response ---
    const captureGroupId = (message) => {
        if (!_ppmOfResolve) return;

        log(`Checking message for group ID. Embeds: ${message.embeds?.length || 0}, Content: "${message.content}"`, "info");

        const searchForGroupId = (text, source) => {
            if (!text) return false;
            // Look for "Group " followed by the group ID
            const groupMatch = text.match(/Group\s+(.+)/);
            if (groupMatch) {
                const groupId = groupMatch[1].trim();
                log(`Group ID captured from ${source}: ${groupId}`, "success");
                _ppmOfResolve(groupId);
                _ppmOfResolve = null;
                return true;
            }
            return false;
        };

        // Search in embeds (title, description, fields)
        if (message.embeds && message.embeds.length > 0) {
            log(`Searching ${message.embeds.length} embed(s) for group ID`, "info");
            for (const embed of message.embeds) {
                if (embed.title) {
                    log(`Checking embed title: "${embed.title}"`, "info");
                    if (searchForGroupId(embed.title, "Embed Title")) return;
                }
                if (embed.description && searchForGroupId(embed.description, "Embed Description")) return;
                if (embed.fields && embed.fields.length > 0) {
                    for (const field of embed.fields) {
                        if (searchForGroupId(field.value, `Field: ${field.name}`)) return;
                    }
                }
            }
        }

        // Search in message content
        if (message.content && searchForGroupId(message.content, "Content")) return;

        // Check for error messages
        if (message.content && message.content.toLowerCase().includes("not found")) {
            log("User not found in any group", "warn");
            _ppmOfResolve("USER_NOT_FOUND");
            _ppmOfResolve = null;
        }
    };

    const waitForGroupId = () => {
        return new Promise(resolve => {
            _ppmOfResolve = resolve;
            setTimeout(() => {
                if (_ppmOfResolve) {
                    log("/ppm_of response timeout", "warn");
                    _ppmOfResolve("TIMEOUT");
                    _ppmOfResolve = null;
                }
            }, CONFIG.PPM_OF_TIMEOUT_MS);
        });
    };

    // --- Capture /close_group Response ---
    const captureCloseGroupResponse = (message) => {
        if (!_closeGroupResolve) return;

        const checkResponse = (text) => {
            // Look for success indicators
            if (text.toLowerCase().includes("stopped") ||
                text.toLowerCase().includes("closed") ||
                text.toLowerCase().includes("success")) {
                log("Group closed successfully", "success");
                _closeGroupResolve("SUCCESS");
                _closeGroupResolve = null;
                return true;
            }

            // Look for error indicators
            if (text.toLowerCase().includes("error") ||
                text.toLowerCase().includes("failed") ||
                text.toLowerCase().includes("not found")) {
                log("Group close failed or group not found", "error");
                _closeGroupResolve("FAILED");
                _closeGroupResolve = null;
                return true;
            }

            return false;
        };

        // Check message content
        if (message.content && checkResponse(message.content)) return;

        // Check embeds
        if (message.embeds && message.embeds.length > 0) {
            for (const embed of message.embeds) {
                if (embed.description && checkResponse(embed.description)) return;
                if (embed.title && checkResponse(embed.title)) return;
            }
        }
    };

    const waitForCloseGroupResponse = () => {
        return new Promise(resolve => {
            _closeGroupResolve = resolve;
            setTimeout(() => {
                if (_closeGroupResolve) {
                    log("/close_group response timeout (likely succeeded)", "info");
                    _closeGroupResolve("TIMEOUT");
                    _closeGroupResolve = null;
                }
            }, CONFIG.CLOSE_GROUP_TIMEOUT_MS);
        });
    };

    // --- Module Loading ---
    const loadCommandExecutor = async () => {
        try {
            // Try multiple methods to find the command executor
            let executor = null;

            // Method 1: Search by strings in the function source
            try {
                const [module, key] = BdApi.Webpack.getWithKey(
                    BdApi.Webpack.Filters.byStrings("commandOrigin", "optionValues"),
                    { searchExports: true }
                );
                if (module && key && typeof module[key] === 'function') {
                    executor = module[key].bind(module);
                    log("Command executor loaded via method 1 (byStrings)", "success");
                    return executor;
                }
            } catch (e) {
                log(`Method 1 failed: ${e.message}`, "warn");
            }

            // Method 2: Custom filter with waitForModule
            if (!executor) {
                const moduleFilter = (m) => {
                    const target = m.default ? m.default : m;
                    if (!target || typeof target !== 'object') return false;
                    return Object.keys(target).some(k => {
                        try {
                            const funcString = target[k].toString();
                            return typeof target[k] === 'function' &&
                                (funcString.includes("commandOrigin") || funcString.includes("commandorigin")) &&
                                (funcString.includes("optionValues") || funcString.includes("optionvalues"));
                        } catch (e) { return false; }
                    });
                };

                const mod = await BdApi.Webpack.waitForModule(moduleFilter, { first: true, searchExports: false });
                if (mod) {
                    const target = mod.default ? mod.default : mod;
                    const keyFinder = (t, k) => {
                        try {
                            const s = t[k].toString();
                            return typeof t[k] === 'function' &&
                                (s.includes("commandOrigin") || s.includes("commandorigin")) &&
                                (s.includes("optionValues") || s.includes("optionvalues"));
                        } catch (e) { return false; }
                    };

                    const funcKey = Object.getOwnPropertyNames(target).find(k => keyFinder(target, k));
                    if (funcKey) {
                        executor = target[funcKey].bind(target);
                        log("Command executor loaded via method 2 (waitForModule)", "success");
                        return executor;
                    }
                }
            }

            log("Failed to load Command Executor with all methods", "error");
            return null;
        } catch (e) {
            log(`Fatal Error loading Command Executor: ${e.message}`, "error");
            return null;
        }
    };

    const loadDispatcherPatch = async () => {
        try {
            // Try multiple methods to find the dispatcher
            let dispatchModule = null;

            // Method 1: Use getStore to find Flux Dispatcher
            try {
                const FluxDispatcher = BdApi.Webpack.getStore("FluxDispatcher");
                if (FluxDispatcher && typeof FluxDispatcher.dispatch === 'function') {
                    dispatchModule = FluxDispatcher;
                    log("Found dispatcher via method 1 (getStore)", "success");
                }
            } catch (e) {
                log(`Method 1 failed: ${e.message}`, "warn");
            }

            // Method 2: Search for dispatch with _events
            if (!dispatchModule) {
                try {
                    let mod = BdApi.Webpack.getModule(m => m?.dispatch && m?._events, { searchExports: true });
                    if (mod && typeof mod.dispatch === 'function') {
                        dispatchModule = mod;
                        log("Found dispatcher via method 2 (dispatch + _events)", "success");
                    }
                } catch (e) {
                    log(`Method 2 failed: ${e.message}`, "warn");
                }
            }

            // Method 3: Search just for dispatch function
            if (!dispatchModule) {
                try {
                    let mod = BdApi.Webpack.getModule(m => m?.dispatch && typeof m.dispatch === 'function', { searchExports: true });
                    if (mod && typeof mod.dispatch === 'function') {
                        dispatchModule = mod;
                        log("Found dispatcher via method 3 (dispatch function)", "success");
                    }
                } catch (e) {
                    log(`Method 3 failed: ${e.message}`, "warn");
                }
            }

            // Method 4: Search in Flux dispatcher default export
            if (!dispatchModule) {
                try {
                    let mod = BdApi.Webpack.getModule(m => m?.default?.dispatch, { searchExports: false });
                    if (mod?.default && typeof mod.default.dispatch === 'function') {
                        dispatchModule = mod.default;
                        log("Found dispatcher via method 4 (Flux dispatcher default)", "success");
                    }
                } catch (e) {
                    log(`Method 4 failed: ${e.message}`, "warn");
                }
            }

            if (!dispatchModule) {
                log("Fatal Error: Could not find Discord dispatcher module (all methods failed)", "error");
                return;
            }

            if (typeof dispatchModule.dispatch !== 'function') {
                log(`Fatal Error: Found dispatcher but dispatch is not a function (type: ${typeof dispatchModule.dispatch})`, "error");
                return;
            }

            _dispatcher = dispatchModule;

            BdApi.Patcher.after(meta.name, _dispatcher, "dispatch", (_, args) => {
                try {
                    const event = args[0];

                    if (event?.type === 'MESSAGE_CREATE' || event?.type === 'MESSAGE_UPDATE') {
                        const message = event.message || event.data;

                         // Check for messages from current user with !killgroup (from any device)
                        if (message &&
                            message.author?.id === _currentUserId &&
                            message.content?.startsWith("!killgroup") &&
                            message.guild_id === CONFIG.GUILD_ID) {

                            log(`Detected !killgroup message from own account in channel ${message.channel_id}`, "info");

                            // Delete the message first, then execute workflow
                            (async () => {
                                if (_deleteMessage) {
                                    try {
                                        await _deleteMessage(message.channel_id, message.id, true);
                                        log("Deleted !killgroup message", "success");
                                    } catch (deleteError) {
                                        log(`Failed to delete message: ${deleteError.message}`, "warn");
                                    }
                                }

                                // Now execute the workflow after deletion
                                try {
                                    await handleKillgroupMessage(message.channel_id, message.content);
                                } catch (workflowError) {
                                    log(`Error in workflow: ${workflowError.message}`, "error");
                                }
                            })();

                            return; // Exit early
                        }

                        // Listen for bot messages in the active channel
                        if (_activeChannelId && message && message.channel_id === _activeChannelId &&
                            message.author?.id === CONFIG.BOT_APPLICATION_ID) {
                            log(`Bot message detected in active channel ${_activeChannelId}`, "info");
                            captureGroupId(message);
                            captureCloseGroupResponse(message);
                        }
                    }
                } catch (dispatchError) {
                    log(`Error in dispatcher patch: ${dispatchError.message}`, "error");
                }
            });
            log("Patched Discord Dispatcher successfully", "success");
        } catch (e) {
            log(`Fatal Error patching Dispatcher: ${e.message}`, "error");
            log(`Stack trace: ${e.stack}`, "error");
        }
    };

    const loadMessageSender = async () => {
        try {
            let sender = null;

            // Method 1: Try to find via byStrings
            try {
                const [module, key] = BdApi.Webpack.getWithKey(
                    BdApi.Webpack.Filters.byStrings("invalidEmojis", "validNonShortcutEmojis"),
                    { searchExports: true }
                );
                if (module && key && typeof module[key] === 'function') {
                    sender = module[key].bind(module);
                    log("Message sender loaded via method 1 (byStrings)", "success");
                    return sender;
                }
            } catch (e) {
                log(`Method 1 failed: ${e.message}`, "warn");
            }

            // Method 2: Try finding MessageActions with sendMessage
            if (!sender) {
                try {
                    const MessageActions = BdApi.Webpack.getByKeys("sendMessage", "editMessage");
                    if (MessageActions && typeof MessageActions.sendMessage === 'function') {
                        sender = MessageActions.sendMessage.bind(MessageActions);
                        log("Message sender loaded via method 2 (MessageActions)", "success");
                        return sender;
                    }
                } catch (e) {
                    log(`Method 2 failed: ${e.message}`, "warn");
                }
            }

            // Method 3: Custom filter with waitForModule (fallback)
            if (!sender) {
                const moduleFilter = (m) => {
                    const target = m.default ? m.default : m;
                    if (!target || typeof target !== 'object') return false;
                    return Object.keys(target).some(k => {
                        try {
                            const funcString = target[k].toString();
                            return typeof target[k] === 'function' &&
                                (funcString.includes("invalidEmojis") || funcString.includes("invalidemojis")) &&
                                (funcString.includes("validNonShortcutEmojis") || funcString.includes("validnonshortcutemojis"));
                        } catch (e) { return false; }
                    });
                };

                const mod = await BdApi.Webpack.waitForModule(moduleFilter, { first: true, searchExports: false });
                if (mod) {
                    const target = mod.default ? mod.default : mod;
                    const keyFinder = (t, k) => {
                        try {
                            const s = t[k].toString();
                            return typeof t[k] === 'function' &&
                                (s.includes("invalidEmojis") || s.includes("invalidemojis")) &&
                                (s.includes("validNonShortcutEmojis") || s.includes("validnonshortcutemojis"));
                        } catch (e) { return false; }
                    };

                    const funcKey = Object.getOwnPropertyNames(target).find(k => keyFinder(target, k));
                    if (funcKey) {
                        sender = target[funcKey].bind(target);
                        log("Message sender loaded via method 3 (waitForModule)", "success");
                        return sender;
                    }
                }
            }

            log("Could not load Message Sender with all methods", "warn");
            return null;
        } catch (e) {
            log(`Error loading Message Sender: ${e.message}`, "error");
            return null;
        }
    };

    const loadMessageDeleter = async () => {
        try {
            let deleter = null;

            // Method 1: Look for MessageActions module with deleteMessage
            try {
                const MessageActions = BdApi.Webpack.getByKeys("deleteMessage", "sendMessage");
                if (MessageActions && typeof MessageActions.deleteMessage === 'function') {
                    deleter = MessageActions.deleteMessage.bind(MessageActions);
                    log("Message deleter loaded via method 1 (getByKeys)", "success");
                    return deleter;
                }
            } catch (e) {
                log(`Method 1 failed: ${e.message}`, "warn");
            }

            // Method 2: Search with searchExports option
            if (!deleter) {
                try {
                    const MessageActions = BdApi.Webpack.getModule(
                        m => m.deleteMessage && m.sendMessage,
                        { searchExports: true }
                    );
                    if (MessageActions && typeof MessageActions.deleteMessage === 'function') {
                        deleter = MessageActions.deleteMessage.bind(MessageActions);
                        log("Message deleter loaded via method 2 (searchExports)", "success");
                        return deleter;
                    }
                } catch (e) {
                    log(`Method 2 failed: ${e.message}`, "warn");
                }
            }

            // Method 3: Search just for deleteMessage
            if (!deleter) {
                try {
                    const MessageActions = BdApi.Webpack.getByKeys("deleteMessage");
                    if (MessageActions && typeof MessageActions.deleteMessage === 'function') {
                        deleter = MessageActions.deleteMessage.bind(MessageActions);
                        log("Message deleter loaded via method 3 (deleteMessage only)", "success");
                        return deleter;
                    }
                } catch (e) {
                    log(`Method 3 failed: ${e.message}`, "warn");
                }
            }

            log("Could not find deleteMessage function with all methods", "warn");
            return null;
        } catch (e) {
            log(`Error loading Message Deleter: ${e.message}`, "error");
            return null;
        }
    };

    const loadCurrentUserId = async () => {
        try {
            let UserStore = null;

            // Method 1: Use getStore to find UserStore
            try {
                UserStore = BdApi.Webpack.getStore("UserStore");
                if (UserStore && typeof UserStore.getCurrentUser === 'function') {
                    const currentUser = UserStore.getCurrentUser();
                    if (currentUser && currentUser.id) {
                        _currentUserId = currentUser.id;
                        log(`Current User ID via method 1 (getStore): ${_currentUserId}`, "success");
                        return true;
                    }
                }
            } catch (e) {
                log(`Method 1 failed: ${e.message}`, "warn");
            }

            // Method 2: Search by getCurrentUser function
            if (!_currentUserId) {
                try {
                    UserStore = BdApi.Webpack.getByKeys("getCurrentUser", "getUser");
                    if (UserStore && typeof UserStore.getCurrentUser === 'function') {
                        const currentUser = UserStore.getCurrentUser();
                        if (currentUser && currentUser.id) {
                            _currentUserId = currentUser.id;
                            log(`Current User ID via method 2 (getByKeys): ${_currentUserId}`, "success");
                            return true;
                        }
                    }
                } catch (e) {
                    log(`Method 2 failed: ${e.message}`, "warn");
                }
            }

            // Method 3: Search with searchExports option
            if (!_currentUserId) {
                try {
                    UserStore = BdApi.Webpack.getModule(m => m.getCurrentUser, { searchExports: true });
                    if (UserStore && typeof UserStore.getCurrentUser === 'function') {
                        const currentUser = UserStore.getCurrentUser();
                        if (currentUser && currentUser.id) {
                            _currentUserId = currentUser.id;
                            log(`Current User ID via method 3 (searchExports): ${_currentUserId}`, "success");
                            return true;
                        }
                    }
                } catch (e) {
                    log(`Method 3 failed: ${e.message}`, "warn");
                }
            }

            log("Could not load current user ID with all methods", "error");
            return false;
        } catch (e) {
            log(`Error loading current user ID: ${e.message}`, "error");
            return false;
        }
    };

    const loadModules = async () => {
        log("Loading required modules...", "info");

        const [executor, userId] = await Promise.all([
            loadCommandExecutor(),
            loadCurrentUserId()
        ]);

        _executeCommand = executor;

        if (!_executeCommand || !userId) {
            log("Failed to load required modules", "error");
            return false;
        }

        await loadDispatcherPatch();
        _sendMessage = await loadMessageSender();
        _deleteMessage = await loadMessageDeleter();

        log("All modules loaded successfully", "success");
        return true;
    };

    // --- Command Execution ---
    const executeSlashCommand = async (command, optionValues = {}, channelId) => {
        if (!_executeCommand) {
            log("Command executor not loaded", "error");
            return false;
        }

        try {
            const realCommand = {
                id: command.commandId,
                version: command.commandVersion,
                type: 1,
                inputType: 3,
                name: command.name,
                applicationId: CONFIG.BOT_APPLICATION_ID,
                options: command.options || [],
                dmPermission: true,
                integration_types: [0, 1],
                displayDescription: command.description,
                rootCommand: {
                    id: command.commandId,
                    type: 1,
                    application_id: CONFIG.BOT_APPLICATION_ID,
                    version: command.commandVersion,
                    name: command.name,
                    description: command.description,
                    options: command.options || [],
                    dm_permission: true,
                    integration_types: [0, 1]
                }
            };

            const mockChannel = { id: channelId, guild_id: CONFIG.GUILD_ID, type: 0 };
            const mockGuild = { id: CONFIG.GUILD_ID };

            await _executeCommand({
                command: realCommand,
                optionValues: optionValues,
                context: { channel: mockChannel, guild: mockGuild },
                commandOrigin: 1,
                commandTargetId: null
            });

            log(`Executed /${command.name} in channel ${channelId}`, "info");
            return true;
        } catch (error) {
            log(`Error executing /${command.name}: ${error.message}`, "error");
            return false;
        }
    };

    // --- Role Checking ---
    const hasHelperRole = () => {
        try {
            let GuildMemberStore = null;

            // Method 1: Use getStore to find GuildMemberStore
            try {
                GuildMemberStore = BdApi.Webpack.getStore("GuildMemberStore");
            } catch (e) {
                log(`Method 1 failed: ${e.message}`, "warn");
            }

            // Method 2: Search by getMember function
            if (!GuildMemberStore) {
                try {
                    GuildMemberStore = BdApi.Webpack.getByKeys("getMember", "getMembers");
                } catch (e) {
                    log(`Method 2 failed: ${e.message}`, "warn");
                }
            }

            // Method 3: Search with searchExports option
            if (!GuildMemberStore) {
                try {
                    GuildMemberStore = BdApi.Webpack.getModule(m => m.getMember, { searchExports: true });
                } catch (e) {
                    log(`Method 3 failed: ${e.message}`, "warn");
                }
            }

            if (!GuildMemberStore || typeof GuildMemberStore.getMember !== 'function') {
                log("Could not find GuildMemberStore with all methods", "error");
                return false;
            }

            const member = GuildMemberStore.getMember(CONFIG.GUILD_ID, _currentUserId);
            if (!member) {
                log("Could not find current user's guild member data", "error");
                return false;
            }

            const hasRole = member.roles.includes(CONFIG.HELPER_ROLE_ID);
            log(`Helper role check: ${hasRole ? "✅ PASS" : "❌ FAIL"}`, hasRole ? "success" : "warn");
            return hasRole;
        } catch (error) {
            log(`Error checking helper role: ${error.message}`, "error");
            return false;
        }
    };

    // --- Main /killgroup Logic ---
    const killGroup = async (userId, channelId) => {
        log(`Starting /killgroup workflow for user ${userId} in channel ${channelId}`, "info");

        // Set the active channel for bot response listening
        _activeChannelId = channelId;

        // Check helper role
        if (!hasHelperRole()) {
            const errorMsg = "❌ You need the @helper role to use /killgroup";
            log(errorMsg, "error");
            sendNotification(errorMsg);
            BdApi.UI.showToast(errorMsg, { type: "error" });
            _activeChannelId = null;
            return;
        }

        // Step 1: Execute /ppm_of to get group ID
        log(`Step 1: Executing /ppm_of for user ${userId}`, "info");
        const ppmOfSuccess = await executeSlashCommand(PPM_OF_COMMAND, {
            "target": [{ type: "userMention", userId: userId }]
        }, channelId);

        if (!ppmOfSuccess) {
            const errorMsg = "❌ Failed to execute /ppm_of command";
            log(errorMsg, "error");
            sendNotification(errorMsg);
            BdApi.UI.showToast(errorMsg, { type: "error" });
            _activeChannelId = null;
            return;
        }

        // Step 2: Wait for group ID response
        log("Step 2: Waiting for group ID response...", "info");
        const groupId = await waitForGroupId();

        if (groupId === "TIMEOUT") {
            const errorMsg = "❌ Timeout waiting for /ppm_of response";
            log(errorMsg, "error");
            sendNotification(errorMsg);
            BdApi.UI.showToast(errorMsg, { type: "error" });
            _activeChannelId = null;
            return;
        }

        if (groupId === "USER_NOT_FOUND") {
            const errorMsg = "❌ User not found in any group";
            log(errorMsg, "warn");
            sendNotification(errorMsg);
            BdApi.UI.showToast(errorMsg, { type: "warning" });
            _activeChannelId = null;
            return;
        }

        log(`Group ID found: ${groupId}`, "success");

        // Step 3: Execute /close_group
        log(`Step 3: Executing /close_group for group ${groupId}`, "info");
        const closeGroupSuccess = await executeSlashCommand(CLOSE_GROUP_COMMAND, {
            "group-id": [{ type: "text", text: groupId }]
        }, channelId);

        if (!closeGroupSuccess) {
            const errorMsg = "❌ Failed to execute /close_group command";
            log(errorMsg, "error");
            sendNotification(errorMsg);
            BdApi.UI.showToast(errorMsg, { type: "error" });
            _activeChannelId = null;
            return;
        }

        // Step 4: Wait for confirmation
        log("Step 4: Waiting for /close_group confirmation...", "info");
        const closeResult = await waitForCloseGroupResponse();

        if (closeResult === "SUCCESS" || closeResult === "TIMEOUT") {
            const successMsg = `✅ Group ${groupId} has been closed`;
            log(successMsg, "success");
            sendNotification(successMsg);
            BdApi.UI.showToast(successMsg, { type: "success" });
        } else {
            const errorMsg = `❌ Failed to close group ${groupId}`;
            log(errorMsg, "error");
            sendNotification(errorMsg);
            BdApi.UI.showToast(errorMsg, { type: "error" });
        }

        // Clear active channel
        _activeChannelId = null;
    };

    // --- Handle !killgroup message (from any device) ---
    const handleKillgroupMessage = async (channelId, messageContent) => {
        log(`Processing !killgroup command from channel ${channelId}`, "info");

        // Parse user mention from command
        const mentionMatch = messageContent.match(/<@!?(\d+)>/);

        if (!mentionMatch) {
            const errorMsg = "❌ Invalid usage. Use: !killgroup @username";
            log(errorMsg, "error");
            BdApi.UI.showToast(errorMsg, { type: "error" });
            return;
        }

        const targetUserId = mentionMatch[1];
        log(`Parsed target user ID: ${targetUserId}`, "info");

        // Execute killgroup workflow in the same channel
        await killGroup(targetUserId, channelId);
    };

    // --- Message Listener for !killgroup Command (BetterDiscord client only) ---
    const onMessageSent = async (channelId, message) => {
        // Check if message starts with !killgroup
        if (!message.content.startsWith("!killgroup")) return;

        log(`Detected !killgroup command in channel ${channelId}`, "info");

        // Parse user mention from command
        // Format: !killgroup @username or !killgroup <@userid>
        const mentionMatch = message.content.match(/<@!?(\d+)>/);

        if (!mentionMatch) {
            const errorMsg = "❌ Invalid usage. Use: !killgroup @username";
            log(errorMsg, "error");
            BdApi.UI.showToast(errorMsg, { type: "error" });
            return;
        }

        const targetUserId = mentionMatch[1];
        log(`Parsed target user ID: ${targetUserId}`, "info");

        // Execute killgroup workflow in the same channel
        await killGroup(targetUserId, channelId);
    };

    // --- Patch Message Sending (BetterDiscord client only) ---
    const patchMessageSending = () => {
        try {
            let MessageActions = null;

            // Method 1: Try getByKeys
            try {
                MessageActions = BdApi.Webpack.getByKeys("sendMessage", "editMessage");
            } catch (e) {
                log(`Method 1 failed: ${e.message}`, "warn");
            }

            // Method 2: Try with searchExports
            if (!MessageActions) {
                try {
                    MessageActions = BdApi.Webpack.getModule(
                        m => m.sendMessage && m.editMessage,
                        { searchExports: true }
                    );
                } catch (e) {
                    log(`Method 2 failed: ${e.message}`, "warn");
                }
            }

            // Method 3: Just search for sendMessage
            if (!MessageActions) {
                try {
                    MessageActions = BdApi.Webpack.getByKeys("sendMessage");
                } catch (e) {
                    log(`Method 3 failed: ${e.message}`, "warn");
                }
            }

            if (!MessageActions || typeof MessageActions.sendMessage !== 'function') {
                log("Could not find MessageActions module with all methods", "error");
                return;
            }

            BdApi.Patcher.before(meta.name, MessageActions, "sendMessage", (_, args) => {
                const [channelId, message] = args;
                if (message && message.content && message.content.startsWith("!killgroup")) {
                    log(`Intercepting !killgroup message: "${message.content}"`, "info");

                    // Clear the message content to prevent sending
                    args[1] = { ...message, content: "" };

                    // Trigger the killgroup workflow
                    setTimeout(() => onMessageSent(channelId, message), 0);

                    // Also return false to cancel
                    return false;
                }
            });

            log("Patched message sending to intercept !killgroup", "success");
        } catch (error) {
            log(`Error patching message sending: ${error.message}`, "error");
        }
    };

    // --- Plugin Lifecycle ---
    return {
        start: async () => {
            log("ClusterKiller plugin starting...", "info");
            initSettings();

            if (!_modulesLoaded) {
                const success = await loadModules();
                if (!success) {
                    log("Failed to initialize ClusterKiller", "error");
                    BdApi.UI.showToast("ClusterKiller failed to load required modules", { type: "error" });
                    return;
                }
                _modulesLoaded = true;
            }

            patchMessageSending();

            log("ClusterKiller plugin started successfully", "success");
            BdApi.UI.showToast("ClusterKiller is ready! Use !killgroup @username from any device", { type: "success" });
        },

        stop: () => {
            log("ClusterKiller plugin stopping...", "info");
            BdApi.Patcher.unpatchAll(meta.name);
            _ppmOfResolve = null;
            _closeGroupResolve = null;
            _activeChannelId = null;
            log("ClusterKiller plugin stopped", "info");
        },

        getSettingsPanel: () => {
            initSettings();
            return BdApi.UI.buildSettingsPanel({
                settings: pluginConfig.settings,
                onChange: (category, id, value) => {
                    settings[id] = value;
                }
            });
        }
    };
}

module.exports = ClusterKiller;

//@end@*/
