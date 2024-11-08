import { App, Notice, Vault } from "obsidian";
import { PDFDocument } from "pdf-lib";
import { ProcessingProgress } from "types";
import { SafetyUtils } from "./safetyUtils";

export class PDFProcessor {
    private progressCallback?: (progress: ProcessingProgress) => void;
    private MAX_PDF_SIZE = 100 * 1024 * 1024; // 100MB limit
    private safetyUtils: SafetyUtils;

    constructor(private vault: Vault, private app: App) {
        this.safetyUtils = new SafetyUtils(app);
    }

    setProgressCallback(callback: (progress: ProcessingProgress) => void) {
        this.progressCallback = callback;
    }

    private updateProgress(current: number, total: number, status: string) {
        if (this.progressCallback) {
            this.progressCallback({ current, total, status });
        }
    }

    async loadPDF(path: string): Promise<PDFDocument> {
        this.updateProgress(0, 100, 'Loading PDF file...');

        try {
            // Check file size
            const stat = await this.vault.adapter.stat(path);
            if (stat && stat.size > this.MAX_PDF_SIZE) {
                throw new Error(`File size (${Math.round(stat.size / 1024 / 1024)}MB) exceeds maximum allowed size (100MB)`);
            }

            const pdfFile = await this.vault.adapter.readBinary(path);
            const doc = await PDFDocument.load(pdfFile);
            this.updateProgress(100, 100, 'PDF loaded successfully');
            return doc;
        } catch (error) {
            throw new Error(`Failed to load PDF: ${error.message}`);
        }
    }

    async extractPages(doc: PDFDocument, startPage: number, endPage: number): Promise<PDFDocument> {
        this.updateProgress(0, endPage - startPage + 1, 'Extracting pages...');

        const pageIndexes = Array.from(
            { length: endPage - startPage + 1 },
            (_, i) => i + startPage - 1
        );

        const newDoc = await PDFDocument.create();
        let processed = 0;

        for (const pageIndex of pageIndexes) {
            const [page] = await newDoc.copyPages(doc, [pageIndex]);
            newDoc.addPage(page);
            processed++;
            this.updateProgress(
                processed,
                pageIndexes.length,
                `Copying page ${pageIndex + 1}...`
            );
        }

        return newDoc;
    }


    async savePDF(doc: PDFDocument, outputPath: string): Promise<void> {
        console.log(`[DEBUG] Starting savePDF for path: ${outputPath}`);

        // First validate and prepare the output path
        const safePath = await this.safetyUtils.validateAndCreatePath(outputPath);
        console.log(`[DEBUG] Validated safe path: ${safePath}`);

        const tempPath = `${safePath}.temp`;
        console.log(`[DEBUG] Using temp path: ${tempPath}`);

        this.updateProgress(0, 100, 'Saving PDF...');

        try {
            console.log(`[DEBUG] Generating PDF bytes`);
            const pdfBytes = await doc.save();
            console.log(`[DEBUG] PDF bytes generated, size: ${pdfBytes.byteLength}`);

            // Write to temporary file first
            console.log(`[DEBUG] Writing to temp file`);
            await this.vault.adapter.writeBinary(tempPath, pdfBytes.buffer);
            console.log(`[DEBUG] Temp file written successfully`);

            // If the file exists, we'll need to overwrite it
            if (await this.vault.adapter.exists(safePath)) {
                console.log(`[DEBUG] Removing existing file at: ${safePath}`);
                await this.vault.adapter.remove(safePath);
            }

            // Move temporary file to final destination
            console.log(`[DEBUG] Writing final file`);
            await this.vault.adapter.writeBinary(safePath, pdfBytes.buffer);
            console.log(`[DEBUG] Final file written successfully`);

            // Clean up temporary file
            try {
                console.log(`[DEBUG] Cleaning up temp file`);
                await this.vault.adapter.remove(tempPath);
                console.log(`[DEBUG] Temp file cleaned up`);
            } catch (error) {
                console.warn(`[DEBUG] Failed to clean up temporary file: ${error.message}`);
            }

            this.updateProgress(100, 100, 'PDF saved successfully');
            console.log(`[DEBUG] Save PDF completed successfully`);
        } catch (error) {
            console.error(`[DEBUG] Error in savePDF:`, error);
            console.error(`[DEBUG] Error stack:`, error.stack);

            // Try to clean up temporary file if there was an error
            try {
                console.log(`[DEBUG] Attempting to clean up temp file after error`);
                await this.vault.adapter.remove(tempPath);
            } catch (cleanupError) {
                console.warn(`[DEBUG] Failed to clean up temporary file after error: ${cleanupError.message}`);
            }
            throw new Error(`Failed to save PDF: ${error.message}`);
        }


        try {
            // After saving the file, verify it exists
            const finalExists = await this.vault.adapter.exists(safePath);
            if (!finalExists) {
                throw new Error('File was not saved successfully');
            }
        } catch (error) {
            throw new Error(`Failed to verify saved PDF: ${error.message}`);
        }
    }

    async ensureSafeOutput(outputPath: string): Promise<boolean> {
        const safePath = await this.safetyUtils.validateAndCreatePath(outputPath);
        if (await this.vault.adapter.exists(safePath)) {
            return await new Promise(resolve => {
                const notice = new Notice(
                    `File ${safePath} already exists. Overwrite?`
                );
                notice.noticeEl.createEl('button', {
                    text: 'Overwrite',
                    cls: 'mod-warning'
                }).onclick = () => {
                    notice.hide();
                    resolve(true);
                };
                notice.noticeEl.createEl('button', {
                    text: 'Cancel'
                }).onclick = () => {
                    notice.hide();
                    resolve(false);
                };
            });
        }
        return true;
    }
}