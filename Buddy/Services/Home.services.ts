import {
  createSpaceRepository,
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
