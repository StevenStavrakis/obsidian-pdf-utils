import { App, Modal, Notice, Setting, TextComponent } from "obsidian";
import PDFResectorPlugin from "./main";
import { PDFDocument } from "pdf-lib";
import { SafetyUtils } from "./safetyUtils";

export class PDFResectorModal extends Modal {
	plugin: PDFResectorPlugin;
	pdfPath = '';
	startPage = 1;
	endPage = 1;
	outputName = '';
	outputDir = '';
	private doc: PDFDocument | null = null;
	private safetyUtils: SafetyUtils;

	constructor(app: App, plugin: PDFResectorPlugin) {
		super(app);
		this.plugin = plugin;
		this.safetyUtils = new SafetyUtils(app);
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

	override async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('pdf-resector-modal');

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
				.setValue(this.startPage.toString())
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
				.setValue(this.endPage.toString())
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
				.setValue(this.outputDir)
				.onChange(async (value) => {
					this.outputDir = value;
				}));

		// Output Name
		new Setting(contentEl)
			.setName('Output Name')
			.setDesc('Name for the new PDF file (without .pdf extension)')
			.addText(text => text
				.setPlaceholder('split-output')
				.setValue(this.outputName)
				.onChange(async (value) => {
					this.outputName = value;
				}));

		// Action buttons container
		const buttonContainer = contentEl.createDiv('button-container');

		// Split Button
		new Setting(buttonContainer)
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

	// In PDFResectorModal.ts
	async splitPDF() {
		try {
			const validationError = this.validateInput();
			if (validationError) {
				new Notice(validationError);
				return;
			}
	
			const doc = this.doc!;
			console.log(`[DEBUG] Starting PDF split process`);
	
			// Get the full path of the source file in the vault
			const sourcePath = this.app.vault.getAbstractFileByPath(this.pdfPath)?.path;
			if (!sourcePath) {
				throw new Error('Could not resolve source file path');
			}
			console.log(`[DEBUG] Full source path: ${sourcePath}`);
	
			// Ensure output name has .pdf extension
			if (!this.outputName.toLowerCase().endsWith('.pdf')) {
				this.outputName = `${this.outputName}.pdf`;
			}
	
			const newDoc = await this.plugin.processor.extractPages(
				doc,
				this.startPage,
				this.endPage
			);
	
			// Get the parent folder of the source file
			const sourceDirectory = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
			console.log(`[DEBUG] Source directory: ${sourceDirectory}`);
			
			// Determine output directory, making sure to use full vault paths
			const outputFolder = this.outputDir.trim()
				? (this.outputDir.startsWith('/') ? this.outputDir : `/${this.outputDir}`)
				: sourceDirectory;
			console.log(`[DEBUG] Output folder: ${outputFolder}`);
	
			// Construct full vault path for output
			const outputPath = `${outputFolder}${outputFolder.endsWith('/') ? '' : '/'}${this.outputName}`;
			console.log(`[DEBUG] Constructed output path: ${outputPath}`);
	
			if (!this.safetyUtils.isPathInVault(outputPath)) {
				throw new Error('Output path must be within the vault');
			}
	
			await this.plugin.processor.savePDF(newDoc, outputPath);
			
			// Verify file exists
			const exists = await this.app.vault.adapter.exists(outputPath);
			console.log(`[DEBUG] File exists check:`, exists);
			
			// If file exists but Obsidian doesn't show it, try to refresh
			if (exists) {
				// Force Obsidian to index the new file
				await this.app.vault.adapter.stat(outputPath);
			}
	
			new Notice(`Successfully created ${outputPath}`);
			this.close();
		} catch (error) {
			console.error('[DEBUG] PDF splitting error:', error);
			console.error('[DEBUG] Error stack:', error.stack);
			new Notice(`Error splitting PDF: ${error.message}`);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}