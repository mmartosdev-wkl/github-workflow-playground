const { resolveTasks, categorizeTasks } = require('./taskCategorization');

describe('Task Categorization', () => {
  describe('resolveTasks', () => {
    describe('exact matches', () => {
      test('should resolve recordScreenshots to recordScreenshotTests', () => {
        expect(resolveTasks('recordScreenshots')).toEqual(['recordScreenshotTests']);
      });

      test('should resolve runChecks to all check tasks', () => {
        const result = resolveTasks('runChecks');
        expect(result).toEqual([
          'assembleInternalDebug',
          'detekt',
          'unitTests',
          'allTests',
          'verifyScreenshotTests'
        ]);
      });

      test('should return new array instance for exact matches', () => {
        const result1 = resolveTasks('recordScreenshots');
        const result2 = resolveTasks('recordScreenshots');
        expect(result1).not.toBe(result2);
        expect(result1).toEqual(result2);
      });
    });

    describe('conditional matches', () => {
      test('should resolve runChecks with compile keyword', () => {
        expect(resolveTasks('runChecks compile')).toEqual(['assembleInternalDebug']);
      });

      test('should resolve runChecks with detekt keyword', () => {
        expect(resolveTasks('runChecks detekt')).toEqual(['detekt']);
      });

      test('should resolve runChecks with unitTests keyword', () => {
        expect(resolveTasks('runChecks unitTests')).toEqual(['unitTests', 'allTests']);
      });

      test('should resolve runChecks with screenshots keyword', () => {
        expect(resolveTasks('runChecks screenshots')).toEqual(['verifyScreenshotTests']);
      });

      test('should resolve multiple keywords in single comment', () => {
        const result = resolveTasks('runChecks compile detekt');
        expect(result).toEqual(['assembleInternalDebug', 'detekt']);
      });

      test('should resolve all keywords when present', () => {
        const result = resolveTasks('runChecks compile detekt unitTests screenshots');
        expect(result).toEqual([
          'assembleInternalDebug',
          'detekt',
          'unitTests',
          'allTests',
          'verifyScreenshotTests'
        ]);
      });

      test('should handle runChecks prefix without keywords', () => {
        expect(resolveTasks('runChecks')).toEqual([
          'assembleInternalDebug',
          'detekt',
          'unitTests',
          'allTests',
          'verifyScreenshotTests'
        ]);
      });

      test('should handle runChecks with unknown keywords', () => {
        expect(resolveTasks('runChecks unknown')).toEqual([]);
      });
    });

    describe('edge cases', () => {
      test('should return empty array for null input', () => {
        expect(resolveTasks(null)).toEqual([]);
      });

      test('should return empty array for undefined input', () => {
        expect(resolveTasks(undefined)).toEqual([]);
      });

      test('should return empty array for empty string', () => {
        expect(resolveTasks('')).toEqual([]);
      });

      test('should return empty array for non-string input', () => {
        expect(resolveTasks(123)).toEqual([]);
        expect(resolveTasks({})).toEqual([]);
        expect(resolveTasks([])).toEqual([]);
      });

      test('should return empty array for unrecognized command', () => {
        expect(resolveTasks('invalidCommand')).toEqual([]);
      });

      test('should handle case sensitivity', () => {
        expect(resolveTasks('RECORDSCREENSHOTS')).toEqual([]);
        expect(resolveTasks('RunChecks')).toEqual([]);
      });
    });
  });

  describe('categorizeTasks', () => {
    describe('basic categorization', () => {
      test('should categorize check tasks correctly', () => {
        const tasks = ['assembleInternalDebug', 'detekt'];
        const result = categorizeTasks(tasks);

        expect(result.checkTasks).toEqual([['assembleInternalDebug', 'detekt']]);
        expect(result.commitTasks).toEqual([]);
      });

      test('should categorize commit tasks correctly', () => {
        const tasks = ['recordScreenshotTests'];
        const result = categorizeTasks(tasks);

        expect(result.checkTasks).toEqual([]);
        expect(result.commitTasks).toEqual([['recordScreenshotTests']]);
      });

      test('should categorize mixed task types', () => {
        const tasks = ['assembleInternalDebug', 'recordScreenshotTests', 'detekt'];
        const result = categorizeTasks(tasks);

        expect(result.checkTasks).toEqual([['assembleInternalDebug', 'detekt']]);
        expect(result.commitTasks).toEqual([['recordScreenshotTests']]);
      });

      test('should handle empty task array', () => {
        const result = categorizeTasks([]);

        expect(result.checkTasks).toEqual([]);
        expect(result.commitTasks).toEqual([]);
      });

      test('should ignore unrecognized tasks', () => {
        const tasks = ['unknownTask', 'assembleInternalDebug'];
        const result = categorizeTasks(tasks);

        expect(result.checkTasks).toEqual([['assembleInternalDebug']]);
        expect(result.commitTasks).toEqual([]);
      });
    });

    describe('new incompatible task handling', () => {
      test('should keep unitTests and allTests together (compatible)', () => {
        const tasks = ['unitTests', 'allTests'];
        const result = categorizeTasks(tasks);

        expect(result.checkTasks).toHaveLength(1);
        expect(result.checkTasks).toEqual([['unitTests', 'allTests']]);
      });

      test('should separate unitTests from verifyScreenshotTests (incompatible)', () => {
        const tasks = ['unitTests', 'verifyScreenshotTests'];
        const result = categorizeTasks(tasks);

        expect(result.checkTasks).toHaveLength(2);
        expect(result.checkTasks).toEqual([
          ['unitTests'],
          ['verifyScreenshotTests']
        ]);
      });

      test('should separate allTests from verifyScreenshotTests (incompatible)', () => {
        const tasks = ['allTests', 'verifyScreenshotTests'];
        const result = categorizeTasks(tasks);

        expect(result.checkTasks).toHaveLength(2);
        expect(result.checkTasks).toEqual([
          ['allTests'],
          ['verifyScreenshotTests']
        ]);
      });

      test('should group unitTests and allTests together, separate from verifyScreenshotTests', () => {
        const tasks = ['unitTests', 'allTests', 'verifyScreenshotTests'];
        const result = categorizeTasks(tasks);

        expect(result.checkTasks).toHaveLength(2);
        expect(result.checkTasks).toEqual([
          ['unitTests', 'allTests'],
          ['verifyScreenshotTests']
        ]);
      });

      test('should maintain compatible tasks together when splitting incompatible ones', () => {
        const tasks = ['assembleInternalDebug', 'unitTests', 'allTests', 'verifyScreenshotTests', 'detekt'];
        const result = categorizeTasks(tasks);

        expect(result.checkTasks).toHaveLength(2);
        expect(result.checkTasks).toEqual([
          ['assembleInternalDebug', 'detekt', 'unitTests', 'allTests'],
          ['verifyScreenshotTests']
        ]);
      });

      test('should handle single task normally', () => {
        const tasks = ['unitTests'];
        const result = categorizeTasks(tasks);

        expect(result.checkTasks).toEqual([['unitTests']]);
      });

      test('should handle compatible tasks with other compatible tasks', () => {
        const tasks = ['unitTests', 'allTests', 'assembleInternalDebug', 'detekt'];
        const result = categorizeTasks(tasks);

        expect(result.checkTasks).toEqual([['unitTests', 'allTests', 'assembleInternalDebug', 'detekt']]);
      });
    });

    describe('error handling', () => {
      test('should throw error for non-array input', () => {
        expect(() => categorizeTasks('not an array')).toThrow('Tasks must be an array');
        expect(() => categorizeTasks(null)).toThrow('Tasks must be an array');
        expect(() => categorizeTasks(undefined)).toThrow('Tasks must be an array');
        expect(() => categorizeTasks({})).toThrow('Tasks must be an array');
        expect(() => categorizeTasks(123)).toThrow('Tasks must be an array');
      });
    });

    describe('complex scenarios', () => {
      test('should handle complex scenario with mixed tasks and new incompatibilities', () => {
        const tasks = [
          'assembleInternalDebug',
          'recordScreenshotTests',
          'unitTests',
          'allTests',
          'verifyScreenshotTests',
          'detekt'
        ];
        const result = categorizeTasks(tasks);

        expect(result.checkTasks).toHaveLength(2);
        expect(result.checkTasks).toEqual([
          ['assembleInternalDebug', 'detekt', 'unitTests', 'allTests'],
          ['verifyScreenshotTests']
        ]);
        expect(result.commitTasks).toEqual([['recordScreenshotTests']]);
      });

      test('should handle duplicate tasks', () => {
        const tasks = ['unitTests', 'unitTests', 'assembleInternalDebug'];
        const result = categorizeTasks(tasks);

        expect(result.checkTasks).toEqual([['unitTests', 'unitTests', 'assembleInternalDebug']]);
      });

      test('should handle multiple incompatible scenarios', () => {
        const tasks = ['unitTests', 'verifyScreenshotTests', 'allTests'];
        const result = categorizeTasks(tasks);

        expect(result.checkTasks).toHaveLength(2);
        expect(result.checkTasks).toEqual([
          ['unitTests', 'allTests'],
          ['verifyScreenshotTests']
        ]);
      });
    });
  });

  describe('integration tests', () => {
    test('should resolve and categorize recordScreenshots command', () => {
      const tasks = resolveTasks('recordScreenshots');
      const result = categorizeTasks(tasks);

      expect(result.checkTasks).toEqual([]);
      expect(result.commitTasks).toEqual([['recordScreenshotTests']]);
    });

    test('should resolve and categorize runChecks command with new incompatibility rules', () => {
      const tasks = resolveTasks('runChecks');
      const result = categorizeTasks(tasks);

      expect(result.checkTasks).toHaveLength(2);
      expect(result.commitTasks).toEqual([]);

      const hasUnitTestsAndAllTestsTogether = result.checkTasks.some(group =>
        group.includes('unitTests') && group.includes('allTests')
      );
      expect(hasUnitTestsAndAllTestsTogether).toBe(true);

      const hasVerifyScreenshotTestsSeparate = result.checkTasks.some(group =>
        group.includes('verifyScreenshotTests') && 
        !group.includes('unitTests') && 
        !group.includes('allTests')
      );
      expect(hasVerifyScreenshotTestsSeparate).toBe(true);
    });

    test('should resolve and categorize conditional runChecks command with unitTests', () => {
      const tasks = resolveTasks('runChecks compile unitTests');
      const result = categorizeTasks(tasks);

      expect(result.checkTasks).toEqual([['assembleInternalDebug', 'unitTests', 'allTests']]);
      expect(result.commitTasks).toEqual([]);
    });

    test('should resolve and categorize conditional runChecks command with screenshots', () => {
      const tasks = resolveTasks('runChecks compile screenshots');
      const result = categorizeTasks(tasks);

      expect(result.checkTasks).toEqual([['assembleInternalDebug', 'verifyScreenshotTests']]);
      expect(result.commitTasks).toEqual([]);
    });

    test('should handle mixed conditional commands with incompatible tasks', () => {
      const tasks = resolveTasks('runChecks unitTests screenshots');
      const result = categorizeTasks(tasks);

      expect(result.checkTasks).toHaveLength(2);
      expect(result.checkTasks).toEqual([
        ['unitTests', 'allTests'],
        ['verifyScreenshotTests']
      ]);
      expect(result.commitTasks).toEqual([]);
    });
  });

  describe('edge cases for new incompatibility logic', () => {
    test('should handle empty task list', () => {
      const result = categorizeTasks([]);
      expect(result.checkTasks).toEqual([]);
      expect(result.commitTasks).toEqual([]);
    });

    test('should handle single task', () => {
      const result = categorizeTasks(['unitTests']);
      expect(result.checkTasks).toEqual([['unitTests']]);
    });

    test('should handle tasks not in any incompatibility rules', () => {
      const tasks = ['assembleInternalDebug', 'detekt'];
      const result = categorizeTasks(tasks);
      expect(result.checkTasks).toEqual([['assembleInternalDebug', 'detekt']]);
    });

    test('should handle order independence', () => {
      const tasks1 = ['unitTests', 'verifyScreenshotTests', 'allTests'];
      const tasks2 = ['verifyScreenshotTests', 'allTests', 'unitTests'];

      const result1 = categorizeTasks(tasks1);
      const result2 = categorizeTasks(tasks2);

      expect(result1.checkTasks).toHaveLength(2);
      expect(result2.checkTasks).toHaveLength(2);

      expect(result1.checkTasks.some(group => 
        group.includes('unitTests') && group.includes('allTests')
      )).toBe(true);
      expect(result2.checkTasks.some(group => 
        group.includes('unitTests') && group.includes('allTests')
      )).toBe(true);
    });
  });
});
