import { beforeEach } from 'vitest';
import { reloadSectionFolds } from '../src/lib/section-fold';

//the inspector remembers which sections are folded in localStorage, so each test starts from the sections' own defaults
beforeEach(() => {
  try {
    localStorage.removeItem('ix-section-folds');
  } catch {
    /* no localStorage in a node test */
  }
  reloadSectionFolds();
});
