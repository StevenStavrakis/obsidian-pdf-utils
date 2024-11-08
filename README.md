# Obsidian PDF Utils

>[!caution]
> This plugin is not thoroughly tested, and does make changes to your file system. It could brick your entire vault for no reason. If you use it, you understand the risks.

A plugin for [Obsidian](https://obsidian.md) that lets you split PDFs into smaller sections by extracting specific page ranges into new PDFs.

## Features

- Split PDFs by selecting page ranges

## Usage

1. **Right-click Method**:
   - Right-click any PDF in your vault
   - Select "Split PDF" from the context menu
   - Enter the desired page range and output settings
   - Click "Split PDF" to create the new file

2. **Command Palette Method**:
   - Open the command palette (Ctrl/Cmd + P)
   - Search for "Split PDF"
   - Enter the PDF path and settings in the modal
   - Click "Split PDF" to create the new file

## Installation

### From Obsidian

Don't know how to get it on the community plugins browser, so you'll have to manually install it.

### Manual Installation

1. Download the latest release from the releases page
2. Extract the files into your vault's `.obsidian/plugins/obsidian-pdf-utils/` directory
3. Enable the plugin in your Community Plugins settings

## Development

This plugin is built using TypeScript and the Obsidian API. To build from source:

```bash
# Clone the repository
git clone https://github.com/StevenStavrakis/obsidian-pdf-utils.git

# Install dependencies
npm install

# Build the plugin
npm run build
```

## Dependencies

- [pdf-lib](https://github.com/Hopding/pdf-lib) - For PDF manipulation

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have suggestions for improvements, please file an issue on the GitHub repository.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request