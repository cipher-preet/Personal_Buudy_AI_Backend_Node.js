import {
  createSpaceRepository,
  createStagedNoteRepository,
  createStagedTaskRepository,
  deleteSpaceRepository,
  deleteStagedNoteRepository,
  deleteStagedTaskRepository,
  getNoteDateMarkersBySpaceRepository,
  getNoteWorkspacesRepository,
  getProfileSummaryRepository,
  getSpaceStatsRepository,
  getStagedNoteByIdRepository,
  getStagedNotesBySpaceRepository,
  getStagedTasksBySpaceRepository,
  getTaskDateMarkersBySpaceRepository,
  getUserActiveSpaceRepository,
  getUserSpacesByUserIdRepository,
  startListningRepository,
  updateSpaceRepository,
  updateStagedNoteRepository,
  updateStagedTaskRepository,
  setStagedTaskStatusRepository,
} from "../Repository/Home.repository.js";

export const createSpaceService = async (spacename: string, userId: string) => {
  try {
    const response = await createSpaceRepository(spacename, userId);
    return response;
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};

//---------------------------------------------------------------------------------------------------

export const deleteSpaceServices = async (
  userId: string,
  spaceId: string,
) => {
  try {
    const response = await deleteSpaceRepository(userId, spaceId);
    return response;
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};

//---------------------------------------------------------------------------------------------------

export const updateSpaceServices = async (
  userId: string,
  spaceId: string,
  updates: { spacename?: string; description?: string },
) => {
  try {
    const response = await updateSpaceRepository(userId, spaceId, updates);
    return response;
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};

//---------------------------------------------------------------------------------------------------

export const getUserSpacesByUserIdServices = async (
  userId: string,
  limit?: number,
  cursor?: string,
) => {
  try {
    const response = await getUserSpacesByUserIdRepository(
      userId,
      limit,
      cursor,
    );
    return response;
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};

//-----------------------------------------------------------------------------------------------

export const getUserActiveSpaceServices = async (userId: string) => {
  try {
    const response = await getUserActiveSpaceRepository(userId);
    return response;
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};

//----------------------------------------------------------------------------------------------

export const startListningServices = async (
  spaceId: string,
  isListning: unknown,
) => {
  try {
    const response = await startListningRepository(spaceId, isListning);
    return response;
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};

//----------------------------------------------------------------------------------------------

export const getSpaceStatsServices = async (
  userId: string,
  spaceId: string,
) => {
  try {
    const response = await getSpaceStatsRepository(userId, spaceId);
    return response;
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};

//----------------------------------------------------------------------------------------------

export const getProfileSummaryServices = async (userId: string) => {
  try {
    const response = await getProfileSummaryRepository(userId);
    return response;
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};

//----------------------------------------------------------------------------------------------

export const getNoteWorkspacesServices = async (userId: string) => {
  try {
    const response = await getNoteWorkspacesRepository(userId);
    return response;
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};

//----------------------------------------------------------------------------------------------

export const getStagedNotesBySpaceServices = async (
  userId: string,
  spaceId: string,
  limit?: number,
  cursor?: string,
  dateKey?: string,
) => {
  try {
    const response = await getStagedNotesBySpaceRepository(
      userId,
      spaceId,
      limit,
      cursor,
      dateKey,
    );
    return response;
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};

//----------------------------------------------------------------------------------------------

export const getStagedNoteByIdServices = async (noteId: string) => {
  try {
    const response = await getStagedNoteByIdRepository(noteId);
    return response;
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};

//----------------------------------------------------------------------------------------------

export const deleteStagedNoteServices = async (
  userId: string,
  noteId: string,
) => {
  try {
    const response = await deleteStagedNoteRepository(userId, noteId);
    return response;
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};

//----------------------------------------------------------------------------------------------

export const updateStagedNoteServices = async (
  userId: string,
  noteId: string,
  updates: { title?: string; body?: string; dateKey?: string },
) => {
  try {
    const response = await updateStagedNoteRepository(userId, noteId, updates);
    return response;
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};

//----------------------------------------------------------------------------------------------

export const getStagedTasksBySpaceServices = async (
  userId: string,
  spaceId: string,
  limit?: number,
  cursor?: string,
  dateKey?: string,
) => {
  try {
    const response = await getStagedTasksBySpaceRepository(
      userId,
      spaceId,
      limit,
      cursor,
      dateKey,
    );
    return response;
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};

//----------------------------------------------------------------------------------------------

export const deleteStagedTaskServices = async (
  userId: string,
  taskId: string,
) => {
  try {
    const response = await deleteStagedTaskRepository(userId, taskId);
    return response;
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};

//----------------------------------------------------------------------------------------------

export const updateStagedTaskServices = async (
  userId: string,
  taskId: string,
  updates: {
    title?: string;
    description?: string;
    dateKey?: string;
    priority?: string;
  },
) => {
  try {
    const response = await updateStagedTaskRepository(userId, taskId, updates);
    return response;
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};

//----------------------------------------------------------------------------------------------

export const setStagedTaskStatusServices = async (
  userId: string,
  taskId: string,
  done: boolean,
) => {
  try {
    const response = await setStagedTaskStatusRepository(userId, taskId, done);
    return response;
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};

//----------------------------------------------------------------------------------------------

export const createStagedNoteServices = async (
  userId: string,
  spaceId: string,
  title: string,
  body: string,
  dateKey?: string,
) => {
  try {
    const response = await createStagedNoteRepository(
      userId,
      spaceId,
      title,
      body,
      dateKey,
    );
    return response;
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};

//----------------------------------------------------------------------------------------------

export const createStagedTaskServices = async (
  userId: string,
  spaceId: string,
  title: string,
  description: string,
  dateKey?: string,
  priority?: string,
) => {
  try {
    const response = await createStagedTaskRepository(
      userId,
      spaceId,
      title,
      description,
      dateKey,
      priority,
    );
    return response;
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};

//----------------------------------------------------------------------------------------------

export const getNoteDateMarkersBySpaceServices = async (
  userId: string,
  spaceId: string,
  fromDate: string,
  toDate: string,
) => {
  try {
    return await getNoteDateMarkersBySpaceRepository(
      userId,
      spaceId,
      fromDate,
      toDate,
    );
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};

//----------------------------------------------------------------------------------------------

export const getTaskDateMarkersBySpaceServices = async (
  userId: string,
  spaceId: string,
  fromDate: string,
  toDate: string,
) => {
  try {
    return await getTaskDateMarkersBySpaceRepository(
      userId,
      spaceId,
      fromDate,
      toDate,
    );
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};
