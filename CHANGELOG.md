# Changelog

All notable changes to ClusterKiller will be documented in this file.

## [1.0.2] - 2025-01-20

### Added
- **Multi-device support**: Use `!killgroup @username` from any Discord client (mobile, web, desktop)
- **Automatic message deletion**: Messages sent from non-BetterDiscord clients are automatically detected and deleted
- **Any-channel execution**: Commands can now be run from any channel in the server (bot commands execute in the same channel)
- **Cross-server notifications**: Notification channel can be on a different server than the bot server
- **Message dispatcher monitoring**: Plugin now monitors all MESSAGE_CREATE events to detect commands from any device

### Changed
- Removed hardcoded bot channel requirement - commands now execute in whichever channel you use them
- Updated dispatcher logic to track active channel dynamically
- Improved error handling for message deletion
- Enhanced notification system with better error logging

### Fixed
- Fixed notification sending for cross-server channels
- Fixed message deletion timing to ensure commands are removed before workflow execution
- Improved module loading for message deletion API

## [1.0.1] - 2025-01-20

### Added
- Initial release
- `!killgroup @username` command
- Helper role requirement validation
- Automatic workflow: `/ppm_of` → parse group ID → `/close_group`
- Configurable notification channel
- Verbose logging option
- Cross-language group ID support (En:, Jp:, Br:, etc.)
