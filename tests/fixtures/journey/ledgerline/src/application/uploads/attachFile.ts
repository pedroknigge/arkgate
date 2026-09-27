import { attachmentName, assertNoRawFileInput } from '../../domain/uploads/attachmentRules';
import { err, ok, type Result } from '../../domain/shared/result';

export function attachFile(markup: string, originalName: string): Result<{ storedAs: string }> {
  if (!assertNoRawFileInput(markup)) return err('raw file input');
  return ok({ storedAs: attachmentName(originalName) });
}
