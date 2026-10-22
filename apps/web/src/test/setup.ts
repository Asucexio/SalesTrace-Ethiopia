import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { expect } from 'vitest';

import { matchers } from './matchers';

expect.extend(matchers);

afterEach(() => {
  cleanup();
});
