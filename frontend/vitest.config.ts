import { defineConfig } from 'vitest/config';

// Unit tests only (pure functions). Node environment — no jsdom needed. Component
// / DOM testing, if ever added, would need environment: 'jsdom' + that dep.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
});
