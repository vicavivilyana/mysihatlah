import type { OcrProvider } from './OcrProvider';
import { TesseractOcrProvider } from './TesseractOcrProvider';

export type { OcrProvider, OcrResult, OcrProgress } from './OcrProvider';
export { parseAppointment } from './parseAppointment';
export type { ParsedAppointment } from './parseAppointment';

let instance: OcrProvider | null = null;

/** Factory — the only place that picks a concrete OCR implementation. */
export function getOcrProvider(): OcrProvider {
  if (!instance) {
    instance = new TesseractOcrProvider();
  }
  return instance;
}
