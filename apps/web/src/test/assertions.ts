import 'vitest';

/**
 * Type declarations for the custom DOM matchers registered in `src/test/setup.ts`.
 *
 * They are declared on the global `Chai.Assertion` interface, which is what Vitest's
 * `expect()` returns, so `expect(element).toBeInTheDocument()` type-checks.
 */
declare global {
  // Augmenting the Chai namespace is the documented way to type custom matchers.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Chai {
    interface Assertion {
      toBeInTheDocument(): void;
      toHaveTextContent(expected: string | RegExp): void;
      toHaveAttribute(name: string, value?: string): void;
      toBeVisible(): void;
      toBeDisabled(): void;
      toBeEnabled(): void;
    }
  }
}

export {};
