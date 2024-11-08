// main.ts
import { App, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { PDFProcessor } from './pdfProcessor';
import { PDFResectorModal } from './pdfResectorModal';  // We should move the modal to its own file too

interface PDFResectorSettings {
	defaultOutputFolder: string;
}

const DEFAULT_SETTINGS: PDFResectorSettings = {
	defaultOutputFolder: 'split-pdfs'
}

export default class PDFResectorPlugin extends Plugin {
	settings: PDFResectorSettings;
	processor: PDFProcessor;

	async onload() {
		await this.loadSettings();

		this.processor = new PDFProcessor(this.app.vault, this.app);

		// Add the command to open the PDF splitter modal
		this.addCommand({
			id: 'open-pdf-resector',
			name: 'Split PDF',
			callback: () => {
				new PDFResectorModal(this.app, this).open();
			}
		});

		// Add the file menu item for PDFs - with type checking
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && file.extension === 'pdf') {
					menu.addItem((item) => {
						item
							.setTitle('Split PDF')
							.setIcon('scissors')
							.onClick(() => {
								const modal = new PDFResectorModal(this.app, this);
								modal.pdfPath = file.path;
								modal.open();
							});
					});
				}
			})
		);

		// Add settings tab
		this.addSettingTab(new PDFResectorSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class PDFResectorSettingTab extends PluginSettingTab {
	plugin: PDFResectorPlugin;

	constructor(app: App, plugin: PDFResectorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Default Output Folder')
			.setDesc('Folder where split PDFs will be saved. Leave blank to save in the same folder as the source PDF.')
			.addText(text => text
				.setPlaceholder('split-pdfs')
				.setValue(this.plugin.settings.defaultOutputFolder)
				.onChange(async (value) => {
					this.plugin.settings.defaultOutputFolder = value;
					await this.plugin.saveSettings();
				}));
	}
}