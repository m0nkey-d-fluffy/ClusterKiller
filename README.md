# ClusterKiller

A BetterDiscord plugin that provides a `!killgroup` command to close a user's group by looking up their group ID and closing it automatically.

## Features

- **`!killgroup @username`** - Local command to close a user's group
- **Helper Role Required** - Only users with the `@helper` role can use `!killgroup`
- **Automatic Workflow** - Runs `/ppm_of` to find the group ID, then `/close_group` to close it
- **Any Channel Support** - Use `!killgroup` from any channel in the server - bot commands execute in that same channel
- **Status Notifications** - Optional notifications sent to a configured channel (can be on a different server)

## Requirements

- BetterDiscord installed
- Access to the Discord server with the bot
- `@helper` role to use the `!killgroup` command

## Installation

1. Download `ClusterKiller.plugin.js`
2. Place it in your BetterDiscord plugins folder:
   - Windows: `%appdata%/BetterDiscord/plugins/`
   - Mac: `~/Library/Application Support/BetterDiscord/plugins/`
   - Linux: `~/.config/BetterDiscord/plugins/`
3. Enable the plugin in Discord Settings → Plugins

## Usage

### Basic Command

`!killgroup @username`


This will:
1. Check that you have the `@helper` role
2. Execute `/ppm_of` for the mentioned user to find their group ID
3. Parse the group ID from the bot's response
4. Execute `/close_group` with that group ID
5. Show a success/error notification

### Examples

`!killgroup @John !killgroup @829704502995189773`


**Note:** You can use `!killgroup` from **any channel** in the server. The bot commands (`/ppm_of` and `/close_group`) will be executed in the same channel where you run `!killgroup`.

## Settings

Access settings via Discord Settings → Plugins → ClusterKiller → Settings

### Notification Channel ID
- **Type:** Text
- **Default:** Empty (console only)
- **Description:** The Discord Channel ID where status notifications will be sent. Leave empty for console-only logging. This channel can be on a different server.

### Verbose Logging
- **Type:** Switch
- **Default:** Enabled
- **Description:** If enabled, all `!killgroup` actions will be logged to the console with detailed information.

## Configuration

The plugin is pre-configured with the following IDs (hardcoded):

- **Guild ID:** `1334603881652555896`
- **Bot Application ID:** `1334630845574676520`
- **Helper Role ID:** `1426619911626686598`

To modify these, edit the `CONFIG` object in `ClusterKiller.plugin.js`.

## How It Works

1. **Message Interception:** The plugin intercepts messages you send that start with `!killgroup`
2. **Role Validation:** Checks if you have the helper role before proceeding
3. **User ID Parsing:** Extracts the user ID from the `@mention` in your command
4. **Channel Detection:** Identifies which channel you're running the command from
5. **Group Lookup:** Sends `/ppm_of <userid>` to the current channel
6. **Response Parsing:** Waits for the bot's response and extracts the group ID from the embed title (format: `"Group En:123456789:1:1"`)
7. **Group Closure:** Sends `/close_group <groupid>` to the current channel
8. **Confirmation:** Shows a success/error notification based on the bot's response

## Troubleshooting

### "You need the @helper role to use !killgroup"
- Make sure you have the `@helper` role in the Discord server
- The helper role ID is hardcoded as `1426619911626686598`

### "Timeout waiting for /ppm_of response"
- The bot may be slow or offline
- The user might not be in any group
- Check the current channel for the actual response
- The channel may have closed before the bot could respond (note: channels close when groups close)

### "User not found in any group"
- The mentioned user is not currently in a group
- The user ID might be incorrect

### "Failed to execute command"
- The plugin modules may not have loaded correctly
- Try reloading Discord (Ctrl+R)
- Check console for detailed error messages (enable Verbose Logging)

### Command not working
- Make sure you're using the correct format: `!killgroup @username`
- The plugin must be enabled in BetterDiscord settings
- Check console logs for errors (F12 → Console tab)
- Look for detailed logging showing bot message detection and group ID parsing

### Notifications not sending
- Verify the notification channel ID is correct in settings
- Check console for notification-related errors
- The notification channel can be on a different server, but you must have permission to post there

## Logs and Debugging

All plugin activity is logged to the browser console with the prefix `[ClusterKiller]`.

To view logs:
1. Press `F12` or `Ctrl+Shift+I` to open Developer Tools
2. Go to the Console tab
3. Look for messages with `[ClusterKiller]` prefix

Log types:
- ✅ Success messages
- ❌ Error messages
- ⚠️ Warning messages
- ℹ️ Info messages (only shown when Verbose Logging is enabled)

## Credits

- **Author:** m0nkey.d.fluffy
- **Based on:** PPMChecker plugin architecture
- **Source:** https://github.com/m0nkey-d-fluffy/ClusterKiller

## License

This plugin is provided as-is for use with BetterDiscord. Use at your own risk.