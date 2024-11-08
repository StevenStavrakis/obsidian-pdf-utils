export interface PDFResectorSettings {
    defaultOutputFolder: string;
}

export interface ProcessingProgress {
    current: number;
    total: number;
    status: string;
}