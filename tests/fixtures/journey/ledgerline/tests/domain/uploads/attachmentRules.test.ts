import { assertNoRawFileInput } from '../../../src/domain/uploads/attachmentRules';

describe('uploads', () => {
  it("INV-UPLOAD-NO-RAW-INPUT — no agrega un <input type='file'> crudo", () => {
    if (assertNoRawFileInput("<input type='file'>") !== false) {
      throw new Error('raw file input must be refused');
    }
    if (assertNoRawFileInput('<input type="text">') !== true) {
      throw new Error('text input is not a file picker');
    }
  });
});
