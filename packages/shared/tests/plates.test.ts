import { describe, expect, it } from 'vitest';
import { PLATE_INVALID_MESSAGE, PLATE_REGEX, PlateBodySchema, VehicleUpsertSchema, normalizePlate, plateOrigin } from '../src/validation.js';

describe('normalizePlate', () => {
  it('saca espacios, puntos y guiones y pasa a mayúsculas', () => {
    expect(normalizePlate('ag 945-rs')).toBe('AG945RS');
    expect(normalizePlate(' a.b.c 123 ')).toBe('ABC123');
  });
});

describe('PLATE_REGEX (4 a 10 alfanuméricos)', () => {
  it.each(['1234', 'AG945RS', 'BBCL42', 'ABC1D23', 'ABCDEFGHIJ'])('acepta %s', (p) => {
    expect(PLATE_REGEX.test(p)).toBe(true);
  });
  it.each(['ABC', 'ABCDEFGHIJK', 'AG945RÑ', ''])('rechaza %s', (p) => {
    expect(PLATE_REGEX.test(p)).toBe(false);
  });
});

describe('plateOrigin (solo informativo)', () => {
  it.each(['AG945RS', 'ABC123', 'A123BCD', '123ABC', 'ag 945-rs'])('%s es argentina', (p) => {
    expect(plateOrigin(p)).toBe('ar');
  });
  it.each(['BBCL42', 'ABC1D23', '1234', 'ABCDEFGHIJ', 'AG945R'])('%s no tiene formato argentino', (p) => {
    expect(plateOrigin(p)).toBe('foreign');
  });
});

describe('schemas de patente', () => {
  it('el cliente puede mandar la patente con separadores', () => {
    expect(PlateBodySchema.parse({ plate: 'AG 945-RS' }).plate).toBe('AG945RS');
  });
  it('un error de patente usa el mensaje único', () => {
    const r = PlateBodySchema.safeParse({ plate: 'abc' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(PLATE_INVALID_MESSAGE);
  });
  it('el panel puede dar de alta patentes de 4 y de 10, no de 11', () => {
    expect(VehicleUpsertSchema.safeParse({ plate: '1234', category: 'socio' }).success).toBe(true);
    expect(VehicleUpsertSchema.safeParse({ plate: 'ABCDEFGHIJ', category: 'remis' }).success).toBe(true);
    expect(VehicleUpsertSchema.safeParse({ plate: 'ABCDEFGHIJK', category: 'remis' }).success).toBe(false);
  });
});
