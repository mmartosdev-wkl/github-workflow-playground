// Define task categories and rules
const taskRules = {
  resolutionRules: {
    exact: {
      'recordScreenshots': ['recordScreenshotTests'],
      'runChecks': ['assembleInternalDebug', 'detekt', 'unitTests', 'allTests', 'verifyScreenshotTests']
    },
    conditional: {
      prefix: 'runChecks',
      mappings: [
        { keyword: 'compile', tasks: ['assembleInternalDebug'] },
        { keyword: 'detekt', tasks: ['detekt'] },
        { keyword: 'unitTests', tasks: ['unitTests', 'allTests'] },
        { keyword: 'screenshots', tasks: ['verifyScreenshotTests'] }
      ]
    }
  },  
  categories: {
    commit: {
      tasks: ['recordScreenshotTests'],
      description: 'Tasks that will potentially commit changes to the repo',
    },
    check: {
      tasks: ['assembleInternalDebug', 'detekt', 'unitTests', 'allTests', 'verifyScreenshotTests'],
      description: 'Tasks that check and produce reports',
    },
  },
  incompatibleGroups: [
    // unitTests and allTests are compatible with each other
    // but incompatible with verifyScreenshotTests
    [['unitTests', 'allTests'], 'verifyScreenshotTests']
  ],
}

/**
 * Resolves tasks based on comment body using configured resolution rules
 * @param {string} commentBody - The comment body to parse
 * @returns {string[]} Array of task names to execute
 */
function resolveTasks(commentBody) {
  if (!commentBody || typeof commentBody !== 'string') {
    return [];
  }

  // Check exact matches first
  if (taskRules.resolutionRules.exact[commentBody]) {
    return [...taskRules.resolutionRules.exact[commentBody]];
  }

  // Check conditional rules
  const conditional = taskRules.resolutionRules.conditional;
  if (commentBody.startsWith(conditional.prefix)) {
    const tasksToRun = [];

    conditional.mappings.forEach(mapping => {
      if (commentBody.includes(mapping.keyword)) {
        tasksToRun.push(...mapping.tasks);
      }
    });

    return tasksToRun;
  }

  return [];
}

/**
 * Checks if two tasks are incompatible based on the configured rules
 * @param {string} task1 - First task to check
 * @param {string} task2 - Second task to check
 * @returns {boolean} True if tasks are incompatible
 */
function areTasksIncompatible(task1, task2) {
  for (const incompatibleGroup of taskRules.incompatibleGroups) {
    const compatibleGroup = incompatibleGroup[0];
    const incompatibleTask = incompatibleGroup[1];

    const isTask1InCompatibleGroup = compatibleGroup.includes(task1);
    const isTask2InCompatibleGroup = compatibleGroup.includes(task2);
    const isTask1Incompatible = task1 === incompatibleTask;
    const isTask2Incompatible = task2 === incompatibleTask;

    // Tasks are incompatible if one is in the compatible group and the other is the incompatible task
    if ((isTask1InCompatibleGroup && isTask2Incompatible) || 
        (isTask2InCompatibleGroup && isTask1Incompatible)) {
      return true;
    }
  }
  return false;
}

/**
 * Finds incompatible task groups within a list of tasks
 * @param {string[]} tasks - Tasks to check for incompatibilities
 * @returns {string[][]} Array of task groups, split by incompatibilities
 */
function splitIncompatibleTasks(tasks) {
  if (tasks.length <= 1) {
    return [tasks];
  }

  // Check if there are any incompatible tasks
  const hasIncompatibilities = tasks.some(task1 => 
    tasks.some(task2 => task1 !== task2 && areTasksIncompatible(task1, task2))
  );

  if (!hasIncompatibilities) {
    return [tasks];
  }

  // Build compatibility groups based on taskRules.incompatibleGroups
  const groups = [];
  const processed = new Set();

  for (const incompatibleGroup of taskRules.incompatibleGroups) {
    const compatibleGroup = incompatibleGroup[0]; // e.g., ['unitTests', 'allTests']
    const incompatibleTask = incompatibleGroup[1]; // e.g., 'verifyScreenshotTests'

    // Find tasks from the compatible group present in our task list
    const foundCompatibleTasks = tasks.filter(task => 
      compatibleGroup.includes(task) && !processed.has(task)
    );

    // Find incompatible tasks present in our task list
    const foundIncompatibleTasks = tasks.filter(task => 
      task === incompatibleTask && !processed.has(task)
    );

    // Find other tasks that are compatible with both groups
    const otherTasks = tasks.filter(task => 
      !compatibleGroup.includes(task) && 
      task !== incompatibleTask && 
      !processed.has(task)
    );

    // Only create groups if we have both compatible and incompatible tasks
    if (foundCompatibleTasks.length > 0 && foundIncompatibleTasks.length > 0) {
      // Create group with compatible tasks + other compatible tasks
      if (foundCompatibleTasks.length > 0) {
        const compatibleTasksWithOthers = [...otherTasks, ...foundCompatibleTasks];
        groups.push(compatibleTasksWithOthers);
        foundCompatibleTasks.forEach(task => processed.add(task));
      }

      // Create group with incompatible tasks (only the incompatible tasks, no others)
      if (foundIncompatibleTasks.length > 0) {
        groups.push([...foundIncompatibleTasks]);
        foundIncompatibleTasks.forEach(task => processed.add(task));
      }

      // Mark other tasks as processed since they went to the compatible group
      otherTasks.forEach(task => processed.add(task));
    }
  }

  // Handle any remaining unprocessed tasks
  const remainingTasks = tasks.filter(task => !processed.has(task));
  if (remainingTasks.length > 0) {
    if (groups.length === 0) {
      // No incompatibilities were resolved, return all tasks together
      groups.push(remainingTasks);
    } else {
      // Try to add remaining tasks to compatible groups
      for (const task of remainingTasks) {
        let added = false;
        for (const group of groups) {
          // Check if this task is compatible with all tasks in the group
          const isCompatible = group.every(groupTask => !areTasksIncompatible(task, groupTask));
          if (isCompatible) {
            group.push(task);
            added = true;
            break;
          }
        }
        // If couldn't add to any existing group, create a new group
        if (!added) {
          groups.push([task]);
        }
      }
    }
  }

  return groups.length > 0 ? groups : [tasks];
}

/**
 * Categorizes tasks into check and commit groups, handling incompatible task combinations
 * @param {string[]} tasks - Array of task names to categorize
 * @returns {{checkTasks: string[][], commitTasks: string[][]}} Categorized tasks grouped by compatibility
 * @throws {Error} If tasks is not an array
 */
function categorizeTasks(tasks) {
  if (!Array.isArray(tasks)) {
    throw new Error('Tasks must be an array');
  }

  const result = {
    checkTasks: [],
    commitTasks: [],
  };

  // Separate tasks by category
  const checkTasks = tasks.filter(task =>
    taskRules.categories.check.tasks.includes(task)
  );
  const commitTasks = tasks.filter(task =>
    taskRules.categories.commit.tasks.includes(task)
  );

  // Handle incompatible groups in check tasks
  if (checkTasks.length > 0) {
    const checkGroups = splitIncompatibleTasks(checkTasks);
    result.checkTasks.push(...checkGroups);
  }

  // Commit tasks go in their own group
  if (commitTasks.length > 0) {
    result.commitTasks.push(commitTasks);
  }

  return result;
}

module.exports = {
  resolveTasks,
  categorizeTasks,
};
