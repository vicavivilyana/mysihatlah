/**
 * OCR provider interface. The pilot uses tesseract.js in the browser. On
 * native, or for higher accuracy, swap in a cloud OCR adapter (Google Vision /
 * AWS Textract) that implements this same interface — no UI change.
 */
export interface OcrResult {
  text: string;
  confidence: number;
}

export interface OcrProgress {
  status: string;
  progress: number; // 0..1
}

export interface OcrProvider {
  recognize(image: Blob | File | string, onProgress?: (p: OcrProgress) => void): Promise<OcrResult>;
  terminate?(): Promise<void>;
}
