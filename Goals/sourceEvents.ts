export const recordSpaceItemForGoals = async (
  _userId: string,
  _input: {
    spaceId?: string;
    sourceType: "task" | "note";
    sourceId: string;
    title: string;
    status?: string;
  },
) => {
  // Goal plans are built from the goal and its deadline, not from Space notes or tasks.
};

export const recordTaskStatusForGoals = async (_userId: string, _taskId: string, _done: boolean) => {};

export const recordNoteForGoals = async (
  _userId: string,
  _noteId: string,
  _title?: string,
  _spaceId?: string,
) => {};
