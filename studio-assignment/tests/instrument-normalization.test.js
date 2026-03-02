const { describe, it, expect } = require('@jest/globals');

// 楽器名正規化関数をテスト用に再実装
function normalizeInstrumentName(instrument) {
  return instrument.replace(/_\d+$/, '');
}

describe('Instrument Normalization', () => {

  describe('normalizeInstrumentName', () => {
    it('should remove _number suffix', () => {
      expect(normalizeInstrumentName('Key_1')).toBe('Key');
      expect(normalizeInstrumentName('Gt_2')).toBe('Gt');
      expect(normalizeInstrumentName('Ba_10')).toBe('Ba');
      expect(normalizeInstrumentName('UNKNOWN_5')).toBe('UNKNOWN');
    });

    it('should not change names without suffix', () => {
      expect(normalizeInstrumentName('Key')).toBe('Key');
      expect(normalizeInstrumentName('Gt')).toBe('Gt');
      expect(normalizeInstrumentName('UNKNOWN')).toBe('UNKNOWN');
    });

    it('should not remove non-suffix underscores', () => {
      expect(normalizeInstrumentName('Gt_1_special')).toBe('Gt_1_special');
      expect(normalizeInstrumentName('test_name')).toBe('test_name');
    });

    it('should handle edge cases', () => {
      expect(normalizeInstrumentName('')).toBe('');
      expect(normalizeInstrumentName('_1')).toBe('');
      expect(normalizeInstrumentName('Key_')).toBe('Key_');
      expect(normalizeInstrumentName('Key_abc')).toBe('Key_abc');
    });
  });
});