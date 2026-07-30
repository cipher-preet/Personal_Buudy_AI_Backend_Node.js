import {
  createSpaceRepository,
  getNoteWorkspacesRepository,
  getSpaceStatsRepository,
  getStagedNoteByIdRepository,
  getStagedNotesBySpaceRepository,
  getStagedTasksBySpaceRepository,
  getUserActiveSpaceRepository,
  getUserSpacesByUserIdRepository,
  startListningRepository,
} from "../Repository/Home.repository";

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
  isListning: boolean,
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
) => {
  try {
    const response = await getStagedNotesBySpaceRepository(
      userId,
      spaceId,
      limit,
      cursor,
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

export const getStagedTasksBySpaceServices = async (
  userId: string,
  spaceId: string,
  limit?: number,
  cursor?: string,
) => {
  try {
    const response = await getStagedTasksBySpaceRepository(
      userId,
      spaceId,
      limit,
      cursor,
    );
    return response;
  } catch (error) {
    console.log("error in Home service Layer ", error);
    throw error;
  }
};
