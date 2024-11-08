import { App, DataAdapter, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TextComponent } from 'obsidian';
import { PDFDocument } from 'pdf-lib';

interface PDFResectorSettings {
	defaultOutputFolder: string;
}

interface FileSystem {
	readBinary(path: string): Promise<Uint8Array>;
	writeBinary(path: string, data: Uint8Array): Promise<void>;
	exists(path: string): Promise<boolean>;
	mkdir(path: string): Promise<void>;
}

class ObsidianFileSystemAdapter implements FileSystem {
	constructor(private adapter: DataAdapter) { }

	async readBinary(path: string): Promise<Uint8Array> {
		const buffer = await this.adapter.readBinary(path);
		return new Uint8Array(buffer);
	}

	async writeBinary(path: string, data: Uint8Array): Promise<void> {
		return this.adapter.writeBinary(path, data.buffer);
	}

	async exists(path: string): Promise<boolean> {
		return this.adapter.exists(path);
	}

	async mkdir(path: string): Promise<void> {
		return this.adapter.mkdir(path);
	}
}

class PDFProcessor {
	constructor(private fs: FileSystem) { }

	async loadPDF(pdfPath: string): Promise<PDFDocument> {
		const pdfFile = await this.fs.readBinary(pdfPath);
		return await PDFDocument.load(pdfFile);
	}

	async extractPages(doc: PDFDocument, startPage: number, endPage: number): Promise<PDFDocument> {
		// Convert from 1-based to 0-based page numbers
		const pageIndexes = Array.from(
			{ length: endPage - startPage + 1 },
			(_, i) => i + startPage - 1
		);

		const newDoc = await PDFDocument.create();
		const pages = await newDoc.copyPages(doc, pageIndexes);
		pages.forEach(page => newDoc.addPage(page));
		return newDoc;
	}

	async savePDF(doc: PDFDocument, outputPath: string): Promise<void> {
		const pdfBytes = await doc.save();
		await this.fs.writeBinary(outputPath, pdfBytes);
	}

	async ensureDirectoryExists(path: string): Promise<void> {
		if (!(await this.fs.exists(path))) {
			await this.fs.mkdir(path);
		}
	}
}

const DEFAULT_SETTINGS: PDFResectorSettings = {
	defaultOutputFolder: 'split-pdfs'
}

export default class PDFResectorPlugin extends Plugin {
	settings: PDFResectorSettings;
	processor: PDFProcessor;

	async onload() {
		await this.loadSettings();
		const fsAdapter = new ObsidianFileSystemAdapter(this.app.vault.adapter);
		this.processor = new PDFProcessor(fsAdapter);

		// Register PDF Resector command
		this.addCommand({
			id: 'open-pdf-resector',
			name: 'Split PDF',
			callback: () => {
				new PDFResectorModal(this.app, this).open();
			}
		});

		// Register the file menu event handler for PDFs
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

class PDFResectorModal extends Modal {
	plugin: PDFResectorPlugin;
	pdfPath = '';
	startPage = 1;
	endPage = 1;
	outputName = '';
	outputDir = '';  // New field for output directory
	private doc: PDFDocument | null = null;

	constructor(app: App, plugin: PDFResectorPlugin) {
		super(app);
		this.plugin = plugin;
	}

	async loadPDFDocument() {
		try {
			this.doc = await this.plugin.processor.loadPDF(this.pdfPath);
			return this.doc.getPageCount();
		} catch (error) {
			console.error('Error loading PDF:', error);
			new Notice(`Error loading PDF: ${error.message}`);
			return 0;
		}
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'PDF Resector' });

		// PDF File Selection
		const pdfPathSetting = new Setting(contentEl)
			.setName('PDF File')
			.setDesc('Select the PDF file to split');

		const pathInput = new TextComponent(pdfPathSetting.controlEl);
		pathInput
			.setPlaceholder('Path to PDF file')
			.setValue(this.pdfPath)
			.onChange(async (value) => {
				this.pdfPath = value;
				const pageCount = await this.loadPDFDocument();
				if (pageCount > 0) {
					new Notice(`PDF loaded with ${pageCount} pages`);
				}
			});

		// Hide the PDF path setting if it was opened from context menu
		if (this.pdfPath) {
			pdfPathSetting.setDesc(`Selected file: ${this.pdfPath}`);
			pathInput.setDisabled(true);
			const pageCount = await this.loadPDFDocument();
			if (pageCount > 0) {
				new Notice(`PDF loaded with ${pageCount} pages`);
			}
		}

		// Start Page
		new Setting(contentEl)
			.setName('Start Page')
			.setDesc('First page to include')
			.addText(text => text
				.setPlaceholder('1')
				.setValue('1')
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.startPage = num;
					}
				}));

		// End Page
		new Setting(contentEl)
			.setName('End Page')
			.setDesc('Last page to include')
			.addText(text => text
				.setPlaceholder('End page number')
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.endPage = num;
					}
				}));

		// Output Directory
		new Setting(contentEl)
			.setName('Output Directory')
			.setDesc('Leave blank to save in the same folder as the source PDF')
			.addText(text => text
				.setPlaceholder('Directory path')
				.onChange(async (value) => {
					this.outputDir = value;
				}));

		// Output Name
		new Setting(contentEl)
			.setName('Output Name')
			.setDesc('Name for the new PDF file')
			.addText(text => text
				.setPlaceholder('split-output')
				.onChange(async (value) => {
					this.outputName = value;
				}));

		// Split Button
		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Split PDF')
				.setCta()
				.onClick(async () => {
					await this.splitPDF();
				}));
	}

	validateInput(): string | null {
		if (!this.pdfPath) {
			return 'Please select a PDF file';
		}
		if (!this.doc) {
			return 'PDF document not loaded';
		}
		if (!this.startPage || !this.endPage || this.startPage > this.endPage) {
			return 'Please enter valid page numbers';
		}
		if (this.startPage < 1 || this.endPage > this.doc.getPageCount()) {
			return `Page numbers must be between 1 and ${this.doc.getPageCount()}`;
		}
		if (!this.outputName) {
			return 'Please enter an output filename';
		}
		return null;
	}

	async splitPDF() {
		try {
			const validationError = this.validateInput();
			if (validationError) {
				new Notice(validationError);
				return;
			}

			// We can safely assert doc is not null here due to validation
			const doc = this.doc!;

			console.log(`Processing PDF: ${this.pdfPath}`);
			console.log(`Pages ${this.startPage} to ${this.endPage}`);

			const newDoc = await this.plugin.processor.extractPages(
				doc,
				this.startPage,
				this.endPage
			);

			// Determine output directory
			const sourceDirectory = this.pdfPath.substring(0, this.pdfPath.lastIndexOf('/'));
			const outputFolder = this.outputDir.trim()
				? this.outputDir
				: sourceDirectory;

			if (outputFolder !== sourceDirectory) {
				await this.plugin.processor.ensureDirectoryExists(outputFolder);
			}

			const outputPath = `${outputFolder}/${this.outputName}.pdf`;
			await this.plugin.processor.savePDF(newDoc, outputPath);

			new Notice(`Successfully created ${outputPath}`);
			this.close();
		} catch (error) {
			console.error('PDF splitting error:', error);
			new Notice(`Error splitting PDF: ${error.message}`);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
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