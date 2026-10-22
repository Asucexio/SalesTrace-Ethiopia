/**
 * Minimal DOM matchers.
 *
 * `@testing-library/jest-dom` is not available in this workspace, so the handful of matchers
 * the test-suite needs are implemented here. The API mirrors jest-dom so the tests can be
 * switched over without changes if the dependency is added later.
 */

interface MatcherResult {
  pass: boolean;
  message: () => string;
}

/**
 * A matcher receives the value under test plus the expected arguments.
 *
 * `unknown` is not enough here: a matcher has to inspect the received value, and the Chai
 * matcher signature is `any`-based by design. The `any` is confined to this one type alias.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Matcher = (received: any, ...args: any[]) => MatcherResult;

function isElement(value: unknown): value is Element {
  return typeof value === 'object' && value !== null && 'nodeType' in value;
}

function inDocument(received: unknown): boolean {
  if (!isElement(received)) return false;
  return received.ownerDocument?.documentElement?.contains(received) ?? false;
}

export const matchers: Record<string, Matcher> = {
  toBeInTheDocument(received) {
    const pass = inDocument(received);
    return {
      pass,
      message: () =>
        pass
          ? 'Expected the element not to be in the document.'
          : 'Expected the element to be in the document, but it was not.',
    };
  },

  toHaveTextContent(received, expected) {
    const text = isElement(received) ? (received.textContent ?? '') : String(received ?? '');
    const pass = typeof expected === 'string' ? text.includes(expected) : expected.test(text);
    return {
      pass,
      message: () =>
        pass
          ? `Expected the element not to have text content matching ${String(expected)}.`
          : `Expected the element to have text content matching ${String(
              expected,
            )}, but it was "${text}".`,
    };
  },

  toHaveAttribute(received, name, value) {
    if (!isElement(received)) {
      return { pass: false, message: () => 'Expected an element that has attributes.' };
    }
    const actual = received.getAttribute(name);
    const pass = value === undefined ? actual !== null : actual === value;
    return {
      pass,
      message: () =>
        pass
          ? `Expected the element not to have the attribute "${name}".`
          : `Expected the element to have the attribute "${name}"${
              value === undefined ? '' : ` with the value "${value}"`
            }, but it was ${actual === null ? 'missing' : `"${actual}"`}.`,
    };
  },

  toBeVisible(received) {
    const pass = isElement(received) && inDocument(received);
    return {
      pass,
      message: () =>
        pass
          ? 'Expected the element not to be visible.'
          : 'Expected the element to be visible in the document.',
    };
  },

  toBeDisabled(received) {
    const pass =
      isElement(received) &&
      (received.hasAttribute('disabled') || received.getAttribute('aria-disabled') === 'true');
    return {
      pass,
      message: () =>
        pass ? 'Expected the element not to be disabled.' : 'Expected the element to be disabled.',
    };
  },

  toBeEnabled(received) {
    const pass = !(isElement(received) && received.hasAttribute('disabled'));
    return {
      pass,
      message: () =>
        pass ? 'Expected the element not to be enabled.' : 'Expected the element to be enabled.',
    };
  },
};
