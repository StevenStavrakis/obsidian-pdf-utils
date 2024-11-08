import { App } from "obsidian";

export interface SafetyCheckResult {
    success: boolean;
    message?: string;
}

export class SafetyUtils {
    private app: App;
    private MAX_PDF_SIZE = 100 * 1024 * 1024; // 100MB limit

    constructor(app: App) {
        this.app = app;
    }

    isPathInVault(path: string): boolean {
        // Check for path traversal attempts
        if (path.includes('../') || path.includes('..\\')) {
            return false;
        }

        // Remove any leading or trailing slashes
        const normalizedPath = path.replace(/^\/+|\/+$/g, '');

        // Split path into components
        const pathComponents = normalizedPath.split('/');

        // Check each component for suspicious patterns
        return pathComponents.every(component => {
            // Disallow empty components, dots, or obviously dangerous patterns
            return component !== '' &&
                component !== '.' &&
                component !== '..' &&
                !component.includes('\\') &&
                !component.includes(':');
        });
    }

    sanitizePath(filename: string): string {
        // Split the filename into base name and extension
        const lastDotIndex = filename.lastIndexOf('.');
        if (lastDotIndex === -1) {
            // No extension - sanitize the whole string
            return this.sanitizeString(filename);
        }

        // Separate base name and extension
        const baseName = filename.slice(0, lastDotIndex);
        const extension = filename.slice(lastDotIndex); // includes the dot

        // Sanitize only the base name and preserve the extension
        const sanitizedBase = this.sanitizeString(baseName);

        // Return with preserved extension
        return `${sanitizedBase}${extension}`;
    }

    private sanitizeString(str: string): string {
        return str
            .replace(/[<>:"|?*\\]/g, '-')  // Replace invalid chars with dash
            .replace(/\s+/g, ' ')          // Normalize spaces
            .replace(/-+/g, '-')           // Replace multiple dashes with single dash
            .trim();                       // Remove leading/trailing whitespace
    }

    async validateAndCreatePath(outputPath: string): Promise<string> {
        // Validate the path
        if (!this.isPathInVault(outputPath)) {
            throw new Error('Invalid path: attempting to access location outside vault');
        }

        // Split path into directory and filename
        const pathParts = outputPath.split('/');
        const filename = pathParts.pop() || 'output';
        const directory = pathParts.join('/');

        // Sanitize the filename while preserving extension
        const sanitizedFilename = this.sanitizePath(filename);
        console.log(`[DEBUG] Original filename: ${filename}`);
        console.log(`[DEBUG] Sanitized filename: ${sanitizedFilename}`);

        // If there's a directory path, ensure it exists
        if (directory) {
            try {
                if (!(await this.app.vault.adapter.exists(directory))) {
                    await this.app.vault.adapter.mkdir(directory);
                }
            } catch (error) {
                throw new Error(`Failed to create directory: ${error.message}`);
            }
        }

        // Return the complete safe path
        return directory ? `${directory}/${sanitizedFilename}` : sanitizedFilename;
    }

    async ensureDirectoryExists(directory: string): Promise<void> {
        if (!directory) return;

        const parts = directory.split('/').filter(part => part.length > 0);
        let currentPath = '';

        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            if (!(await this.app.vault.adapter.exists(currentPath))) {
                await this.app.vault.adapter.mkdir(currentPath);
            }
        }
    }

    async ensureSafeOutput(path: string, fileSize?: number): Promise<SafetyCheckResult> {
        try {
            if (!this.isPathInVault(path)) {
                return {
                    success: false,
                    message: 'Invalid path: attempting to access location outside vault'
                };
            }

            if (fileSize && fileSize > this.MAX_PDF_SIZE) {
                return {
                    success: false,
                    message: 'File size exceeds maximum allowed size'
                };
            }

            const sanitizedPath = this.sanitizePath(path);
            await this.ensureDirectoryExists(sanitizedPath.split('/').slice(0, -1).join('/'));

            return {
                success: true
            };
        } catch (error) {
            return {
                success: false,
                message: `Safety check failed: ${error.message}`
            };
        }
    }
}