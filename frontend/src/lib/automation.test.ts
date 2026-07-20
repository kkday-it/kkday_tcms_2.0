import { describe, it, expect } from 'vitest';
import { pct, countAutomated, AUTOMATED } from './automation';

describe('pct', () => {
    it('rounds n/total to a whole percentage', () => {
        expect(pct(28, 33)).toBe(85);   // run 395 in SIT
        expect(pct(9, 9)).toBe(100);
        expect(pct(1, 4)).toBe(25);
    });

    it('returns 0 when total is 0 (empty run)', () => {
        expect(pct(0, 0)).toBe(0);
    });
});

describe('countAutomated', () => {
    it('counts only results whose case is Automated', () => {
        const results = [
            { test_case: { automation_status: AUTOMATED } },
            { test_case: { automation_status: 'Manual' } },
            { test_case: { automation_status: 'Automated' } },
            { test_case: {} },       // no automation_status
            {},                      // no test_case
        ];
        expect(countAutomated(results)).toBe(2);
    });

    it('is 0 for an empty list', () => {
        expect(countAutomated([])).toBe(0);
    });

    it('detail-page % matches: 2 automated of 5 → 40%', () => {
        const results = [
            { test_case: { automation_status: AUTOMATED } },
            { test_case: { automation_status: AUTOMATED } },
            { test_case: { automation_status: 'Manual' } },
            { test_case: { automation_status: 'Manual' } },
            { test_case: { automation_status: 'Manual' } },
        ];
        expect(pct(countAutomated(results), results.length)).toBe(40);
    });
});
