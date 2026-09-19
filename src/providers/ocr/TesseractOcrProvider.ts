import Tesseract from 'tesseract.js';
import type { OcrProvider, OcrProgress, OcrResult } from './OcrProvider';

/**
 * In-browser OCR using tesseract.js. English + Malay share the Latin script,
 * so the 'eng' model reads Malay appointment cards well; we post-process Malay
 * month names in the parser. Language data is fetched from the CDN on first use.
 */
export class TesseractOcrProvider implements OcrProvider {
  async recognize(
    image: Blob | File | string,
    onProgress?: (p: OcrProgress) => void,
  ): Promise<OcrResult> {
    const result = await Tesseract.recognize(image, 'eng', {
      logger: (m: { status: string; progress: number }) => {
        onProgress?.({ status: m.status, progress: m.progress ?? 0 });
      },
    });
    return {
      text: result.data.text ?? '',
      confidence: result.data.confidence ?? 0,
    };
  }
}
